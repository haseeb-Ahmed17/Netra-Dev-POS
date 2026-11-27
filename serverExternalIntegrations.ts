import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateOmnichannelOrderNumber,
  transitionOmnichannelOrderStatus,
} from './src/lib/omnichannelOrders';
import { hasRolePermission } from './src/lib/rbac';
import { roundCurrency, roundQuantity } from './src/lib/unitUtils';
import type {
  Branch,
  EmployeeRole,
  ExternalIntegrationSummary,
  ExternalOrderSource,
  IntegrationAuditLogEntry,
  IntegrationConnectionStatus,
  IntegrationProvider,
  OmnichannelOrder,
  OmnichannelOrderItem,
  OmnichannelPaymentMethod,
  OmnichannelPaymentStatus,
  Product,
  ShopSubscriptionStatus,
} from './src/types';
import type {
  OmnichannelMemoryStore,
  VerifiedStaffContext,
  VerifiedTenantUser,
} from './serverOmnichannelOrders';

export interface ExternalIntegrationsEnvConfig {
  appUrl?: string;
  shopifyApiKey?: string;
  shopifyApiSecret?: string;
  shopifyScopes?: string;
  shopifyApiVersion?: string;
  encryptionKey?: string;
  whatsappAccessToken?: string;
  whatsappPhoneNumberId?: string;
  allowUnsafeTestUrls?: boolean;
}

export interface StoredExternalIntegrationRecord {
  id: string;
  userId: string;
  provider: IntegrationProvider;
  status: IntegrationConnectionStatus;
  displayName: string;
  storeDomain: string;
  apiKeyMasked: string;
  webhookSecretHash?: string;
  encryptedCredentials?: string;
  scopes: string[];
  lastSyncAt?: string;
  lastSyncStatus: 'never' | 'success' | 'partial' | 'error';
  lastError?: string;
  metadata: Record<string, unknown>;
  connectedAt?: string;
  disconnectedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredExternalProductMapping {
  id: string;
  userId: string;
  provider: ExternalOrderSource;
  productId: string;
  externalProductId: string;
  externalVariantId: string;
  externalInventoryItemId: string;
  externalSku: string;
  lastSyncedStock?: number;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredOAuthStateNonce {
  nonce: string;
  userId: string;
  provider: 'shopify';
  shopDomain: string;
  expiresAt: string;
  consumedAt?: string;
}

export class ExternalIntegrationsMemoryStore {
  integrations = new Map<string, StoredExternalIntegrationRecord>();
  productMappings = new Map<string, StoredExternalProductMapping>();
  auditLogs: IntegrationAuditLogEntry[] = [];
  oauthStates = new Map<string, StoredOAuthStateNonce>();

  private integrationKey(userId: string, provider: IntegrationProvider): string {
    return `${userId}:${provider}`;
  }

  getIntegration(
    userId: string,
    provider: IntegrationProvider
  ): StoredExternalIntegrationRecord | undefined {
    return this.integrations.get(this.integrationKey(userId, provider));
  }

  upsertIntegration(record: StoredExternalIntegrationRecord): StoredExternalIntegrationRecord {
    this.integrations.set(this.integrationKey(record.userId, record.provider), record);
    return record;
  }

  listTenantIntegrations(userId: string): StoredExternalIntegrationRecord[] {
    const out: StoredExternalIntegrationRecord[] = [];
    for (const rec of this.integrations.values()) {
      if (rec.userId === userId) out.push(rec);
    }
    return out;
  }

  findConnectedIntegrationByDomain(
    provider: IntegrationProvider,
    domain: string
  ): StoredExternalIntegrationRecord | undefined {
    const clean = domain.trim().toLowerCase();
    if (!clean) return undefined;
    for (const rec of this.integrations.values()) {
      if (
        rec.provider === provider &&
        rec.status === 'connected' &&
        rec.storeDomain.trim().toLowerCase() === clean
      ) {
        return rec;
      }
    }
    return undefined;
  }

  findCustomIntegrationByApiKeyHash(hash: string): StoredExternalIntegrationRecord | undefined {
    if (!hash) return undefined;
    for (const rec of this.integrations.values()) {
      if (
        rec.provider === 'custom_website' &&
        rec.status === 'connected' &&
        rec.webhookSecretHash === hash
      ) {
        return rec;
      }
    }
    return undefined;
  }

  listMappings(userId: string, provider?: ExternalOrderSource): StoredExternalProductMapping[] {
    const out: StoredExternalProductMapping[] = [];
    for (const m of this.productMappings.values()) {
      if (m.userId === userId && (!provider || m.provider === provider)) {
        out.push(m);
      }
    }
    return out;
  }

  upsertMapping(mapping: StoredExternalProductMapping): void {
    const key = `${mapping.userId}:${mapping.provider}:${mapping.externalProductId}:${mapping.externalVariantId}`;
    this.productMappings.set(key, mapping);
  }

  appendAuditLog(entry: IntegrationAuditLogEntry): void {
    this.auditLogs.unshift(entry);
  }

  listAuditLogs(userId: string): IntegrationAuditLogEntry[] {
    return this.auditLogs.filter((l) => l.userId === userId);
  }
}

export interface ExternalIntegrationRouteDeps<
  TUser extends VerifiedTenantUser = VerifiedTenantUser,
> {
  adminSupabase: SupabaseClient | null;
  omnichannelMemoryStore?: OmnichannelMemoryStore;
  integrationsMemoryStore?: ExternalIntegrationsMemoryStore;
  authenticateReq: (req: Request) => Promise<TUser | null>;
  checkOpAccess: (user: TUser) => Promise<{
    allowed: boolean;
    status?: ShopSubscriptionStatus;
    reason?: string;
  }>;
  resolveStaff: (req: Request, user: TUser) => Promise<VerifiedStaffContext>;
  env?: ExternalIntegrationsEnvConfig;
  fetchImpl?: typeof fetch;
}

const DEFAULT_SHOPIFY_SCOPES = 'read_orders,read_products,write_inventory';
const DEFAULT_SHOPIFY_API_VERSION = '2025-01';
const EPHEMERAL_DEV_ENCRYPTION_SECRET = crypto.randomBytes(32).toString('hex');

function resolveEncryptionKeyBytes(env?: ExternalIntegrationsEnvConfig): Buffer {
  const raw =
    env?.encryptionKey ||
    process.env.INTEGRATION_ENCRYPTION_KEY ||
    process.env.STAFF_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    EPHEMERAL_DEV_ENCRYPTION_SECRET;
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptIntegrationSecret(
  plaintext: string,
  env?: ExternalIntegrationsEnvConfig
): string {
  const key = resolveEncryptionKeyBytes(env);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptIntegrationSecret(
  ciphertext: string,
  env?: ExternalIntegrationsEnvConfig
): string {
  const parts = String(ciphertext || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Invalid encrypted credential envelope.');
  }
  const key = resolveEncryptionKeyBytes(env);
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const data = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function timingSafeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function maskCredentialHint(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return '••••' + trimmed.slice(-3);
  const prefix = trimmed.slice(0, Math.min(7, trimmed.indexOf('_') > 0 ? trimmed.indexOf('_') + 1 : 4));
  return `${prefix}••••${trimmed.slice(-4)}`;
}

export function normalizeShopifyShopDomain(rawInput: string): string | null {
  let cleaned = String(rawInput || '').trim().toLowerCase();
  cleaned = cleaned.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!cleaned) return null;
  if (!cleaned.includes('.')) {
    cleaned = `${cleaned}.myshopify.com`;
  }
  if (!/^[a-z0-9][a-z0-9-]{0,61}\.myshopify\.com$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) {
    return true;
  }
  const m172 = host.match(/^172\.(\d+)\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export function normalizeWooStoreUrl(
  rawUrl: string,
  options?: { allowUnsafeTestUrls?: boolean }
): string | null {
  try {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) return null;
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(candidate);
    if (!options?.allowUnsafeTestUrls) {
      if (parsed.protocol !== 'https:') return null;
      if (isPrivateOrLocalHostname(parsed.hostname)) return null;
    } else if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

export function resolveAppBaseUrl(req: Request, env?: ExternalIntegrationsEnvConfig): string {
  const configured = String(env?.appUrl ?? process.env.APP_URL ?? '').trim();
  if (configured && configured !== 'MY_APP_URL' && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  return `${proto}://${host}`.replace(/\/+$/, '');
}

export function verifyShopifyOAuthHmac(
  query: Record<string, unknown>,
  clientSecret: string
): boolean {
  if (!clientSecret) return false;
  const providedHmac = typeof query.hmac === 'string' ? query.hmac.trim().toLowerCase() : '';
  if (!/^[0-9a-f]{64}$/.test(providedHmac)) return false;

  const entries: Array<[string, string]> = [];
  for (const [key, val] of Object.entries(query)) {
    if (key === 'hmac' || key === 'signature') continue;
    if (Array.isArray(val)) {
      entries.push([key, val.map(String).join(', ')]);
    } else if (val !== undefined && val !== null) {
      entries.push([key, String(val)]);
    }
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  const message = entries
    .map(([k, v]) => `${k.replace(/%/g, '%25').replace(/=/g, '%3D').replace(/&/g, '%26')}=${v.replace(/%/g, '%25').replace(/&/g, '%26')}`)
    .join('&');

  const expected = crypto.createHmac('sha256', clientSecret).update(message, 'utf8').digest('hex');
  return timingSafeEquals(providedHmac, expected);
}

export function verifyShopifyWebhookHmac(
  rawBody: Buffer | string | undefined,
  hmacHeader: string | undefined,
  clientSecret: string
): boolean {
  if (!rawBody || !hmacHeader || !clientSecret) return false;
  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody)
    .digest('base64');
  return timingSafeEquals(hmacHeader.trim(), expected);
}

export function verifyWooCommerceWebhookSignature(
  rawBody: Buffer | string | undefined,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!rawBody || !signatureHeader || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody)
    .digest('base64');
  return timingSafeEquals(signatureHeader.trim(), expected);
}

export function verifyCustomWebhookSignature(
  rawBody: Buffer | string | undefined,
  signatureHeader: string | undefined,
  webhookSecret: string,
  timestampHeader?: string
): { valid: boolean; reason?: string } {
  if (!rawBody || !signatureHeader || !webhookSecret) {
    return { valid: false, reason: 'Missing webhook signature or payload.' };
  }
  const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const trimmedSig = signatureHeader.trim().toLowerCase();
  if (!trimmedSig.startsWith('sha256=')) {
    return { valid: false, reason: 'Invalid signature format; expected sha256=<hex>.' };
  }

  if (timestampHeader && timestampHeader.trim()) {
    const tsSec = Number(timestampHeader.trim());
    if (!Number.isFinite(tsSec)) {
      return { valid: false, reason: 'Invalid X-SmartBitz-Timestamp header.' };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - tsSec) > 300) {
      return { valid: false, reason: 'Webhook timestamp is expired (>300s).' };
    }
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', webhookSecret).update(`${timestampHeader.trim()}.${bodyStr}`, 'utf8').digest('hex');
    return timingSafeEquals(trimmedSig, expected)
      ? { valid: true }
      : { valid: false, reason: 'Webhook HMAC signature mismatch.' };
  }

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', webhookSecret).update(bodyStr, 'utf8').digest('hex');
  return timingSafeEquals(trimmedSig, expected)
    ? { valid: true }
    : { valid: false, reason: 'Webhook HMAC signature mismatch.' };
}

function signOAuthStatePayload(
  payload: { userId: string; shopDomain: string; nonce: string; exp: number },
  secret: string
): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded, 'utf8').digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySignedOAuthState(
  stateToken: string,
  secret: string
): { userId: string; shopDomain: string; nonce: string; exp: number } | null {
  const parts = String(stateToken || '').split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', secret).update(encoded, 'utf8').digest('base64url');
  if (!timingSafeEquals(sig, expectedSig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      userId?: string;
      shopDomain?: string;
      nonce?: string;
      exp?: number;
    };
    if (
      !parsed.userId ||
      !parsed.shopDomain ||
      !parsed.nonce ||
      !parsed.exp ||
      Date.now() > parsed.exp
    ) {
      return null;
    }
    return {
      userId: parsed.userId,
      shopDomain: parsed.shopDomain,
      nonce: parsed.nonce,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

export async function executeShopifyGraphql<T = Record<string, unknown>>(params: {
  shopDomain: string;
  accessToken: string;
  apiVersion?: string;
  query: string;
  variables?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const fetchFn = params.fetchImpl ?? fetch;
  const version = params.apiVersion || DEFAULT_SHOPIFY_API_VERSION;
  const endpoint = `https://${params.shopDomain}/admin/api/${version}/graphql.json`;

  const resp = await fetchFn(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': params.accessToken,
    },
    body: JSON.stringify({
      query: params.query,
      variables: params.variables ?? {},
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return {
      ok: false,
      status: resp.status,
      error: text || `Shopify GraphQL API returned HTTP ${resp.status}`,
    };
  }

  const json = (await resp.json().catch(() => ({}))) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  if (Array.isArray(json.errors) && json.errors.length > 0) {
    return {
      ok: false,
      status: 502,
      error: json.errors.map((e) => e.message || 'GraphQL error').join('; '),
    };
  }

  return { ok: true, data: (json.data ?? ({} as T)) };
}

export const SHOPIFY_GRAPHQL_PRODUCTS_QUERY = `
  query SmartBitzSyncProducts($first: Int!) {
    products(first: $first) {
      nodes {
        id
        title
        variants(first: 20) {
          nodes {
            id
            sku
            price
            inventoryQuantity
            inventoryItem {
              id
            }
          }
        }
      }
    }
  }
`;

export const SHOPIFY_GRAPHQL_ORDERS_QUERY = `
  query SmartBitzSyncOrders($first: Int!, $query: String) {
    orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        createdAt
        displayFinancialStatus
        cancelledAt
        cancelReason
        note
        customer {
          firstName
          lastName
          phone
        }
        shippingAddress {
          name
          phone
          address1
          address2
          city
        }
        totalPriceSet {
          shopMoney {
            amount
          }
        }
        lineItems(first: 50) {
          nodes {
            quantity
            sku
            title
            variant {
              id
              sku
              product {
                id
              }
            }
          }
        }
      }
    }
  }
`;

export const SHOPIFY_GRAPHQL_INVENTORY_SET_MUTATION = `
  mutation SmartBitzSetInventory($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      userErrors {
        field
        message
      }
    }
  }
`;

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function toSummary(
  rec: StoredExternalIntegrationRecord,
  mappedProductsCount = 0
): ExternalIntegrationSummary {
  return {
    id: rec.id,
    provider: rec.provider,
    status: rec.status,
    displayName: rec.displayName,
    storeDomain: rec.storeDomain,
    apiKeyMasked: rec.apiKeyMasked,
    scopes: rec.scopes,
    lastSyncAt: rec.lastSyncAt,
    lastSyncStatus: rec.lastSyncStatus,
    lastError: rec.lastError,
    connectedAt: rec.connectedAt,
    disconnectedAt: rec.disconnectedAt,
    mappedProductsCount,
    metadata: rec.metadata,
  };
}

function mapSupabaseIntegrationRow(row: Record<string, unknown>): StoredExternalIntegrationRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    provider: row.provider as IntegrationProvider,
    status: (row.status as IntegrationConnectionStatus) || 'not_connected',
    displayName: String(row.display_name || ''),
    storeDomain: String(row.store_domain || ''),
    apiKeyMasked: String(row.api_key_masked || ''),
    webhookSecretHash:
      typeof row.webhook_secret_hash === 'string' ? row.webhook_secret_hash : undefined,
    encryptedCredentials:
      typeof row.encrypted_credentials === 'string' ? row.encrypted_credentials : undefined,
    scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
    lastSyncAt: typeof row.last_sync_at === 'string' ? row.last_sync_at : undefined,
    lastSyncStatus:
      (row.last_sync_status as StoredExternalIntegrationRecord['lastSyncStatus']) || 'never',
    lastError: typeof row.last_error === 'string' ? row.last_error : undefined,
    metadata:
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : {},
    connectedAt: typeof row.connected_at === 'string' ? row.connected_at : undefined,
    disconnectedAt: typeof row.disconnected_at === 'string' ? row.disconnected_at : undefined,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function mapOmnichannelOrderRowLocal(row: Record<string, unknown>): OmnichannelOrder {
  return {
    id: String(row.id),
    userId: typeof row.user_id === 'string' ? row.user_id : undefined,
    orderNumber: String(row.order_number || ''),
    channel: (row.channel as OmnichannelOrder['channel']) || 'website',
    status: (row.status as OmnichannelOrder['status']) || 'new',
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
    paymentMethod: (row.payment_method as OmnichannelPaymentMethod) || 'online',
    paymentStatus: (row.payment_status as OmnichannelPaymentStatus) || 'unpaid',
    paidAmount: roundCurrency(Number(row.paid_amount ?? 0)),
    idempotencyKey:
      typeof row.idempotency_key === 'string' && row.idempotency_key
        ? row.idempotency_key
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
    createdBy: String(row.created_by || 'external'),
    updatedBy: String(row.updated_by || 'external'),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

interface NormalizedExternalLineInput {
  externalProductId?: string;
  externalVariantId?: string;
  sku?: string;
  productId?: string;
  quantity: number;
}

interface NormalizedExternalOrderInput {
  externalSource: ExternalOrderSource;
  externalOrderId: string;
  externalOrderNumber?: string;
  idempotencyKey?: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  notes?: string;
  paymentMethod: OmnichannelPaymentMethod;
  paymentStatus: OmnichannelPaymentStatus;
  paidAmount: number;
  items: NormalizedExternalLineInput[];
}

const CART_OR_DRAFT_EVENTS = new Set([
  'cart.created',
  'cart.updated',
  'cart.item_added',
  'carts/create',
  'carts/update',
  'checkout.started',
  'checkout.abandoned',
  'checkouts/create',
  'checkouts/update',
]);

export function isNonOrderCartOrDraftEvent(eventName?: string, orderStatus?: string): boolean {
  const ev = String(eventName || '').trim().toLowerCase();
  const st = String(orderStatus || '').trim().toLowerCase();
  if (ev && CART_OR_DRAFT_EVENTS.has(ev)) return true;
  if (st && ['cart', 'draft', 'checkout-draft', 'abandoned', 'pending_cart'].includes(st)) {
    return true;
  }
  return false;
}

export function registerExternalIntegrationRoutes<
  TUser extends VerifiedTenantUser = VerifiedTenantUser,
>(app: Express, deps: ExternalIntegrationRouteDeps<TUser>): void {
  const {
    adminSupabase,
    omnichannelMemoryStore,
    integrationsMemoryStore,
    authenticateReq,
    checkOpAccess,
    resolveStaff,
  } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;

  const getEnvConfig = (): ExternalIntegrationsEnvConfig => ({
    appUrl: deps.env?.appUrl ?? process.env.APP_URL,
    shopifyApiKey: deps.env?.shopifyApiKey ?? process.env.SHOPIFY_API_KEY,
    shopifyApiSecret: deps.env?.shopifyApiSecret ?? process.env.SHOPIFY_API_SECRET,
    shopifyScopes: deps.env?.shopifyScopes ?? process.env.SHOPIFY_SCOPES ?? DEFAULT_SHOPIFY_SCOPES,
    shopifyApiVersion:
      deps.env?.shopifyApiVersion ?? process.env.SHOPIFY_API_VERSION ?? DEFAULT_SHOPIFY_API_VERSION,
    encryptionKey: deps.env?.encryptionKey ?? process.env.INTEGRATION_ENCRYPTION_KEY,
    whatsappAccessToken: deps.env?.whatsappAccessToken ?? process.env.WHATSAPP_ACCESS_TOKEN,
    whatsappPhoneNumberId: deps.env?.whatsappPhoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID,
    allowUnsafeTestUrls: deps.env?.allowUnsafeTestUrls ?? false,
  });

  async function requireAdminIntegrationStaff(
    req: Request,
    res: Response
  ): Promise<{
    user: TUser;
    staff: { role: EmployeeRole; employeeId: string; employeeName: string };
  } | null> {
    const user = await authenticateReq(req);
    if (!user) {
      res.status(401).json({ ok: false, error: 'Authentication required.' });
      return null;
    }

    const op = await checkOpAccess(user);
    if (!op.allowed) {
      res.status(403).json({ ok: false, error: op.reason || 'Subscription access restricted.' });
      return null;
    }

    const staff = await resolveStaff(req, user);
    if (!staff.role || !hasRolePermission(staff.role, 'integrations.manage')) {
      res.status(403).json({
        ok: false,
        error: 'Only Shop Admin can manage external e-commerce integrations.',
      });
      return null;
    }

    return {
      user,
      staff: {
        role: staff.role,
        employeeId: staff.employeeId || user.id,
        employeeName: staff.employeeName || user.email || 'Admin',
      },
    };
  }

  async function recordAuditLog(params: {
    userId: string;
    provider: string;
    action: string;
    actorId: string;
    actorName: string;
    actorRole: string;
    details: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const entry: IntegrationAuditLogEntry = {
      id: `iaud-${crypto.randomUUID()}`,
      userId: params.userId,
      provider: params.provider,
      action: params.action,
      actorId: params.actorId,
      actorName: params.actorName,
      actorRole: params.actorRole,
      details: params.details,
      metadata: params.metadata ?? {},
      createdAt: new Date().toISOString(),
    };

    if (integrationsMemoryStore) {
      integrationsMemoryStore.appendAuditLog(entry);
      return;
    }
    if (!adminSupabase) return;

    await adminSupabase.from('integration_audit_logs').insert({
      id: entry.id,
      user_id: params.userId,
      provider: params.provider,
      action: params.action,
      actor_id: params.actorId,
      actor_name: params.actorName,
      actor_role: params.actorRole,
      details: params.details,
      metadata: entry.metadata ?? {},
      created_at: entry.createdAt,
    });
  }

  async function loadIntegrationRecord(
    userId: string,
    provider: IntegrationProvider
  ): Promise<StoredExternalIntegrationRecord | null> {
    if (integrationsMemoryStore) {
      return integrationsMemoryStore.getIntegration(userId, provider) ?? null;
    }
    if (!adminSupabase) return null;
    const res = await adminSupabase
      .from('external_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .maybeSingle();
    if (res.error || !res.data) return null;
    return mapSupabaseIntegrationRow(res.data as Record<string, unknown>);
  }

  async function saveIntegrationRecord(
    record: StoredExternalIntegrationRecord
  ): Promise<{ ok: true; record: StoredExternalIntegrationRecord } | { ok: false; error: string }> {
    if (integrationsMemoryStore) {
      return { ok: true, record: integrationsMemoryStore.upsertIntegration(record) };
    }
    if (!adminSupabase) {
      return { ok: false, error: 'Database service unavailable.' };
    }

    const row = {
      id: record.id,
      user_id: record.userId,
      provider: record.provider,
      status: record.status,
      display_name: record.displayName,
      store_domain: record.storeDomain,
      api_key_masked: record.apiKeyMasked,
      webhook_secret_hash: record.webhookSecretHash ?? null,
      encrypted_credentials: record.encryptedCredentials ?? null,
      scopes: record.scopes,
      last_sync_at: record.lastSyncAt ?? null,
      last_sync_status: record.lastSyncStatus,
      last_error: record.lastError ?? null,
      metadata: record.metadata,
      connected_at: record.connectedAt ?? null,
      disconnected_at: record.disconnectedAt ?? null,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    };

    const up = await adminSupabase
      .from('external_integrations')
      .upsert(row, { onConflict: 'user_id,provider' })
      .select('*')
      .single();

    if (up.error) {
      return { ok: false, error: up.error.message };
    }
    return {
      ok: true,
      record: mapSupabaseIntegrationRow(up.data as Record<string, unknown>),
    };
  }

  async function loadTenantProductsAndMappings(
    userId: string,
    provider: ExternalOrderSource
  ): Promise<{
    products: Product[];
    branches: Branch[];
    mappings: StoredExternalProductMapping[];
  }> {
    if (omnichannelMemoryStore) {
      const t = omnichannelMemoryStore.tenants.get(userId);
      const mappings = integrationsMemoryStore
        ? integrationsMemoryStore.listMappings(userId, provider)
        : [];
      return {
        products: t?.products ?? [],
        branches: t?.branches ?? [],
        mappings,
      };
    }

    if (!adminSupabase) {
      return { products: [], branches: [], mappings: [] };
    }

    const [prodRes, branchRes, mapRes] = await Promise.all([
      adminSupabase.from('products').select('*').eq('user_id', userId),
      adminSupabase.from('branches').select('*').eq('user_id', userId),
      adminSupabase
        .from('external_product_mappings')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', provider),
    ]);

    const products: Product[] = ((prodRes.data || []) as Array<Record<string, unknown>>).map(
      (row) => ({
        id: String(row.id),
        sku: String(row.sku || ''),
        barcode: String(row.barcode || ''),
        nameEn: String(row.name_en || ''),
        nameUr: String(row.name_ur || row.name_en || ''),
        category:
          row.category === 'beverages' || row.category === 'bakery' || row.category === 'pantry'
            ? row.category
            : 'pantry',
        price: roundCurrency(Number(row.price ?? 0)),
        cost: roundCurrency(Number(row.cost ?? 0)),
        taxRate: Number(row.tax_rate ?? 0),
        sellingUnit: (row.selling_unit as Product['sellingUnit']) || 'piece',
        stock: roundQuantity(Number(row.stock ?? 0)),
        branchStock:
          row.branch_stock && typeof row.branch_stock === 'object'
            ? (row.branch_stock as Record<string, number>)
            : undefined,
        image: String(row.image || ''),
      })
    );

    const branches: Branch[] = ((branchRes.data || []) as Array<Record<string, unknown>>).map(
      (b) => ({
        id: String(b.id),
        name: String(b.name || 'Main'),
        code: String(b.code || ''),
        address: String(b.address || ''),
        phone: String(b.phone || ''),
        isMain: Boolean(b.is_main),
        isActive: b.is_active !== false,
        createdAt: String(b.created_at || ''),
      })
    );

    const mappings: StoredExternalProductMapping[] = (
      (mapRes.data || []) as Array<Record<string, unknown>>
    ).map((m) => ({
      id: String(m.id),
      userId: String(m.user_id),
      provider: m.provider as ExternalOrderSource,
      productId: String(m.product_id),
      externalProductId: String(m.external_product_id),
      externalVariantId: String(m.external_variant_id || ''),
      externalInventoryItemId: String(m.external_inventory_item_id || ''),
      externalSku: String(m.external_sku || ''),
      lastSyncedStock:
        m.last_synced_stock !== null && m.last_synced_stock !== undefined
          ? Number(m.last_synced_stock)
          : undefined,
      lastSyncedAt: typeof m.last_synced_at === 'string' ? m.last_synced_at : undefined,
      createdAt: String(m.created_at || ''),
      updatedAt: String(m.updated_at || ''),
    }));

    return { products, branches, mappings };
  }

  async function upsertProductMappings(
    userId: string,
    provider: ExternalOrderSource,
    rows: StoredExternalProductMapping[]
  ): Promise<void> {
    if (rows.length === 0) return;
    if (integrationsMemoryStore) {
      for (const r of rows) integrationsMemoryStore.upsertMapping(r);
      return;
    }
    if (!adminSupabase) return;

    await adminSupabase.from('external_product_mappings').upsert(
      rows.map((r) => ({
        id: r.id,
        user_id: userId,
        provider,
        product_id: r.productId,
        external_product_id: r.externalProductId,
        external_variant_id: r.externalVariantId,
        external_inventory_item_id: r.externalInventoryItemId,
        external_sku: r.externalSku,
        last_synced_stock: r.lastSyncedStock ?? null,
        last_synced_at: r.lastSyncedAt ?? null,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
      })),
      { onConflict: 'user_id,provider,external_product_id,external_variant_id' }
    );
  }

  async function claimWebhookEventDedup(
    channel: ExternalOrderSource,
    eventId: string,
    userId: string,
    rawBody: string
  ): Promise<boolean> {
    const cleanId = eventId.trim();
    if (!cleanId) return true;
    const key = `${channel}:${userId}:${cleanId}`;

    if (omnichannelMemoryStore) {
      if (omnichannelMemoryStore.webhookEventIds.has(key)) return false;
      omnichannelMemoryStore.webhookEventIds.add(key);
      return true;
    }
    if (!adminSupabase) return true;

    const payloadHash = sha256Hex(rawBody);
    const ins = await adminSupabase.from('webhook_events').insert({
      id: `wh-${crypto.randomUUID()}`,
      channel,
      event_id: `${userId}:${cleanId}`,
      user_id: userId,
      payload_hash: payloadHash,
      status: 'processed',
      created_at: new Date().toISOString(),
    });
    if (ins.error && ins.error.code === '23505') {
      return false;
    }
    return true;
  }

  async function importExternalOrderIntoOmnichannel(params: {
    userId: string;
    integrationId?: string;
    input: NormalizedExternalOrderInput;
  }): Promise<
    | { ok: true; deduplicated: boolean; order: OmnichannelOrder }
    | { ok: false; code: string; error: string }
  > {
    const { userId, integrationId, input } = params;
    const { products, branches, mappings } = await loadTenantProductsAndMappings(
      userId,
      input.externalSource
    );

    const byId = new Map(products.map((p) => [p.id, p]));
    const bySku = new Map(
      products
        .filter((p) => p.sku && p.sku.trim())
        .map((p) => [p.sku.trim().toLowerCase(), p])
    );

    // Resolve line items strictly against THIS tenant's catalog
    const resolvedQtyMap = new Map<string, number>();
    for (const line of input.items) {
      const qty = roundQuantity(Number(line.quantity));
      if (!Number.isFinite(qty) || qty <= 0) {
        return {
          ok: false,
          code: 'INVALID_QUANTITY',
          error: 'External order contains an item with invalid quantity.',
        };
      }

      let matched: Product | undefined;
      if (line.externalVariantId || line.externalProductId) {
        const mapped = mappings.find(
          (m) =>
            (line.externalVariantId && m.externalVariantId === line.externalVariantId) ||
            (line.externalProductId && m.externalProductId === line.externalProductId)
        );
        if (mapped) matched = byId.get(mapped.productId);
      }
      if (!matched && line.sku) {
        matched = bySku.get(line.sku.trim().toLowerCase());
      }
      if (!matched && line.productId) {
        matched = byId.get(line.productId.trim());
      }
      if (!matched) {
        return {
          ok: false,
          code: 'UNMAPPED_PRODUCT',
          error: `External item (${line.sku || line.externalProductId || line.productId || 'unknown'}) does not match any product in this shop's catalog.`,
        };
      }

      resolvedQtyMap.set(matched.id, roundQuantity((resolvedQtyMap.get(matched.id) ?? 0) + qty));
    }

    if (resolvedQtyMap.size === 0) {
      return { ok: false, code: 'EMPTY_ITEMS', error: 'Order contains no valid items.' };
    }

    const activeBranch =
      branches.find((b) => b.isActive !== false && b.isMain) ||
      branches.find((b) => b.isActive !== false) ||
      branches[0];

    if (omnichannelMemoryStore) {
      const tenant = omnichannelMemoryStore.tenants.get(userId);
      if (!tenant) {
        return { ok: false, code: 'TENANT_NOT_FOUND', error: 'Shop workspace not found.' };
      }

      // Deduplicate by externalOrderId or idempotencyKey
      const dup = tenant.orders.find(
        (o) =>
          (o.externalSource === input.externalSource &&
            o.externalOrderId === input.externalOrderId) ||
          (input.idempotencyKey && o.idempotencyKey === input.idempotencyKey)
      );
      if (dup) {
        return { ok: true, deduplicated: true, order: dup };
      }

      let subtotal = 0;
      let taxAmount = 0;
      const items: OmnichannelOrderItem[] = [];
      for (const [productId, quantity] of resolvedQtyMap.entries()) {
        const prod = byId.get(productId)!;
        const unitPrice = roundCurrency(Number(prod.price || 0));
        const taxRate = Math.max(0, Number(prod.taxRate || 0));
        const lineSub = roundCurrency(unitPrice * quantity);
        const lineTax = roundCurrency((lineSub * taxRate) / 100);
        const lineTotal = roundCurrency(lineSub + lineTax);
        subtotal = roundCurrency(subtotal + lineSub);
        taxAmount = roundCurrency(taxAmount + lineTax);
        items.push({
          productId: prod.id,
          sku: prod.sku,
          nameEn: prod.nameEn,
          nameUr: prod.nameUr,
          category: prod.category,
          sellingUnit: prod.sellingUnit,
          quantity,
          unitPrice,
          taxRate,
          lineTotal,
        });
      }

      const total = Math.max(0, roundCurrency(subtotal + taxAmount));
      const paidAmount = Math.min(total, Math.max(0, roundCurrency(input.paidAmount)));
      const nowIso = new Date().toISOString();
      const orderNumber = generateOmnichannelOrderNumber(input.externalSource);
      const order: OmnichannelOrder = {
        id: `omni-${crypto.randomUUID()}`,
        userId,
        orderNumber,
        channel: input.externalSource,
        status: 'new',
        branchId: activeBranch?.id,
        branchName: activeBranch?.name,
        customerName: input.customerName || 'External Store Customer',
        customerPhone: input.customerPhone || 'N/A',
        deliveryAddress: input.deliveryAddress || 'External Delivery',
        notes: input.notes,
        items,
        subtotal,
        discountAmount: 0,
        taxAmount,
        total,
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentStatus,
        paidAmount,
        idempotencyKey: input.idempotencyKey,
        externalSource: input.externalSource,
        externalOrderId: input.externalOrderId,
        externalOrderNumber: input.externalOrderNumber,
        integrationId,
        stockReserved: false,
        statusHistory: [
          {
            status: 'new',
            changedAt: nowIso,
            actorId: `${input.externalSource}_webhook`,
            actorName: input.externalSource.replace('_', ' '),
            actorRole: 'webhook',
            note: `Imported from ${input.externalSource} (${input.externalOrderNumber || input.externalOrderId})`,
          },
        ],
        notificationLog: [],
        createdBy: input.externalSource,
        updatedBy: input.externalSource,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      tenant.orders.unshift(order);
      tenant.auditLogs.unshift({
        id: `oaud-${crypto.randomUUID()}`,
        orderId: order.id,
        action: `${input.externalSource}_order_imported`,
        actorId: `${input.externalSource}_webhook`,
        actorName: input.externalSource,
        actorRole: 'webhook',
        newStatus: 'new',
        details: `Imported ${input.externalSource} order ${input.externalOrderNumber || input.externalOrderId} -> ${order.orderNumber}`,
        createdAt: nowIso,
      });

      return { ok: true, deduplicated: false, order };
    }

    if (!adminSupabase) {
      return { ok: false, code: 'DB_UNAVAILABLE', error: 'Database service unavailable.' };
    }

    const orderNumber = generateOmnichannelOrderNumber(input.externalSource);
    const rpcRes = await adminSupabase.rpc('import_external_omnichannel_order', {
      p_user_id: userId,
      p_channel: input.externalSource,
      p_external_source: input.externalSource,
      p_external_order_id: input.externalOrderId,
      p_external_order_number: input.externalOrderNumber ?? null,
      p_integration_id: integrationId ?? null,
      p_customer_name: input.customerName || 'External Store Customer',
      p_customer_phone: input.customerPhone || 'N/A',
      p_delivery_address: input.deliveryAddress || 'External Delivery',
      p_notes: input.notes || '',
      p_branch_id: activeBranch?.id ?? null,
      p_payment_method: input.paymentMethod,
      p_payment_status: input.paymentStatus,
      p_paid_amount: input.paidAmount,
      p_idempotency_key: input.idempotencyKey ?? null,
      p_order_number: orderNumber,
      p_items: Array.from(resolvedQtyMap.entries()).map(([productId, quantity]) => ({
        productId,
        quantity,
      })),
    });

    if (rpcRes.error) {
      return {
        ok: false,
        code: isMissingColumnOrTable(rpcRes.error) ? 'SCHEMA_MIGRATION_PENDING' : 'RPC_ERROR',
        error: rpcRes.error.message,
      };
    }

    const payload = rpcRes.data as {
      ok?: boolean;
      deduplicated?: boolean;
      code?: string;
      error?: string;
      order?: Record<string, unknown>;
    };

    if (!payload?.ok || !payload.order) {
      return {
        ok: false,
        code: payload?.code || 'IMPORT_FAILED',
        error: payload?.error || 'Could not import external order.',
      };
    }

    return {
      ok: true,
      deduplicated: Boolean(payload.deduplicated),
      order: mapOmnichannelOrderRowLocal(payload.order),
    };
  }

  async function cancelExternalOrderSafely(params: {
    userId: string;
    externalSource: ExternalOrderSource;
    externalOrderId: string;
    reason: string;
  }): Promise<
    | { ok: true; found: boolean; restocked: boolean; order?: OmnichannelOrder }
    | { ok: false; code: string; error: string }
  > {
    if (omnichannelMemoryStore) {
      const tenant = omnichannelMemoryStore.tenants.get(params.userId);
      if (!tenant) return { ok: false, code: 'TENANT_NOT_FOUND', error: 'Shop not found.' };

      const existing = tenant.orders.find(
        (o) =>
          o.externalSource === params.externalSource &&
          o.externalOrderId === params.externalOrderId
      );
      if (!existing) {
        return { ok: true, found: false, restocked: false };
      }
      if (existing.status === 'cancelled' || existing.status === 'rejected') {
        return { ok: true, found: true, restocked: false, order: existing };
      }
      if (existing.status === 'delivered') {
        return {
          ok: false,
          code: 'ALREADY_DELIVERED',
          error: `Order ${existing.orderNumber} is already delivered.`,
        };
      }

      const nowIso = new Date().toISOString();
      const transition = transitionOmnichannelOrderStatus({
        order: existing,
        targetStatus: 'cancelled',
        actor: {
          id: `${params.externalSource}_webhook`,
          name: params.externalSource,
          role: 'admin',
        },
        products: tenant.products,
        reason: params.reason,
        nowIso,
      });

      if (transition.ok === false) {
        return { ok: false, code: transition.code, error: transition.error };
      }

      // Stamp last history entry with webhook role cleanly
      const updatedOrder: OmnichannelOrder = {
        ...transition.order,
        statusHistory: transition.order.statusHistory.map((h, idx, arr) =>
          idx === arr.length - 1 ? { ...h, actorRole: 'webhook' } : h
        ),
      };

      tenant.products = transition.updatedProducts;
      tenant.orders = tenant.orders.map((o) => (o.id === existing.id ? updatedOrder : o));
      if (transition.adjustments.length > 0) {
        tenant.adjustments.unshift(...transition.adjustments);
      }
      tenant.auditLogs.unshift({
        id: `oaud-${crypto.randomUUID()}`,
        orderId: existing.id,
        action: `${params.externalSource}_order_cancelled`,
        actorId: `${params.externalSource}_webhook`,
        actorName: params.externalSource,
        actorRole: 'webhook',
        previousStatus: existing.status,
        newStatus: 'cancelled',
        details: params.reason,
        createdAt: nowIso,
      });

      return {
        ok: true,
        found: true,
        restocked: transition.didRestoreStock,
        order: updatedOrder,
      };
    }

    if (!adminSupabase) {
      return { ok: false, code: 'DB_UNAVAILABLE', error: 'Database service unavailable.' };
    }

    const rpcRes = await adminSupabase.rpc('cancel_external_omnichannel_order_with_restock', {
      p_user_id: params.userId,
      p_external_source: params.externalSource,
      p_external_order_id: params.externalOrderId,
      p_reason: params.reason,
    });

    if (rpcRes.error) {
      return { ok: false, code: 'RPC_ERROR', error: rpcRes.error.message };
    }

    const payload = rpcRes.data as {
      ok?: boolean;
      code?: string;
      error?: string;
      restocked?: boolean;
      order?: Record<string, unknown>;
    };

    if (!payload.ok) {
      if (payload.code === 'ORDER_NOT_FOUND') {
        return { ok: true, found: false, restocked: false };
      }
      return {
        ok: false,
        code: payload.code || 'CANCEL_FAILED',
        error: payload.error || 'Could not cancel order.',
      };
    }

    return {
      ok: true,
      found: true,
      restocked: Boolean(payload.restocked),
      order: payload.order ? mapOmnichannelOrderRowLocal(payload.order) : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // 1. OVERVIEW & AUDIT LOGS (Admin-only, never returns decrypted secrets)
  // -------------------------------------------------------------------------
  app.get('/api/integrations', async (req: Request, res: Response) => {
    const auth = await requireAdminIntegrationStaff(req, res);
    if (!auth) return;

    const env = getEnvConfig();
    const baseUrl = resolveAppBaseUrl(req, env);
    const shopifyAppConfigured = Boolean(env.shopifyApiKey && env.shopifyApiSecret);
    const whatsappCloudEnvConfigured = Boolean(env.whatsappAccessToken && env.whatsappPhoneNumberId);

    let tenantWaPhoneId = '';
    if (omnichannelMemoryStore) {
      tenantWaPhoneId =
        omnichannelMemoryStore.tenants.get(auth.user.id)?.settings.whatsappPhoneNumberId || '';
    } else if (adminSupabase) {
      const st = await adminSupabase
        .from('store_settings')
        .select('whatsapp_business_phone_id')
        .eq('user_id', auth.user.id)
        .maybeSingle();
      tenantWaPhoneId = String(
        (st.data as Record<string, unknown> | null)?.whatsapp_business_phone_id || ''
      );
    }

    let records: StoredExternalIntegrationRecord[] = [];
    const mappingCounts = new Map<string, number>();

    if (integrationsMemoryStore) {
      records = integrationsMemoryStore.listTenantIntegrations(auth.user.id);
      for (const m of integrationsMemoryStore.listMappings(auth.user.id)) {
        mappingCounts.set(m.provider, (mappingCounts.get(m.provider) ?? 0) + 1);
      }
    } else if (adminSupabase) {
      const [intRes, mapRes] = await Promise.all([
        adminSupabase
          .from('external_integrations')
          .select(
            'id,user_id,provider,status,display_name,store_domain,api_key_masked,scopes,last_sync_at,last_sync_status,last_error,metadata,connected_at,disconnected_at,created_at,updated_at'
          )
          .eq('user_id', auth.user.id),
        adminSupabase
          .from('external_product_mappings')
          .select('provider')
          .eq('user_id', auth.user.id),
      ]);
      if (!intRes.error && Array.isArray(intRes.data)) {
        records = (intRes.data as Array<Record<string, unknown>>).map(mapSupabaseIntegrationRow);
      }
      if (!mapRes.error && Array.isArray(mapRes.data)) {
        for (const row of mapRes.data as Array<{ provider?: string }>) {
          if (row.provider) {
            mappingCounts.set(row.provider, (mappingCounts.get(row.provider) ?? 0) + 1);
          }
        }
      }
    }

    const byProvider = new Map(records.map((r) => [r.provider, r]));

    const buildDefaultSummary = (provider: IntegrationProvider): ExternalIntegrationSummary => {
      const existing = byProvider.get(provider);
      if (existing) {
        return toSummary(existing, mappingCounts.get(provider) ?? 0);
      }
      if (provider === 'whatsapp_business') {
        const waReady = whatsappCloudEnvConfigured && Boolean(tenantWaPhoneId.trim());
        return {
          provider: 'whatsapp_business',
          status: waReady ? 'connected' : 'not_connected',
          displayName: 'WhatsApp Business Cloud API',
          storeDomain: tenantWaPhoneId.trim(),
          apiKeyMasked: waReady ? maskCredentialHint(tenantWaPhoneId) : '',
          scopes: [],
          lastSyncStatus: 'never',
          metadata: {
            personalWhatsAppUnsupported: true,
            manualFallbackActive: true,
            requiresMetaBusinessAuth: !whatsappCloudEnvConfigured,
            serverConfigured: whatsappCloudEnvConfigured,
          },
        };
      }
      return {
        provider,
        status: 'not_connected',
        displayName:
          provider === 'shopify'
            ? 'Shopify'
            : provider === 'woocommerce'
            ? 'WooCommerce'
            : 'Custom Website',
        storeDomain: '',
        apiKeyMasked: '',
        scopes: [],
        lastSyncStatus: 'never',
        mappedProductsCount: 0,
        metadata: {},
      };
    };

    const integrations: ExternalIntegrationSummary[] = [
      buildDefaultSummary('shopify'),
      buildDefaultSummary('woocommerce'),
      buildDefaultSummary('custom_website'),
      buildDefaultSummary('whatsapp_business'),
    ];

    return res.json({
      ok: true,
      integrations,
      capabilities: {
        shopifyOAuthAppConfigured: shopifyAppConfigured,
        whatsappCloudConfigured: whatsappCloudEnvConfigured,
        appUrl: baseUrl,
        shopifyCallbackUrl: `${baseUrl}/api/integrations/shopify/oauth/callback`,
        customWebhookUrl: `${baseUrl}/api/integrations/custom/webhooks/orders`,
        wooWebhookUrl: `${baseUrl}/api/integrations/woocommerce/webhooks?tenant=${encodeURIComponent(auth.user.id)}`,
      },
    });
  });

  app.get('/api/integrations/audit-logs', async (req: Request, res: Response) => {
    const auth = await requireAdminIntegrationStaff(req, res);
    if (!auth) return;

    if (integrationsMemoryStore) {
      return res.json({
        ok: true,
        logs: integrationsMemoryStore.listAuditLogs(auth.user.id).slice(0, 50),
      });
    }
    if (!adminSupabase) {
      return res.status(503).json({ ok: false, error: 'Database service unavailable.' });
    }

    const q = await adminSupabase
      .from('integration_audit_logs')
      .select('*')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (q.error) {
      if (isMissingColumnOrTable(q.error)) {
        return res.json({ ok: true, logs: [], schemaPending: true });
      }
      return res.status(500).json({ ok: false, error: q.error.message });
    }

    const logs: IntegrationAuditLogEntry[] = (
      (q.data || []) as Array<Record<string, unknown>>
    ).map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      provider: String(r.provider),
      action: String(r.action),
      actorId: String(r.actor_id),
      actorName: String(r.actor_name),
      actorRole: String(r.actor_role),
      details: String(r.details || ''),
      metadata:
        r.metadata && typeof r.metadata === 'object'
          ? (r.metadata as Record<string, unknown>)
          : {},
      createdAt: String(r.created_at),
    }));

    return res.json({ ok: true, logs });
  });

  // -------------------------------------------------------------------------
  // 2. SHOPIFY OAUTH URL + CALLBACK + DISCONNECT
  // -------------------------------------------------------------------------
  app.get('/api/integrations/shopify/oauth/url', async (req: Request, res: Response) => {
    const auth = await requireAdminIntegrationStaff(req, res);
    if (!auth) return;

    const env = getEnvConfig();
    const shopDomain = normalizeShopifyShopDomain(String(req.query.shop || ''));
    if (!shopDomain) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_SHOP_DOMAIN',
        error: 'Enter a valid Shopify store domain (e.g., your-store.myshopify.com).',
      });
    }

    if (!env.shopifyApiKey || !env.shopifyApiSecret) {
      return res.status(503).json({
        ok: false,
        code: 'SHOPIFY_APP_NOT_CONFIGURED',
        error:
          'Shopify OAuth credentials (SHOPIFY_API_KEY and SHOPIFY_API_SECRET) are not configured on this server yet. Connection remains Not Connected until a real Shopify store owner authorizes the app.',
      });
    }

    const baseUrl = resolveAppBaseUrl(req, env);
    const redirectUri = `${baseUrl}/api/integrations/shopify/oauth/callback`;
    const scopes = (env.shopifyScopes || DEFAULT_SHOPIFY_SCOPES).trim();
    const nonce = crypto.randomBytes(16).toString('hex');
    const exp = Date.now() + 10 * 60 * 1000;

    if (integrationsMemoryStore) {
      integrationsMemoryStore.oauthStates.set(nonce, {
        nonce,
        userId: auth.user.id,
        provider: 'shopify',
        shopDomain,
        expiresAt: new Date(exp).toISOString(),
      });
    } else if (adminSupabase) {
      const ins = await adminSupabase.from('integration_oauth_states').insert({
        nonce,
        user_id: auth.user.id,
        provider: 'shopify',
        shop_domain: shopDomain,
        expires_at: new Date(exp).toISOString(),
        created_at: new Date().toISOString(),
      });
      if (ins.error) {
        return res.status(500).json({ ok: false, error: ins.error.message });
      }
    }

    const state = signOAuthStatePayload(
      { userId: auth.user.id, shopDomain, nonce, exp },
      env.shopifyApiSecret
    );

    const authUrl = new URL(`https://${shopDomain}/admin/oauth/authorize`);
    authUrl.searchParams.set('client_id', env.shopifyApiKey);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    await recordAuditLog({
      userId: auth.user.id,
      provider: 'shopify',
      action: 'shopify_oauth_started',
      actorId: auth.staff.employeeId,
      actorName: auth.staff.employeeName,
      actorRole: auth.staff.role,
      details: `Initiated Shopify OAuth authorization for ${shopDomain}`,
      metadata: { shopDomain, scopes },
    });

    return res.json({
      ok: true,
      authUrl: authUrl.toString(),
      redirectUri,
      shopDomain,
    });
  });

  const handleShopifyCallback = async (req: Request, res: Response) => {
    const env = getEnvConfig();
    const renderCallbackHtml = (payload: {
      ok: boolean;
      shop?: string;
      error?: string;
    }) => {
      const msg = payload.ok
        ? { type: 'SHOPIFY_OAUTH_SUCCESS', provider: 'shopify', shop: payload.shop || '' }
        : { type: 'SHOPIFY_OAUTH_ERROR', provider: 'shopify', error: payload.error || 'Authorization failed.' };
      const title = payload.ok ? 'Shopify Connected' : 'Shopify Authorization Failed';
      const bodyText = payload.ok
        ? `Connected ${escapeHtml(payload.shop || 'Shopify store')}. This window will close automatically.`
        : escapeHtml(payload.error || 'Could not complete Shopify authorization.');

      return res
        .status(payload.ok ? 200 : 400)
        .type('html')
        .send(`<!doctype html><html><head><title>${title}</title></head><body style="font-family:system-ui,sans-serif;padding:24px;color:#0f172a;">
<p>${bodyText}</p>
<script>
try {
  if (window.opener && typeof window.opener.postMessage === 'function') {
    window.opener.postMessage(${JSON.stringify(msg)}, '*');
  }
} catch (e) {}
window.close();
</script></body></html>`);
    };

    if (!env.shopifyApiKey || !env.shopifyApiSecret) {
      return renderCallbackHtml({
        ok: false,
        error: 'Shopify OAuth credentials are not configured on this server.',
      });
    }

    const shopDomain = normalizeShopifyShopDomain(String(req.query.shop || ''));
    const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
    const stateParam = typeof req.query.state === 'string' ? req.query.state.trim() : '';

    if (!shopDomain || !code || !stateParam) {
      return renderCallbackHtml({
        ok: false,
        error: 'Missing required Shopify OAuth callback parameters (shop, code, or state).',
      });
    }

    // 1. Verify Shopify HMAC query signature
    if (!verifyShopifyOAuthHmac(req.query as Record<string, unknown>, env.shopifyApiSecret)) {
      return renderCallbackHtml({
        ok: false,
        error: 'Invalid Shopify OAuth HMAC signature.',
      });
    }

    // 2. Verify signed OAuth state token + shop binding
    const verifiedState = verifySignedOAuthState(stateParam, env.shopifyApiSecret);
    if (!verifiedState || verifiedState.shopDomain !== shopDomain) {
      return renderCallbackHtml({
        ok: false,
        error: 'Invalid, expired, or mismatched OAuth state parameter.',
      });
    }

    // 3. Consume single-use nonce (replay protection)
    if (integrationsMemoryStore) {
      const stored = integrationsMemoryStore.oauthStates.get(verifiedState.nonce);
      if (
        !stored ||
        stored.consumedAt ||
        stored.userId !== verifiedState.userId ||
        stored.shopDomain !== shopDomain ||
        Date.now() > new Date(stored.expiresAt).getTime()
      ) {
        return renderCallbackHtml({
          ok: false,
          error: 'OAuth authorization state has already been used or expired.',
        });
      }
      stored.consumedAt = new Date().toISOString();
    } else if (adminSupabase) {
      const stateRow = await adminSupabase
        .from('integration_oauth_states')
        .select('*')
        .eq('nonce', verifiedState.nonce)
        .eq('user_id', verifiedState.userId)
        .maybeSingle();

      const row = stateRow.data as Record<string, unknown> | null;
      if (
        stateRow.error ||
        !row ||
        row.consumed_at ||
        String(row.shop_domain) !== shopDomain ||
        Date.now() > new Date(String(row.expires_at)).getTime()
      ) {
        return renderCallbackHtml({
          ok: false,
          error: 'OAuth authorization state has already been used or expired.',
        });
      }

      await adminSupabase
        .from('integration_oauth_states')
        .update({ consumed_at: new Date().toISOString() })
        .eq('nonce', verifiedState.nonce);
    }

    // 4. Exchange authorization code for offline Admin API access token
    let tokenData: { access_token?: string; scope?: string } = {};
    try {
      const tokenResp = await fetchImpl(`https://${shopDomain}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: env.shopifyApiKey,
          client_secret: env.shopifyApiSecret,
          code,
        }),
      });
      if (!tokenResp.ok) {
        return renderCallbackHtml({
          ok: false,
          error: `Shopify token exchange failed with HTTP ${tokenResp.status}.`,
        });
      }
      tokenData = (await tokenResp.json()) as { access_token?: string; scope?: string };
    } catch {
      return renderCallbackHtml({
        ok: false,
        error: 'Network error while exchanging Shopify authorization code.',
      });
    }

    if (!tokenData.access_token) {
      return renderCallbackHtml({
        ok: false,
        error: 'Shopify did not return an Admin API access token.',
      });
    }

    const nowIso = new Date().toISOString();
    const grantedScopes = String(tokenData.scope || env.shopifyScopes || DEFAULT_SHOPIFY_SCOPES)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const existing = await loadIntegrationRecord(verifiedState.userId, 'shopify');
    const encrypted = encryptIntegrationSecret(
      JSON.stringify({
        accessToken: tokenData.access_token,
        apiVersion: env.shopifyApiVersion || DEFAULT_SHOPIFY_API_VERSION,
      }),
      env
    );

    const saved = await saveIntegrationRecord({
      id: existing?.id || `int-${crypto.randomUUID()}`,
      userId: verifiedState.userId,
      provider: 'shopify',
      status: 'connected',
      displayName: `Shopify (${shopDomain})`,
      storeDomain: shopDomain,
      apiKeyMasked: maskCredentialHint(tokenData.access_token),
      encryptedCredentials: encrypted,
      scopes: grantedScopes,
      lastSyncAt: existing?.lastSyncAt,
      lastSyncStatus: existing?.lastSyncStatus ?? 'never',
      lastError: undefined,
      metadata: {
        apiVersion: env.shopifyApiVersion || DEFAULT_SHOPIFY_API_VERSION,
      },
      connectedAt: nowIso,
      disconnectedAt: undefined,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    });

    if (saved.ok === false) {
      return renderCallbackHtml({ ok: false, error: saved.error });
    }

    await recordAuditLog({
      userId: verifiedState.userId,
      provider: 'shopify',
      action: 'shopify_connected',
      actorId: verifiedState.userId,
      actorName: 'Shop Owner',
      actorRole: 'admin',
      details: `Connected Shopify store ${shopDomain} with scopes: ${grantedScopes.join(', ')}`,
      metadata: { shopDomain, scopes: grantedScopes },
    });

    return renderCallbackHtml({ ok: true, shop: shopDomain });
  };

  app.get(
    ['/api/integrations/shopify/oauth/callback', '/api/integrations/shopify/oauth/callback/'],
    handleShopifyCallback
  );

  // -------------------------------------------------------------------------
  // 3. WOOCOMMERCE CONNECT (Encrypted server-side credentials + live verify)
  // -------------------------------------------------------------------------
  app.post('/api/integrations/woocommerce/connect', async (req: Request, res: Response) => {
    const auth = await requireAdminIntegrationStaff(req, res);
    if (!auth) return;

    const env = getEnvConfig();
    const body = (req.body || {}) as {
      storeUrl?: string;
      consumerKey?: string;
      consumerSecret?: string;
      webhookSecret?: string;
    };

    const storeUrl = normalizeWooStoreUrl(body.storeUrl || '', {
      allowUnsafeTestUrls: env.allowUnsafeTestUrls,
    });
    const consumerKey = String(body.consumerKey || '').trim();
    const consumerSecret = String(body.consumerSecret || '').trim();
    const webhookSecret = String(body.webhookSecret || consumerSecret).trim();

    if (!storeUrl) {
      return res.status(400).json({
        ok: false,
        error: 'Enter a valid public HTTPS WooCommerce store URL (e.g., https://shop.example.com).',
      });
    }
    if (consumerKey.length < 6 || consumerSecret.length < 6) {
      return res.status(400).json({
        ok: false,
        error: 'Valid WooCommerce Consumer Key and Consumer Secret are required.',
      });
    }

    // Verify WooCommerce REST API connectivity before marking connected (never fake connected status)
    try {
      const authHeader =
        'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`, 'utf8').toString('base64');
      const verifyResp = await fetchImpl(`${storeUrl}/wp-json/wc/v3/orders?per_page=1`, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
      });
      if (!verifyResp.ok) {
        return res.status(verifyResp.status === 401 || verifyResp.status === 403 ? 401 : 502).json({
          ok: false,
          code: 'WOOCOMMERCE_VERIFICATION_FAILED',
          error: `Could not verify WooCommerce REST API credentials (HTTP ${verifyResp.status}). Status remains Not Connected.`,
        });
      }
    } catch {
      return res.status(502).json({
        ok: false,
        code: 'WOOCOMMERCE_UNREACHABLE',
        error:
          'Could not reach the WooCommerce store URL to verify credentials. Status remains Not Connected.',
      });
    }

    const nowIso = new Date().toISOString();
    const existing = await loadIntegrationRecord(auth.user.id, 'woocommerce');
    const encrypted = encryptIntegrationSecret(
      JSON.stringify({ consumerKey, consumerSecret, webhookSecret }),
      env
    );

    const saved = await saveIntegrationRecord({
      id: existing?.id || `int-${crypto.randomUUID()}`,
      userId: auth.user.id,
      provider: 'woocommerce',
      status: 'connected',
      displayName: `WooCommerce (${new URL(storeUrl).hostname})`,
      storeDomain: storeUrl,
      apiKeyMasked: maskCredentialHint(consumerKey),
      webhookSecretHash: sha256Hex(webhookSecret),
      encryptedCredentials: encrypted,
      scopes: ['read_orders', 'read_products', 'write_inventory'],
      lastSyncAt: existing?.lastSyncAt,
      lastSyncStatus: existing?.lastSyncStatus ?? 'never',
      lastError: undefined,
      metadata: {
        restApiVersion: 'wc/v3',
      },
      connectedAt: nowIso,
      disconnectedAt: undefined,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    });

    if (saved.ok === false) {
      return res.status(500).json({ ok: false, error: saved.error });
    }

    await recordAuditLog({
      userId: auth.user.id,
      provider: 'woocommerce',
      action: 'woocommerce_connected',
      actorId: auth.staff.employeeId,
      actorName: auth.staff.employeeName,
      actorRole: auth.staff.role,
      details: `Connected & verified WooCommerce store ${storeUrl}`,
      metadata: { storeUrl },
    });

    return res.json({
      ok: true,
      integration: toSummary(saved.record),
    });
  });

  // -------------------------------------------------------------------------
  // 4. CUSTOM WEBSITE API KEY & WEBHOOK SECRET GENERATION (Shown Once)
  // -------------------------------------------------------------------------
  app.post('/api/integrations/custom/credentials', async (req: Request, res: Response) => {
    const auth = await requireAdminIntegrationStaff(req, res);
    if (!auth) return;

    const env = getEnvConfig();
    const body = (req.body || {}) as { storeDomain?: string; displayName?: string };
    const storeDomain = String(body.storeDomain || '').trim().slice(0, 180);
    const displayName = String(body.displayName || 'Custom Website Checkout').trim().slice(0, 120);

    const apiKey = `sb_live_${crypto.randomBytes(16).toString('hex')}`;
    const webhookSecret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
    const nowIso = new Date().toISOString();
    const existing = await loadIntegrationRecord(auth.user.id, 'custom_website');

    const encrypted = encryptIntegrationSecret(JSON.stringify({ webhookSecret }), env);
    const baseUrl = resolveAppBaseUrl(req, env);
    const webhookUrl = `${baseUrl}/api/integrations/custom/webhooks/orders`;

    const saved = await saveIntegrationRecord({
      id: existing?.id || `int-${crypto.randomUUID()}`,
      userId: auth.user.id,
      provider: 'custom_website',
      status: 'connected',
      displayName: displayName || 'Custom Website',
      storeDomain,
      apiKeyMasked: maskCredentialHint(apiKey),
      webhookSecretHash: sha256Hex(apiKey),
      encryptedCredentials: encrypted,
      scopes: ['orders:ingest_completed_checkout'],
      lastSyncAt: existing?.lastSyncAt,
      lastSyncStatus: existing?.lastSyncStatus ?? 'never',
      lastError: undefined,
      metadata: { webhookUrl },
      connectedAt: existing?.connectedAt || nowIso,
      disconnectedAt: undefined,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    });

    if (saved.ok === false) {
      return res.status(500).json({ ok: false, error: saved.error });
    }

    await recordAuditLog({
      userId: auth.user.id,
      provider: 'custom_website',
      action: existing ? 'custom_website_credentials_rotated' : 'custom_website_credentials_created',
      actorId: auth.staff.employeeId,
      actorName: auth.staff.employeeName,
      actorRole: auth.staff.role,
      details: `${existing ? 'Rotated' : 'Generated'} custom website API key (${maskCredentialHint(apiKey)})`,
      metadata: { storeDomain },
    });

    // Return plaintext apiKey & webhookSecret ONCE at creation/rotation time only
    return res.json({
      ok: true,
      integration: toSummary(saved.record),
      apiKey,
      webhookSecret,
      webhookUrl,
    });
  });

  // -------------------------------------------------------------------------
  // 5. DISCONNECT ANY EXTERNAL PROVIDER
  // -------------------------------------------------------------------------
  app.post('/api/integrations/:provider/disconnect', async (req: Request, res: Response) => {
    const auth = await requireAdminIntegrationStaff(req, res);
    if (!auth) return;

    const provider = String(req.params.provider || '').trim() as IntegrationProvider;
    if (!['shopify', 'woocommerce', 'custom_website'].includes(provider)) {
      return res.status(400).json({ ok: false, error: 'Unsupported integration provider.' });
    }

    const existing = await loadIntegrationRecord(auth.user.id, provider);
    const nowIso = new Date().toISOString();

    if (!existing) {
      return res.json({
        ok: true,
        integration: {
          provider,
          status: 'not_connected',
          displayName: provider,
          storeDomain: '',
          apiKeyMasked: '',
          scopes: [],
          lastSyncStatus: 'never',
        },
      });
    }

    const saved = await saveIntegrationRecord({
      ...existing,
      status: 'disconnected',
      apiKeyMasked: '',
      webhookSecretHash: undefined,
      encryptedCredentials: undefined,
      scopes: [],
      disconnectedAt: nowIso,
      updatedAt: nowIso,
    });

    if (saved.ok === false) {
      return res.status(500).json({ ok: false, error: saved.error });
    }

    await recordAuditLog({
      userId: auth.user.id,
      provider,
      action: `${provider}_disconnected`,
      actorId: auth.staff.employeeId,
      actorName: auth.staff.employeeName,
      actorRole: auth.staff.role,
      details: `Disconnected ${provider} integration and wiped stored credentials.`,
    });

    return res.json({ ok: true, integration: toSummary(saved.record) });
  });

  // -------------------------------------------------------------------------
  // 6. PRODUCT, INVENTORY & ORDER SYNC (Shopify GraphQL + WooCommerce REST)
  // -------------------------------------------------------------------------
  app.post('/api/integrations/:provider/sync', async (req: Request, res: Response) => {
    const auth = await requireAdminIntegrationStaff(req, res);
    if (!auth) return;

    const provider = String(req.params.provider || '').trim();
    if (provider !== 'shopify' && provider !== 'woocommerce') {
      return res.status(400).json({
        ok: false,
        error: 'Manual sync is supported only for Shopify and WooCommerce integrations.',
      });
    }

    const existing = await loadIntegrationRecord(auth.user.id, provider);
    if (!existing || existing.status !== 'connected' || !existing.encryptedCredentials) {
      return res.status(400).json({
        ok: false,
        code: 'INTEGRATION_NOT_CONNECTED',
        error: `${provider === 'shopify' ? 'Shopify' : 'WooCommerce'} is not connected yet.`,
      });
    }

    const env = getEnvConfig();
    let creds: Record<string, string>;
    try {
      creds = JSON.parse(decryptIntegrationSecret(existing.encryptedCredentials, env)) as Record<
        string,
        string
      >;
    } catch {
      return res.status(500).json({
        ok: false,
        error: 'Stored integration credentials could not be decrypted.',
      });
    }

    const { products } = await loadTenantProductsAndMappings(auth.user.id, provider);
    const bySku = new Map(
      products
        .filter((p) => p.sku && p.sku.trim())
        .map((p) => [p.sku.trim().toLowerCase(), p])
    );

    const nowIso = new Date().toISOString();
    let mappedCount = 0;
    let importedOrders = 0;
    let skippedOrders = 0;
    const newMappings: StoredExternalProductMapping[] = [];

    if (provider === 'shopify') {
      const prodGql = await executeShopifyGraphql<{
        products?: {
          nodes?: Array<{
            id: string;
            title: string;
            variants?: {
              nodes?: Array<{
                id: string;
                sku?: string;
                inventoryItem?: { id?: string };
              }>;
            };
          }>;
        };
      }>({
        shopDomain: existing.storeDomain,
        accessToken: creds.accessToken,
        apiVersion: creds.apiVersion || env.shopifyApiVersion,
        query: SHOPIFY_GRAPHQL_PRODUCTS_QUERY,
        variables: { first: 50 },
        fetchImpl,
      });

      if (prodGql.ok === false) {
        await saveIntegrationRecord({
          ...existing,
          lastSyncAt: nowIso,
          lastSyncStatus: 'error',
          lastError: prodGql.error,
          updatedAt: nowIso,
        });
        return res.status(502).json({ ok: false, error: prodGql.error });
      }

      for (const sp of prodGql.data.products?.nodes || []) {
        for (const variant of sp.variants?.nodes || []) {
          const sku = String(variant.sku || '').trim();
          const local = sku ? bySku.get(sku.toLowerCase()) : undefined;
          if (local) {
            mappedCount += 1;
            newMappings.push({
              id: `map-${crypto.randomUUID()}`,
              userId: auth.user.id,
              provider: 'shopify',
              productId: local.id,
              externalProductId: sp.id,
              externalVariantId: variant.id,
              externalInventoryItemId: variant.inventoryItem?.id || '',
              externalSku: sku,
              lastSyncedStock: local.stock,
              lastSyncedAt: nowIso,
              createdAt: nowIso,
              updatedAt: nowIso,
            });
          }
        }
      }

      await upsertProductMappings(auth.user.id, 'shopify', newMappings);

      const ordersGql = await executeShopifyGraphql<{
        orders?: {
          nodes?: Array<{
            id: string;
            name?: string;
            displayFinancialStatus?: string;
            cancelledAt?: string | null;
            note?: string | null;
            customer?: { firstName?: string; lastName?: string; phone?: string };
            shippingAddress?: { name?: string; phone?: string; address1?: string; city?: string };
            totalPriceSet?: { shopMoney?: { amount?: string } };
            lineItems?: {
              nodes?: Array<{
                quantity: number;
                sku?: string;
                variant?: { id?: string; product?: { id?: string } };
              }>;
            };
          }>;
        };
      }>({
        shopDomain: existing.storeDomain,
        accessToken: creds.accessToken,
        apiVersion: creds.apiVersion || env.shopifyApiVersion,
        query: SHOPIFY_GRAPHQL_ORDERS_QUERY,
        variables: { first: 25, query: '-status:cancelled' },
        fetchImpl,
      });

      if (ordersGql.ok) {
        for (const so of ordersGql.data.orders?.nodes || []) {
          if (so.cancelledAt) continue;
          const fin = String(so.displayFinancialStatus || '').toUpperCase();
          const isPaid = fin === 'PAID' || fin === 'PARTIALLY_PAID';
          const items: NormalizedExternalLineInput[] = (so.lineItems?.nodes || []).map((li) => ({
            externalProductId: li.variant?.product?.id,
            externalVariantId: li.variant?.id,
            sku: li.sku,
            quantity: Number(li.quantity || 0),
          }));
          const custName =
            so.shippingAddress?.name ||
            [so.customer?.firstName, so.customer?.lastName].filter(Boolean).join(' ') ||
            'Shopify Customer';
          const custPhone = so.shippingAddress?.phone || so.customer?.phone || 'N/A';
          const address =
            [so.shippingAddress?.address1, so.shippingAddress?.city].filter(Boolean).join(', ') ||
            'Shopify Delivery';
          const paidAmount = isPaid ? Number(so.totalPriceSet?.shopMoney?.amount || 0) : 0;

          const imp = await importExternalOrderIntoOmnichannel({
            userId: auth.user.id,
            integrationId: existing.id,
            input: {
              externalSource: 'shopify',
              externalOrderId: so.id,
              externalOrderNumber: so.name,
              idempotencyKey: `shopify:${so.id}`,
              customerName: custName,
              customerPhone: custPhone,
              deliveryAddress: address,
              notes: so.note || undefined,
              paymentMethod: isPaid ? 'online' : 'cod',
              paymentStatus:
                fin === 'PAID' ? 'paid' : fin === 'PARTIALLY_PAID' ? 'partially_paid' : 'cod_pending',
              paidAmount,
              items,
            },
          });
          if (imp.ok && !imp.deduplicated) importedOrders += 1;
          else if (!imp.ok) skippedOrders += 1;
        }
      }
    } else {
      // WooCommerce REST API sync
      const authHeader =
        'Basic ' +
        Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`, 'utf8').toString('base64');

      const [wcProdResp, wcOrdersResp] = await Promise.all([
        fetchImpl(`${existing.storeDomain}/wp-json/wc/v3/products?per_page=50`, {
          headers: { Authorization: authHeader, Accept: 'application/json' },
        }),
        fetchImpl(`${existing.storeDomain}/wp-json/wc/v3/orders?per_page=25`, {
          headers: { Authorization: authHeader, Accept: 'application/json' },
        }),
      ]);

      if (!wcProdResp.ok) {
        return res.status(502).json({
          ok: false,
          error: `WooCommerce products sync failed (HTTP ${wcProdResp.status}).`,
        });
      }

      const wcProducts = (await wcProdResp.json().catch(() => [])) as Array<{
        id: number | string;
        sku?: string;
      }>;
      for (const wp of Array.isArray(wcProducts) ? wcProducts : []) {
        const sku = String(wp.sku || '').trim();
        const local = sku ? bySku.get(sku.toLowerCase()) : undefined;
        if (local) {
          mappedCount += 1;
          newMappings.push({
            id: `map-${crypto.randomUUID()}`,
            userId: auth.user.id,
            provider: 'woocommerce',
            productId: local.id,
            externalProductId: String(wp.id),
            externalVariantId: '',
            externalInventoryItemId: '',
            externalSku: sku,
            lastSyncedStock: local.stock,
            lastSyncedAt: nowIso,
            createdAt: nowIso,
            updatedAt: nowIso,
          });
        }
      }
      await upsertProductMappings(auth.user.id, 'woocommerce', newMappings);

      if (wcOrdersResp.ok) {
        const wcOrders = (await wcOrdersResp.json().catch(() => [])) as Array<{
          id: number | string;
          number?: string;
          status?: string;
          total?: string;
          date_paid?: string | null;
          payment_method?: string;
          billing?: {
            first_name?: string;
            last_name?: string;
            phone?: string;
            address_1?: string;
            city?: string;
          };
          line_items?: Array<{
            product_id?: number | string;
            variation_id?: number | string;
            sku?: string;
            quantity?: number;
          }>;
        }>;
        for (const wo of Array.isArray(wcOrders) ? wcOrders : []) {
          const st = String(wo.status || '').toLowerCase();
          if (isNonOrderCartOrDraftEvent(undefined, st) || st === 'cancelled') continue;
          const isPaid = Boolean(wo.date_paid);
          const isCod = String(wo.payment_method || '').toLowerCase() === 'cod';
          const imp = await importExternalOrderIntoOmnichannel({
            userId: auth.user.id,
            integrationId: existing.id,
            input: {
              externalSource: 'woocommerce',
              externalOrderId: String(wo.id),
              externalOrderNumber: wo.number ? `#${wo.number}` : `#${wo.id}`,
              idempotencyKey: `woocommerce:${wo.id}`,
              customerName:
                [wo.billing?.first_name, wo.billing?.last_name].filter(Boolean).join(' ') ||
                'WooCommerce Customer',
              customerPhone: wo.billing?.phone || 'N/A',
              deliveryAddress:
                [wo.billing?.address_1, wo.billing?.city].filter(Boolean).join(', ') ||
                'WooCommerce Delivery',
              paymentMethod: isCod ? 'cod' : 'online',
              paymentStatus: isPaid ? 'paid' : isCod ? 'cod_pending' : 'unpaid',
              paidAmount: isPaid ? Number(wo.total || 0) : 0,
              items: (wo.line_items || []).map((li) => ({
                externalProductId: li.product_id ? String(li.product_id) : undefined,
                externalVariantId: li.variation_id ? String(li.variation_id) : undefined,
                sku: li.sku,
                quantity: Number(li.quantity || 0),
              })),
            },
          });
          if (imp.ok && !imp.deduplicated) importedOrders += 1;
          else if (!imp.ok) skippedOrders += 1;
        }
      }
    }

    const updated = await saveIntegrationRecord({
      ...existing,
      lastSyncAt: nowIso,
      lastSyncStatus: skippedOrders > 0 ? 'partial' : 'success',
      lastError: undefined,
      updatedAt: nowIso,
    });

    await recordAuditLog({
      userId: auth.user.id,
      provider,
      action: `${provider}_sync_completed`,
      actorId: auth.staff.employeeId,
      actorName: auth.staff.employeeName,
      actorRole: auth.staff.role,
      details: `Synced ${mappedCount} SKU mappings and imported ${importedOrders} new orders (${skippedOrders} skipped).`,
      metadata: { mappedCount, importedOrders, skippedOrders },
    });

    return res.json({
      ok: true,
      integration: updated.ok ? toSummary(updated.record, mappedCount) : toSummary(existing, mappedCount),
      mappedProductsCount: mappedCount,
      importedOrders,
      skippedOrders,
    });
  });

  // -------------------------------------------------------------------------
  // 7. SHOPIFY WEBHOOK RECEIVER (HMAC verified + checkout-only + cancel/update)
  // -------------------------------------------------------------------------
  app.post('/api/integrations/shopify/webhooks', async (req: Request, res: Response) => {
    const env = getEnvConfig();
    const rawBody =
      (req as Request & { rawBody?: Buffer }).rawBody ?? JSON.stringify(req.body ?? {});
    const hmacHeader = req.header('x-shopify-hmac-sha256') || '';
    const topic = String(req.header('x-shopify-topic') || '').trim().toLowerCase();
    const shopDomain = normalizeShopifyShopDomain(req.header('x-shopify-shop-domain') || '');
    const webhookId = req.header('x-shopify-webhook-id') || '';

    if (!env.shopifyApiSecret) {
      return res.status(503).json({ ok: false, error: 'Shopify webhook secret not configured.' });
    }
    if (!verifyShopifyWebhookHmac(rawBody, hmacHeader, env.shopifyApiSecret)) {
      return res.status(401).json({ ok: false, error: 'Invalid Shopify webhook HMAC signature.' });
    }
    if (!shopDomain) {
      return res.status(400).json({ ok: false, error: 'Missing X-Shopify-Shop-Domain header.' });
    }

    // Ignore cart / unsubmitted checkout events (only completed placed orders enter SmartBitz)
    if (isNonOrderCartOrDraftEvent(topic)) {
      return res.status(202).json({
        ok: true,
        ignored: true,
        reason: 'Cart and draft checkout events are ignored; only placed orders are imported.',
      });
    }

    let integration: StoredExternalIntegrationRecord | null = null;
    if (integrationsMemoryStore) {
      integration =
        integrationsMemoryStore.findConnectedIntegrationByDomain('shopify', shopDomain) ?? null;
    } else if (adminSupabase) {
      const q = await adminSupabase
        .from('external_integrations')
        .select('*')
        .eq('provider', 'shopify')
        .eq('status', 'connected')
        .eq('store_domain', shopDomain)
        .maybeSingle();
      if (!q.error && q.data) {
        integration = mapSupabaseIntegrationRow(q.data as Record<string, unknown>);
      }
    }

    if (!integration) {
      return res.status(404).json({ ok: false, error: 'No connected Shopify store for domain.' });
    }

    const rawStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const eventKey = webhookId || `${topic}:${sha256Hex(rawStr).slice(0, 24)}`;
    const claimed = await claimWebhookEventDedup('shopify', eventKey, integration.userId, rawStr);
    if (!claimed) {
      return res.json({ ok: true, deduplicated: true });
    }

    const body = (req.body || {}) as {
      id?: number | string;
      name?: string;
      order_number?: number | string;
      financial_status?: string;
      cancelled_at?: string | null;
      cancel_reason?: string | null;
      note?: string | null;
      total_price?: string | number;
      customer?: { first_name?: string; last_name?: string; phone?: string };
      shipping_address?: {
        name?: string;
        phone?: string;
        address1?: string;
        city?: string;
      };
      line_items?: Array<{
        product_id?: number | string;
        variant_id?: number | string;
        sku?: string;
        quantity?: number;
      }>;
    };

    const externalOrderId = body.id ? String(body.id) : '';
    if (!externalOrderId) {
      return res.status(400).json({ ok: false, error: 'Missing Shopify order ID.' });
    }

    if (topic === 'orders/cancelled' || body.cancelled_at) {
      const cancelRes = await cancelExternalOrderSafely({
        userId: integration.userId,
        externalSource: 'shopify',
        externalOrderId,
        reason: body.cancel_reason || 'Cancelled in Shopify',
      });
      if (cancelRes.ok === false) {
        return res.status(409).json(cancelRes);
      }
      return res.json(cancelRes);
    }

    const fin = String(body.financial_status || '').toLowerCase();
    const isPaid = fin === 'paid' || fin === 'partially_paid';
    const imp = await importExternalOrderIntoOmnichannel({
      userId: integration.userId,
      integrationId: integration.id,
      input: {
        externalSource: 'shopify',
        externalOrderId,
        externalOrderNumber: body.name || (body.order_number ? `#${body.order_number}` : undefined),
        idempotencyKey: `shopify:${externalOrderId}`,
        customerName:
          body.shipping_address?.name ||
          [body.customer?.first_name, body.customer?.last_name].filter(Boolean).join(' ') ||
          'Shopify Customer',
        customerPhone: body.shipping_address?.phone || body.customer?.phone || 'N/A',
        deliveryAddress:
          [body.shipping_address?.address1, body.shipping_address?.city]
            .filter(Boolean)
            .join(', ') || 'Shopify Delivery',
        notes: body.note || undefined,
        paymentMethod: isPaid ? 'online' : 'cod',
        paymentStatus:
          fin === 'paid' ? 'paid' : fin === 'partially_paid' ? 'partially_paid' : 'cod_pending',
        paidAmount: isPaid ? Number(body.total_price || 0) : 0,
        items: (body.line_items || []).map((li) => ({
          externalProductId: li.product_id ? String(li.product_id) : undefined,
          externalVariantId: li.variant_id ? String(li.variant_id) : undefined,
          sku: li.sku,
          quantity: Number(li.quantity || 0),
        })),
      },
    });

    if (imp.ok === false) {
      return res.status(400).json(imp);
    }

    return res.status(imp.deduplicated ? 200 : 201).json(imp);
  });

  // -------------------------------------------------------------------------
  // 8. WOOCOMMERCE WEBHOOK RECEIVER (HMAC verified + checkout-only)
  // -------------------------------------------------------------------------
  app.post('/api/integrations/woocommerce/webhooks', async (req: Request, res: Response) => {
    const rawBody =
      (req as Request & { rawBody?: Buffer }).rawBody ?? JSON.stringify(req.body ?? {});
    const sigHeader = req.header('x-wc-webhook-signature') || '';
    const topic = String(req.header('x-wc-webhook-topic') || '').trim().toLowerCase();
    const deliveryId = req.header('x-wc-webhook-delivery-id') || '';
    const tenantParam = typeof req.query.tenant === 'string' ? req.query.tenant.trim() : '';
    const sourceHeader = String(req.header('x-wc-webhook-source') || '').trim().replace(/\/+$/, '');

    let integration: StoredExternalIntegrationRecord | null = null;
    if (tenantParam) {
      integration = await loadIntegrationRecord(tenantParam, 'woocommerce');
    } else if (sourceHeader) {
      if (integrationsMemoryStore) {
        integration =
          integrationsMemoryStore.findConnectedIntegrationByDomain('woocommerce', sourceHeader) ??
          null;
      } else if (adminSupabase) {
        const q = await adminSupabase
          .from('external_integrations')
          .select('*')
          .eq('provider', 'woocommerce')
          .eq('status', 'connected')
          .eq('store_domain', sourceHeader)
          .maybeSingle();
        if (!q.error && q.data) {
          integration = mapSupabaseIntegrationRow(q.data as Record<string, unknown>);
        }
      }
    }

    if (!integration || integration.status !== 'connected' || !integration.encryptedCredentials) {
      return res.status(404).json({ ok: false, error: 'WooCommerce integration not connected.' });
    }

    const env = getEnvConfig();
    let creds: { webhookSecret?: string; consumerSecret?: string };
    try {
      creds = JSON.parse(decryptIntegrationSecret(integration.encryptedCredentials, env)) as {
        webhookSecret?: string;
        consumerSecret?: string;
      };
    } catch {
      return res.status(500).json({ ok: false, error: 'Could not verify WooCommerce secret.' });
    }

    const secret = creds.webhookSecret || creds.consumerSecret || '';
    if (!verifyWooCommerceWebhookSignature(rawBody, sigHeader, secret)) {
      return res.status(401).json({ ok: false, error: 'Invalid WooCommerce webhook signature.' });
    }

    const body = (req.body || {}) as {
      id?: number | string;
      number?: string;
      status?: string;
      total?: string | number;
      date_paid?: string | null;
      payment_method?: string;
      billing?: {
        first_name?: string;
        last_name?: string;
        phone?: string;
        address_1?: string;
        city?: string;
      };
      line_items?: Array<{
        product_id?: number | string;
        variation_id?: number | string;
        sku?: string;
        quantity?: number;
      }>;
    };

    if (isNonOrderCartOrDraftEvent(topic, body.status)) {
      return res.status(202).json({
        ok: true,
        ignored: true,
        reason: 'Draft or cart events are ignored; only placed WooCommerce orders are imported.',
      });
    }

    const rawStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const eventKey = deliveryId || `${topic}:${sha256Hex(rawStr).slice(0, 24)}`;
    const claimed = await claimWebhookEventDedup('woocommerce', eventKey, integration.userId, rawStr);
    if (!claimed) {
      return res.json({ ok: true, deduplicated: true });
    }

    const externalOrderId = body.id ? String(body.id) : '';
    if (!externalOrderId) {
      return res.status(400).json({ ok: false, error: 'Missing WooCommerce order ID.' });
    }

    const statusLower = String(body.status || '').toLowerCase();
    if (topic === 'order.cancelled' || topic === 'order.deleted' || statusLower === 'cancelled') {
      const cancelRes = await cancelExternalOrderSafely({
        userId: integration.userId,
        externalSource: 'woocommerce',
        externalOrderId,
        reason: 'Cancelled in WooCommerce',
      });
      if (cancelRes.ok === false) {
        return res.status(409).json(cancelRes);
      }
      return res.json(cancelRes);
    }

    const isPaid = Boolean(body.date_paid) || statusLower === 'completed' || statusLower === 'processing';
    const isCod = String(body.payment_method || '').toLowerCase() === 'cod';
    const imp = await importExternalOrderIntoOmnichannel({
      userId: integration.userId,
      integrationId: integration.id,
      input: {
        externalSource: 'woocommerce',
        externalOrderId,
        externalOrderNumber: body.number ? `#${body.number}` : `#${externalOrderId}`,
        idempotencyKey: `woocommerce:${externalOrderId}`,
        customerName:
          [body.billing?.first_name, body.billing?.last_name].filter(Boolean).join(' ') ||
          'WooCommerce Customer',
        customerPhone: body.billing?.phone || 'N/A',
        deliveryAddress:
          [body.billing?.address_1, body.billing?.city].filter(Boolean).join(', ') ||
          'WooCommerce Delivery',
        paymentMethod: isCod ? 'cod' : 'online',
        paymentStatus: isPaid ? 'paid' : isCod ? 'cod_pending' : 'unpaid',
        paidAmount: isPaid ? Number(body.total || 0) : 0,
        items: (body.line_items || []).map((li) => ({
          externalProductId: li.product_id ? String(li.product_id) : undefined,
          externalVariantId: li.variation_id ? String(li.variation_id) : undefined,
          sku: li.sku,
          quantity: Number(li.quantity || 0),
        })),
      },
    });

    if (imp.ok === false) {
      return res.status(400).json(imp);
    }

    return res.status(imp.deduplicated ? 200 : 201).json(imp);
  });

  // -------------------------------------------------------------------------
  // 9. CUSTOM WEBSITE WEBHOOK / ORDER INGEST (Signed HMAC + Checkout-Only)
  // -------------------------------------------------------------------------
  app.post('/api/integrations/custom/webhooks/orders', async (req: Request, res: Response) => {
    const rawBody =
      (req as Request & { rawBody?: Buffer }).rawBody ?? JSON.stringify(req.body ?? {});
    const apiKeyHeader = String(req.header('x-smartbitz-key') || '').trim();
    const signatureHeader = req.header('x-smartbitz-signature') || '';
    const timestampHeader = req.header('x-smartbitz-timestamp') || '';

    if (!apiKeyHeader) {
      return res.status(401).json({ ok: false, error: 'Missing X-SmartBitz-Key header.' });
    }

    const keyHash = sha256Hex(apiKeyHeader);
    let integration: StoredExternalIntegrationRecord | null = null;

    if (integrationsMemoryStore) {
      integration = integrationsMemoryStore.findCustomIntegrationByApiKeyHash(keyHash) ?? null;
    } else if (adminSupabase) {
      const q = await adminSupabase
        .from('external_integrations')
        .select('*')
        .eq('provider', 'custom_website')
        .eq('status', 'connected')
        .eq('webhook_secret_hash', keyHash)
        .maybeSingle();
      if (!q.error && q.data) {
        integration = mapSupabaseIntegrationRow(q.data as Record<string, unknown>);
      }
    }

    if (!integration || !integration.encryptedCredentials) {
      return res.status(401).json({ ok: false, error: 'Invalid or disconnected store API key.' });
    }

    const env = getEnvConfig();
    let webhookSecret = '';
    try {
      const parsed = JSON.parse(decryptIntegrationSecret(integration.encryptedCredentials, env)) as {
        webhookSecret?: string;
      };
      webhookSecret = parsed.webhookSecret || '';
    } catch {
      return res.status(500).json({ ok: false, error: 'Could not decrypt webhook secret.' });
    }

    const sigCheck = verifyCustomWebhookSignature(
      rawBody,
      signatureHeader,
      webhookSecret,
      timestampHeader
    );
    if (!sigCheck.valid) {
      return res.status(401).json({ ok: false, error: sigCheck.reason || 'Invalid signature.' });
    }

    const body = (req.body || {}) as {
      event?: string;
      eventId?: string;
      status?: string;
      externalOrderId?: string;
      orderNumber?: string;
      idempotencyKey?: string;
      reason?: string;
      customer?: { name?: string; phone?: string; deliveryAddress?: string };
      payment?: {
        method?: OmnichannelPaymentMethod;
        status?: OmnichannelPaymentStatus;
        paidAmount?: number;
      };
      notes?: string;
      items?: Array<{ productId?: string; sku?: string; quantity?: number }>;
    };

    if (isNonOrderCartOrDraftEvent(body.event, body.status)) {
      return res.status(202).json({
        ok: true,
        ignored: true,
        reason: 'Only completed checkouts/placed orders are imported; cart/draft events are ignored.',
      });
    }

    const externalOrderId = String(body.externalOrderId || '').trim();
    if (!externalOrderId) {
      return res.status(400).json({ ok: false, error: 'externalOrderId is required.' });
    }

    const rawStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const eventKey =
      String(body.eventId || '').trim() ||
      `${String(body.event || 'order.placed')}:${externalOrderId}:${sha256Hex(rawStr).slice(0, 12)}`;
    const claimed = await claimWebhookEventDedup(
      'custom_website',
      eventKey,
      integration.userId,
      rawStr
    );
    if (!claimed) {
      return res.json({ ok: true, deduplicated: true });
    }

    const evLower = String(body.event || '').trim().toLowerCase();
    const stLower = String(body.status || '').trim().toLowerCase();
    if (evLower === 'order.cancelled' || stLower === 'cancelled') {
      const cancelRes = await cancelExternalOrderSafely({
        userId: integration.userId,
        externalSource: 'custom_website',
        externalOrderId,
        reason: body.reason || 'Cancelled on custom website',
      });
      if (cancelRes.ok === false) {
        return res.status(409).json(cancelRes);
      }
      return res.json(cancelRes);
    }

    const payMethod: OmnichannelPaymentMethod = body.payment?.method || 'cod';
    const payStatus: OmnichannelPaymentStatus =
      body.payment?.status || (payMethod === 'cod' ? 'cod_pending' : 'paid');

    const imp = await importExternalOrderIntoOmnichannel({
      userId: integration.userId,
      integrationId: integration.id,
      input: {
        externalSource: 'custom_website',
        externalOrderId,
        externalOrderNumber: body.orderNumber,
        idempotencyKey: body.idempotencyKey || `custom:${externalOrderId}`,
        customerName: body.customer?.name || 'Website Customer',
        customerPhone: body.customer?.phone || 'N/A',
        deliveryAddress: body.customer?.deliveryAddress || 'Online Delivery',
        notes: body.notes,
        paymentMethod: payMethod,
        paymentStatus: payStatus,
        paidAmount: Number(body.payment?.paidAmount ?? 0),
        items: (body.items || []).map((li) => ({
          productId: li.productId,
          sku: li.sku,
          quantity: Number(li.quantity || 0),
        })),
      },
    });

    if (imp.ok === false) {
      return res.status(400).json(imp);
    }

    await recordAuditLog({
      userId: integration.userId,
      provider: 'custom_website',
      action: imp.deduplicated ? 'custom_order_deduplicated' : 'custom_order_imported',
      actorId: 'custom_website_webhook',
      actorName: 'Custom Website',
      actorRole: 'webhook',
      details: `Processed custom website order ${externalOrderId} (${imp.order.orderNumber})`,
    });

    return res.status(imp.deduplicated ? 200 : 201).json(imp);
  });
}
