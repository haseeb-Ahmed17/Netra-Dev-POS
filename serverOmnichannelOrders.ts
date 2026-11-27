import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildManualWhatsAppFallbackUrl,
  buildOmnichannelNotificationMessage,
  calculateOmnichannelOrderTotals,
  generateOmnichannelOrderNumber,
  isValidOmnichannelTransition,
  normalizeOmnichannelPaymentDefaults,
  parseWhatsAppOrderMessageText,
  resolveProductStockForBranch,
  slugifyStoreName,
  transitionOmnichannelOrderStatus,
} from './src/lib/omnichannelOrders';
import { hasRolePermission, type RoleAction } from './src/lib/rbac';
import { roundCurrency, roundQuantity } from './src/lib/unitUtils';
import type {
  Branch,
  Customer,
  EmployeeRole,
  InventoryAdjustment,
  OmnichannelNotificationEntry,
  OmnichannelOrder,
  OmnichannelOrderStatus,
  OmnichannelPaymentMethod,
  OmnichannelPaymentStatus,
  OrderChannel,
  Product,
  PublicStorefrontData,
  ShopSubscriptionStatus,
  StoreSettings,
} from './src/types';

export interface VerifiedStaffContext {
  role: EmployeeRole | null;
  employeeId: string | null;
  employeeName?: string | null;
}

export interface VerifiedTenantUser {
  id: string;
  email: string;
}

export interface OmnichannelMemoryTenant {
  userId: string;
  subscriptionStatus: ShopSubscriptionStatus;
  settings: StoreSettings;
  branches: Branch[];
  products: Product[];
  customers: Customer[];
  orders: OmnichannelOrder[];
  adjustments: InventoryAdjustment[];
  auditLogs: Array<{
    id: string;
    orderId: string;
    action: string;
    actorId: string;
    actorName: string;
    actorRole: string;
    previousStatus?: string;
    newStatus?: string;
    details: string;
    createdAt: string;
  }>;
}

export class OmnichannelMemoryStore {
  tenants = new Map<string, OmnichannelMemoryTenant>();
  webhookEventIds = new Set<string>();

  registerTenant(tenant: OmnichannelMemoryTenant): void {
    this.tenants.set(tenant.userId, tenant);
  }

  findTenantBySlug(slug: string): OmnichannelMemoryTenant | undefined {
    const clean = slugifyStoreName(slug);
    for (const tenant of this.tenants.values()) {
      const candidate = tenant.settings.storefrontSlug
        ? slugifyStoreName(tenant.settings.storefrontSlug)
        : '';
      if (candidate && candidate === clean) {
        return tenant;
      }
    }
    return undefined;
  }

  findTenantByWhatsAppPhoneId(phoneNumberId: string): OmnichannelMemoryTenant | undefined {
    const clean = phoneNumberId.trim();
    if (!clean) return undefined;
    for (const tenant of this.tenants.values()) {
      if ((tenant.settings.whatsappPhoneNumberId || '').trim() === clean) {
        return tenant;
      }
    }
    return undefined;
  }
}

export interface OmnichannelRouteDeps<TUser extends VerifiedTenantUser = VerifiedTenantUser> {
  adminSupabase: SupabaseClient | null;
  memoryStore?: OmnichannelMemoryStore;
  authenticateReq: (req: Request) => Promise<TUser | null>;
  checkOpAccess: (user: TUser) => Promise<{
    allowed: boolean;
    status?: ShopSubscriptionStatus;
    reason?: string;
  }>;
  resolveStaff: (req: Request, user: TUser) => Promise<VerifiedStaffContext>;
  whatsappEnv?: {
    accessToken?: string;
    phoneNumberId?: string;
    verifyToken?: string;
    appSecret?: string;
    apiVersion?: string;
  };
  onlineGatewayConfigured?: boolean;
  whatsappSendOverride?: (params: {
    phone: string;
    text: string;
  }) => Promise<{ delivered: boolean; providerMessageId?: string; error?: string }>;
}

const storefrontRateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkStorefrontRateLimit(key: string, maxRequests: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = storefrontRateBuckets.get(key);
  if (!entry || now >= entry.resetAt) {
    storefrontRateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count += 1;
  return true;
}

function timingSafeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyWhatsAppSignature(
  rawBody: Buffer | string | undefined,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!appSecret || !signatureHeader || !rawBody) return false;
  const trimmed = signatureHeader.trim();
  if (!trimmed.startsWith('sha256=')) return false;
  const expected =
    'sha256=' +
    crypto
      .createHmac('sha256', appSecret)
      .update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody)
      .digest('hex');
  return timingSafeEquals(trimmed, expected);
}

function isMissingColumnOrTable(err?: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return (
    err.code === '42703' ||
    err.code === '42P01' ||
    err.code === '42883' ||
    err.code === 'PGRST205' ||
    err.code === 'PGRST202' ||
    /column .* does not exist|relation .* does not exist|function .* does not exist|Could not find/i.test(
      err.message || ''
    )
  );
}

function mapOmnichannelOrderRow(row: Record<string, unknown>): OmnichannelOrder {
  return {
    id: String(row.id),
    userId: typeof row.user_id === 'string' ? row.user_id : undefined,
    orderNumber: String(row.order_number || ''),
    channel: (row.channel as OrderChannel) || 'website',
    status: (row.status as OmnichannelOrderStatus) || 'new',
    branchId: typeof row.branch_id === 'string' && row.branch_id ? row.branch_id : undefined,
    branchName:
      typeof row.branch_name === 'string' && row.branch_name ? row.branch_name : undefined,
    customerId:
      typeof row.customer_id === 'string' && row.customer_id ? row.customer_id : undefined,
    customerName: String(row.customer_name || ''),
    customerPhone: String(row.customer_phone || ''),
    deliveryAddress: String(row.delivery_address || ''),
    notes: typeof row.notes === 'string' && row.notes ? row.notes : undefined,
    items: Array.isArray(row.items) ? (row.items as OmnichannelOrder['items']) : [],
    subtotal: roundCurrency(Number(row.subtotal ?? 0)),
    discountAmount: roundCurrency(Number(row.discount_amount ?? 0)),
    taxAmount: roundCurrency(Number(row.tax_amount ?? 0)),
    total: roundCurrency(Number(row.total ?? 0)),
    paymentMethod: (row.payment_method as OmnichannelPaymentMethod) || 'cod',
    paymentStatus: (row.payment_status as OmnichannelPaymentStatus) || 'unpaid',
    paidAmount: roundCurrency(Number(row.paid_amount ?? 0)),
    idempotencyKey:
      typeof row.idempotency_key === 'string' && row.idempotency_key
        ? row.idempotency_key
        : undefined,
    externalMessageId:
      typeof row.external_message_id === 'string' && row.external_message_id
        ? row.external_message_id
        : undefined,
    externalSource:
      row.external_source === 'shopify' ||
      row.external_source === 'woocommerce' ||
      row.external_source === 'custom_website'
        ? row.external_source
        : undefined,
    externalOrderId:
      typeof row.external_order_id === 'string' && row.external_order_id
        ? row.external_order_id
        : undefined,
    externalOrderNumber:
      typeof row.external_order_number === 'string' && row.external_order_number
        ? row.external_order_number
        : undefined,
    integrationId:
      typeof row.integration_id === 'string' && row.integration_id
        ? row.integration_id
        : undefined,
    stockReserved: Boolean(row.stock_reserved),
    stockReservedAt:
      typeof row.stock_reserved_at === 'string' ? row.stock_reserved_at : undefined,
    stockRestoredAt:
      typeof row.stock_restored_at === 'string' ? row.stock_restored_at : undefined,
    statusHistory: Array.isArray(row.status_history)
      ? (row.status_history as OmnichannelOrder['statusHistory'])
      : [],
    notificationLog: Array.isArray(row.notification_log)
      ? (row.notification_log as OmnichannelOrder['notificationLog'])
      : [],
    cancellationReason:
      typeof row.cancellation_reason === 'string' && row.cancellation_reason
        ? row.cancellation_reason
        : undefined,
    createdBy: String(row.created_by || 'customer'),
    updatedBy: String(row.updated_by || 'customer'),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function mapProductRow(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    sku: String(row.sku || ''),
    barcode: String(row.barcode || ''),
    qrCode: typeof row.qr_code === 'string' ? row.qr_code : undefined,
    nameEn: String(row.name_en || ''),
    nameUr: String(row.name_ur || row.name_en || ''),
    category:
      row.category === 'beverages' || row.category === 'bakery' || row.category === 'pantry'
        ? row.category
        : 'pantry',
    brand: typeof row.brand === 'string' ? row.brand : undefined,
    variant: typeof row.variant === 'string' ? row.variant : undefined,
    price: roundCurrency(Number(row.price ?? 0)),
    cost: roundCurrency(Number(row.cost ?? 0)),
    taxRate: Number(row.tax_rate ?? 0),
    sellingUnit: (row.selling_unit as Product['sellingUnit']) || 'piece',
    stock: roundQuantity(Number(row.stock ?? 0)),
    branchId: typeof row.branch_id === 'string' ? row.branch_id : undefined,
    branchStock:
      row.branch_stock && typeof row.branch_stock === 'object'
        ? (row.branch_stock as Record<string, number>)
        : undefined,
    image: String(row.image || ''),
  };
}

async function dispatchWhatsAppNotification(params: {
  storeName: string;
  order: OmnichannelOrder;
  event: OmnichannelNotificationEntry['event'];
  env: OmnichannelRouteDeps['whatsappEnv'];
  sendOverride?: OmnichannelRouteDeps['whatsappSendOverride'];
}): Promise<OmnichannelNotificationEntry> {
  const nowIso = new Date().toISOString();
  const messagePreview = buildOmnichannelNotificationMessage(
    params.storeName,
    params.order,
    params.event
  );
  const manualShareUrl = buildManualWhatsAppFallbackUrl(
    params.order.customerPhone,
    messagePreview
  );

  const accessToken = params.env?.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN ?? '';
  const phoneNumberId =
    params.env?.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  const apiVersion = params.env?.apiVersion ?? process.env.WHATSAPP_API_VERSION ?? 'v20.0';

  if (params.sendOverride) {
    try {
      const res = await params.sendOverride({
        phone: params.order.customerPhone,
        text: messagePreview,
      });
      return {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        event: params.event,
        channel: 'whatsapp',
        status: res.delivered ? 'sent' : 'manual_fallback',
        recipientPhone: params.order.customerPhone,
        messagePreview,
        manualShareUrl: res.delivered ? undefined : manualShareUrl,
        error: res.error,
        createdAt: nowIso,
      };
    } catch (err) {
      return {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        event: params.event,
        channel: 'whatsapp',
        status: 'failed',
        recipientPhone: params.order.customerPhone,
        messagePreview,
        manualShareUrl,
        error: err instanceof Error ? err.message : 'Notification dispatch failed.',
        createdAt: nowIso,
      };
    }
  }

  if (!accessToken || !phoneNumberId) {
    return {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      event: params.event,
      channel: 'whatsapp',
      status: 'manual_fallback',
      recipientPhone: params.order.customerPhone,
      messagePreview,
      manualShareUrl,
      createdAt: nowIso,
    };
  }

  const digits = params.order.customerPhone.replace(/[^\d]/g, '');
  const toPhone = digits.startsWith('0') && digits.length >= 10 ? `92${digits.slice(1)}` : digits;
  if (toPhone.length < 10) {
    return {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      event: params.event,
      channel: 'whatsapp',
      status: 'skipped',
      recipientPhone: params.order.customerPhone,
      messagePreview,
      error: 'Invalid recipient phone number.',
      createdAt: nowIso,
    };
  }

  try {
    const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'text',
        text: { preview_url: false, body: messagePreview.slice(0, 4096) },
      }),
    });

    if (!upstream.ok) {
      const payload = (await upstream.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      return {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        event: params.event,
        channel: 'whatsapp',
        status: 'manual_fallback',
        recipientPhone: params.order.customerPhone,
        messagePreview,
        manualShareUrl,
        error: payload.error?.message || `WhatsApp Cloud API HTTP ${upstream.status}`,
        createdAt: nowIso,
      };
    }

    return {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      event: params.event,
      channel: 'whatsapp',
      status: 'sent',
      recipientPhone: params.order.customerPhone,
      messagePreview,
      createdAt: nowIso,
    };
  } catch (err) {
    return {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      event: params.event,
      channel: 'whatsapp',
      status: 'manual_fallback',
      recipientPhone: params.order.customerPhone,
      messagePreview,
      manualShareUrl,
      error: err instanceof Error ? err.message : 'Network error calling WhatsApp Cloud API.',
      createdAt: nowIso,
    };
  }
}

export function registerOmnichannelRoutes<TUser extends VerifiedTenantUser = VerifiedTenantUser>(
  app: Express,
  deps: OmnichannelRouteDeps<TUser>
): void {
  const { adminSupabase, memoryStore, authenticateReq, checkOpAccess, resolveStaff } = deps;
  const onlineGatewayConfigured = Boolean(deps.onlineGatewayConfigured);

  function getWaEnv() {
    return {
      accessToken: deps.whatsappEnv?.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN ?? '',
      phoneNumberId:
        deps.whatsappEnv?.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
      verifyToken: deps.whatsappEnv?.verifyToken ?? process.env.WHATSAPP_VERIFY_TOKEN ?? '',
      appSecret: deps.whatsappEnv?.appSecret ?? process.env.WHATSAPP_APP_SECRET ?? '',
      apiVersion: deps.whatsappEnv?.apiVersion ?? process.env.WHATSAPP_API_VERSION ?? 'v20.0',
    };
  }

  async function appendSupabaseOrderAuditLog(params: {
    userId: string;
    orderId: string;
    action: string;
    actorId: string;
    actorName: string;
    actorRole: string;
    previousStatus?: string | null;
    newStatus?: string | null;
    details: string;
    createdAt: string;
  }): Promise<void> {
    if (!adminSupabase) return;
    try {
      await adminSupabase.from('order_audit_logs').insert({
        id: `oaud-${crypto.randomUUID()}`,
        user_id: params.userId,
        order_id: params.orderId,
        action: params.action,
        actor_id: params.actorId,
        actor_name: params.actorName,
        actor_role: params.actorRole,
        previous_status: params.previousStatus ?? null,
        new_status: params.newStatus ?? null,
        details: params.details,
        created_at: params.createdAt,
      });
    } catch {
      // Best-effort audit persistence for fallback paths when RPCs are unavailable
    }
  }

  async function requireAuthorizedStaff(
    req: Request,
    res: Response,
    requiredAction: RoleAction
  ): Promise<{
    user: VerifiedTenantUser;
    staff: { role: EmployeeRole; employeeId: string; employeeName: string };
  } | null> {
    const user = await authenticateReq(req);
    if (!user) {
      res.status(401).json({ ok: false, error: 'Authentication required.' });
      return null;
    }

    const opAccess = await checkOpAccess(user);
    if (!opAccess.allowed) {
      res.status(403).json({
        ok: false,
        error:
          opAccess.status === 'suspended'
            ? 'Store access is suspended. Order operations are paused while records remain preserved.'
            : 'Store account is blocked.',
      });
      return null;
    }

    const staff = await resolveStaff(req, user);
    if (!staff.role) {
      res.status(401).json({ ok: false, error: 'Verified staff PIN session is required.' });
      return null;
    }

    if (!hasRolePermission(staff.role, requiredAction)) {
      res.status(403).json({
        ok: false,
        error: `Role '${staff.role}' is not authorized for '${requiredAction}'.`,
      });
      return null;
    }

    let employeeName = staff.employeeName || '';
    if (!employeeName && memoryStore) {
      employeeName = user.email.split('@')[0] || staff.role;
    } else if (!employeeName && adminSupabase && staff.employeeId) {
      const empRes = await adminSupabase
        .from('employees')
        .select('name')
        .eq('id', staff.employeeId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!empRes.error && empRes.data?.name) {
        employeeName = String(empRes.data.name);
      }
    }

    return {
      user,
      staff: {
        role: staff.role,
        employeeId: staff.employeeId || `staff-${staff.role}`,
        employeeName: employeeName || staff.role.toUpperCase(),
      },
    };
  }

  async function loadPublicStorefrontBySlug(
    slug: string
  ): Promise<
    | {
        ok: true;
        userId: string;
        data: PublicStorefrontData;
        products: Product[];
      }
    | { ok: false; status: number; error: string }
  > {
    const cleanSlug = slugifyStoreName(slug);
    const waEnv = getWaEnv();
    const whatsappConfigured = Boolean(waEnv.accessToken && waEnv.phoneNumberId);

    if (memoryStore) {
      const tenant = memoryStore.findTenantBySlug(cleanSlug);
      if (!tenant || !tenant.settings.storefrontEnabled) {
        return { ok: false, status: 404, error: 'Online storefront not found or currently offline.' };
      }
      if (tenant.subscriptionStatus === 'suspended' || tenant.subscriptionStatus === 'blocked') {
        return { ok: false, status: 403, error: 'This store is currently unavailable for online orders.' };
      }

      const publicBranches = tenant.branches
        .filter((b) => b.isActive)
        .map((b) => ({ id: b.id, name: b.name, isMain: b.isMain }));

      const defaultBranchId =
        publicBranches.find((b) => b.isMain)?.id || publicBranches[0]?.id;

      const publicProducts = tenant.products
        .filter((p) => resolveProductStockForBranch(p, defaultBranchId) > 0 || p.stock > 0)
        .map((p) => ({
          id: p.id,
          sku: p.sku,
          nameEn: p.nameEn,
          nameUr: p.nameUr,
          category: p.category,
          brand: p.brand,
          variant: p.variant,
          price: roundCurrency(p.price),
          sellingUnit: p.sellingUnit,
          stock: roundQuantity(p.stock),
          branchStock: p.branchStock,
          image: p.image,
        }));

      return {
        ok: true,
        userId: tenant.userId,
        products: tenant.products,
        data: {
          storeSlug: cleanSlug,
          storeName: tenant.settings.storeName,
          storeDescription: tenant.settings.storefrontDescription || '',
          phone: tenant.settings.phone || '',
          address: tenant.settings.address || '',
          codEnabled: tenant.settings.codEnabled !== false,
          onlinePaymentConfigured: onlineGatewayConfigured,
          whatsappConfigured,
          defaultTaxRate: Number(tenant.settings.defaultTaxRate ?? 0),
          branches: publicBranches,
          products: publicProducts,
        },
      };
    }

    if (!adminSupabase) {
      return { ok: false, status: 503, error: 'Storefront service unavailable.' };
    }

    const storeRes = await adminSupabase
      .from('store_settings')
      .select(
        'user_id, store_name, phone, address, default_tax_rate, storefront_slug, storefront_enabled, storefront_description, cod_enabled'
      )
      .ilike('storefront_slug', cleanSlug)
      .maybeSingle();

    if (storeRes.error) {
      if (isMissingColumnOrTable(storeRes.error)) {
        return { ok: false, status: 503, error: 'Storefront schema migration has not been applied yet.' };
      }
      return { ok: false, status: 500, error: storeRes.error.message };
    }

    const row = storeRes.data as Record<string, unknown> | null;
    if (!row || !row.storefront_enabled) {
      return { ok: false, status: 404, error: 'Online storefront not found or currently offline.' };
    }

    const tenantUserId = String(row.user_id);

    const subRes = await adminSupabase
      .from('subscriptions')
      .select('is_blocked, status')
      .eq('user_id', tenantUserId)
      .maybeSingle();

    if (!subRes.error && subRes.data) {
      const st = String((subRes.data as Record<string, unknown>).status || '');
      if (Boolean((subRes.data as Record<string, unknown>).is_blocked) || st === 'suspended' || st === 'blocked') {
        return { ok: false, status: 403, error: 'This store is currently unavailable for online orders.' };
      }
    }

    const [branchesRes, productsRes] = await Promise.all([
      adminSupabase
        .from('branches')
        .select('id, name, is_main, is_active')
        .eq('user_id', tenantUserId)
        .eq('is_active', true),
      adminSupabase
        .from('products')
        .select('id, sku, barcode, name_en, name_ur, category, brand, variant, price, tax_rate, selling_unit, stock, branch_stock, image')
        .eq('user_id', tenantUserId)
        .order('name_en', { ascending: true }),
    ]);

    const branches = ((branchesRes.data || []) as Array<Record<string, unknown>>).map((b) => ({
      id: String(b.id),
      name: String(b.name || 'Main Branch'),
      isMain: Boolean(b.is_main),
    }));

    const fullProducts = ((productsRes.data || []) as Array<Record<string, unknown>>).map(mapProductRow);
    const defaultBranchId = branches.find((b) => b.isMain)?.id || branches[0]?.id;

    const publicProducts = fullProducts
      .filter((p) => resolveProductStockForBranch(p, defaultBranchId) > 0 || p.stock > 0)
      .map((p) => ({
        id: p.id,
        sku: p.sku,
        nameEn: p.nameEn,
        nameUr: p.nameUr,
        category: p.category,
        brand: p.brand,
        variant: p.variant,
        price: p.price,
        sellingUnit: p.sellingUnit,
        stock: p.stock,
        branchStock: p.branchStock,
        image: p.image,
      }));

    return {
      ok: true,
      userId: tenantUserId,
      products: fullProducts,
      data: {
        storeSlug: cleanSlug,
        storeName: String(row.store_name || 'Shop Storefront'),
        storeDescription: String(row.storefront_description || ''),
        phone: String(row.phone || ''),
        address: String(row.address || ''),
        codEnabled: row.cod_enabled !== false,
        onlinePaymentConfigured: onlineGatewayConfigured,
        whatsappConfigured,
        defaultTaxRate: Number(row.default_tax_rate ?? 0),
        branches,
        products: publicProducts,
      },
    };
  }

  // =========================================================================
  // 1. PUBLIC ONLINE STOREFRONT ENDPOINTS (No Auth Required, Strictly Public)
  // =========================================================================

  app.get('/api/storefront/:slug', async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    if (!checkStorefrontRateLimit(`sf-get:${ip}`, 180)) {
      return res.status(429).json({ ok: false, error: 'Too many storefront requests. Please wait a moment.' });
    }

    const loaded = await loadPublicStorefrontBySlug(String(req.params.slug || ''));
    if (!loaded.ok) {
      return res.status(loaded.status).json({ ok: false, error: loaded.error });
    }
    return res.json({ ok: true, storefront: loaded.data });
  });

  app.post('/api/storefront/:slug/orders', async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    if (!checkStorefrontRateLimit(`sf-post:${ip}`, 60)) {
      return res.status(429).json({ ok: false, error: 'Too many order submissions. Please wait a moment.' });
    }

    const loaded = await loadPublicStorefrontBySlug(String(req.params.slug || ''));
    if (!loaded.ok) {
      return res.status(loaded.status).json({ ok: false, error: loaded.error });
    }

    const body = (req.body || {}) as {
      customerName?: string;
      customerPhone?: string;
      deliveryAddress?: string;
      notes?: string;
      branchId?: string;
      paymentMethod?: OmnichannelPaymentMethod;
      idempotencyKey?: string;
      items?: Array<{ productId: string; quantity: number }>;
    };

    const customerName = String(body.customerName || '').trim();
    const customerPhone = String(body.customerPhone || '').trim();
    const deliveryAddress = String(body.deliveryAddress || '').trim();
    const notes = String(body.notes || '').trim();
    const idempotencyKey = String(body.idempotencyKey || req.header('x-idempotency-key') || '').trim();

    if (customerName.length < 2) {
      return res.status(400).json({ ok: false, error: 'Customer name is required.' });
    }
    if (customerPhone.replace(/[^\d]/g, '').length < 7) {
      return res.status(400).json({ ok: false, error: 'A valid phone number is required.' });
    }
    if (deliveryAddress.length < 4) {
      return res.status(400).json({ ok: false, error: 'Delivery address is required.' });
    }

    const requestedMethod: OmnichannelPaymentMethod = body.paymentMethod || 'cod';
    if (requestedMethod === 'cod' && !loaded.data.codEnabled) {
      return res.status(400).json({ ok: false, error: 'Cash on Delivery is disabled for this storefront.' });
    }
    const allowedPublicMethods: OmnichannelPaymentMethod[] = [
      'cod',
      'bank_transfer',
      'jazzcash',
      'easypaisa',
      'online',
    ];
    if (!allowedPublicMethods.includes(requestedMethod)) {
      return res.status(400).json({ ok: false, error: 'Unsupported storefront payment method.' });
    }

    const paymentNorm = normalizeOmnichannelPaymentDefaults(
      requestedMethod,
      undefined,
      onlineGatewayConfigured
    );
    if (paymentNorm.ok === false) {
      return res.status(400).json({ ok: false, error: paymentNorm.error });
    }

    // Validate branch belongs to this tenant
    let resolvedBranchId: string | undefined;
    let resolvedBranchName: string | undefined;
    if (body.branchId) {
      const branchMatch = loaded.data.branches.find((b) => b.id === body.branchId);
      if (!branchMatch) {
        return res.status(400).json({ ok: false, error: 'Selected store branch is invalid.' });
      }
      resolvedBranchId = branchMatch.id;
      resolvedBranchName = branchMatch.name;
    } else if (loaded.data.branches.length > 0) {
      const main = loaded.data.branches.find((b) => b.isMain) || loaded.data.branches[0];
      resolvedBranchId = main.id;
      resolvedBranchName = main.name;
    }

    // Check idempotency BEFORE creating order
    if (idempotencyKey) {
      if (memoryStore) {
        const tenant = memoryStore.tenants.get(loaded.userId);
        const dup = tenant?.orders.find((o) => o.idempotencyKey === idempotencyKey);
        if (dup) {
          return res.status(200).json({
            ok: true,
            deduplicated: true,
            order: {
              id: dup.id,
              orderNumber: dup.orderNumber,
              status: dup.status,
              total: dup.total,
              paymentMethod: dup.paymentMethod,
              paymentStatus: dup.paymentStatus,
              createdAt: dup.createdAt,
            },
          });
        }
      } else if (adminSupabase) {
        const dupRes = await adminSupabase
          .from('omnichannel_orders')
          .select('*')
          .eq('user_id', loaded.userId)
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle();
        if (!dupRes.error && dupRes.data) {
          const dup = mapOmnichannelOrderRow(dupRes.data as Record<string, unknown>);
          return res.status(200).json({
            ok: true,
            deduplicated: true,
            order: {
              id: dup.id,
              orderNumber: dup.orderNumber,
              status: dup.status,
              total: dup.total,
              paymentMethod: dup.paymentMethod,
              paymentStatus: dup.paymentStatus,
              createdAt: dup.createdAt,
            },
          });
        }
      }
    }

    // Authoritative catalog pricing & stock availability pre-check (does NOT deduct stock on 'new')
    const productsById = new Map(loaded.products.map((p) => [p.id, p]));
    const calc = calculateOmnichannelOrderTotals(body.items || [], productsById, {
      branchId: resolvedBranchId,
    });
    if (calc.ok === false) {
      return res.status(400).json({ ok: false, code: calc.code, error: calc.error });
    }

    for (const item of calc.items) {
      const prod = productsById.get(item.productId)!;
      const avail = resolveProductStockForBranch(prod, resolvedBranchId);
      if (avail + 0.0001 < item.quantity) {
        return res.status(409).json({
          ok: false,
          code: 'INSUFFICIENT_STOCK',
          error: `Only ${avail} ${prod.sellingUnit} available for ${prod.nameEn}.`,
        });
      }
    }

    const nowIso = new Date().toISOString();
    const orderNumber = generateOmnichannelOrderNumber('website');
    const orderId = `omni-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const newOrder: OmnichannelOrder = {
      id: orderId,
      userId: loaded.userId,
      orderNumber,
      channel: 'website',
      status: 'new',
      branchId: resolvedBranchId,
      branchName: resolvedBranchName,
      customerName,
      customerPhone,
      deliveryAddress,
      notes: notes || undefined,
      items: calc.items,
      subtotal: calc.subtotal,
      discountAmount: calc.discountAmount,
      taxAmount: calc.taxAmount,
      total: calc.total,
      paymentMethod: paymentNorm.paymentMethod,
      paymentStatus: paymentNorm.paymentStatus,
      paidAmount: 0,
      idempotencyKey: idempotencyKey || undefined,
      stockReserved: false,
      statusHistory: [
        {
          status: 'new',
          changedAt: nowIso,
          actorId: 'public_storefront',
          actorName: customerName,
          actorRole: 'customer',
          note: 'Order placed on public storefront',
        },
      ],
      notificationLog: [],
      createdBy: customerName,
      updatedBy: customerName,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const notif = await dispatchWhatsAppNotification({
      storeName: loaded.data.storeName,
      order: newOrder,
      event: 'new_order',
      env: getWaEnv(),
      sendOverride: deps.whatsappSendOverride,
    });
    newOrder.notificationLog = [notif];

    if (memoryStore) {
      const tenant = memoryStore.tenants.get(loaded.userId)!;
      tenant.orders.unshift(newOrder);
      tenant.auditLogs.unshift({
        id: `oaud-${Date.now()}`,
        orderId: newOrder.id,
        action: 'website_order_created',
        actorId: 'public_storefront',
        actorName: customerName,
        actorRole: 'customer',
        newStatus: 'new',
        details: `Website order ${orderNumber} placed (${newOrder.total}). Stock NOT deducted yet.`,
        createdAt: nowIso,
      });
    } else if (adminSupabase) {
      const rpcRes = await adminSupabase.rpc('create_omnichannel_order', {
        p_user_id: loaded.userId,
        p_channel: 'website',
        p_customer_name: customerName,
        p_customer_phone: customerPhone,
        p_delivery_address: deliveryAddress,
        p_notes: notes,
        p_branch_id: resolvedBranchId ?? null,
        p_customer_id: null,
        p_discount_amount: 0,
        p_payment_method: paymentNorm.paymentMethod,
        p_payment_status: paymentNorm.paymentStatus,
        p_paid_amount: 0,
        p_idempotency_key: idempotencyKey || null,
        p_external_message_id: null,
        p_order_number: orderNumber,
        p_items: calc.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        p_actor_id: 'public_storefront',
        p_actor_name: customerName,
        p_actor_role: 'customer',
        p_notification_entry: notif,
        p_allow_online_payment: onlineGatewayConfigured,
        p_require_stock_check: true,
        p_history_note: 'Order placed on public storefront',
        p_audit_action: 'website_order_created',
        p_audit_details: `Website order ${orderNumber} placed (${newOrder.total}). Stock NOT deducted yet.`,
      });

      if (rpcRes.error && !isMissingColumnOrTable(rpcRes.error)) {
        const statusCode = rpcRes.error.code === '42501' ? 403 : 500;
        return res.status(statusCode).json({ ok: false, error: rpcRes.error.message });
      }

      if (!rpcRes.error && rpcRes.data) {
        const payload = rpcRes.data as {
          ok?: boolean;
          deduplicated?: boolean;
          code?: string;
          error?: string;
          order?: Record<string, unknown>;
        };
        if (!payload.ok) {
          const statusCode =
            payload.code === 'INSUFFICIENT_STOCK' || payload.code === 'OUT_OF_STOCK'
              ? 409
              : payload.code === 'STORE_UNAVAILABLE'
              ? 403
              : payload.code === 'STOREFRONT_OFFLINE'
              ? 404
              : 400;
          return res.status(statusCode).json({
            ok: false,
            code: payload.code,
            error: payload.error || 'Could not submit storefront order.',
          });
        }
        const saved = mapOmnichannelOrderRow(payload.order!);
        if (payload.deduplicated) {
          return res.status(200).json({
            ok: true,
            deduplicated: true,
            order: {
              id: saved.id,
              orderNumber: saved.orderNumber,
              status: saved.status,
              total: saved.total,
              paymentMethod: saved.paymentMethod,
              paymentStatus: saved.paymentStatus,
              createdAt: saved.createdAt,
            },
          });
        }
        return res.status(201).json({
          ok: true,
          order: {
            id: saved.id,
            orderNumber: saved.orderNumber,
            status: saved.status,
            subtotal: saved.subtotal,
            taxAmount: saved.taxAmount,
            total: saved.total,
            paymentMethod: saved.paymentMethod,
            paymentStatus: saved.paymentStatus,
            createdAt: saved.createdAt,
            notification: notif,
          },
        });
      }

      const insertRes = await adminSupabase.from('omnichannel_orders').insert({
        id: newOrder.id,
        user_id: loaded.userId,
        branch_id: newOrder.branchId ?? null,
        branch_name: newOrder.branchName ?? '',
        order_number: newOrder.orderNumber,
        channel: 'website',
        status: 'new',
        customer_id: null,
        customer_name: newOrder.customerName,
        customer_phone: newOrder.customerPhone,
        delivery_address: newOrder.deliveryAddress,
        notes: newOrder.notes ?? '',
        items: newOrder.items,
        subtotal: newOrder.subtotal,
        discount_amount: newOrder.discountAmount,
        tax_amount: newOrder.taxAmount,
        total: newOrder.total,
        payment_method: newOrder.paymentMethod,
        payment_status: newOrder.paymentStatus,
        paid_amount: 0,
        idempotency_key: newOrder.idempotencyKey ?? null,
        stock_reserved: false,
        status_history: newOrder.statusHistory,
        notification_log: newOrder.notificationLog,
        created_by: newOrder.createdBy,
        updated_by: newOrder.updatedBy,
        created_at: nowIso,
        updated_at: nowIso,
      });

      if (insertRes.error) {
        return res.status(500).json({ ok: false, error: insertRes.error.message });
      }

      await appendSupabaseOrderAuditLog({
        userId: loaded.userId,
        orderId: newOrder.id,
        action: 'website_order_created',
        actorId: 'public_storefront',
        actorName: customerName,
        actorRole: 'customer',
        newStatus: 'new',
        details: `Website order ${orderNumber} placed (${newOrder.total}). Stock NOT deducted yet.`,
        createdAt: nowIso,
      });
    }

    return res.status(201).json({
      ok: true,
      order: {
        id: newOrder.id,
        orderNumber: newOrder.orderNumber,
        status: newOrder.status,
        subtotal: newOrder.subtotal,
        taxAmount: newOrder.taxAmount,
        total: newOrder.total,
        paymentMethod: newOrder.paymentMethod,
        paymentStatus: newOrder.paymentStatus,
        createdAt: newOrder.createdAt,
        notification: notif,
      },
    });
  });

  // =========================================================================
  // 2. OFFICIAL META WHATSAPP CLOUD API WEBHOOKS
  // =========================================================================

  app.get('/api/webhooks/whatsapp', (req: Request, res: Response) => {
    const { verifyToken } = getWaEnv();
    const mode = String(req.query['hub.mode'] || '');
    const token = String(req.query['hub.verify_token'] || '');
    const challenge = String(req.query['hub.challenge'] || '');

    if (!verifyToken) {
      return res.status(503).json({
        ok: false,
        error: 'WHATSAPP_VERIFY_TOKEN is not configured on this server.',
      });
    }

    if (mode === 'subscribe' && timingSafeEquals(token, verifyToken)) {
      return res.status(200).type('text/plain').send(challenge);
    }
    return res.status(403).json({ ok: false, error: 'Invalid webhook verification token.' });
  });

  app.post('/api/webhooks/whatsapp', async (req: Request, res: Response) => {
    const waEnv = getWaEnv();
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const sigHeader = req.header('x-hub-signature-256');

    if (!waEnv.appSecret) {
      return res.status(503).json({
        ok: false,
        error: 'WHATSAPP_APP_SECRET is not configured for webhook signature verification.',
      });
    }

    const payloadBytes = rawBody ?? Buffer.from(JSON.stringify(req.body || {}), 'utf8');
    if (!verifyWhatsAppSignature(payloadBytes, sigHeader, waEnv.appSecret)) {
      return res.status(401).json({ ok: false, error: 'Invalid X-Hub-Signature-256.' });
    }

    const body = req.body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            metadata?: { phone_number_id?: string };
            contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
            messages?: Array<{
              id?: string;
              from?: string;
              type?: string;
              text?: { body?: string };
              order?: { product_items?: Array<{ product_retailer_id?: string; quantity?: number }> };
            }>;
          };
        }>;
      }>;
    };

    const createdOrders: string[] = [];
    const deduplicatedMessages: string[] = [];

    const entries = Array.isArray(body?.entry) ? body.entry : [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const val = change.value;
        if (!val || !Array.isArray(val.messages)) continue;

        const phoneNumberId = String(val.metadata?.phone_number_id || '').trim();
        const contactsMap = new Map<string, string>();
        for (const c of val.contacts || []) {
          if (c.wa_id) contactsMap.set(c.wa_id, c.profile?.name || 'WhatsApp Customer');
        }

        // Resolve tenant by whatsapp_business_phone_id
        let tenantUserId: string | null = null;
        let tenantStoreName = 'Shop';
        let tenantProducts: Product[] = [];
        let tenantBranches: Branch[] = [];

        if (memoryStore) {
          const tenant = memoryStore.findTenantByWhatsAppPhoneId(phoneNumberId);
          if (!tenant) continue;
          if (tenant.subscriptionStatus === 'suspended' || tenant.subscriptionStatus === 'blocked') {
            continue;
          }
          tenantUserId = tenant.userId;
          tenantStoreName = tenant.settings.storeName;
          tenantProducts = tenant.products;
          tenantBranches = tenant.branches;
        } else if (adminSupabase && phoneNumberId) {
          const stRes = await adminSupabase
            .from('store_settings')
            .select('user_id, store_name')
            .eq('whatsapp_business_phone_id', phoneNumberId)
            .maybeSingle();
          if (stRes.error || !stRes.data) continue;
          tenantUserId = String((stRes.data as Record<string, unknown>).user_id);
          tenantStoreName = String((stRes.data as Record<string, unknown>).store_name || 'Shop');

          const subRes = await adminSupabase
            .from('subscriptions')
            .select('is_blocked, status')
            .eq('user_id', tenantUserId)
            .maybeSingle();
          if (
            !subRes.error &&
            subRes.data &&
            (Boolean((subRes.data as Record<string, unknown>).is_blocked) ||
              ['suspended', 'blocked'].includes(
                String((subRes.data as Record<string, unknown>).status || '')
              ))
          ) {
            continue;
          }

          const [prodRes, branchRes] = await Promise.all([
            adminSupabase.from('products').select('*').eq('user_id', tenantUserId),
            adminSupabase.from('branches').select('*').eq('user_id', tenantUserId).eq('is_active', true),
          ]);
          tenantProducts = ((prodRes.data || []) as Array<Record<string, unknown>>).map(mapProductRow);
          tenantBranches = ((branchRes.data || []) as Array<Record<string, unknown>>).map((b) => ({
            id: String(b.id),
            name: String(b.name || 'Main'),
            code: String(b.code || 'MAIN'),
            address: String(b.address || ''),
            phone: String(b.phone || ''),
            isMain: Boolean(b.is_main),
            isActive: b.is_active !== false,
            createdAt: String(b.created_at || ''),
          }));
        }

        if (!tenantUserId) continue;

        const defaultBranch = tenantBranches.find((b) => b.isMain) || tenantBranches[0];
        const productsById = new Map(tenantProducts.map((p) => [p.id, p]));

        for (const msg of val.messages) {
          const messageId = String(msg.id || '').trim();
          const fromPhone = String(msg.from || '').trim();
          if (!messageId || !fromPhone) continue;

          // Webhook event deduplication
          const eventKey = `whatsapp:${messageId}`;
          if (memoryStore) {
            if (memoryStore.webhookEventIds.has(eventKey)) {
              deduplicatedMessages.push(messageId);
              continue;
            }
          } else if (adminSupabase) {
            const evRes = await adminSupabase
              .from('webhook_events')
              .select('id')
              .eq('channel', 'whatsapp')
              .eq('event_id', messageId)
              .maybeSingle();
            if (!evRes.error && evRes.data) {
              deduplicatedMessages.push(messageId);
              continue;
            }
          }

          let rawItems: Array<{ productId: string; quantity: number }> = [];
          let extraNotes = '';

          if (msg.order?.product_items && Array.isArray(msg.order.product_items)) {
            for (const pi of msg.order.product_items) {
              const retailerId = String(pi.product_retailer_id || '').trim().toLowerCase();
              const matched = tenantProducts.find(
                (p) => p.sku.toLowerCase() === retailerId || p.id.toLowerCase() === retailerId
              );
              if (matched && Number(pi.quantity) > 0) {
                rawItems.push({ productId: matched.id, quantity: roundQuantity(Number(pi.quantity)) });
              }
            }
          }

          if (rawItems.length === 0 && msg.text?.body) {
            const parsed = parseWhatsAppOrderMessageText(msg.text.body, tenantProducts);
            rawItems = parsed.items;
            if (parsed.unmatchedLines.length > 0) {
              extraNotes = `Unmatched WhatsApp text: ${parsed.unmatchedLines.join('; ')}`;
            }
          }

          if (rawItems.length === 0) {
            // Do not create empty orders for casual non-order WhatsApp messages; mark webhook processed.
            if (memoryStore) memoryStore.webhookEventIds.add(eventKey);
            continue;
          }

          const calc = calculateOmnichannelOrderTotals(rawItems, productsById, {
            branchId: defaultBranch?.id,
          });
          if (calc.ok === false) {
            if (memoryStore) memoryStore.webhookEventIds.add(eventKey);
            continue;
          }

          const customerName = contactsMap.get(fromPhone) || `WhatsApp ${fromPhone}`;
          const nowIso = new Date().toISOString();
          const orderNumber = generateOmnichannelOrderNumber('whatsapp');
          const orderId = `omni-wa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

          const order: OmnichannelOrder = {
            id: orderId,
            userId: tenantUserId,
            orderNumber,
            channel: 'whatsapp',
            status: 'new',
            branchId: defaultBranch?.id,
            branchName: defaultBranch?.name,
            customerName,
            customerPhone: fromPhone,
            deliveryAddress: 'Confirm via WhatsApp',
            notes: extraNotes || msg.text?.body || undefined,
            items: calc.items,
            subtotal: calc.subtotal,
            discountAmount: calc.discountAmount,
            taxAmount: calc.taxAmount,
            total: calc.total,
            paymentMethod: 'cod',
            paymentStatus: 'cod_pending',
            paidAmount: 0,
            externalMessageId: messageId,
            stockReserved: false,
            statusHistory: [
              {
                status: 'new',
                changedAt: nowIso,
                actorId: 'whatsapp_webhook',
                actorName: customerName,
                actorRole: 'webhook',
                note: `Incoming WhatsApp order (${messageId})`,
              },
            ],
            notificationLog: [],
            createdBy: 'WhatsApp Webhook',
            updatedBy: 'WhatsApp Webhook',
            createdAt: nowIso,
            updatedAt: nowIso,
          };

          const notif = await dispatchWhatsAppNotification({
            storeName: tenantStoreName,
            order,
            event: 'new_order',
            env: waEnv,
            sendOverride: deps.whatsappSendOverride,
          });
          order.notificationLog = [notif];

          if (memoryStore) {
            memoryStore.webhookEventIds.add(eventKey);
            const memTenant = memoryStore.tenants.get(tenantUserId);
            memTenant?.orders.unshift(order);
            memTenant?.auditLogs.unshift({
              id: `oaud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              orderId: order.id,
              action: 'whatsapp_order_created',
              actorId: 'whatsapp_webhook',
              actorName: customerName,
              actorRole: 'webhook',
              newStatus: 'new',
              details: `Incoming WhatsApp order ${order.orderNumber} (${messageId}) logged.`,
              createdAt: nowIso,
            });
            createdOrders.push(order.orderNumber);
          } else if (adminSupabase) {
            const payloadHash = crypto
              .createHash('sha256')
              .update(payloadBytes)
              .digest('hex');
            const whIns = await adminSupabase.from('webhook_events').insert({
              id: `whev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              channel: 'whatsapp',
              event_id: messageId,
              user_id: tenantUserId,
              payload_hash: payloadHash,
              status: 'processed',
              created_at: nowIso,
            });
            if (whIns.error?.code === '23505') {
              deduplicatedMessages.push(messageId);
              continue;
            }

            const rpcRes = await adminSupabase.rpc('create_omnichannel_order', {
              p_user_id: tenantUserId,
              p_channel: 'whatsapp',
              p_customer_name: order.customerName,
              p_customer_phone: order.customerPhone,
              p_delivery_address: order.deliveryAddress,
              p_notes: order.notes ?? '',
              p_branch_id: order.branchId ?? null,
              p_customer_id: null,
              p_discount_amount: 0,
              p_payment_method: 'cod',
              p_payment_status: 'cod_pending',
              p_paid_amount: 0,
              p_idempotency_key: null,
              p_external_message_id: messageId,
              p_order_number: order.orderNumber,
              p_items: calc.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
              })),
              p_actor_id: 'whatsapp_webhook',
              p_actor_name: order.customerName,
              p_actor_role: 'webhook',
              p_notification_entry: notif,
              p_allow_online_payment: onlineGatewayConfigured,
              p_require_stock_check: false,
              p_history_note: `Incoming WhatsApp order (${messageId})`,
              p_audit_action: 'whatsapp_order_created',
              p_audit_details: `Incoming WhatsApp order ${order.orderNumber} (${messageId}) logged.`,
            });

            if (!rpcRes.error && rpcRes.data) {
              const payload = rpcRes.data as {
                ok?: boolean;
                deduplicated?: boolean;
                order?: Record<string, unknown>;
              };
              if (payload.deduplicated) {
                deduplicatedMessages.push(messageId);
              } else if (payload.ok && payload.order) {
                createdOrders.push(String(payload.order.order_number || order.orderNumber));
              }
            } else if (!rpcRes.error || isMissingColumnOrTable(rpcRes.error)) {
              const ins = await adminSupabase.from('omnichannel_orders').insert({
                id: order.id,
                user_id: tenantUserId,
                branch_id: order.branchId ?? null,
                branch_name: order.branchName ?? '',
                order_number: order.orderNumber,
                channel: 'whatsapp',
                status: 'new',
                customer_name: order.customerName,
                customer_phone: order.customerPhone,
                delivery_address: order.deliveryAddress,
                notes: order.notes ?? '',
                items: order.items,
                subtotal: order.subtotal,
                discount_amount: order.discountAmount,
                tax_amount: order.taxAmount,
                total: order.total,
                payment_method: order.paymentMethod,
                payment_status: order.paymentStatus,
                paid_amount: 0,
                external_message_id: messageId,
                stock_reserved: false,
                status_history: order.statusHistory,
                notification_log: order.notificationLog,
                created_by: order.createdBy,
                updated_by: order.updatedBy,
                created_at: nowIso,
                updated_at: nowIso,
              });
              if (!ins.error) {
                createdOrders.push(order.orderNumber);
                await appendSupabaseOrderAuditLog({
                  userId: tenantUserId,
                  orderId: order.id,
                  action: 'whatsapp_order_created',
                  actorId: 'whatsapp_webhook',
                  actorName: order.customerName,
                  actorRole: 'webhook',
                  newStatus: 'new',
                  details: `Incoming WhatsApp order ${order.orderNumber} (${messageId}) logged.`,
                  createdAt: nowIso,
                });
              }
            }
          }
        }
      }
    }

    return res.status(200).json({
      ok: true,
      createdOrders,
      deduplicatedMessages,
    });
  });

  // =========================================================================
  // 3. AUTHENTICATED STAFF OMNICHANNEL ENDPOINTS (Tenant + RBAC Isolated)
  // =========================================================================

  app.get('/api/omnichannel/orders', async (req: Request, res: Response) => {
    const auth = await requireAuthorizedStaff(req, res, 'omnichannel.read');
    if (!auth) return;

    const channel = typeof req.query.channel === 'string' ? req.query.channel : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : '';
    const paymentStatus =
      typeof req.query.paymentStatus === 'string' ? req.query.paymentStatus : '';
    const customerQuery =
      typeof req.query.customerQuery === 'string'
        ? req.query.customerQuery.trim().toLowerCase()
        : '';
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : '';
    const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : '';

    let orders: OmnichannelOrder[] = [];
    if (memoryStore) {
      orders = [...(memoryStore.tenants.get(auth.user.id)?.orders || [])];
    } else if (adminSupabase) {
      const q = adminSupabase
        .from('omnichannel_orders')
        .select('*')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false });
      const { data, error } = await q;
      if (error) {
        if (isMissingColumnOrTable(error)) {
          return res.json({ ok: true, orders: [], schemaPending: true });
        }
        return res.status(500).json({ ok: false, error: error.message });
      }
      orders = ((data || []) as Array<Record<string, unknown>>).map(mapOmnichannelOrderRow);
    }

    const filtered = orders.filter((o) => {
      if (channel && o.channel !== channel) return false;
      if (status && o.status !== status) return false;
      if (branchId && o.branchId !== branchId) return false;
      if (paymentStatus && o.paymentStatus !== paymentStatus) return false;
      if (customerQuery) {
        const hay = `${o.orderNumber} ${o.customerName} ${o.customerPhone}`.toLowerCase();
        if (!hay.includes(customerQuery)) return false;
      }
      if (dateFrom && o.createdAt.slice(0, 10) < dateFrom) return false;
      if (dateTo && o.createdAt.slice(0, 10) > dateTo) return false;
      return true;
    });

    return res.json({ ok: true, orders: filtered });
  });

  app.post('/api/omnichannel/orders', async (req: Request, res: Response) => {
    const auth = await requireAuthorizedStaff(req, res, 'omnichannel.create');
    if (!auth) return;

    const body = (req.body || {}) as {
      channel?: OrderChannel;
      customerId?: string;
      customerName?: string;
      customerPhone?: string;
      deliveryAddress?: string;
      notes?: string;
      branchId?: string;
      discountAmount?: number;
      paymentMethod?: OmnichannelPaymentMethod;
      paymentStatus?: OmnichannelPaymentStatus;
      paidAmount?: number;
      idempotencyKey?: string;
      items?: Array<{ productId: string; quantity: number }>;
    };

    if (
      body.channel !== undefined &&
      body.channel !== 'whatsapp' &&
      body.channel !== 'phone'
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Staff order channel must be phone or whatsapp.',
      });
    }
    const channel: OrderChannel = body.channel === 'whatsapp' ? 'whatsapp' : 'phone';

    if (
      body.discountAmount !== undefined &&
      (!Number.isFinite(Number(body.discountAmount)) || Number(body.discountAmount) < 0)
    ) {
      return res.status(400).json({ ok: false, error: 'Discount amount must be a non-negative number.' });
    }
    if (
      body.paidAmount !== undefined &&
      (!Number.isFinite(Number(body.paidAmount)) || Number(body.paidAmount) < 0)
    ) {
      return res.status(400).json({ ok: false, error: 'Paid amount must be a non-negative number.' });
    }
    if (
      body.paymentStatus !== undefined &&
      !['unpaid', 'cod_pending', 'partially_paid', 'paid'].includes(body.paymentStatus)
    ) {
      return res.status(400).json({ ok: false, error: 'Invalid initial payment status.' });
    }

    const idempotencyKey = String(body.idempotencyKey || req.header('x-idempotency-key') || '').trim();

    if (idempotencyKey) {
      if (memoryStore) {
        const dup = memoryStore.tenants
          .get(auth.user.id)
          ?.orders.find((o) => o.idempotencyKey === idempotencyKey);
        if (dup) return res.json({ ok: true, deduplicated: true, order: dup });
      } else if (adminSupabase) {
        const dupRes = await adminSupabase
          .from('omnichannel_orders')
          .select('*')
          .eq('user_id', auth.user.id)
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle();
        if (!dupRes.error && dupRes.data) {
          return res.json({
            ok: true,
            deduplicated: true,
            order: mapOmnichannelOrderRow(dupRes.data as Record<string, unknown>),
          });
        }
      }
    }

    let tenantProducts: Product[] = [];
    let tenantBranches: Branch[] = [];
    let tenantCustomers: Customer[] = [];
    let storeName = 'Shop';

    if (memoryStore) {
      const t = memoryStore.tenants.get(auth.user.id);
      if (!t) return res.status(404).json({ ok: false, error: 'Shop workspace not found.' });
      tenantProducts = t.products;
      tenantBranches = t.branches;
      tenantCustomers = t.customers;
      storeName = t.settings.storeName;
    } else if (adminSupabase) {
      const [prodRes, branchRes, custRes, stRes] = await Promise.all([
        adminSupabase.from('products').select('*').eq('user_id', auth.user.id),
        adminSupabase.from('branches').select('*').eq('user_id', auth.user.id),
        adminSupabase.from('customers').select('*').eq('user_id', auth.user.id),
        adminSupabase.from('store_settings').select('store_name').eq('user_id', auth.user.id).maybeSingle(),
      ]);
      tenantProducts = ((prodRes.data || []) as Array<Record<string, unknown>>).map(mapProductRow);
      tenantBranches = ((branchRes.data || []) as Array<Record<string, unknown>>).map((b) => ({
        id: String(b.id),
        name: String(b.name || 'Main'),
        code: String(b.code || ''),
        address: String(b.address || ''),
        phone: String(b.phone || ''),
        isMain: Boolean(b.is_main),
        isActive: b.is_active !== false,
        createdAt: String(b.created_at || ''),
      }));
      tenantCustomers = ((custRes.data || []) as Array<Record<string, unknown>>).map((c) => ({
        id: String(c.id),
        name: String(c.name || ''),
        phone: String(c.phone || ''),
        address: String(c.address || ''),
        balance: Number(c.balance ?? 0),
        createdAt: String(c.created_at || ''),
      }));
      storeName = String((stRes.data as Record<string, unknown> | null)?.store_name || 'Shop');
    }

    const requestedBranchId = typeof body.branchId === 'string' ? body.branchId.trim() : '';
    const branchMatch = requestedBranchId
      ? tenantBranches.find((b) => b.id === requestedBranchId && b.isActive !== false)
      : tenantBranches.find((b) => b.isActive !== false && b.isMain) ||
        tenantBranches.find((b) => b.isActive !== false) ||
        tenantBranches[0];
    if (requestedBranchId && !branchMatch) {
      return res.status(400).json({ ok: false, error: 'Selected store branch is invalid or inactive.' });
    }

    const paymentNorm = normalizeOmnichannelPaymentDefaults(
      body.paymentMethod || 'cod',
      body.paymentStatus,
      onlineGatewayConfigured
    );
    if (paymentNorm.ok === false) {
      return res.status(400).json({ ok: false, error: paymentNorm.error });
    }

    const productsById = new Map(tenantProducts.map((p) => [p.id, p]));
    const calc = calculateOmnichannelOrderTotals(body.items || [], productsById, {
      discountAmount: body.discountAmount,
      branchId: branchMatch?.id,
    });
    if (calc.ok === false) {
      return res.status(400).json({ ok: false, code: calc.code, error: calc.error });
    }

    let customerId = typeof body.customerId === 'string' && body.customerId.trim() ? body.customerId.trim() : undefined;
    let customerName = String(body.customerName || '').trim();
    let customerPhone = String(body.customerPhone || '').trim();
    let deliveryAddress = String(body.deliveryAddress || '').trim();

    if (customerId) {
      const existing = tenantCustomers.find((c) => c.id === customerId);
      if (!existing) {
        return res.status(404).json({ ok: false, error: 'Selected customer does not belong to this shop.' });
      }
      customerName = customerName || existing.name;
      customerPhone = customerPhone || existing.phone;
      deliveryAddress = deliveryAddress || existing.address || 'Shop Pickup / Phone Order';
    }

    if (customerName.length < 2 || customerPhone.replace(/[^\d]/g, '').length < 7) {
      return res.status(400).json({ ok: false, error: 'Customer name and valid phone number are required.' });
    }

    if (!customerId) {
      // Create inline customer when staff enters a new phone/WhatsApp customer
      const createdCustomerId = crypto.randomUUID();
      const customerNowIso = new Date().toISOString();
      const newCustomer: Customer = {
        id: createdCustomerId,
        name: customerName,
        phone: customerPhone,
        address: deliveryAddress || '',
        balance: 0,
        whatsappOptIn: true,
        createdAt: customerNowIso,
      };
      customerId = createdCustomerId;
      if (memoryStore) {
        memoryStore.tenants.get(auth.user.id)?.customers.push(newCustomer);
      } else if (adminSupabase) {
        const custIns = await adminSupabase.from('customers').insert({
          id: newCustomer.id,
          user_id: auth.user.id,
          name: newCustomer.name,
          phone: newCustomer.phone,
          address: newCustomer.address,
          balance: 0,
          created_at: customerNowIso,
        });
        if (custIns.error) {
          return res.status(500).json({ ok: false, error: custIns.error.message });
        }
      }
    }

    const paidAmount = Math.min(
      calc.total,
      Math.max(0, roundCurrency(Number(body.paidAmount ?? 0)))
    );
    const resolvedPaymentStatus: OmnichannelPaymentStatus =
      paidAmount >= calc.total && calc.total > 0
        ? 'paid'
        : paidAmount > 0
        ? 'partially_paid'
        : paymentNorm.paymentStatus;

    const nowIso = new Date().toISOString();
    const orderNumber = generateOmnichannelOrderNumber(channel);
    const order: OmnichannelOrder = {
      id: `omni-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: auth.user.id,
      orderNumber,
      channel,
      status: 'new',
      branchId: branchMatch?.id,
      branchName: branchMatch?.name,
      customerId,
      customerName,
      customerPhone,
      deliveryAddress: deliveryAddress || 'Counter Pickup',
      notes: body.notes?.trim() || undefined,
      items: calc.items,
      subtotal: calc.subtotal,
      discountAmount: calc.discountAmount,
      taxAmount: calc.taxAmount,
      total: calc.total,
      paymentMethod: paymentNorm.paymentMethod,
      paymentStatus: resolvedPaymentStatus,
      paidAmount,
      idempotencyKey: idempotencyKey || undefined,
      stockReserved: false,
      statusHistory: [
        {
          status: 'new',
          changedAt: nowIso,
          actorId: auth.staff.employeeId,
          actorName: auth.staff.employeeName,
          actorRole: auth.staff.role,
          note: `${channel === 'whatsapp' ? 'Manual WhatsApp' : 'Phone'} order logged`,
        },
      ],
      notificationLog: [],
      createdBy: auth.staff.employeeName,
      updatedBy: auth.staff.employeeName,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const notif = await dispatchWhatsAppNotification({
      storeName,
      order,
      event: 'new_order',
      env: getWaEnv(),
      sendOverride: deps.whatsappSendOverride,
    });
    order.notificationLog = [notif];

    if (memoryStore) {
      const tenant = memoryStore.tenants.get(auth.user.id)!;
      tenant.orders.unshift(order);
      tenant.auditLogs.unshift({
        id: `oaud-${Date.now()}`,
        orderId: order.id,
        action: `${channel}_order_created`,
        actorId: auth.staff.employeeId,
        actorName: auth.staff.employeeName,
        actorRole: auth.staff.role,
        newStatus: 'new',
        details: `${channel} order ${order.orderNumber} created by ${auth.staff.employeeName}`,
        createdAt: nowIso,
      });
    } else if (adminSupabase) {
      const rpcRes = await adminSupabase.rpc('create_omnichannel_order', {
        p_user_id: auth.user.id,
        p_channel: channel,
        p_customer_name: customerName,
        p_customer_phone: customerPhone,
        p_delivery_address: deliveryAddress || 'Counter Pickup',
        p_notes: body.notes?.trim() || '',
        p_branch_id: branchMatch?.id ?? null,
        p_customer_id: customerId ?? null,
        p_discount_amount: calc.discountAmount,
        p_payment_method: paymentNorm.paymentMethod,
        p_payment_status: resolvedPaymentStatus,
        p_paid_amount: paidAmount,
        p_idempotency_key: idempotencyKey || null,
        p_external_message_id: null,
        p_order_number: orderNumber,
        p_items: calc.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        p_actor_id: auth.staff.employeeId,
        p_actor_name: auth.staff.employeeName,
        p_actor_role: auth.staff.role,
        p_notification_entry: notif,
        p_allow_online_payment: onlineGatewayConfigured,
        p_require_stock_check: false,
        p_history_note: `${channel === 'whatsapp' ? 'Manual WhatsApp' : 'Phone'} order logged`,
        p_audit_action: `${channel}_order_created`,
        p_audit_details: `${channel} order ${order.orderNumber} created by ${auth.staff.employeeName}`,
      });

      if (rpcRes.error && !isMissingColumnOrTable(rpcRes.error)) {
        const statusCode = rpcRes.error.code === '42501' ? 403 : 500;
        return res.status(statusCode).json({ ok: false, error: rpcRes.error.message });
      }

      if (!rpcRes.error && rpcRes.data) {
        const payload = rpcRes.data as {
          ok?: boolean;
          deduplicated?: boolean;
          code?: string;
          error?: string;
          order?: Record<string, unknown>;
        };
        if (!payload.ok) {
          const statusCode =
            payload.code === 'INSUFFICIENT_STOCK' || payload.code === 'OUT_OF_STOCK'
              ? 409
              : payload.code === 'STORE_UNAVAILABLE'
              ? 403
              : 400;
          return res.status(statusCode).json({
            ok: false,
            code: payload.code,
            error: payload.error || 'Could not create order.',
          });
        }
        const saved = mapOmnichannelOrderRow(payload.order!);
        if (payload.deduplicated) {
          return res.json({ ok: true, deduplicated: true, order: saved });
        }
        return res.status(201).json({ ok: true, order: saved, customerId: saved.customerId ?? customerId });
      }

      const ins = await adminSupabase.from('omnichannel_orders').insert({
        id: order.id,
        user_id: auth.user.id,
        branch_id: order.branchId ?? null,
        branch_name: order.branchName ?? '',
        order_number: order.orderNumber,
        channel: order.channel,
        status: 'new',
        customer_id: order.customerId ?? null,
        customer_name: order.customerName,
        customer_phone: order.customerPhone,
        delivery_address: order.deliveryAddress,
        notes: order.notes ?? '',
        items: order.items,
        subtotal: order.subtotal,
        discount_amount: order.discountAmount,
        tax_amount: order.taxAmount,
        total: order.total,
        payment_method: order.paymentMethod,
        payment_status: order.paymentStatus,
        paid_amount: order.paidAmount,
        idempotency_key: order.idempotencyKey ?? null,
        stock_reserved: false,
        status_history: order.statusHistory,
        notification_log: order.notificationLog,
        created_by: order.createdBy,
        updated_by: order.updatedBy,
        created_at: nowIso,
        updated_at: nowIso,
      });
      if (ins.error) {
        return res.status(500).json({ ok: false, error: ins.error.message });
      }
      await appendSupabaseOrderAuditLog({
        userId: auth.user.id,
        orderId: order.id,
        action: `${channel}_order_created`,
        actorId: auth.staff.employeeId,
        actorName: auth.staff.employeeName,
        actorRole: auth.staff.role,
        newStatus: 'new',
        details: `${channel} order ${order.orderNumber} created by ${auth.staff.employeeName}`,
        createdAt: nowIso,
      });
    }

    return res.status(201).json({ ok: true, order, customerId });
  });

  app.patch('/api/omnichannel/orders/:id/status', async (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      status?: OmnichannelOrderStatus;
      reason?: string;
    };
    const targetStatus = body.status;
    if (
      !targetStatus ||
      !['accepted', 'preparing', 'ready', 'delivered', 'rejected', 'cancelled'].includes(
        targetStatus
      )
    ) {
      return res.status(400).json({ ok: false, error: 'Valid target status is required.' });
    }

    const requiredAction: RoleAction =
      targetStatus === 'cancelled' || targetStatus === 'rejected'
        ? 'orders.cancel'
        : 'omnichannel.manage_status';

    const auth = await requireAuthorizedStaff(req, res, requiredAction);
    if (!auth) return;

    const orderId = String(req.params.id || '');
    const nowIso = new Date().toISOString();

    if (memoryStore) {
      const tenant = memoryStore.tenants.get(auth.user.id);
      if (!tenant) return res.status(404).json({ ok: false, error: 'Shop workspace not found.' });

      const existing = tenant.orders.find((o) => o.id === orderId);
      if (!existing) {
        return res.status(404).json({ ok: false, error: 'Order not found for this shop.' });
      }

      if (!isValidOmnichannelTransition(existing.status, targetStatus)) {
        return res.status(400).json({
          ok: false,
          code: 'INVALID_TRANSITION',
          error: `Cannot move order ${existing.orderNumber} from "${existing.status}" to "${targetStatus}".`,
        });
      }

      let notif: OmnichannelNotificationEntry | undefined;
      if (
        targetStatus === 'accepted' ||
        targetStatus === 'ready' ||
        targetStatus === 'delivered'
      ) {
        const eventMap = {
          accepted: 'order_accepted',
          ready: 'order_ready',
          delivered: 'order_delivered',
        } as const;
        notif = await dispatchWhatsAppNotification({
          storeName: tenant.settings.storeName,
          order: existing,
          event: eventMap[targetStatus],
          env: getWaEnv(),
          sendOverride: deps.whatsappSendOverride,
        });
      }

      const result = transitionOmnichannelOrderStatus({
        order: existing,
        targetStatus,
        actor: {
          id: auth.staff.employeeId,
          name: auth.staff.employeeName,
          role: auth.staff.role,
        },
        products: tenant.products,
        reason: body.reason,
        notificationEntry: notif,
        nowIso,
      });

      if (result.ok === false) {
        const codeStatus = result.code === 'INSUFFICIENT_STOCK' ? 409 : 400;
        return res.status(codeStatus).json({ ok: false, code: result.code, error: result.error });
      }

      tenant.products = result.updatedProducts;
      tenant.orders = tenant.orders.map((o) => (o.id === orderId ? result.order : o));
      if (result.adjustments.length > 0) {
        tenant.adjustments.unshift(...result.adjustments);
      }
      tenant.auditLogs.unshift({
        id: `oaud-${Date.now()}`,
        orderId,
        action: `order_status_${targetStatus}`,
        actorId: auth.staff.employeeId,
        actorName: auth.staff.employeeName,
        actorRole: auth.staff.role,
        previousStatus: existing.status,
        newStatus: targetStatus,
        details: body.reason?.trim() || `Moved from ${existing.status} to ${targetStatus}`,
        createdAt: nowIso,
      });

      return res.json({
        ok: true,
        order: result.order,
        updatedProducts: result.updatedProducts,
        adjustments: result.adjustments,
        didReserveStock: result.didReserveStock,
        didRestoreStock: result.didRestoreStock,
      });
    }

    if (!adminSupabase) {
      return res.status(503).json({ ok: false, error: 'Database service unavailable.' });
    }

    const orderRes = await adminSupabase
      .from('omnichannel_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (orderRes.error || !orderRes.data) {
      return res.status(404).json({ ok: false, error: 'Order not found for this shop.' });
    }

    const existing = mapOmnichannelOrderRow(orderRes.data as Record<string, unknown>);
    if (!isValidOmnichannelTransition(existing.status, targetStatus)) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_TRANSITION',
        error: `Cannot move order ${existing.orderNumber} from "${existing.status}" to "${targetStatus}".`,
      });
    }

    const storeRes = await adminSupabase
      .from('store_settings')
      .select('store_name')
      .eq('user_id', auth.user.id)
      .maybeSingle();
    const storeName = String((storeRes.data as Record<string, unknown> | null)?.store_name || 'Shop');

    let notif: OmnichannelNotificationEntry | undefined;
    if (targetStatus === 'accepted' || targetStatus === 'ready' || targetStatus === 'delivered') {
      const eventMap = {
        accepted: 'order_accepted',
        ready: 'order_ready',
        delivered: 'order_delivered',
      } as const;
      notif = await dispatchWhatsAppNotification({
        storeName,
        order: existing,
        event: eventMap[targetStatus],
        env: getWaEnv(),
        sendOverride: deps.whatsappSendOverride,
      });
    }

    const historyEntry = {
      status: targetStatus,
      changedAt: nowIso,
      actorId: auth.staff.employeeId,
      actorName: auth.staff.employeeName,
      actorRole: auth.staff.role,
      note: body.reason?.trim() || undefined,
    };

    // Use atomic Postgres RPC for stock-mutating transitions when deployed
    if (targetStatus === 'accepted') {
      const rpcRes = await adminSupabase.rpc('accept_omnichannel_order_with_stock', {
        p_user_id: auth.user.id,
        p_order_id: orderId,
        p_actor_id: auth.staff.employeeId,
        p_actor_name: auth.staff.employeeName,
        p_actor_role: auth.staff.role,
        p_history_entry: historyEntry,
        p_notification_entry: notif ?? null,
      });
      if (rpcRes.error && !isMissingColumnOrTable(rpcRes.error)) {
        const statusCode = rpcRes.error.code === '42501' ? 403 : 500;
        return res.status(statusCode).json({ ok: false, error: rpcRes.error.message });
      }
      if (!rpcRes.error && rpcRes.data) {
        const payload = rpcRes.data as { ok?: boolean; code?: string; error?: string; order?: Record<string, unknown> };
        if (!payload.ok) {
          return res.status(payload.code === 'INSUFFICIENT_STOCK' ? 409 : 400).json({
            ok: false,
            code: payload.code,
            error: payload.error || 'Could not accept order.',
          });
        }
        return res.json({
          ok: true,
          order: mapOmnichannelOrderRow(payload.order!),
          didReserveStock: true,
          didRestoreStock: false,
        });
      }
    }

    if (targetStatus === 'cancelled' || targetStatus === 'rejected') {
      const rpcRes = await adminSupabase.rpc('cancel_or_reject_omnichannel_order_with_restock', {
        p_user_id: auth.user.id,
        p_order_id: orderId,
        p_target_status: targetStatus,
        p_reason: body.reason?.trim() || '',
        p_actor_id: auth.staff.employeeId,
        p_actor_name: auth.staff.employeeName,
        p_actor_role: auth.staff.role,
        p_history_entry: historyEntry,
      });
      if (rpcRes.error && !isMissingColumnOrTable(rpcRes.error)) {
        const statusCode = rpcRes.error.code === '42501' ? 403 : 500;
        return res.status(statusCode).json({ ok: false, error: rpcRes.error.message });
      }
      if (!rpcRes.error && rpcRes.data) {
        const payload = rpcRes.data as {
          ok?: boolean;
          code?: string;
          error?: string;
          restocked?: boolean;
          order?: Record<string, unknown>;
        };
        if (!payload.ok) {
          return res.status(400).json({ ok: false, code: payload.code, error: payload.error });
        }
        return res.json({
          ok: true,
          order: mapOmnichannelOrderRow(payload.order!),
          didReserveStock: false,
          didRestoreStock: Boolean(payload.restocked),
        });
      }
    }

    if (targetStatus === 'preparing' || targetStatus === 'ready' || targetStatus === 'delivered') {
      const rpcRes = await adminSupabase.rpc('transition_omnichannel_order_status', {
        p_user_id: auth.user.id,
        p_order_id: orderId,
        p_target_status: targetStatus,
        p_note: body.reason?.trim() || null,
        p_actor_id: auth.staff.employeeId,
        p_actor_name: auth.staff.employeeName,
        p_actor_role: auth.staff.role,
        p_notification_entry: notif ?? null,
      });
      if (rpcRes.error && !isMissingColumnOrTable(rpcRes.error)) {
        const statusCode = rpcRes.error.code === '42501' ? 403 : 500;
        return res.status(statusCode).json({ ok: false, error: rpcRes.error.message });
      }
      if (!rpcRes.error && rpcRes.data) {
        const payload = rpcRes.data as {
          ok?: boolean;
          code?: string;
          error?: string;
          order?: Record<string, unknown>;
        };
        if (!payload.ok) {
          return res.status(400).json({
            ok: false,
            code: payload.code,
            error: payload.error || 'Could not update order status.',
          });
        }
        return res.json({
          ok: true,
          order: mapOmnichannelOrderRow(payload.order!),
          didReserveStock: false,
          didRestoreStock: false,
        });
      }
    }

    // Legacy fallback when database RPCs have not been deployed yet
    const prodRes = await adminSupabase.from('products').select('*').eq('user_id', auth.user.id);
    const tenantProducts = ((prodRes.data || []) as Array<Record<string, unknown>>).map(mapProductRow);

    const transition = transitionOmnichannelOrderStatus({
      order: existing,
      targetStatus,
      actor: {
        id: auth.staff.employeeId,
        name: auth.staff.employeeName,
        role: auth.staff.role,
      },
      products: tenantProducts,
      reason: body.reason,
      notificationEntry: notif,
      nowIso,
    });

    if (transition.ok === false) {
      return res
        .status(transition.code === 'INSUFFICIENT_STOCK' ? 409 : 400)
        .json({ ok: false, code: transition.code, error: transition.error });
    }

    if (transition.didReserveStock || transition.didRestoreStock) {
      const prevMap = new Map(tenantProducts.map((p) => [p.id, p]));
      for (const updatedProd of transition.updatedProducts) {
        const prev = prevMap.get(updatedProd.id);
        if (prev && prev.stock !== updatedProd.stock) {
          await adminSupabase
            .from('products')
            .update({
              stock: updatedProd.stock,
              branch_stock: updatedProd.branchStock ?? {},
              updated_at: nowIso,
            })
            .eq('id', updatedProd.id)
            .eq('user_id', auth.user.id);
        }
      }
      if (transition.adjustments.length > 0) {
        await adminSupabase.from('inventory_adjustments').insert(
          transition.adjustments.map((a) => ({
            id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a.id)
              ? a.id
              : crypto.randomUUID(),
            user_id: auth.user.id,
            product_id: a.productId,
            product_name: a.productName,
            sku: a.sku,
            selling_unit: a.sellingUnit,
            branch_id: a.branchId ?? null,
            adjustment_type: a.adjustmentType,
            quantity_change: a.quantityChange,
            previous_stock: a.previousStock,
            new_stock: a.newStock,
            reason: a.reason,
            actor_name: a.actorName ?? auth.staff.employeeName,
            created_at: a.createdAt,
          }))
        );
      }
    }

    const upd = await adminSupabase
      .from('omnichannel_orders')
      .update({
        status: transition.order.status,
        stock_reserved: transition.order.stockReserved,
        stock_reserved_at: transition.order.stockReservedAt ?? null,
        stock_restored_at: transition.order.stockRestoredAt ?? null,
        cancellation_reason: transition.order.cancellationReason ?? null,
        status_history: transition.order.statusHistory,
        notification_log: transition.order.notificationLog,
        updated_by: auth.staff.employeeName,
        updated_at: nowIso,
      })
      .eq('id', orderId)
      .eq('user_id', auth.user.id);

    if (upd.error) {
      return res.status(500).json({ ok: false, error: upd.error.message });
    }

    await appendSupabaseOrderAuditLog({
      userId: auth.user.id,
      orderId,
      action: `order_status_${targetStatus}`,
      actorId: auth.staff.employeeId,
      actorName: auth.staff.employeeName,
      actorRole: auth.staff.role,
      previousStatus: existing.status,
      newStatus: targetStatus,
      details: body.reason?.trim() || `Moved from ${existing.status} to ${targetStatus}`,
      createdAt: nowIso,
    });

    return res.json({
      ok: true,
      order: transition.order,
      updatedProducts: transition.updatedProducts,
      adjustments: transition.adjustments,
      didReserveStock: transition.didReserveStock,
      didRestoreStock: transition.didRestoreStock,
    });
  });

  app.patch('/api/omnichannel/orders/:id/payment', async (req: Request, res: Response) => {
    const auth = await requireAuthorizedStaff(req, res, 'omnichannel.payment');
    if (!auth) return;

    const orderId = String(req.params.id || '');
    const body = (req.body || {}) as {
      paymentMethod?: OmnichannelPaymentMethod;
      paymentStatus?: OmnichannelPaymentStatus;
      paidAmount?: number;
    };

    if (
      body.paymentMethod !== undefined &&
      !['cod', 'cash', 'card', 'jazzcash', 'easypaisa', 'bank_transfer', 'online'].includes(
        body.paymentMethod
      )
    ) {
      return res.status(400).json({ ok: false, error: 'Unsupported payment method.' });
    }
    if (
      body.paymentStatus !== undefined &&
      !['unpaid', 'cod_pending', 'partially_paid', 'paid', 'refunded'].includes(body.paymentStatus)
    ) {
      return res.status(400).json({ ok: false, error: 'Invalid payment status.' });
    }
    if (
      body.paidAmount !== undefined &&
      (!Number.isFinite(Number(body.paidAmount)) || Number(body.paidAmount) < 0)
    ) {
      return res.status(400).json({ ok: false, error: 'Paid amount must be a non-negative number.' });
    }

    if (body.paymentMethod === 'online' && !onlineGatewayConfigured) {
      return res.status(400).json({
        ok: false,
        error: 'Online card payment gateway is not configured on this server.',
      });
    }

    const nowIso = new Date().toISOString();

    if (memoryStore) {
      const tenant = memoryStore.tenants.get(auth.user.id);
      const existing = tenant?.orders.find((o) => o.id === orderId);
      if (!tenant || !existing) {
        return res.status(404).json({ ok: false, error: 'Order not found for this shop.' });
      }

      const nextMethod = body.paymentMethod ?? existing.paymentMethod;
      const nextPaid =
        body.paidAmount !== undefined
          ? Math.min(existing.total, Math.max(0, roundCurrency(Number(body.paidAmount))))
          : body.paymentStatus === 'paid'
          ? existing.total
          : existing.paidAmount;

      const nextStatus: OmnichannelPaymentStatus =
        body.paymentStatus ??
        (nextPaid >= existing.total && existing.total > 0
          ? 'paid'
          : nextPaid > 0
          ? 'partially_paid'
          : nextMethod === 'cod'
          ? 'cod_pending'
          : 'unpaid');

      const updated: OmnichannelOrder = {
        ...existing,
        paymentMethod: nextMethod,
        paymentStatus: nextStatus,
        paidAmount: nextPaid,
        updatedBy: auth.staff.employeeName,
        updatedAt: nowIso,
      };
      tenant.orders = tenant.orders.map((o) => (o.id === orderId ? updated : o));
      tenant.auditLogs.unshift({
        id: `oaud-${Date.now()}`,
        orderId,
        action: 'order_payment_updated',
        actorId: auth.staff.employeeId,
        actorName: auth.staff.employeeName,
        actorRole: auth.staff.role,
        previousStatus: existing.status,
        newStatus: existing.status,
        details: `Payment updated to ${nextStatus} (${nextMethod}, paid ${nextPaid})`,
        createdAt: nowIso,
      });
      return res.json({ ok: true, order: updated });
    }

    if (!adminSupabase) {
      return res.status(503).json({ ok: false, error: 'Database service unavailable.' });
    }

    const orderRes = await adminSupabase
      .from('omnichannel_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (orderRes.error || !orderRes.data) {
      return res.status(404).json({ ok: false, error: 'Order not found for this shop.' });
    }

    const existing = mapOmnichannelOrderRow(orderRes.data as Record<string, unknown>);
    const nextMethod = body.paymentMethod ?? existing.paymentMethod;
    const nextPaid =
      body.paidAmount !== undefined
        ? Math.min(existing.total, Math.max(0, roundCurrency(Number(body.paidAmount))))
        : body.paymentStatus === 'paid'
        ? existing.total
        : existing.paidAmount;
    const nextStatus: OmnichannelPaymentStatus =
      body.paymentStatus ??
      (nextPaid >= existing.total && existing.total > 0
        ? 'paid'
        : nextPaid > 0
        ? 'partially_paid'
        : nextMethod === 'cod'
        ? 'cod_pending'
        : 'unpaid');

    const upd = await adminSupabase
      .from('omnichannel_orders')
      .update({
        payment_method: nextMethod,
        payment_status: nextStatus,
        paid_amount: nextPaid,
        updated_by: auth.staff.employeeName,
        updated_at: nowIso,
      })
      .eq('id', orderId)
      .eq('user_id', auth.user.id)
      .select('*')
      .single();

    if (upd.error) {
      return res.status(500).json({ ok: false, error: upd.error.message });
    }

    await appendSupabaseOrderAuditLog({
      userId: auth.user.id,
      orderId,
      action: 'order_payment_updated',
      actorId: auth.staff.employeeId,
      actorName: auth.staff.employeeName,
      actorRole: auth.staff.role,
      previousStatus: existing.status,
      newStatus: existing.status,
      details: `Payment updated to ${nextStatus} (${nextMethod}, paid ${nextPaid})`,
      createdAt: nowIso,
    });

    return res.json({
      ok: true,
      order: mapOmnichannelOrderRow(upd.data as Record<string, unknown>),
    });
  });

  app.post('/api/omnichannel/storefront-settings', async (req: Request, res: Response) => {
    const auth = await requireAuthorizedStaff(req, res, 'storefront.manage');
    if (!auth) return;

    const body = (req.body || {}) as {
      storefrontSlug?: string;
      storefrontEnabled?: boolean;
      storefrontDescription?: string;
      codEnabled?: boolean;
      whatsappPhoneNumberId?: string;
    };

    const cleanSlug = slugifyStoreName(String(body.storefrontSlug || ''));
    if (cleanSlug.length < 3) {
      return res.status(400).json({ ok: false, error: 'Storefront slug must be at least 3 characters.' });
    }

    if (memoryStore) {
      const collision = memoryStore.findTenantBySlug(cleanSlug);
      if (collision && collision.userId !== auth.user.id) {
        return res.status(409).json({ ok: false, error: 'This storefront link slug is already taken by another shop.' });
      }
      const tenant = memoryStore.tenants.get(auth.user.id);
      if (!tenant) return res.status(404).json({ ok: false, error: 'Shop not found.' });
      tenant.settings = {
        ...tenant.settings,
        storefrontSlug: cleanSlug,
        storefrontEnabled: Boolean(body.storefrontEnabled),
        storefrontDescription: String(body.storefrontDescription ?? tenant.settings.storefrontDescription ?? ''),
        codEnabled: body.codEnabled !== false,
        whatsappPhoneNumberId: String(body.whatsappPhoneNumberId ?? tenant.settings.whatsappPhoneNumberId ?? ''),
      };
      return res.json({ ok: true, settings: tenant.settings });
    }

    if (!adminSupabase) {
      return res.status(503).json({ ok: false, error: 'Database service unavailable.' });
    }

    const collisionRes = await adminSupabase
      .from('store_settings')
      .select('user_id')
      .ilike('storefront_slug', cleanSlug)
      .neq('user_id', auth.user.id)
      .maybeSingle();

    if (!collisionRes.error && collisionRes.data) {
      return res.status(409).json({ ok: false, error: 'This storefront link slug is already in use by another shop.' });
    }

    const upd = await adminSupabase
      .from('store_settings')
      .update({
        storefront_slug: cleanSlug,
        storefront_enabled: Boolean(body.storefrontEnabled),
        storefront_description: String(body.storefrontDescription || ''),
        cod_enabled: body.codEnabled !== false,
        whatsapp_business_phone_id: String(body.whatsappPhoneNumberId || '').trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', auth.user.id);

    if (upd.error) {
      return res.status(500).json({ ok: false, error: upd.error.message });
    }

    return res.json({
      ok: true,
      storefrontSlug: cleanSlug,
      storefrontEnabled: Boolean(body.storefrontEnabled),
    });
  });
}
