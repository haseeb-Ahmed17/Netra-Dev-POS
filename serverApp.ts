import 'dotenv/config';
import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasRolePermission, type RoleAction } from './src/lib/rbac';
import {
  classifyEmployeePin,
  hashPinAsync,
  isDemoFixturePinHash,
  isValidPinFormat,
  isStoredPinHash,
  REDACTED_PIN_SENTINEL,
  verifyPinHashAsync,
} from './src/lib/pinSecurity';
import type { EmployeeRole, ShopSubscriptionStatus } from './src/types';

function isRpcMissingError(message?: string | null): boolean {
  return /PGRST202|Could not find the function/i.test(message || '');
}

function isTableMissingError(err?: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return (
    err.code === 'PGRST205' ||
    err.code === '42P01' ||
    /Could not find the table|relation .* does not exist/i.test(err.message || '')
  );
}

function isMissingColumnError(err?: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return (
    err.code === '42703' ||
    /column .* does not exist|Could not find the .* column/i.test(err.message || '')
  );
}

function timingSafePinEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function normalizeEmployeeRole(value: unknown): EmployeeRole {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'admin' || raw === 'manager' || raw === 'cashier') {
    return raw;
  }
  return 'cashier';
}

function rowHasConfiguredPin(row: Record<string, unknown>): boolean {
  const pinHash = typeof row.pin_hash === 'string' ? row.pin_hash.trim() : '';
  const pinCode = typeof row.pin_code === 'string' ? row.pin_code.trim() : '';
  if (isDemoFixturePinHash(pinHash) || isDemoFixturePinHash(pinCode)) {
    return false;
  }
  return (
    isStoredPinHash(pinHash) ||
    isStoredPinHash(pinCode) ||
    isValidPinFormat(pinCode)
  );
}

function classifyPinState(
  row: Record<string, unknown>
): 'hashed' | 'demo_fixture' | 'legacy_4digit' | 'unconfigured' {
  return classifyEmployeePin({
    pinHash: typeof row.pin_hash === 'string' ? row.pin_hash : undefined,
    pinCode: typeof row.pin_code === 'string' ? row.pin_code : undefined,
  });
}

async function selectEmployeesWithSchemaFallback(
  client: SupabaseClient,
  userId: string,
  options?: { employeeId?: string; activeOnly?: boolean }
): Promise<{ rows: Array<Record<string, unknown>>; supportsPinHashColumn: boolean; error: { code?: string; message: string } | null }> {
  let query = client
    .from('employees')
    .select('id, name, phone, role, is_active, pin_hash, pin_code, created_at')
    .eq('user_id', userId);
  if (options?.activeOnly) query = query.eq('is_active', true);
  if (options?.employeeId) query = query.eq('id', options.employeeId);
  const res = await query;

  if (!res.error) {
    return {
      rows: (res.data || []) as Array<Record<string, unknown>>,
      supportsPinHashColumn: true,
      error: null,
    };
  }

  if (!isMissingColumnError(res.error)) {
    return { rows: [], supportsPinHashColumn: true, error: res.error };
  }

  let legacyQuery = client
    .from('employees')
    .select('id, name, phone, role, is_active, pin_code, created_at')
    .eq('user_id', userId);
  if (options?.activeOnly) legacyQuery = legacyQuery.eq('is_active', true);
  if (options?.employeeId) legacyQuery = legacyQuery.eq('id', options.employeeId);
  const legacyRes = await legacyQuery;
  return {
    rows: (legacyRes.data || []) as Array<Record<string, unknown>>,
    supportsPinHashColumn: false,
    error: legacyRes.error,
  };
}

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

const INITIAL_FOUNDER_EMAIL = (
  process.env.INITIAL_FOUNDER_EMAIL || 'bc260436573mha@vu.edu.pk'
)
  .trim()
  .toLowerCase();

const SUPER_ADMIN_USER_IDS = new Set(
  (process.env.SUPER_ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

interface ServerSaasAuditLog {
  id: string;
  actor_user_id?: string | null;
  actor_email: string;
  target_user_id: string;
  target_email: string;
  target_shop_name: string;
  action: string;
  previous_status?: string | null;
  new_status?: string | null;
  details: string;
  created_at: string;
}

const platformAuditMemoryLog: ServerSaasAuditLog[] = [];
const unmigratedStatusOverlay = new Map<
  string,
  { status: ShopSubscriptionStatus; suspendedReason?: string; suspendedAt?: string }
>();

async function recordSaasAuditLog(
  client: SupabaseClient | null,
  entry: Omit<ServerSaasAuditLog, 'id' | 'created_at'>
): Promise<ServerSaasAuditLog> {
  const full: ServerSaasAuditLog = {
    id: `saas-audit-${crypto.randomUUID()}`,
    ...entry,
    created_at: new Date().toISOString(),
  };
  platformAuditMemoryLog.unshift(full);
  if (platformAuditMemoryLog.length > 200) {
    platformAuditMemoryLog.length = 200;
  }

  if (client) {
    try {
      await client.from('saas_audit_logs').insert(full);
    } catch {
      // Non-blocking when saas_audit_logs migration hasn't been applied yet
    }
  }
  return full;
}

interface VerifiedSupabaseUser {
  id: string;
  email: string;
  emailConfirmed: boolean;
  appMetadataRole?: string;
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
  const rawRole =
    typeof data.user.app_metadata?.role === 'string'
      ? data.user.app_metadata.role.trim().toLowerCase()
      : undefined;
  return {
    id: data.user.id,
    email: (data.user.email || '').trim().toLowerCase(),
    emailConfirmed: Boolean(data.user.email_confirmed_at),
    appMetadataRole: rawRole,
    jwt,
  };
}

async function verifyIsExplicitSuperAdmin(user: VerifiedSupabaseUser): Promise<boolean> {
  // 1. Explicit UUID allowlist or server-controlled app_metadata claim
  if (SUPER_ADMIN_USER_IDS.has(user.id)) {
    return true;
  }
  if (user.appMetadataRole === 'super_admin') {
    return true;
  }

  if (adminSupabase) {
    // 2. Authoritative Supabase Auth admin lookup (app_metadata is server-only)
    const { data: authLookup, error: authErr } = await adminSupabase.auth.admin.getUserById(user.id);
    const authUser = !authErr ? authLookup?.user : null;
    if (authUser?.app_metadata?.role === 'super_admin') {
      return true;
    }

    // 3. Authoritative public.super_admins table check (if migrated)
    const saLookup = await adminSupabase
      .from('super_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!saLookup.error && saLookup.data?.user_id) {
      return true;
    }

    // 4. Secure one-time initial Founder provisioning:
    // Only when NO other super admin exists yet AND verified server email matches INITIAL_FOUNDER_EMAIL
    const confirmedEmail = Boolean(authUser?.email_confirmed_at ?? user.emailConfirmed);
    const verifiedEmail = (authUser?.email || user.email || '').trim().toLowerCase();
    if (confirmedEmail && verifiedEmail === INITIAL_FOUNDER_EMAIL) {
      let existingSuperAdminFound = false;

      if (!saLookup.error) {
        const anySa = await adminSupabase
          .from('super_admins')
          .select('user_id')
          .limit(1);
        if (!anySa.error && (anySa.data?.length ?? 0) > 0) {
          existingSuperAdminFound = true;
        }
      }

      if (!existingSuperAdminFound) {
        const usersList = await adminSupabase.auth.admin.listUsers({ page: 1, perPage: 200 });
        if (!usersList.error && Array.isArray(usersList.data?.users)) {
          existingSuperAdminFound = usersList.data.users.some(
            (u) => u.id !== user.id && u.app_metadata?.role === 'super_admin'
          );
        }
      }

      if (!existingSuperAdminFound) {
        const { error: metaErr } = await adminSupabase.auth.admin.updateUserById(user.id, {
          app_metadata: {
            ...(authUser?.app_metadata || {}),
            role: 'super_admin',
            super_admin_provisioned_at: new Date().toISOString(),
          },
        });
        if (!metaErr) {
          if (!isTableMissingError(saLookup.error)) {
            await adminSupabase
              .from('super_admins')
              .upsert(
                { user_id: user.id, email: verifiedEmail },
                { onConflict: 'user_id' }
              );
          }
          await recordSaasAuditLog(adminSupabase, {
            actor_user_id: user.id,
            actor_email: verifiedEmail,
            target_user_id: user.id,
            target_email: verifiedEmail,
            target_shop_name: String(authUser?.user_metadata?.shop_name || 'Platform Founder'),
            action: 'founder_provisioned',
            previous_status: 'unassigned',
            new_status: 'super_admin',
            details: 'Secure one-time initial Super Admin claim verified on server.',
          });
          return true;
        }
      }
    }

    return false;
  }

  // Fallback when service role key is unavailable: verify via Postgres RLS / RPC
  const userClient = createUserScopedSupabase(user.jwt);
  if (!userClient) return false;

  const { data: rpcOk, error: rpcErr } = await userClient.rpc('is_super_admin');
  if (!rpcErr && rpcOk === true) {
    return true;
  }

  const { data, error } = await userClient
    .from('super_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.user_id);
}

async function checkTenantOperationalAccess(
  user: VerifiedSupabaseUser
): Promise<{
  allowed: boolean;
  status?: ShopSubscriptionStatus;
  reason?: string;
}> {
  const client = adminSupabase ?? createUserScopedSupabase(user.jwt);
  if (!client) return { allowed: true };

  let subRow: Record<string, unknown> | null = null;
  const primary = await client
    .from('subscriptions')
    .select('is_blocked, status, suspended_reason, expires_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!primary.error) {
    subRow = (primary.data as Record<string, unknown> | null) ?? null;
  } else if (isMissingColumnError(primary.error)) {
    const legacy = await client
      .from('subscriptions')
      .select('is_blocked, expires_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!legacy.error) {
      subRow = (legacy.data as Record<string, unknown> | null) ?? null;
    }
  }

  const overlay = unmigratedStatusOverlay.get(user.id);
  const rawStatus =
    typeof subRow?.status === 'string' &&
    ['active', 'suspended', 'blocked'].includes(subRow.status)
      ? (subRow.status as ShopSubscriptionStatus)
      : overlay?.status;

  const isBlocked = Boolean(subRow?.is_blocked);
  const effectiveStatus: ShopSubscriptionStatus =
    rawStatus === 'suspended'
      ? 'suspended'
      : rawStatus === 'blocked' || isBlocked
      ? 'blocked'
      : 'active';

  if (effectiveStatus === 'suspended' || effectiveStatus === 'blocked') {
    const reason =
      typeof subRow?.suspended_reason === 'string' && subRow.suspended_reason
        ? subRow.suspended_reason
        : overlay?.suspendedReason || '';
    return {
      allowed: false,
      status: effectiveStatus,
      reason,
    };
  }

  return { allowed: true, status: 'active' };
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

async function issueFallbackStaffToken(
  userId: string,
  employeeId: string,
  role: EmployeeRole
): Promise<{ token: string; signedToken: string; expiresAt: string }> {
  const expiresMs = Date.now() + 12 * 60 * 60 * 1000;
  const expiresAt = new Date(expiresMs).toISOString();
  const signedToken = signStaffToken({
    uid: userId,
    empId: employeeId,
    role,
    exp: expiresMs,
  });

  if (adminSupabase) {
    try {
      const dbToken = crypto.randomBytes(24).toString('hex');
      const { error } = await adminSupabase.from('staff_sessions').insert({
        token: dbToken,
        user_id: userId,
        employee_id: employeeId,
        role,
        expires_at: expiresAt,
      });
      if (!error) {
        return { token: dbToken, signedToken, expiresAt };
      }
    } catch {
      // Fall back to HMAC signedToken if staff_sessions table is not yet migrated
    }
  }

  return { token: signedToken, signedToken, expiresAt };
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

  // Explicit Super Admin status check (backed strictly by server metadata / public.super_admins, never client flags)
  app.get('/api/admin/me', async (req: Request, res: Response) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.', isSuperAdmin: false });
    }
    const isSuperAdmin = await verifyIsExplicitSuperAdmin(user);
    return res.json({ isSuperAdmin, userId: user.id });
  });

  // List all registered shops, owners, subscriptions, staff counts & audit logs (Super Admin only)
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

    const { data: subRows, error: subErr } = await client
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false });

    if (subErr) {
      return res.status(500).json({ error: subErr.message });
    }

    const subByUserId = new Map<string, Record<string, unknown>>(
      (subRows || []).map((r) => [String((r as Record<string, unknown>).user_id), r as Record<string, unknown>])
    );

    const storeNameByUserId = new Map<string, string>();
    const empStatsByUserId = new Map<
      string,
      { employeeCount: number; activeEmployeeCount: number; adminConfigured: boolean }
    >();
    const authUsersList: Array<{
      id: string;
      email: string;
      shopName?: string;
      createdAt: string;
      lastSignInAt?: string;
    }> = [];

    if (adminSupabase) {
      const [usersRes, settingsRes, empPrimary] = await Promise.all([
        adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        adminSupabase.from('store_settings').select('user_id, store_name'),
        adminSupabase.from('employees').select('id, user_id, role, is_active, pin_hash, pin_code'),
      ]);

      if (!usersRes.error && Array.isArray(usersRes.data?.users)) {
        for (const u of usersRes.data.users) {
          authUsersList.push({
            id: u.id,
            email: (u.email || '').trim().toLowerCase(),
            shopName:
              typeof u.user_metadata?.shop_name === 'string' && u.user_metadata.shop_name.trim()
                ? u.user_metadata.shop_name.trim()
                : undefined,
            createdAt: u.created_at || new Date().toISOString(),
            lastSignInAt: u.last_sign_in_at || undefined,
          });
        }
      }

      if (!settingsRes.error && Array.isArray(settingsRes.data)) {
        for (const row of settingsRes.data) {
          const uid = String(row.user_id || '');
          const sname = typeof row.store_name === 'string' ? row.store_name.trim() : '';
          if (uid && sname) {
            storeNameByUserId.set(uid, sname);
          }
        }
      }

      let empRows: Array<Record<string, unknown>> = [];
      if (!empPrimary.error && Array.isArray(empPrimary.data)) {
        empRows = empPrimary.data as Array<Record<string, unknown>>;
      } else if (isMissingColumnError(empPrimary.error)) {
        const empLegacy = await adminSupabase
          .from('employees')
          .select('id, user_id, role, is_active, pin_code');
        if (!empLegacy.error && Array.isArray(empLegacy.data)) {
          empRows = empLegacy.data as Array<Record<string, unknown>>;
        }
      }

      for (const row of empRows) {
        const uid = String(row.user_id || '');
        if (!uid) continue;
        const curr = empStatsByUserId.get(uid) ?? {
          employeeCount: 0,
          activeEmployeeCount: 0,
          adminConfigured: false,
        };
        curr.employeeCount += 1;
        const isActive = row.is_active !== false;
        if (isActive) curr.activeEmployeeCount += 1;
        if (normalizeEmployeeRole(row.role) === 'admin' && isActive && rowHasConfiguredPin(row)) {
          curr.adminConfigured = true;
        }
        empStatsByUserId.set(uid, curr);
      }
    }

    const allUserIds = new Set<string>([
      ...subByUserId.keys(),
      ...authUsersList.map((u) => u.id),
    ]);
    const authByUserId = new Map(authUsersList.map((u) => [u.id, u]));

    const merged = Array.from(allUserIds).map((uid) => {
      const row = subByUserId.get(uid);
      const authU = authByUserId.get(uid);
      const empStats = empStatsByUserId.get(uid) ?? {
        employeeCount: 0,
        activeEmployeeCount: 0,
        adminConfigured: false,
      };
      const overlay = unmigratedStatusOverlay.get(uid);
      const createdAt = String(row?.created_at || authU?.createdAt || new Date().toISOString());
      const defaultTrialExpiry = new Date(
        new Date(createdAt).getTime() + 30 * 24 * 60 * 60 * 1000
      ).toISOString();
      const rawStatus =
        typeof row?.status === 'string' && ['active', 'suspended', 'blocked'].includes(row.status)
          ? (row.status as ShopSubscriptionStatus)
          : overlay?.status;
      const isBlocked = Boolean(row?.is_blocked);
      const status: ShopSubscriptionStatus =
        rawStatus === 'suspended'
          ? 'suspended'
          : rawStatus === 'blocked' || isBlocked
          ? 'blocked'
          : 'active';

      return {
        user_id: uid,
        email: String(row?.email || authU?.email || ''),
        shop_name:
          storeNameByUserId.get(uid) ||
          (row?.shop_name ? String(row.shop_name) : '') ||
          authU?.shopName ||
          '',
        plan_name: String(row?.plan_name || '30-Day Free Trial'),
        expires_at: String(row?.expires_at || defaultTrialExpiry),
        is_blocked: status !== 'active' || isBlocked,
        status,
        suspended_reason:
          (typeof row?.suspended_reason === 'string' && row.suspended_reason) ||
          overlay?.suspendedReason ||
          '',
        suspended_at: row?.suspended_at || overlay?.suspendedAt || null,
        trial_ends_at: row?.trial_ends_at || defaultTrialExpiry,
        max_branches: row?.max_branches ?? 3,
        max_employees: row?.max_employees ?? 15,
        payment_history: Array.isArray(row?.payment_history) ? row.payment_history : [],
        employee_count: empStats.employeeCount,
        active_employee_count: empStats.activeEmployeeCount,
        admin_configured: empStats.adminConfigured,
        last_sign_in_at: authU?.lastSignInAt ?? null,
        created_at: createdAt,
        updated_at: row?.updated_at || createdAt,
      };
    });

    merged.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

    let dbAuditRows: ServerSaasAuditLog[] = [];
    const auditRes = await client
      .from('saas_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (!auditRes.error && Array.isArray(auditRes.data)) {
      dbAuditRows = auditRes.data as ServerSaasAuditLog[];
    }
    const seenIds = new Set(dbAuditRows.map((a) => a.id));
    const combinedLogs = [
      ...dbAuditRows,
      ...platformAuditMemoryLog.filter((a) => !seenIds.has(a.id)),
    ]
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 100);

    return res.json({ subscriptions: merged, auditLogs: combinedLogs });
  });

  app.get('/api/admin/audit-logs', async (req: Request, res: Response) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const isSuperAdmin = await verifyIsExplicitSuperAdmin(user);
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Forbidden: explicit super_admin role required.' });
    }

    const client = adminSupabase ?? createUserScopedSupabase(user.jwt);
    let dbAuditRows: ServerSaasAuditLog[] = [];
    if (client) {
      const auditRes = await client
        .from('saas_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!auditRes.error && Array.isArray(auditRes.data)) {
        dbAuditRows = auditRes.data as ServerSaasAuditLog[];
      }
    }
    const seenIds = new Set(dbAuditRows.map((a) => a.id));
    const combinedLogs = [
      ...dbAuditRows,
      ...platformAuditMemoryLog.filter((a) => !seenIds.has(a.id)),
    ]
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 100);

    return res.json({ auditLogs: combinedLogs });
  });

  // Update / activate / suspend / block a shopkeeper subscription (Super Admin only)
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

    const {
      expiresAt,
      isBlocked,
      status,
      suspendedReason,
      planName,
      maxBranches,
      maxEmployees,
      paymentHistory,
      actionLabel,
    } = req.body as {
      expiresAt?: string;
      isBlocked?: boolean;
      status?: ShopSubscriptionStatus;
      suspendedReason?: string;
      planName?: string;
      maxBranches?: number;
      maxEmployees?: number;
      paymentHistory?: unknown[];
      actionLabel?: string;
    };

    const normalizedStatus: ShopSubscriptionStatus | undefined =
      status && ['active', 'suspended', 'blocked'].includes(status)
        ? status
        : typeof isBlocked === 'boolean'
        ? isBlocked
          ? 'blocked'
          : 'active'
        : undefined;

    const effectiveBlocked =
      normalizedStatus !== undefined
        ? normalizedStatus !== 'active'
        : typeof isBlocked === 'boolean'
        ? isBlocked
        : undefined;

    if (targetUserId === user.id && effectiveBlocked === true) {
      return res.status(400).json({
        error: 'Cannot suspend or block the active platform Super Admin account.',
      });
    }

    const client = adminSupabase ?? createUserScopedSupabase(user.jwt);
    if (!client) {
      return res.status(503).json({ error: 'Supabase client unavailable on server.' });
    }

    const existingSubRes = await client
      .from('subscriptions')
      .select('*')
      .eq('user_id', targetUserId)
      .maybeSingle();

    const existingRow = (existingSubRes.data as Record<string, unknown> | null) ?? null;
    const prevOverlay = unmigratedStatusOverlay.get(targetUserId);
    const previousStatus =
      typeof existingRow?.status === 'string'
        ? existingRow.status
        : existingRow?.is_blocked
        ? prevOverlay?.status || 'blocked'
        : 'active';

    let targetEmail = String(existingRow?.email || '');
    let targetShopName = String(existingRow?.shop_name || '');
    if ((!targetEmail || !targetShopName) && adminSupabase) {
      const authLookup = await adminSupabase.auth.admin.getUserById(targetUserId);
      if (!authLookup.error && authLookup.data?.user) {
        targetEmail = targetEmail || (authLookup.data.user.email || '').toLowerCase();
        targetShopName =
          targetShopName || String(authLookup.data.user.user_metadata?.shop_name || '');
      }
    }

    const nowIso = new Date().toISOString();
    const defaultExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const payload: Record<string, unknown> = {
      updated_at: nowIso,
    };
    if (typeof expiresAt === 'string' && !Number.isNaN(Date.parse(expiresAt))) {
      payload.expires_at = expiresAt;
    }
    if (typeof effectiveBlocked === 'boolean') {
      payload.is_blocked = effectiveBlocked;
    }
    if (normalizedStatus) {
      payload.status = normalizedStatus;
      payload.suspended_at = normalizedStatus === 'active' ? null : nowIso;
      payload.suspended_reason =
        normalizedStatus === 'active' ? '' : String(suspendedReason || '').trim();
      if (normalizedStatus === 'active') {
        unmigratedStatusOverlay.delete(targetUserId);
      } else {
        unmigratedStatusOverlay.set(targetUserId, {
          status: normalizedStatus,
          suspendedReason: String(suspendedReason || '').trim(),
          suspendedAt: nowIso,
        });
      }
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

    const writeSubscriptionCompat = async (
      fields: Record<string, unknown>
    ): Promise<{ error: { code?: string; message: string } | null }> => {
      const optionalCols = [
        'status',
        'suspended_at',
        'suspended_reason',
        'max_branches',
        'max_employees',
        'payment_history',
      ];
      let candidate = { ...fields };
      for (let attempt = 0; attempt <= optionalCols.length; attempt++) {
        const op = existingRow
          ? await client.from('subscriptions').update(candidate).eq('user_id', targetUserId)
          : await client.from('subscriptions').upsert(
              {
                user_id: targetUserId,
                email: targetEmail || 'owner@store.local',
                shop_name: targetShopName,
                plan_name: String(candidate.plan_name || '30-Day Free Trial'),
                expires_at: String(candidate.expires_at || defaultExpiry),
                is_blocked: Boolean(candidate.is_blocked ?? false),
                created_at: nowIso,
                ...candidate,
              },
              { onConflict: 'user_id' }
            );
        if (!op.error) return { error: null };
        if (!isMissingColumnError(op.error)) return { error: op.error };

        const msg = op.error.message || '';
        const matchedCol = optionalCols.find(
          (col) => col in candidate && new RegExp(`\\b${col}\\b`, 'i').test(msg)
        );
        if (matchedCol) {
          const nextCandidate = { ...candidate };
          delete nextCandidate[matchedCol];
          candidate = nextCandidate;
        } else {
          // Strip all optional extended columns if Postgres didn't identify the exact one
          const coreOnly: Record<string, unknown> = {
            updated_at: nowIso,
          };
          if ('expires_at' in candidate) coreOnly.expires_at = candidate.expires_at;
          if ('is_blocked' in candidate) coreOnly.is_blocked = candidate.is_blocked;
          if ('plan_name' in candidate) coreOnly.plan_name = candidate.plan_name;
          candidate = coreOnly;
        }
      }
      return { error: null };
    };

    const writeRes = await writeSubscriptionCompat(payload);
    if (writeRes.error) {
      return res.status(500).json({ error: writeRes.error.message });
    }

    const nextStatusLabel =
      normalizedStatus ??
      (effectiveBlocked === true ? 'blocked' : effectiveBlocked === false ? 'active' : previousStatus);
    const derivedAction =
      actionLabel ||
      (normalizedStatus === 'suspended'
        ? 'shop_suspended'
        : normalizedStatus === 'blocked'
        ? 'shop_blocked'
        : normalizedStatus === 'active' && previousStatus !== 'active'
        ? 'shop_activated'
        : 'subscription_updated');

    const auditEntry = await recordSaasAuditLog(client, {
      actor_user_id: user.id,
      actor_email: user.email,
      target_user_id: targetUserId,
      target_email: targetEmail,
      target_shop_name: targetShopName || targetEmail,
      action: derivedAction,
      previous_status: previousStatus,
      new_status: nextStatusLabel,
      details: [
        planName ? `Plan: ${planName}` : null,
        expiresAt ? `Expires: ${expiresAt.slice(0, 10)}` : null,
        suspendedReason ? `Reason: ${suspendedReason}` : null,
      ]
        .filter(Boolean)
        .join(' • ') || `Updated status to ${nextStatusLabel}`,
    });

    return res.json({ ok: true, auditLog: auditEntry });
  });

  // Authenticated non-secret staff bootstrap inspection & fallback for the signed-in owner's store
  app.get('/api/staff/bootstrap-status', async (req: Request, res: Response) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Authentication required.' });
    }

    const userClient = createUserScopedSupabase(user.jwt);
    if (!userClient && !adminSupabase) {
      return res.status(503).json({ ok: false, error: 'Supabase client unavailable.' });
    }

    const userLookup = userClient
      ? await selectEmployeesWithSchemaFallback(userClient, user.id)
      : null;

    let effectiveRows = userLookup?.rows ?? [];
    let supportsPinHashColumn = userLookup?.supportsPinHashColumn ?? false;
    let source: 'user_rls' | 'service_role_scoped' = 'user_rls';
    const rlsReadable = Boolean(userLookup && !userLookup.error);
    const rlsError = userLookup?.error?.message ?? null;

    if ((!userLookup || userLookup.error) && adminSupabase) {
      const adminLookup = await selectEmployeesWithSchemaFallback(adminSupabase, user.id);
      if (adminLookup.error) {
        return res.status(500).json({ ok: false, error: adminLookup.error.message });
      }
      effectiveRows = adminLookup.rows;
      supportsPinHashColumn = adminLookup.supportsPinHashColumn;
      source = 'service_role_scoped';
    } else if (userLookup?.error) {
      return res.status(500).json({ ok: false, error: userLookup.error.message });
    }

    const employees = effectiveRows.map((row) => {
      const pinState = classifyPinState(row);
      const isDemoFixturePin = pinState === 'demo_fixture';
      return {
        id: String(row.id),
        name: String(row.name || ''),
        phone: String(row.phone || ''),
        role: normalizeEmployeeRole(row.role),
        hasPin: !isDemoFixturePin && rowHasConfiguredPin(row),
        isDemoFixturePin,
        pinState,
        isActive: row.is_active !== false,
        createdAt: String(row.created_at || ''),
      };
    });

    const adminConfigured = employees.some(
      (emp) =>
        emp.role === 'admin' &&
        emp.isActive &&
        emp.hasPin &&
        !emp.isDemoFixturePin
    );

    return res.json({
      ok: true,
      userId: user.id,
      source,
      rlsReadable,
      rlsError,
      supportsPinHashColumn,
      employeeCount: employees.length,
      hasConfiguredAdmin: adminConfigured,
      needsInitialAdminSetup: !adminConfigured,
      employees,
    });
  });

  // First-time Admin onboarding: allowed ONLY when the authenticated store owner has no active Admin with a configured PIN.
  app.post('/api/staff/bootstrap-admin', async (req: Request, res: Response) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Authentication required.' });
    }

    const body = req.body as {
      name?: string;
      phone?: string;
      pin?: string;
    };
    const cleanName = String(body.name || '').trim();
    const cleanPhone = String(body.phone || '').trim();
    const cleanPin = String(body.pin || '').trim();

    if (!cleanName || cleanName.length > 80) {
      return res.status(400).json({ ok: false, error: 'Valid Admin name (1-80 characters) is required.' });
    }
    if (!isValidPinFormat(cleanPin)) {
      return res.status(400).json({ ok: false, error: 'PIN must be exactly 4 numeric digits.' });
    }
    if (isStoredPinHash(cleanPin)) {
      return res.status(400).json({ ok: false, error: 'Send raw 4-digit PIN only over TLS; never pass precomputed hash.' });
    }

    const userClient = createUserScopedSupabase(user.jwt);
    const dbClient = adminSupabase ?? userClient;
    if (!userClient || !dbClient) {
      return res.status(503).json({ ok: false, error: 'Supabase client unavailable.' });
    }

    const existingLookup = await selectEmployeesWithSchemaFallback(dbClient, user.id);
    if (existingLookup.error) {
      return res.status(500).json({ ok: false, error: existingLookup.error.message });
    }

    const existingRows = existingLookup.rows;
    const alreadyConfigured = existingRows.some(
      (r) =>
        normalizeEmployeeRole(r.role) === 'admin' &&
        r.is_active !== false &&
        rowHasConfiguredPin(r)
    );
    if (alreadyConfigured) {
      return res.status(409).json({
        ok: false,
        error: 'An active Store Admin PIN is already configured. Sign in with your Admin PIN to manage staff.',
      });
    }

    // Reuse an existing unconfigured Admin row if one exists so no employee records are deleted
    const unconfiguredAdmin = existingRows.find(
      (r) =>
        normalizeEmployeeRole(r.role) === 'admin' &&
        r.is_active !== false &&
        !rowHasConfiguredPin(r)
    );
    const targetEmployeeId =
      typeof unconfiguredAdmin?.id === 'string' && unconfiguredAdmin.id
        ? unconfiguredAdmin.id
        : `${user.id.slice(0, 8)}-emp-admin`;
    const nowIso = new Date().toISOString();
    const createdAt =
      typeof unconfiguredAdmin?.created_at === 'string' && unconfiguredAdmin.created_at
        ? unconfiguredAdmin.created_at
        : nowIso;

    // Primary path: Postgres pgcrypto RPC (sets bcrypt pin_hash + verifies into staff_sessions)
    const { error: setRpcErr } = await userClient.rpc('set_staff_pin', {
      p_employee_id: targetEmployeeId,
      p_name: cleanName,
      p_role: 'admin',
      p_phone: cleanPhone,
      p_pin: cleanPin,
      p_is_active: true,
    });

    if (!setRpcErr) {
      const { data: verifyData, error: verifyRpcErr } = await userClient.rpc('verify_staff_pin', {
        p_pin: cleanPin,
        p_employee_id: targetEmployeeId,
      });
      const verified = (verifyData || {}) as {
        ok?: boolean;
        token?: string;
        employeeId?: string;
        role?: EmployeeRole;
        expiresAt?: string;
      };
      const signedToken = signStaffToken({
        uid: user.id,
        empId: targetEmployeeId,
        role: 'admin',
        exp: Date.now() + 12 * 60 * 60 * 1000,
      });
      if (!verifyRpcErr && verified.ok && verified.token && verified.expiresAt) {
        return res.json({
          ok: true,
          employee: {
            id: targetEmployeeId,
            name: cleanName,
            phone: cleanPhone,
            role: 'admin',
            hasPin: true,
            isActive: true,
            createdAt,
          },
          session: {
            token: verified.token,
            employeeId: targetEmployeeId,
            role: 'admin',
            expiresAt: verified.expiresAt,
            signedToken,
          },
        });
      }
    }

    // Fallback when RPC is not deployed (PGRST202) OR an existing Cashier row triggered 42501 and adminSupabase is available
    const canFallback =
      !setRpcErr ||
      isRpcMissingError(setRpcErr.message) ||
      (setRpcErr.code === '42501' && Boolean(adminSupabase));
    if (!canFallback) {
      const status = setRpcErr?.code === '42501' ? 403 : 400;
      return res.status(status).json({ ok: false, error: setRpcErr?.message || 'Unable to create initial Admin.' });
    }

    const pbkdf2Hash = await hashPinAsync(cleanPin);
    let upsertErr: { code?: string; message: string } | null = null;
    if (existingLookup.supportsPinHashColumn) {
      const resUp = await dbClient
        .from('employees')
        .upsert(
          {
            id: targetEmployeeId,
            user_id: user.id,
            name: cleanName,
            phone: cleanPhone,
            role: 'admin',
            pin_code: REDACTED_PIN_SENTINEL,
            pin_hash: pbkdf2Hash,
            pin_updated_at: nowIso,
            is_active: true,
            created_at: createdAt,
          },
          { onConflict: 'id' }
        );
      upsertErr = resUp.error;
    }
    if (!existingLookup.supportsPinHashColumn || isMissingColumnError(upsertErr)) {
      const legacyUp = await dbClient
        .from('employees')
        .upsert(
          {
            id: targetEmployeeId,
            user_id: user.id,
            name: cleanName,
            phone: cleanPhone,
            role: 'admin',
            pin_code: pbkdf2Hash,
            is_active: true,
            created_at: createdAt,
          },
          { onConflict: 'id' }
        );
      upsertErr = legacyUp.error;
    }

    if (upsertErr) {
      return res.status(upsertErr.code === '42501' ? 403 : 400).json({
        ok: false,
        error: upsertErr.message,
      });
    }

    const issued = await issueFallbackStaffToken(user.id, targetEmployeeId, 'admin');

    return res.json({
      ok: true,
      employee: {
        id: targetEmployeeId,
        name: cleanName,
        phone: cleanPhone,
        role: 'admin',
        hasPin: true,
        isActive: true,
        createdAt,
      },
      session: {
        token: issued.token,
        employeeId: targetEmployeeId,
        role: 'admin',
        expiresAt: issued.expiresAt,
        signedToken: issued.signedToken,
      },
    });
  });

  // Verify staff PIN securely via Postgres pgcrypto RPC (or PBKDF2 hash / pre-migration legacy fallback when RPC is absent)
  app.post('/api/staff/verify-pin', async (req: Request, res: Response) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Authentication required.' });
    }

    // Verify store is not suspended/blocked before allowing PIN unlock
    const opAccess = await checkTenantOperationalAccess(user);
    if (!opAccess.allowed) {
      return res.status(403).json({
        ok: false,
        error:
          opAccess.status === 'suspended'
            ? 'This store subscription is currently suspended. POS access is paused while all shop records remain preserved.'
            : 'This store account is blocked. Contact platform support while your shop records remain preserved.',
      });
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

    const result = (data || {}) as {
      ok?: boolean;
      token?: string;
      employeeId?: string;
      name?: string;
      role?: EmployeeRole;
      expiresAt?: string;
      error?: string;
    };

    if (!error && result.ok && result.token && result.employeeId && result.role) {
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
    }

    const dbClient = adminSupabase ?? userClient;
    const empLookup = await selectEmployeesWithSchemaFallback(dbClient, user.id, {
      employeeId: employeeId || undefined,
      activeOnly: true,
    });
    for (const row of empLookup.rows) {
      const storedHash = typeof row.pin_hash === 'string' ? row.pin_hash.trim() : '';
      const storedPinCode = typeof row.pin_code === 'string' ? row.pin_code.trim() : '';
      const hashCandidate = storedHash.startsWith('pbkdf2_sha256$')
        ? storedHash
        : storedPinCode.startsWith('pbkdf2_sha256$')
        ? storedPinCode
        : '';

      const hashMatches = hashCandidate
        ? await verifyPinHashAsync(cleanPin, hashCandidate)
        : isValidPinFormat(storedPinCode) && timingSafePinEquals(cleanPin, storedPinCode);

      if (hashMatches) {
        const empId = String(row.id);
        const empRole = row.role as EmployeeRole;
        const empName = String(row.name || '');
        const issued = await issueFallbackStaffToken(user.id, empId, empRole);
        return res.json({
          ok: true,
          token: issued.token,
          employeeId: empId,
          name: empName,
          role: empRole,
          expiresAt: issued.expiresAt,
          signedToken: issued.signedToken,
        });
      }
    }

    if (error && !isRpcMissingError(error.message)) {
      return res.status(400).json({ ok: false, error: error.message });
    }

    return res.status(401).json({
      ok: false,
      error: result.error || 'Invalid or inactive staff PIN.',
    });
  });

  // Create or update staff employee (enforces Admin role server-side & hashes PIN)
  app.post('/api/staff/save-employee', async (req: Request, res: Response) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const opAccess = await checkTenantOperationalAccess(user);
    if (!opAccess.allowed) {
      return res.status(403).json({
        error:
          opAccess.status === 'suspended'
            ? 'Store access is suspended. Staff changes are disabled while records remain preserved.'
            : 'Store account is blocked.',
      });
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
    if (!['admin', 'manager', 'cashier'].includes(body.role)) {
      return res.status(400).json({ error: 'Invalid employee role.' });
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

    if (!error) {
      return res.json(data || { ok: true });
    }

    if (!isRpcMissingError(error.message)) {
      const status = error.code === '42501' ? 403 : error.code === '23505' ? 409 : 400;
      return res.status(status).json({ error: error.message });
    }

    // Fallback when Postgres RPC is not yet deployed: verify Admin staff session server-side
    const staff = await resolveVerifiedStaffRole(req, user);
    if (staff.role !== 'admin') {
      return res.status(403).json({ error: 'Only an authenticated Admin can manage staff accounts.' });
    }

    const dbClient = adminSupabase ?? userClient;
    const empLookup = await selectEmployeesWithSchemaFallback(dbClient, user.id);
    if (empLookup.error) {
      return res.status(500).json({ error: empLookup.error.message });
    }
    const existingList = empLookup.rows;
    const existingRow = existingList.find((r) => String(r.id) === body.id);
    const cleanPin = body.pin && body.pin !== REDACTED_PIN_SENTINEL ? body.pin.trim() : '';
    if (!existingRow && !cleanPin) {
      return res.status(400).json({ error: 'A 4-digit PIN is required when adding a new employee.' });
    }
    if (cleanPin) {
      for (const other of existingList) {
        if (String(other.id) !== body.id) {
          const otherHash =
            typeof other.pin_hash === 'string' && other.pin_hash.startsWith('pbkdf2_sha256$')
              ? other.pin_hash
              : typeof other.pin_code === 'string' && other.pin_code.startsWith('pbkdf2_sha256$')
              ? other.pin_code
              : '';
          if (otherHash && (await verifyPinHashAsync(cleanPin, otherHash))) {
            return res.status(409).json({ error: 'This 4-digit PIN is already assigned to another staff member.' });
          }
          if (
            !otherHash &&
            typeof other.pin_code === 'string' &&
            isValidPinFormat(other.pin_code) &&
            timingSafePinEquals(cleanPin, other.pin_code.trim())
          ) {
            return res.status(409).json({ error: 'This 4-digit PIN is already assigned to another staff member.' });
          }
        }
      }
    }

    const existingHash =
      typeof existingRow?.pin_hash === 'string' && existingRow.pin_hash
        ? existingRow.pin_hash
        : typeof existingRow?.pin_code === 'string'
        ? existingRow.pin_code
        : undefined;
    const nextHash = cleanPin ? await hashPinAsync(cleanPin) : existingHash;

    let upsertErr: { code?: string; message: string } | null = null;
    if (empLookup.supportsPinHashColumn) {
      const payload: Record<string, unknown> = {
        id: body.id,
        user_id: user.id,
        name: body.name.trim(),
        phone: (body.phone || '').trim(),
        role: body.role,
        pin_code: REDACTED_PIN_SENTINEL,
        is_active: typeof body.isActive === 'boolean' ? body.isActive : true,
      };
      if (nextHash) {
        payload.pin_hash = nextHash;
        payload.pin_updated_at = new Date().toISOString();
      }
      const resUp = await dbClient.from('employees').upsert(payload, { onConflict: 'id' });
      upsertErr = resUp.error;
    }

    if (!empLookup.supportsPinHashColumn || isMissingColumnError(upsertErr)) {
      const legacyPayload: Record<string, unknown> = {
        id: body.id,
        user_id: user.id,
        name: body.name.trim(),
        phone: (body.phone || '').trim(),
        role: body.role,
        pin_code: nextHash || REDACTED_PIN_SENTINEL,
        is_active: typeof body.isActive === 'boolean' ? body.isActive : true,
      };
      const legacyUp = await dbClient.from('employees').upsert(legacyPayload, { onConflict: 'id' });
      upsertErr = legacyUp.error;
    }

    if (upsertErr) {
      return res.status(upsertErr.code === '42501' ? 403 : 400).json({ error: upsertErr.message });
    }
    return res.json({ ok: true, id: body.id, role: body.role, hasPin: Boolean(nextHash) });
  });

  // Delete staff employee (enforces Admin role server-side)
  app.delete('/api/staff/:id', async (req: Request, res: Response) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const opAccess = await checkTenantOperationalAccess(user);
    if (!opAccess.allowed) {
      return res.status(403).json({
        error:
          opAccess.status === 'suspended'
            ? 'Store access is suspended. Staff changes are disabled while records remain preserved.'
            : 'Store account is blocked.',
      });
    }

    const staffToken = (req.header('x-staff-session') || '').trim();
    const userClient = createUserScopedSupabase(user.jwt, staffToken || null);
    if (!userClient) {
      return res.status(503).json({ error: 'Supabase client unavailable.' });
    }

    const targetId = String(req.params.id || '').trim();
    const { data, error } = await userClient.rpc('delete_staff_member', {
      p_employee_id: targetId,
    });

    if (!error) {
      return res.json(data || { ok: true });
    }
    if (!isRpcMissingError(error.message)) {
      const status = error.code === '42501' ? 403 : 400;
      return res.status(status).json({ error: error.message });
    }

    const staff = await resolveVerifiedStaffRole(req, user);
    if (staff.role !== 'admin') {
      return res.status(403).json({ error: 'Only an authenticated Admin can remove staff accounts.' });
    }
    const dbClient = adminSupabase ?? userClient;
    const { error: delErr } = await dbClient
      .from('employees')
      .delete()
      .eq('id', targetId)
      .eq('user_id', user.id);
    if (delErr) {
      return res.status(400).json({ error: delErr.message });
    }
    return res.json({ ok: true });
  });

  // Server-side RBAC authorization preflight check for privileged POS mutations
  app.post('/api/rbac/authorize', async (req: Request, res: Response) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ allowed: false, error: 'Authentication required.' });
    }

    const opAccess = await checkTenantOperationalAccess(user);
    if (!opAccess.allowed) {
      return res.status(403).json({
        allowed: false,
        error:
          opAccess.status === 'suspended'
            ? 'Store access is currently suspended. POS billing is disabled while all shop records remain preserved.'
            : 'Store account is blocked.',
      });
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

    const opAccess = await checkTenantOperationalAccess(user);
    if (!opAccess.allowed) {
      return res.status(403).json({
        delivered: false,
        configured: false,
        error: 'Store access is suspended or blocked.',
      });
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
