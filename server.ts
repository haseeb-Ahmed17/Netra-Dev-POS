import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServer as createViteServer } from 'vite';
import { hasRolePermission, type RoleAction } from './src/lib/rbac';
import {
  isValidPinFormat,
  isStoredPinHash,
  REDACTED_PIN_SENTINEL,
} from './src/lib/pinSecurity';
import type { EmployeeRole } from './src/types';

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v20.0';

const SESSION_SIGNING_KEY =
  process.env.STAFF_SESSION_SECRET ||
  SUPABASE_SERVICE_ROLE_KEY ||
  crypto.randomBytes(32).toString('hex');

const hasPublicSupabase =
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('YOUR_PROJECT_REF') &&
  SUPABASE_ANON_KEY.length > 20 &&
  !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY');

const hasServiceRole =
  hasPublicSupabase &&
  SUPABASE_SERVICE_ROLE_KEY.length > 20 &&
  !SUPABASE_SERVICE_ROLE_KEY.includes('YOUR_');

const adminSupabase: SupabaseClient | null = hasServiceRole
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

function createUserScopedSupabase(jwt: string, staffSessionToken?: string | null): SupabaseClient | null {
  if (!hasPublicSupabase) return null;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
  };
  if (staffSessionToken) {
    headers['x-staff-session'] = staffSessionToken;
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers },
  });
}

function extractBearerToken(req: Request): string | null {
  const raw = req.header('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match ? match[1].trim() : null;
}

interface VerifiedSupabaseUser {
  id: string;
  email: string;
  jwt: string;
}

async function authenticateSupabaseRequest(req: Request): Promise<VerifiedSupabaseUser | null> {
  if (!hasPublicSupabase) return null;
  const jwt = extractBearerToken(req);
  if (!jwt) return null;

  const client = adminSupabase ?? createUserScopedSupabase(jwt);
  if (!client) return null;

  const { data, error } = await client.auth.getUser(jwt);
  if (error || !data?.user) {
    return null;
  }
  return {
    id: data.user.id,
    email: (data.user.email || '').toLowerCase(),
    jwt,
  };
}

async function verifyIsExplicitSuperAdmin(user: VerifiedSupabaseUser): Promise<boolean> {
  if (adminSupabase) {
    const { data, error } = await adminSupabase
      .from('super_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) return false;
    return Boolean(data?.user_id);
  }

  const userClient = createUserScopedSupabase(user.jwt);
  if (!userClient) return false;
  const { data, error } = await userClient
    .from('super_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.user_id);
}

interface SignedStaffCookiePayload {
  uid: string;
  empId: string;
  role: EmployeeRole;
  exp: number;
}

function signStaffToken(payload: SignedStaffCookiePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SIGNING_KEY)
    .update(body)
    .digest('base64url');
  return `sbz_${body}.${sig}`;
}

function verifySignedStaffToken(token: string, expectedUserId: string): SignedStaffCookiePayload | null {
  if (!token.startsWith('sbz_')) return null;
  const rest = token.slice(4);
  const dotIdx = rest.indexOf('.');
  if (dotIdx <= 0) return null;
  const body = rest.slice(0, dotIdx);
  const sig = rest.slice(dotIdx + 1);
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SIGNING_KEY)
    .update(body)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SignedStaffCookiePayload;
    if (parsed.uid !== expectedUserId) return null;
    if (typeof parsed.exp !== 'number' || Date.now() > parsed.exp) return null;
    if (!['admin', 'manager', 'cashier'].includes(parsed.role)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function resolveVerifiedStaffRole(
  req: Request,
  user: VerifiedSupabaseUser
): Promise<{ role: EmployeeRole | null; employeeId: string | null }> {
  const token = (req.header('x-staff-session') || '').trim();
  if (!token) {
    return { role: null, employeeId: null };
  }

  const signed = verifySignedStaffToken(token, user.id);
  if (signed) {
    return { role: signed.role, employeeId: signed.empId };
  }

  // Otherwise verify against Postgres staff_sessions table (requires service_role or RPC)
  if (adminSupabase) {
    const { data, error } = await adminSupabase
      .from('staff_sessions')
      .select('role, employee_id, expires_at')
      .eq('token', token)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!error && data && new Date(data.expires_at).getTime() > Date.now()) {
      return { role: data.role as EmployeeRole, employeeId: data.employee_id };
    }
    return { role: null, employeeId: null };
  }

  const userClient = createUserScopedSupabase(user.jwt, token);
  if (userClient) {
    const { data, error } = await userClient.rpc('current_staff_role');
    if (!error && typeof data === 'string' && ['admin', 'manager', 'cashier'].includes(data)) {
      return { role: data as EmployeeRole, employeeId: null };
    }
  }

  return { role: null, employeeId: null };
}

export function createPosExpressApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      supabaseConfigured: hasPublicSupabase,
      adminServiceConfigured: hasServiceRole,
      whatsappConfigured: Boolean(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID),
    });
  });

  // Explicit Super Admin status check (backed strictly by public.super_admins, never email prefixes)
  app.get('/api/admin/me', async (req: Request, res: Response) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.', isSuperAdmin: false });
    }
    const isSuperAdmin = await verifyIsExplicitSuperAdmin(user);
    return res.json({ isSuperAdmin, userId: user.id });
  });

  // List all tenant subscriptions (Super Admin only)
  app.get('/api/admin/subscriptions', async (req: Request, res: Response) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const isSuperAdmin = await verifyIsExplicitSuperAdmin(user);
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Forbidden: explicit super_admin role required.' });
    }

    const client = adminSupabase ?? createUserScopedSupabase(user.jwt);
    if (!client) {
      return res.status(503).json({ error: 'Supabase client unavailable on server.' });
    }

    const { data, error } = await client
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    return res.json({ subscriptions: data || [] });
  });

  // Update a shopkeeper subscription (Super Admin only)
  app.post('/api/admin/subscriptions/:userId', async (req: Request, res: Response) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const isSuperAdmin = await verifyIsExplicitSuperAdmin(user);
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Forbidden: explicit super_admin role required.' });
    }

    const targetUserId = String(req.params.userId || '').trim();
    if (!targetUserId) {
      return res.status(400).json({ error: 'Target userId is required.' });
    }

    const { expiresAt, isBlocked, planName, maxBranches, maxEmployees, paymentHistory } = req.body as {
      expiresAt?: string;
      isBlocked?: boolean;
      planName?: string;
      maxBranches?: number;
      maxEmployees?: number;
      paymentHistory?: unknown[];
    };

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof expiresAt === 'string' && !Number.isNaN(Date.parse(expiresAt))) {
      payload.expires_at = expiresAt;
    }
    if (typeof isBlocked === 'boolean') {
      payload.is_blocked = isBlocked;
    }
    if (typeof planName === 'string' && planName.trim()) {
      payload.plan_name = planName.trim();
    }
    if (typeof maxBranches === 'number' && Number.isFinite(maxBranches) && maxBranches >= 1) {
      payload.max_branches = Math.floor(maxBranches);
    }
    if (typeof maxEmployees === 'number' && Number.isFinite(maxEmployees) && maxEmployees >= 1) {
      payload.max_employees = Math.floor(maxEmployees);
    }
    if (Array.isArray(paymentHistory)) {
      payload.payment_history = paymentHistory;
    }

    const client = adminSupabase ?? createUserScopedSupabase(user.jwt);
    if (!client) {
      return res.status(503).json({ error: 'Supabase client unavailable on server.' });
    }

    const { error } = await client
      .from('subscriptions')
      .update(payload)
      .eq('user_id', targetUserId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    return res.json({ ok: true });
  });

  // Verify staff PIN securely via Postgres pgcrypto RPC (no plaintext PIN returned or exposed)
  app.post('/api/staff/verify-pin', async (req: Request, res: Response) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Authentication required.' });
    }

    const { pin, employeeId } = req.body as { pin?: string; employeeId?: string };
    const cleanPin = String(pin || '').trim();
    if (!isValidPinFormat(cleanPin)) {
      return res.status(400).json({ ok: false, error: 'PIN must be exactly 4 numeric digits.' });
    }

    const userClient = createUserScopedSupabase(user.jwt);
    if (!userClient) {
      return res.status(503).json({ ok: false, error: 'Supabase client unavailable.' });
    }

    const { data, error } = await userClient.rpc('verify_staff_pin', {
      p_pin: cleanPin,
      p_employee_id: employeeId || null,
    });

    if (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }

    const result = (data || {}) as {
      ok?: boolean;
      token?: string;
      employeeId?: string;
      name?: string;
      role?: EmployeeRole;
      expiresAt?: string;
      error?: string;
    };

    if (!result.ok || !result.token || !result.employeeId || !result.role) {
      return res.status(401).json({
        ok: false,
        error: result.error || 'Invalid or inactive staff PIN.',
      });
    }

    return res.json({
      ok: true,
      token: result.token,
      employeeId: result.employeeId,
      name: result.name,
      role: result.role,
      expiresAt: result.expiresAt,
      signedToken: signStaffToken({
        uid: user.id,
        empId: result.employeeId,
        role: result.role,
        exp: Date.now() + 12 * 60 * 60 * 1000,
      }),
    });
  });

  // Create or update staff employee (enforces Admin role server-side & hashes PIN via DB RPC)
  app.post('/api/staff/save-employee', async (req: Request, res: Response) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const staffToken = (req.header('x-staff-session') || '').trim();
    const userClient = createUserScopedSupabase(user.jwt, staffToken || null);
    if (!userClient) {
      return res.status(503).json({ error: 'Supabase client unavailable.' });
    }

    const body = req.body as {
      id?: string;
      name?: string;
      role?: EmployeeRole;
      phone?: string;
      pin?: string;
      isActive?: boolean;
    };

    if (!body.id || !body.name || !body.role) {
      return res.status(400).json({ error: 'Employee id, name, and role are required.' });
    }
    if (body.pin && body.pin !== REDACTED_PIN_SENTINEL && !isValidPinFormat(body.pin)) {
      return res.status(400).json({ error: 'PIN must be exactly 4 numeric digits.' });
    }
    if (body.pin && isStoredPinHash(body.pin)) {
      return res.status(400).json({ error: 'Send raw 4-digit PIN only over TLS; never pass precomputed hash.' });
    }

    const { data, error } = await userClient.rpc('set_staff_pin', {
      p_employee_id: body.id,
      p_name: body.name,
      p_role: body.role,
      p_phone: body.phone || '',
      p_pin: body.pin && body.pin !== REDACTED_PIN_SENTINEL ? body.pin : null,
      p_is_active: typeof body.isActive === 'boolean' ? body.isActive : true,
    });

    if (error) {
      const status = error.code === '42501' ? 403 : error.code === '23505' ? 409 : 400;
      return res.status(status).json({ error: error.message });
    }
    return res.json(data || { ok: true });
  });

  // Delete staff employee (enforces Admin role server-side)
  app.delete('/api/staff/:id', async (req: Request, res: Response) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const staffToken = (req.header('x-staff-session') || '').trim();
    const userClient = createUserScopedSupabase(user.jwt, staffToken || null);
    if (!userClient) {
      return res.status(503).json({ error: 'Supabase client unavailable.' });
    }

    const { data, error } = await userClient.rpc('delete_staff_member', {
      p_employee_id: String(req.params.id || '').trim(),
    });

    if (error) {
      const status = error.code === '42501' ? 403 : 400;
      return res.status(status).json({ error: error.message });
    }
    return res.json(data || { ok: true });
  });

  // Server-side RBAC authorization preflight check for privileged POS mutations
  app.post('/api/rbac/authorize', async (req: Request, res: Response) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ allowed: false, error: 'Authentication required.' });
    }

    const { action, customPermissions } = req.body as {
      action?: RoleAction;
      customPermissions?: string[];
    };
    if (!action) {
      return res.status(400).json({ allowed: false, error: 'Action parameter is required.' });
    }

    const staff = await resolveVerifiedStaffRole(req, user);
    if (!staff.role) {
      return res.status(401).json({
        allowed: false,
        error: 'Verified staff PIN session is required.',
      });
    }

    if (!hasRolePermission(staff.role, action, customPermissions)) {
      return res.status(403).json({
        allowed: false,
        role: staff.role,
        error: `Role '${staff.role}' is not authorized to perform '${action}'.`,
      });
    }

    return res.json({ allowed: true, role: staff.role, employeeId: staff.employeeId });
  });

  // Server-side WhatsApp Cloud API delivery proxy (credentials strictly server-only in process.env)
  app.post('/api/whatsapp/send', async (req: Request, res: Response) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ delivered: false, configured: false, error: 'Authentication required.' });
    }

    const staff = await resolveVerifiedStaffRole(req, user);
    if (!staff.role) {
      return res.status(401).json({
        delivered: false,
        configured: false,
        error: 'Verified staff PIN session is required.',
      });
    }

    if (!hasRolePermission(staff.role, 'whatsapp.send')) {
      return res.status(403).json({
        delivered: false,
        configured: false,
        error: 'Not authorized to dispatch WhatsApp messages.',
      });
    }

    const { phone, to, text, message } = req.body as {
      phone?: string;
      to?: string;
      text?: string;
      message?: string;
      messageType?: string;
    };
    const digits = String(phone || to || '').replace(/[^\d]/g, '');
    const normalizedPhone = digits.startsWith('0') && digits.length >= 10
      ? `92${digits.slice(1)}`
      : digits;
    const messageBody = String(text || message || '').trim();

    if (normalizedPhone.length < 10 || !messageBody) {
      return res.status(400).json({
        delivered: false,
        configured: Boolean(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID),
        error: 'Valid recipient phone number and non-empty message text are required.',
      });
    }

    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      return res.status(200).json({
        delivered: false,
        configured: false,
        error: 'WhatsApp Cloud API credentials are not configured on the server. Use manual WhatsApp share fallback.',
      });
    }

    try {
      const endpoint = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizedPhone,
          type: 'text',
          text: {
            preview_url: false,
            body: messageBody.slice(0, 4096),
          },
        }),
      });

      const payload = (await upstream.json().catch(() => ({}))) as {
        messages?: Array<{ id?: string }>;
        error?: { message?: string };
      };

      if (!upstream.ok) {
        return res.status(502).json({
          delivered: false,
          configured: true,
          error: payload.error?.message || `WhatsApp Graph API returned HTTP ${upstream.status}.`,
        });
      }

      return res.json({
        delivered: true,
        configured: true,
        providerMessageId: payload.messages?.[0]?.id,
      });
    } catch (err) {
      return res.status(502).json({
        delivered: false,
        configured: true,
        error: err instanceof Error ? err.message : 'Network error calling WhatsApp Cloud API.',
      });
    }
  });

  return app;
}

async function startServer() {
  const app = createPosExpressApp();

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Khaas Retail / SmartBitz POS listening on http://0.0.0.0:${PORT}`);
  });
}

const isDirectRun =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('server.ts');

if (isDirectRun) {
  startServer().catch((err) => {
    console.error('Failed to start POS server:', err);
    process.exit(1);
  });
}
