import {
  INITIAL_PRODUCTS,
  createDefaultStoreSettings,
  createInitialCustomers,
  createInitialEmployees,
  createInitialExpenses,
  createInitialInventoryAdjustments,
  createInitialOrders,
  createInitialPurchases,
  createInitialUdhaarCustomers,
  createInitialUdhaarEntries,
  createInitialVendors,
} from '../data/initialData';
import type {
  Customer,
  Employee,
  ExpenseRecord,
  InventoryAdjustment,
  OfflineQueuedSale,
  OrderRecord,
  Product,
  PurchaseItem,
  PurchaseRecord,
  ReminderSchedule,
  ShopkeeperUser,
  StaffSessionInfo,
  StoreSettings,
  SubscriptionRecord,
  SyncHistoryEntry,
  UdhaarCustomer,
  UdhaarEntry,
  Vendor,
} from '../types';
import { deterministicDemoUuid, generateUuid } from './idUtils';
import { idbSetItem } from './indexedDbStore';
import {
  DEMO_PIN_HASHES,
  hasConfiguredAdmin,
  hashPinAsync,
  isStoredPinHash,
  isValidPinFormat,
  REDACTED_PIN_SENTINEL,
  stripPlaintextPin,
  verifyPinHashAsync,
} from './pinSecurity';
import type { RoleAction } from './rbac';
import {
  getStaffSessionHeaderToken,
  isSupabaseConfigured,
  setStaffSessionHeaderToken,
  supabase,
} from './supabaseClient';
import { normalizeSellingUnit, roundQuantity } from './unitUtils';

async function getSupabaseAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

function isJsonApiResponse(resp: Response): boolean {
  const contentType = (resp.headers.get('content-type') || '').toLowerCase();
  return contentType.includes('application/json');
}

function isMissingEmployeeColumnError(
  err?: { code?: string; message?: string } | null
): boolean {
  if (!err) return false;
  return (
    err.code === '42703' ||
    /column .* does not exist|Could not find the .* column/i.test(err.message || '')
  );
}

export async function fetchEmployeesWithSchemaFallback(
  client: NonNullable<typeof supabase>,
  userId: string,
  options?: { employeeId?: string; activeOnly?: boolean }
): Promise<{
  data: Array<Record<string, unknown>> | null;
  error: { code?: string; message: string } | null;
  supportsPinHashColumn: boolean;
}> {
  let query = client
    .from('employees')
    .select('id, user_id, name, phone, role, is_active, created_at, pin_hash, pin_code')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (options?.activeOnly) query = query.eq('is_active', true);
  if (options?.employeeId) query = query.eq('id', options.employeeId);

  const primary = await query;
  if (!primary.error) {
    return {
      data: (primary.data ?? []) as Array<Record<string, unknown>>,
      error: null,
      supportsPinHashColumn: true,
    };
  }
  if (!isMissingEmployeeColumnError(primary.error)) {
    return { data: null, error: primary.error, supportsPinHashColumn: true };
  }

  let legacyQuery = client
    .from('employees')
    .select('id, user_id, name, phone, role, is_active, created_at, pin_code')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (options?.activeOnly) legacyQuery = legacyQuery.eq('is_active', true);
  if (options?.employeeId) legacyQuery = legacyQuery.eq('id', options.employeeId);

  const legacy = await legacyQuery;
  return {
    data: (legacy.data ?? null) as Array<Record<string, unknown>> | null,
    error: legacy.error,
    supportsPinHashColumn: false,
  };
}

export async function fetchBootstrapStatusFromServer(): Promise<{
  ok: boolean;
  source?: string;
  rlsReadable?: boolean;
  rlsError?: string | null;
  supportsPinHashColumn?: boolean;
  hasConfiguredAdmin?: boolean;
  employees?: Employee[];
  error?: string;
} | null> {
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken || typeof fetch !== 'function') {
    return null;
  }
  try {
    const resp = await fetch('/api/staff/bootstrap-status', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!resp.ok || !isJsonApiResponse(resp)) {
      return null;
    }
    const body = (await resp.json()) as {
      ok?: boolean;
      source?: string;
      rlsReadable?: boolean;
      rlsError?: string | null;
      supportsPinHashColumn?: boolean;
      hasConfiguredAdmin?: boolean;
      employees?: Array<{
        id: string;
        name: string;
        phone?: string;
        role: Employee['role'];
        hasPin: boolean;
        isActive: boolean;
        createdAt?: string;
      }>;
    };
    if (!body.ok || !Array.isArray(body.employees)) {
      return null;
    }
    return {
      ok: true,
      source: body.source,
      rlsReadable: body.rlsReadable,
      rlsError: body.rlsError ?? null,
      supportsPinHashColumn: body.supportsPinHashColumn,
      hasConfiguredAdmin: body.hasConfiguredAdmin,
      employees: body.employees.map((e) => ({
        id: String(e.id),
        name: String(e.name ?? ''),
        phone: String(e.phone ?? ''),
        role: e.role,
        pinHash: '',
        hasPin: Boolean(e.hasPin),
        isActive: e.isActive !== false,
        createdAt: String(e.createdAt ?? new Date().toISOString()),
      })),
    };
  } catch {
    return null;
  }
}

export async function checkIsSuperAdmin(userId: string): Promise<boolean> {
  if (!userId || !isSupabaseConfigured || !supabase) {
    return false;
  }

  const accessToken = await getSupabaseAccessToken();
  if (accessToken && typeof fetch === 'function') {
    try {
      const resp = await fetch('/api/admin/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (resp.ok && isJsonApiResponse(resp)) {
        const body = (await resp.json()) as { isSuperAdmin?: boolean };
        return Boolean(body.isSuperAdmin);
      }
    } catch {
      // Static build / offline fallback handled via RLS-protected table lookup below
    }
  }

  try {
    const { data, error } = await supabase
      .from('super_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return false;
    return Boolean(data?.user_id);
  } catch {
    return false;
  }
}

export async function authorizeServerAction(
  action: RoleAction,
  customPermissions?: string[]
): Promise<string | null> {
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken || typeof fetch !== 'function') {
    return null;
  }
  const staffToken = getStaffSessionHeaderToken();
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    };
    if (staffToken) {
      headers['x-staff-session'] = staffToken;
    }
    const resp = await fetch('/api/rbac/authorize', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, customPermissions }),
    });
    if (resp.status === 404 || resp.status >= 500 || !isJsonApiResponse(resp)) {
      return null;
    }
    const body = (await resp.json().catch(() => ({}))) as {
      allowed?: boolean;
      error?: string;
    };
    if (!resp.ok || body.allowed === false) {
      return body.error || `Unauthorized to perform action: ${action}`;
    }
    return null;
  } catch {
    return null;
  }
}

export interface ShopkeeperWorkspaceData {
  products: Product[];
  orders: OrderRecord[];
  udhaarCustomers: UdhaarCustomer[];
  udhaarEntries: UdhaarEntry[];
  vendors: Vendor[];
  purchases: PurchaseRecord[];
  inventoryAdjustments: InventoryAdjustment[];
  customers: Customer[];
  employees: Employee[];
  expenses: ExpenseRecord[];
  storeSettings: StoreSettings;
  cloudSyncError?: string | null;
  isOffline?: boolean;
  wasEmployeesBootstrapped?: boolean;
  employeesSource?:
    | 'supabase_direct'
    | 'server_api'
    | 'local_storage_fallback'
    | 'local_mode';
  employeeFallbackReason?: string | null;
  refreshedStaffSession?: {
    token: string;
    employeeId: string;
    role: Employee['role'];
    expiresAt: string;
  } | null;
}

interface StoredLocalAccount {
  id: string;
  email: string;
  password: string;
  shopName: string;
}

const LOCAL_ACCOUNTS_KEY = 'khaas_pos_local_accounts_v1';
const LOCAL_SESSION_KEY = 'khaas_pos_local_session_v1';
const LOCAL_SUBSCRIPTIONS_KEY = 'khaas_pos_subscriptions_v1';
export const OFFLINE_QUEUE_KEY = 'netra_offline_queue';

function userDataKey(userId: string): string {
  return `khaas_pos_workspace_${userId}_v1`;
}

function offlineProductsCacheKey(userId: string): string {
  return `netra_offline_products_${userId}_v1`;
}

export function isNetworkLossError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed') ||
    lower.includes('fetch failed') ||
    lower.includes('err_internet_disconnected') ||
    lower.includes('econnrefused') ||
    lower.includes('timeout') ||
    lower.includes('offline')
  );
}

export function getOfflineQueue(userId?: string): OfflineQueuedSale[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const all = parsed as OfflineQueuedSale[];
    return userId ? all.filter((item) => item.userId === userId) : all;
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue: OfflineQueuedSale[]): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore storage quota errors
  }
  void idbSetItem(OFFLINE_QUEUE_KEY, queue);
}

export function enqueueOfflineSale(item: OfflineQueuedSale): OfflineQueuedSale[] {
  const current = getOfflineQueue();
  const isDuplicate = current.some(
    (q) =>
      q.id === item.id ||
      (item.order.clientTxRef &&
        q.order.clientTxRef &&
        q.order.clientTxRef === item.order.clientTxRef)
  );
  const next = isDuplicate
    ? current
    : [...current, { ...item, localUpdatedAt: item.localUpdatedAt || new Date().toISOString() }];
  saveOfflineQueue(next);
  return next.filter((q) => q.userId === item.userId);
}

function getDemoAccount(): StoredLocalAccount {
  return {
    id: 'demo-shopkeeper-1',
    email: 'demo@khaasretail.pk',
    password: 'password123',
    shopName: 'Khaas Retail Lahore',
  };
}

function loadLocalAccounts(): StoredLocalAccount[] {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as StoredLocalAccount[];
      }
    }
  } catch {
    // ignore corrupted storage
  }
  const seeded = [getDemoAccount()];
  try {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(seeded));
  } catch {
    // ignore
  }
  return seeded;
}

function saveLocalAccounts(accounts: StoredLocalAccount[]): void {
  try {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // ignore
  }
}

function buildStarterProducts(userId: string): Product[] {
  const prefix = userId.slice(0, 8);
  return INITIAL_PRODUCTS.map((p) => ({
    ...p,
    id: `${prefix}-${p.id}`,
  }));
}

export function buildStarterWorkspace(
  userId: string,
  includeDemoOrders: boolean,
  shopName?: string
): ShopkeeperWorkspaceData {
  const products = buildStarterProducts(userId);
  const defaultSettings = createDefaultStoreSettings(shopName || 'Khaas Retail');

  if (!includeDemoOrders) {
    return {
      products,
      orders: [],
      udhaarCustomers: [],
      udhaarEntries: [],
      vendors: [],
      purchases: [],
      inventoryAdjustments: [],
      customers: [],
      employees: [],
      expenses: [],
      storeSettings: defaultSettings,
    };
  }
  const prefix = userId.slice(0, 8);
  return {
    products,
    orders: createInitialOrders().map((o) => ({
      ...o,
      id: `${prefix}-${o.id}`,
      customerId: o.customerId
        ? deterministicDemoUuid(userId, o.customerId)
        : undefined,
      udhaarCustomerId: o.udhaarCustomerId
        ? `${prefix}-${o.udhaarCustomerId}`
        : undefined,
      items: o.items.map((item) => ({
        ...item,
        productId: `${prefix}-${item.productId}`,
      })),
    })),
    udhaarCustomers: createInitialUdhaarCustomers().map((c) => ({
      ...c,
      id: `${prefix}-${c.id}`,
    })),
    udhaarEntries: createInitialUdhaarEntries().map((e) => ({
      ...e,
      id: `${prefix}-${e.id}`,
      customerId: `${prefix}-${e.customerId}`,
    })),
    vendors: createInitialVendors().map((v) => ({
      ...v,
      id: deterministicDemoUuid(userId, v.id),
    })),
    purchases: createInitialPurchases().map((p) => {
      const mappedPurchaseId = deterministicDemoUuid(userId, p.id);
      return {
        ...p,
        id: mappedPurchaseId,
        vendorId: deterministicDemoUuid(userId, p.vendorId),
        items: p.items.map((pi) => ({
          ...pi,
          id: deterministicDemoUuid(userId, pi.id),
          purchaseId: mappedPurchaseId,
          productId: `${prefix}-${pi.productId}`,
        })),
      };
    }),
    inventoryAdjustments: createInitialInventoryAdjustments().map((a) => ({
      ...a,
      id: deterministicDemoUuid(userId, a.id),
      productId: `${prefix}-${a.productId}`,
    })),
    customers: createInitialCustomers().map((c) => ({
      ...c,
      id: deterministicDemoUuid(userId, c.id),
    })),
    employees: createInitialEmployees().map((emp) => ({
      ...emp,
      id: `${prefix}-${emp.id}`,
    })),
    expenses: createInitialExpenses().map((exp) => ({
      ...exp,
      id: deterministicDemoUuid(userId, exp.id),
    })),
    storeSettings: defaultSettings,
  };
}

function normalizeEmployeeRecord(raw: unknown): Employee {
  const r = (raw ?? {}) as Record<string, unknown>;
  const legacyPin = typeof r.pinCode === 'string' ? r.pinCode.trim() : '';
  let pinHash = typeof r.pinHash === 'string' ? r.pinHash : '';
  if (!pinHash && legacyPin && legacyPin in DEMO_PIN_HASHES) {
    pinHash = DEMO_PIN_HASHES[legacyPin as keyof typeof DEMO_PIN_HASHES];
  }
  const hasPin = Boolean(
    r.hasPin ||
      pinHash ||
      (legacyPin && legacyPin !== REDACTED_PIN_SENTINEL)
  );
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    phone: String(r.phone ?? ''),
    role: (r.role as Employee['role']) || 'cashier',
    pinHash,
    hasPin,
    isActive: r.isActive !== false,
    branchId: typeof r.branchId === 'string' && r.branchId ? r.branchId : undefined,
    shiftAssignment:
      typeof r.shiftAssignment === 'string' && r.shiftAssignment
        ? r.shiftAssignment
        : undefined,
    customPermissions: Array.isArray(r.customPermissions)
      ? r.customPermissions.filter((p): p is string => typeof p === 'string')
      : undefined,
    createdAt: String(r.createdAt ?? new Date().toISOString()),
  };
}

async function migrateLegacyLocalPins(userId: string): Promise<void> {
  try {
    const raw = localStorage.getItem(userDataKey(userId));
    if (!raw) return;
    const parsed = JSON.parse(raw) as Omit<
      Partial<ShopkeeperWorkspaceData>,
      'employees'
    > & {
      employees?: Array<Record<string, unknown>>;
    };
    if (!Array.isArray(parsed.employees)) return;
    let changed = false;
    const migrated = await Promise.all(
      parsed.employees.map(async (emp) => {
        const legacyPin = typeof emp.pinCode === 'string' ? emp.pinCode.trim() : '';
        let pinHash = typeof emp.pinHash === 'string' ? emp.pinHash : '';
        if (!pinHash && isValidPinFormat(legacyPin)) {
          pinHash =
            legacyPin in DEMO_PIN_HASHES
              ? DEMO_PIN_HASHES[legacyPin as keyof typeof DEMO_PIN_HASHES]
              : await hashPinAsync(legacyPin);
          changed = true;
        }
        if ('pinCode' in emp || 'pin_code' in emp) {
          changed = true;
        }
        return {
          ...stripPlaintextPin(emp),
          pinHash,
          hasPin: Boolean(emp.hasPin || pinHash),
        };
      })
    );
    if (changed) {
      localStorage.setItem(
        userDataKey(userId),
        JSON.stringify({ ...parsed, employees: migrated })
      );
    }
  } catch {
    // ignore migration errors on corrupted storage
  }
}

function loadLocalWorkspace(userId: string, shopName?: string): ShopkeeperWorkspaceData {
  try {
    const raw = localStorage.getItem(userDataKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ShopkeeperWorkspaceData>;
      const isDemo = userId === 'demo-shopkeeper-1';
      const fallbackEmployees: Employee[] = isDemo
        ? createInitialEmployees().map((emp) => ({
            ...emp,
            id: `${userId.slice(0, 8)}-${emp.id}`,
          }))
        : [];
      const fallbackCustomers = isDemo
        ? createInitialCustomers().map((c) => ({
            ...c,
            id: deterministicDemoUuid(userId, c.id),
          }))
        : [];
      const fallbackExpenses = isDemo
        ? createInitialExpenses().map((exp) => ({
            ...exp,
            id: deterministicDemoUuid(userId, exp.id),
          }))
        : [];
      const normalizedProducts = (parsed.products ?? []).map((p) => ({
        ...p,
        sellingUnit: normalizeSellingUnit(p.sellingUnit),
        stock: roundQuantity(Number(p.stock ?? 0)),
      }));
      const normalizedEmployees = Array.isArray(parsed.employees)
        ? parsed.employees.length > 0
          ? parsed.employees.map((emp) => normalizeEmployeeRecord(emp))
          : fallbackEmployees
        : fallbackEmployees;
      return {
        products: normalizedProducts,
        orders: parsed.orders ?? [],
        udhaarCustomers: parsed.udhaarCustomers ?? [],
        udhaarEntries: parsed.udhaarEntries ?? [],
        vendors: parsed.vendors ?? [],
        purchases: parsed.purchases ?? [],
        inventoryAdjustments: parsed.inventoryAdjustments ?? [],
        customers: parsed.customers ?? fallbackCustomers,
        employees: normalizedEmployees,
        expenses: parsed.expenses ?? fallbackExpenses,
        storeSettings:
          parsed.storeSettings ?? createDefaultStoreSettings(shopName || 'Khaas Retail'),
      };
    }
  } catch {
    // ignore
  }
  const isDemo = userId === 'demo-shopkeeper-1';
  const starter = buildStarterWorkspace(userId, isDemo, shopName);
  saveLocalWorkspace(userId, starter);
  return starter;
}

function saveLocalWorkspace(userId: string, data: ShopkeeperWorkspaceData): void {
  const sanitizedEmployees = (data.employees ?? []).map((emp) => ({
    ...stripPlaintextPin(emp as unknown as Record<string, unknown>),
    pinHash: emp.pinHash ?? '',
    hasPin: Boolean(emp.hasPin || emp.pinHash),
  }));
  const snapshot = {
    ...data,
    employees: sanitizedEmployees,
  };
  try {
    localStorage.setItem(userDataKey(userId), JSON.stringify(snapshot));
    localStorage.setItem(
      offlineProductsCacheKey(userId),
      JSON.stringify(data.products)
    );
  } catch {
    // ignore
  }
  void idbSetItem(userDataKey(userId), snapshot);
}

// ---------- Auth API ----------

export async function getActiveShopkeeper(): Promise<ShopkeeperUser | null> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) return null;

    // Ensure the cached JWT is still valid against Supabase Auth
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      await supabase.auth.signOut().catch(() => undefined);
      return null;
    }

    const u = userData.user;
    return {
      id: u.id,
      email: u.email ?? '',
      shopName: (u.user_metadata?.shop_name as string) || 'Khaas Retail',
    };
  }

  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ShopkeeperUser;
  } catch {
    return null;
  }
}

export async function signInShopkeeper(
  email: string,
  password: string
): Promise<ShopkeeperUser> {
  const normalizedEmail = email.trim().toLowerCase();

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (error || !data.user) {
      throw new Error(error?.message || 'Invalid email or password.');
    }
    return {
      id: data.user.id,
      email: data.user.email ?? normalizedEmail,
      shopName: (data.user.user_metadata?.shop_name as string) || 'Khaas Retail',
    };
  }

  const accounts = loadLocalAccounts();
  const found = accounts.find(
    (a) => a.email.toLowerCase() === normalizedEmail && a.password === password
  );
  if (!found) {
    throw new Error('Invalid email or password.');
  }
  const sessionUser: ShopkeeperUser = {
    id: found.id,
    email: found.email,
    shopName: found.shopName,
  };
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(sessionUser));
  return sessionUser;
}

export async function signUpShopkeeper(
  email: string,
  password: string,
  shopName: string
): Promise<ShopkeeperUser> {
  const normalizedEmail = email.trim().toLowerCase();
  const cleanShop = shopName.trim() || 'My POS Store';

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: { shop_name: cleanShop },
      },
    });
    if (error) {
      throw new Error(error.message);
    }
    if (!data.user) {
      throw new Error('Account creation failed. Please try again.');
    }
    if (!data.session) {
      throw new Error(
        'Check your email to confirm your account before signing in.'
      );
    }
    return {
      id: data.user.id,
      email: data.user.email ?? normalizedEmail,
      shopName: cleanShop,
    };
  }

  const accounts = loadLocalAccounts();
  if (accounts.some((a) => a.email.toLowerCase() === normalizedEmail)) {
    throw new Error('An account with this email already exists.');
  }
  const newAccount: StoredLocalAccount = {
    id: `shop-${Date.now()}`,
    email: normalizedEmail,
    password,
    shopName: cleanShop,
  };
  saveLocalAccounts([...accounts, newAccount]);

  const sessionUser: ShopkeeperUser = {
    id: newAccount.id,
    email: newAccount.email,
    shopName: newAccount.shopName,
  };
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(sessionUser));

  // Initialize starter catalog for the new private shopkeeper account
  saveLocalWorkspace(newAccount.id, buildStarterWorkspace(newAccount.id, false, cleanShop));
  return sessionUser;
}

export async function signOutShopkeeper(): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    await supabase.auth.signOut();
    return;
  }
  try {
    localStorage.removeItem(LOCAL_SESSION_KEY);
  } catch {
    // ignore
  }
}

// ---------- Data Sync API ----------

function mapProductFromRow(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    sku: String(row.sku),
    barcode: String(row.barcode),
    qrCode: typeof row.qr_code === 'string' && row.qr_code ? row.qr_code : undefined,
    nameEn: String(row.name_en),
    nameUr: String(row.name_ur),
    category: row.category as Product['category'],
    brand: typeof row.brand === 'string' && row.brand ? row.brand : undefined,
    variant: typeof row.variant === 'string' && row.variant ? row.variant : undefined,
    price: Number(row.price),
    wholesalePrice:
      row.wholesale_price !== undefined && row.wholesale_price !== null
        ? Number(row.wholesale_price)
        : undefined,
    cost: Number(row.cost_price ?? row.cost ?? 0),
    taxRate: Number(row.tax_rate ?? 0),
    sellingUnit: normalizeSellingUnit(row.selling_unit as string | undefined),
    stock: roundQuantity(Number(row.stock ?? 0)),
    minStock:
      row.min_stock !== undefined && row.min_stock !== null
        ? Number(row.min_stock)
        : undefined,
    reorderLevel:
      row.reorder_level !== undefined && row.reorder_level !== null
        ? Number(row.reorder_level)
        : undefined,
    batchNumber:
      typeof row.batch_number === 'string' && row.batch_number
        ? row.batch_number
        : undefined,
    expiryDate:
      typeof row.expiry_date === 'string' && row.expiry_date
        ? row.expiry_date.slice(0, 10)
        : undefined,
    branchId: typeof row.branch_id === 'string' && row.branch_id ? row.branch_id : undefined,
    branchStock:
      row.branch_stock && typeof row.branch_stock === 'object'
        ? (row.branch_stock as Record<string, number>)
        : undefined,
    image: String(row.image_url ?? row.image ?? ''),
  };
}

function mapProductToRow(
  product: Product,
  userId: string,
  schemaTier: 'extended' | 'selling_unit' | 'core' = 'extended'
) {
  const base = {
    id: product.id,
    user_id: userId,
    sku: product.sku,
    barcode: product.barcode,
    name_en: product.nameEn,
    name_ur: product.nameUr,
    category: product.category,
    price: product.price,
    cost_price: product.cost,
    tax_rate: product.taxRate,
    stock: roundQuantity(product.stock),
    image_url: product.image,
  };
  if (schemaTier === 'core') return base;
  const withUnit = {
    ...base,
    selling_unit: normalizeSellingUnit(product.sellingUnit),
  };
  if (schemaTier === 'selling_unit') return withUnit;
  return {
    ...withUnit,
    qr_code: product.qrCode ?? null,
    brand: product.brand ?? null,
    variant: product.variant ?? null,
    wholesale_price: product.wholesalePrice ?? null,
    min_stock: product.minStock ?? 5,
    reorder_level: product.reorderLevel ?? 10,
    batch_number: product.batchNumber ?? null,
    expiry_date: product.expiryDate || null,
    branch_id: product.branchId ?? null,
    branch_stock: product.branchStock ?? null,
  };
}

async function upsertProductsCompat(
  userId: string,
  products: Product[]
): Promise<{ error: { code?: string; message: string } | null }> {
  if (!supabase || products.length === 0) return { error: null };
  const first = await supabase
    .from('products')
    .upsert(products.map((p) => mapProductToRow(p, userId, 'extended')), { onConflict: 'id' });
  if (!first.error) return { error: null };
  if (isMissingColumnError(first.error.message)) {
    const second = await supabase
      .from('products')
      .upsert(products.map((p) => mapProductToRow(p, userId, 'selling_unit')), { onConflict: 'id' });
    if (!second.error) return { error: null };
    if (isMissingColumnError(second.error.message)) {
      const fallback = await supabase
        .from('products')
        .upsert(products.map((p) => mapProductToRow(p, userId, 'core')), { onConflict: 'id' });
      return { error: fallback.error };
    }
    return { error: second.error };
  }
  return { error: first.error };
}

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        reject(new Error('Invalid image file.'));
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxDim = 480;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(result);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => resolve(result);
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadProductImage(
  userId: string,
  file: File
): Promise<string> {
  if (isSupabaseConfigured && supabase) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const safeName = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);
    const objectPath = `${userId}/${Date.now()}-${safeName || 'product'}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(objectPath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || 'image/jpeg',
      });

    if (uploadError) {
      return compressImageToDataUrl(file);
    }

    const { data } = supabase.storage
      .from('product-images')
      .getPublicUrl(objectPath);

    return data.publicUrl;
  }

  return compressImageToDataUrl(file);
}

function mapOrderFromRow(row: Record<string, unknown>): OrderRecord {
  const rawStatus = String(row.return_status ?? 'completed');
  const returnStatus: OrderRecord['returnStatus'] =
    rawStatus === 'refunded' ||
    rawStatus === 'partially_refunded' ||
    rawStatus === 'exchanged' ||
    rawStatus === 'cancelled'
      ? rawStatus
      : 'completed';

  return {
    id: String(row.id),
    receiptNumber: String(row.receipt_number),
    createdAt: String(row.created_at),
    branchId: typeof row.branch_id === 'string' && row.branch_id ? row.branch_id : undefined,
    branchName:
      typeof row.branch_name === 'string' && row.branch_name ? row.branch_name : undefined,
    cashierId:
      typeof row.cashier_id === 'string' && row.cashier_id ? row.cashier_id : undefined,
    cashierName:
      typeof row.cashier_name === 'string' && row.cashier_name ? row.cashier_name : undefined,
    shiftId: typeof row.shift_id === 'string' && row.shift_id ? row.shift_id : undefined,
    customerId: row.customer_id ? String(row.customer_id) : undefined,
    customerName: String(row.customer_name ?? ''),
    udhaarCustomerId: row.udhaar_customer_id
      ? String(row.udhaar_customer_id)
      : undefined,
    paymentMethod: row.payment_method as OrderRecord['paymentMethod'],
    paymentSplits: Array.isArray(row.payment_splits)
      ? (row.payment_splits as OrderRecord['paymentSplits'])
      : undefined,
    items: (row.items as OrderRecord['items']) ?? [],
    subtotal: Number(row.subtotal),
    discountPercent: Number(row.discount_percent),
    discountMode:
      row.discount_mode === 'fixed' || row.discount_mode === 'percent'
        ? row.discount_mode
        : undefined,
    discountAmount: Number(row.discount_amount),
    taxRate: Number(row.tax_rate),
    taxAmount: Number(row.tax_amount),
    total: Number(row.total),
    paidAmount:
      row.paid_amount !== undefined && row.paid_amount !== null
        ? Number(row.paid_amount)
        : undefined,
    balanceDue:
      row.balance_due !== undefined && row.balance_due !== null
        ? Number(row.balance_due)
        : undefined,
    amountTendered: Number(row.amount_tendered),
    changeDue: Number(row.change_due),
    transactionId: row.transaction_id ? String(row.transaction_id) : undefined,
    clientTxRef:
      typeof row.client_tx_ref === 'string' && row.client_tx_ref
        ? row.client_tx_ref
        : undefined,
    returnStatus,
    refundedAmount: Number(row.refunded_amount ?? 0),
    returnedAt: row.returned_at ? String(row.returned_at) : undefined,
    returnNote: row.return_note ? String(row.return_note) : undefined,
    cancellationReason:
      typeof row.cancellation_reason === 'string' && row.cancellation_reason
        ? row.cancellation_reason
        : undefined,
    cancelledBy:
      typeof row.cancelled_by === 'string' && row.cancelled_by
        ? row.cancelled_by
        : undefined,
    cancelledAt:
      typeof row.cancelled_at === 'string' && row.cancelled_at
        ? row.cancelled_at
        : undefined,
  };
}

function mapOrderToRow(order: OrderRecord, userId: string, includeExtended = true) {
  const base = {
    id: order.id,
    user_id: userId,
    receipt_number: order.receiptNumber,
    created_at: order.createdAt,
    customer_id: order.customerId ?? null,
    customer_name: order.customerName,
    udhaar_customer_id: order.udhaarCustomerId ?? null,
    payment_method: order.paymentMethod,
    items: order.items,
    subtotal: order.subtotal,
    discount_percent: order.discountPercent,
    discount_amount: order.discountAmount,
    tax_rate: order.taxRate,
    tax_amount: order.taxAmount,
    total: order.total,
    amount_tendered: order.amountTendered,
    change_due: order.changeDue,
    transaction_id: order.transactionId ?? '',
    return_status: order.returnStatus ?? 'completed',
    refunded_amount: order.refundedAmount ?? 0,
    returned_at: order.returnedAt ?? null,
    return_note: order.returnNote ?? '',
  };
  if (!includeExtended) return base;
  return {
    ...base,
    branch_id: order.branchId ?? null,
    branch_name: order.branchName ?? null,
    cashier_id: order.cashierId ?? null,
    cashier_name: order.cashierName ?? null,
    shift_id: order.shiftId ?? null,
    payment_splits: order.paymentSplits ?? null,
    discount_mode: order.discountMode ?? 'percent',
    paid_amount: order.paidAmount ?? null,
    balance_due: order.balanceDue ?? null,
    client_tx_ref: order.clientTxRef ?? null,
    cancellation_reason: order.cancellationReason ?? null,
    cancelled_by: order.cancelledBy ?? null,
    cancelled_at: order.cancelledAt ?? null,
  };
}

function mapUdhaarCustomerFromRow(row: Record<string, unknown>): UdhaarCustomer {
  const schedule = (row.reminder_schedule as ReminderSchedule) || 'none';
  return {
    id: String(row.id),
    name: String(row.name),
    phone: String(row.customer_phone || row.phone || ''),
    notes: String(row.notes ?? ''),
    creditLimit:
      row.credit_limit !== undefined && row.credit_limit !== null
        ? Number(row.credit_limit)
        : undefined,
    discountPercent:
      row.discount_percent !== undefined && row.discount_percent !== null
        ? Number(row.discount_percent)
        : undefined,
    reminderSchedule: schedule,
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : undefined,
    whatsappOptIn: row.whatsapp_opt_in !== false,
    createdAt: String(row.created_at),
  };
}

function mapUdhaarCustomerToRow(
  customer: UdhaarCustomer,
  userId: string,
  includeExtended = true
) {
  const base = {
    id: customer.id,
    user_id: userId,
    name: customer.name,
    phone: customer.phone,
    customer_phone: customer.phone,
    notes: customer.notes ?? '',
    reminder_schedule: customer.reminderSchedule ?? 'none',
    due_date: customer.dueDate || null,
    created_at: customer.createdAt,
  };
  if (!includeExtended) return base;
  return {
    ...base,
    credit_limit: customer.creditLimit ?? null,
    discount_percent: customer.discountPercent ?? null,
    whatsapp_opt_in: customer.whatsappOptIn !== false,
  };
}

function mapUdhaarEntryFromRow(row: Record<string, unknown>): UdhaarEntry {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    type: row.type as UdhaarEntry['type'],
    amount: Number(row.amount),
    note: String(row.note ?? ''),
    receiptNumber: row.receipt_number ? String(row.receipt_number) : undefined,
    createdAt: String(row.created_at),
  };
}

function mapVendorFromRow(row: Record<string, unknown>): Vendor {
  return {
    id: String(row.id),
    name: String(row.name),
    company: String(row.company ?? ''),
    phone: String(row.phone ?? ''),
    address: String(row.address ?? ''),
    balance: Number(row.balance ?? 0),
    createdAt: String(row.created_at),
  };
}

function mapVendorToRow(vendor: Vendor, userId: string) {
  return {
    id: vendor.id,
    user_id: userId,
    name: vendor.name,
    company: vendor.company,
    phone: vendor.phone,
    address: vendor.address,
    balance: vendor.balance,
    created_at: vendor.createdAt,
  };
}

export function mapPurchaseItemFromRow(
  row: Record<string, unknown>,
  productsById?: Map<string, Product>
): PurchaseItem {
  const productId = String(row.product_id);
  const prod = productsById?.get(productId);
  const quantity = roundQuantity(Number(row.quantity ?? 0));
  const unitCost = Number(row.unit_cost ?? row.cost_price ?? 0);
  const rawLineTotal = row.line_total;
  const lineTotal =
    rawLineTotal !== undefined && rawLineTotal !== null
      ? Number(rawLineTotal)
      : quantity * unitCost;

  return {
    id: String(row.id),
    purchaseId: String(row.purchase_id),
    productId,
    productName:
      typeof row.product_name === 'string' && row.product_name.trim()
        ? row.product_name
        : prod?.nameEn ?? '',
    sku:
      typeof row.sku === 'string' && row.sku.trim()
        ? row.sku
        : prod?.sku ?? '',
    sellingUnit: normalizeSellingUnit(
      (row.selling_unit as string | undefined) ?? prod?.sellingUnit
    ),
    quantity,
    unitCost,
    lineTotal,
    batchNumber:
      typeof row.batch_number === 'string' && row.batch_number
        ? row.batch_number
        : undefined,
    expiryDate:
      typeof row.expiry_date === 'string' && row.expiry_date
        ? row.expiry_date.slice(0, 10)
        : undefined,
  };
}

export function mapPurchaseFromRow(
  row: Record<string, unknown>,
  itemsByPurchase: Map<string, PurchaseItem[]>,
  vendorsById?: Map<string, Vendor>
): PurchaseRecord {
  const id = String(row.id);
  const vendorId = String(row.vendor_id);
  const vendor = vendorsById?.get(vendorId);
  const resolvedVendorName = vendor
    ? vendor.company
      ? `${vendor.name} (${vendor.company})`
      : vendor.name
    : '';
  const totalAmount = Number(row.total_amount ?? 0);
  const paidAmount = Number(row.paid_amount ?? 0);
  const rawBalanceDue = row.balance_due;
  const balanceDue =
    rawBalanceDue !== undefined && rawBalanceDue !== null
      ? Number(rawBalanceDue)
      : Math.max(0, totalAmount - paidAmount);
  const rawStatus = String(row.status ?? 'received');
  const status: PurchaseRecord['status'] =
    rawStatus === 'ordered' ||
    rawStatus === 'partial' ||
    rawStatus === 'received' ||
    rawStatus === 'returned'
      ? rawStatus
      : 'received';

  return {
    id,
    vendorId,
    vendorName:
      typeof row.vendor_name === 'string' && row.vendor_name.trim()
        ? row.vendor_name
        : resolvedVendorName,
    invoiceNumber: String(row.invoice_number ?? ''),
    status,
    branchId: typeof row.branch_id === 'string' && row.branch_id ? row.branch_id : undefined,
    totalAmount,
    paidAmount,
    balanceDue,
    returnedAmount:
      row.returned_amount !== undefined && row.returned_amount !== null
        ? Number(row.returned_amount)
        : undefined,
    note: String(row.note ?? row.notes ?? ''),
    items: itemsByPurchase.get(id) ?? [],
    createdAt: String(row.created_at),
  };
}

export function mapAdjustmentFromRow(
  row: Record<string, unknown>,
  productsById?: Map<string, Product>
): InventoryAdjustment {
  const productId = String(row.product_id);
  const prod = productsById?.get(productId);
  return {
    id: String(row.id),
    productId,
    productName:
      typeof row.product_name === 'string' && row.product_name.trim()
        ? row.product_name
        : prod?.nameEn ?? '',
    sku:
      typeof row.sku === 'string' && row.sku.trim()
        ? row.sku
        : prod?.sku ?? '',
    sellingUnit: normalizeSellingUnit(
      (row.selling_unit as string | undefined) ?? prod?.sellingUnit
    ),
    branchId: typeof row.branch_id === 'string' && row.branch_id ? row.branch_id : undefined,
    adjustmentType: row.adjustment_type as InventoryAdjustment['adjustmentType'],
    quantityChange: roundQuantity(Number(row.quantity_change ?? 0)),
    previousStock: roundQuantity(Number(row.previous_stock ?? 0)),
    newStock: roundQuantity(Number(row.new_stock ?? 0)),
    reason: String(row.reason ?? ''),
    actorName:
      typeof row.actor_name === 'string' && row.actor_name ? row.actor_name : undefined,
    createdAt: String(row.created_at),
  };
}

function mapCustomerFromRow(row: Record<string, unknown>): Customer {
  return {
    id: String(row.id),
    name: String(row.name),
    phone: String(row.phone ?? ''),
    address: String(row.address ?? ''),
    balance: Number(row.balance ?? 0),
    creditLimit:
      row.credit_limit !== undefined && row.credit_limit !== null
        ? Number(row.credit_limit)
        : undefined,
    discountPercent:
      row.discount_percent !== undefined && row.discount_percent !== null
        ? Number(row.discount_percent)
        : undefined,
    dueDate:
      typeof row.due_date === 'string' && row.due_date
        ? row.due_date.slice(0, 10)
        : undefined,
    reminderSchedule: (row.reminder_schedule as ReminderSchedule) || undefined,
    notes: typeof row.notes === 'string' ? row.notes : undefined,
    whatsappOptIn: row.whatsapp_opt_in !== false,
    whatsappOptInAt:
      typeof row.whatsapp_opt_in_at === 'string' ? row.whatsapp_opt_in_at : undefined,
    createdAt: String(row.created_at),
  };
}

function mapCustomerToRow(
  customer: Customer,
  userId: string,
  includeExtended = true
) {
  const base = {
    id: customer.id,
    user_id: userId,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    balance: Math.max(0, customer.balance),
    created_at: customer.createdAt,
  };
  if (!includeExtended) return base;
  return {
    ...base,
    credit_limit: customer.creditLimit ?? null,
    discount_percent: customer.discountPercent ?? null,
    due_date: customer.dueDate || null,
    reminder_schedule: customer.reminderSchedule ?? 'none',
    notes: customer.notes ?? '',
    whatsapp_opt_in: customer.whatsappOptIn !== false,
    whatsapp_opt_in_at: customer.whatsappOptInAt ?? null,
  };
}

export function mapEmployeeFromRow(row: Record<string, unknown>): Employee {
  const rawPinCode = typeof row.pin_code === 'string' ? row.pin_code.trim() : '';
  const rawPinHash = typeof row.pin_hash === 'string' ? row.pin_hash.trim() : '';
  const rawRole = String(row.role ?? '').trim().toLowerCase();
  const role: Employee['role'] =
    rawRole === 'admin' || rawRole === 'manager' || rawRole === 'cashier'
      ? rawRole
      : 'cashier';
  const hasPin =
    isStoredPinHash(rawPinHash) ||
    isStoredPinHash(rawPinCode) ||
    isValidPinFormat(rawPinCode);
  return {
    id: String(row.id),
    name: String(row.name),
    phone: String(row.phone ?? ''),
    role,
    pinHash: '',
    hasPin,
    isActive: row.is_active !== false,
    branchId: typeof row.branch_id === 'string' && row.branch_id ? row.branch_id : undefined,
    shiftAssignment:
      typeof row.shift_assignment === 'string' && row.shift_assignment
        ? row.shift_assignment
        : undefined,
    customPermissions: Array.isArray(row.custom_permissions)
      ? row.custom_permissions.filter((p): p is string => typeof p === 'string')
      : undefined,
    createdAt: String(row.created_at),
  };
}

function mapEmployeeToRow(employee: Employee, userId: string) {
  return {
    id: employee.id,
    user_id: userId,
    name: employee.name,
    phone: employee.phone,
    role: employee.role,
    pin_code: REDACTED_PIN_SENTINEL,
    is_active: employee.isActive,
    created_at: employee.createdAt,
  };
}

function mapStoreSettingsFromRow(
  row: Record<string, unknown> | null | undefined,
  fallbackShopName?: string
): StoreSettings {
  if (!row) {
    return createDefaultStoreSettings(fallbackShopName || 'Khaas Retail');
  }
  const defaults = createDefaultStoreSettings(fallbackShopName || 'Khaas Retail');
  return {
    ...defaults,
    storeName: String(row.store_name || fallbackShopName || 'Khaas Retail'),
    phone: String(row.phone ?? defaults.phone),
    address: String(row.address ?? defaults.address),
    taxNumber: String(row.tax_number ?? defaults.taxNumber),
    receiptFooter: String(row.receipt_footer ?? defaults.receiptFooter),
    defaultTaxRate:
      row.default_tax_rate !== undefined && row.default_tax_rate !== null
        ? Number(row.default_tax_rate)
        : defaults.defaultTaxRate,
    thermalPaperWidth:
      row.thermal_paper_width === '58mm' || row.thermal_paper_width === '80mm'
        ? row.thermal_paper_width
        : defaults.thermalPaperWidth,
    enabledPaymentMethods: Array.isArray(row.enabled_payment_methods)
      ? (row.enabled_payment_methods as StoreSettings['enabledPaymentMethods'])
      : defaults.enabledPaymentMethods,
    bankName: String(row.bank_name ?? ''),
    bankAccountTitle: String(row.bank_account_title ?? ''),
    bankAccountNumber: String(row.bank_account_number ?? ''),
    jazzcashAccountTitle: String(row.jazzcash_account_title ?? ''),
    jazzcashAccountNumber: String(row.jazzcash_account_number ?? ''),
    easypaisaAccountTitle: String(row.easypaisa_account_title ?? ''),
    easypaisaAccountNumber: String(row.easypaisa_account_number ?? ''),
    autoKickDrawer:
      typeof row.auto_kick_drawer === 'boolean'
        ? row.auto_kick_drawer
        : defaults.autoKickDrawer,
    showCustomerDisplay:
      typeof row.show_customer_display === 'boolean'
        ? row.show_customer_display
        : defaults.showCustomerDisplay,
    whatsappAutoReceipts:
      typeof row.whatsapp_auto_receipts === 'boolean'
        ? row.whatsapp_auto_receipts
        : defaults.whatsappAutoReceipts,
    whatsappTemplateReceipt:
      typeof row.whatsapp_template_receipt === 'string'
        ? row.whatsapp_template_receipt
        : defaults.whatsappTemplateReceipt,
    whatsappTemplateReminder:
      typeof row.whatsapp_template_reminder === 'string'
        ? row.whatsapp_template_reminder
        : defaults.whatsappTemplateReminder,
  };
}

function mapStoreSettingsToRow(
  settings: StoreSettings,
  userId: string,
  tier: 'extended' | 'wallets' | 'core' = 'extended'
) {
  const core = {
    user_id: userId,
    store_name: settings.storeName,
    phone: settings.phone,
    address: settings.address,
    tax_number: settings.taxNumber,
    receipt_footer: settings.receiptFooter,
    updated_at: new Date().toISOString(),
  };
  if (tier === 'core') return core;
  const wallets = {
    ...core,
    jazzcash_account_title: settings.jazzcashAccountTitle ?? '',
    jazzcash_account_number: settings.jazzcashAccountNumber ?? '',
    easypaisa_account_title: settings.easypaisaAccountTitle ?? '',
    easypaisa_account_number: settings.easypaisaAccountNumber ?? '',
  };
  if (tier === 'wallets') return wallets;
  return {
    ...wallets,
    default_tax_rate: settings.defaultTaxRate ?? 0,
    thermal_paper_width: settings.thermalPaperWidth ?? '80mm',
    enabled_payment_methods: settings.enabledPaymentMethods ?? [
      'cash',
      'jazzcash',
      'easypaisa',
      'card',
      'bank_transfer',
      'udhaar',
    ],
    bank_name: settings.bankName ?? '',
    bank_account_title: settings.bankAccountTitle ?? '',
    bank_account_number: settings.bankAccountNumber ?? '',
    auto_kick_drawer: Boolean(settings.autoKickDrawer),
    show_customer_display: settings.showCustomerDisplay !== false,
    whatsapp_auto_receipts: Boolean(settings.whatsappAutoReceipts),
    whatsapp_template_receipt: settings.whatsappTemplateReceipt ?? '',
    whatsapp_template_reminder: settings.whatsappTemplateReminder ?? '',
  };
}

function mapExpenseFromRow(row: Record<string, unknown>): ExpenseRecord {
  const interval = row.recurrence_interval;
  const approval = row.approval_status;
  return {
    id: String(row.id),
    title: String(row.title),
    category: (row.category as ExpenseRecord['category']) || 'Other',
    amount: Number(row.amount ?? 0),
    notes: String(row.notes ?? ''),
    expenseDate: String(row.expense_date ?? '').slice(0, 10),
    branchId: typeof row.branch_id === 'string' && row.branch_id ? row.branch_id : undefined,
    isRecurring: Boolean(row.is_recurring),
    recurrenceInterval:
      interval === 'weekly' || interval === 'monthly' || interval === 'yearly'
        ? interval
        : undefined,
    nextDueDate:
      typeof row.next_due_date === 'string' && row.next_due_date
        ? row.next_due_date.slice(0, 10)
        : undefined,
    approvalStatus:
      approval === 'pending' || approval === 'approved' || approval === 'rejected'
        ? approval
        : undefined,
    approvedBy:
      typeof row.approved_by === 'string' && row.approved_by ? row.approved_by : undefined,
    paidFromDrawer: Boolean(row.paid_from_drawer),
    createdAt: String(row.created_at),
  };
}

function mapExpenseToRow(
  expense: ExpenseRecord,
  userId: string,
  includeExtended = true
) {
  const base = {
    id: expense.id,
    user_id: userId,
    title: expense.title,
    category: expense.category,
    amount: Math.max(0, expense.amount),
    notes: expense.notes,
    expense_date: expense.expenseDate,
    created_at: expense.createdAt,
  };
  if (!includeExtended) return base;
  return {
    ...base,
    branch_id: expense.branchId ?? null,
    is_recurring: Boolean(expense.isRecurring),
    recurrence_interval: expense.recurrenceInterval ?? null,
    next_due_date: expense.nextDueDate || null,
    approval_status: expense.approvalStatus ?? 'approved',
    approved_by: expense.approvedBy ?? null,
    paid_from_drawer: Boolean(expense.paidFromDrawer),
  };
}

function mapSubscriptionFromRow(row: Record<string, unknown>): SubscriptionRecord {
  return {
    userId: String(row.user_id),
    email: String(row.email ?? ''),
    shopName: row.shop_name ? String(row.shop_name) : undefined,
    planName: String(row.plan_name ?? '30-Day Free Trial'),
    expiresAt: String(row.expires_at),
    isBlocked: Boolean(row.is_blocked),
    maxBranches:
      row.max_branches !== undefined && row.max_branches !== null
        ? Number(row.max_branches)
        : 3,
    maxEmployees:
      row.max_employees !== undefined && row.max_employees !== null
        ? Number(row.max_employees)
        : 15,
    paymentHistory: Array.isArray(row.payment_history)
      ? (row.payment_history as SubscriptionRecord['paymentHistory'])
      : [],
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function fetchWorkspaceData(
  userId: string,
  shopName?: string
): Promise<ShopkeeperWorkspaceData> {
  await migrateLegacyLocalPins(userId);
  const browserOffline =
    typeof navigator !== 'undefined' && navigator.onLine === false;

  const mergeEmployeeLocalMeta = (
    cloudEmployees: Employee[],
    localEmployees: Employee[]
  ): Employee[] => {
    const localEmpById = new Map(localEmployees.map((e) => [e.id, e]));
    return cloudEmployees.map((mapped) => {
      const cachedEmp = localEmpById.get(mapped.id);
      return {
        ...mapped,
        branchId: mapped.branchId ?? cachedEmp?.branchId,
        shiftAssignment: mapped.shiftAssignment ?? cachedEmp?.shiftAssignment,
        customPermissions: mapped.customPermissions ?? cachedEmp?.customPermissions,
      };
    });
  };

  const logWorkspaceDiagnostic = (
    ws: ShopkeeperWorkspaceData,
    extra?: Record<string, unknown>
  ) => {
    if (typeof console !== 'undefined' && typeof console.info === 'function') {
      console.info('[SmartBitz Workspace]', {
        userId,
        employeesSource: ws.employeesSource ?? 'unknown',
        employeeFallbackReason: ws.employeeFallbackReason ?? null,
        isOffline: Boolean(ws.isOffline),
        hasConfiguredAdmin: hasConfiguredAdmin(ws.employees),
        employeeCount: ws.employees.length,
        employeesSummary: ws.employees.map((e) => ({
          id: e.id,
          name: e.name,
          role: e.role,
          isActive: e.isActive,
          hasPin: Boolean(e.hasPin),
        })),
        ...extra,
      });
    }
  };

  if (isSupabaseConfigured && supabase && !browserOffline) {
    let resolvedCloudEmployees: Employee[] | null = null;
    let resolvedEmployeesSource:
      | 'supabase_direct'
      | 'server_api'
      | 'local_storage_fallback' = 'local_storage_fallback';
    let employeeFallbackReason: string | null = null;

    try {
      const [
        prodRes,
        ordRes,
        custRes,
        entryRes,
        vendRes,
        purRes,
        purItemsRes,
        adjRes,
        crmCustRes,
        empRes,
        expRes,
        settingsRes,
      ] = await Promise.all([
        supabase
          .from('products')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('orders')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: true }),
        supabase
          .from('udhaar_customers')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('udhaar_entries')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: true }),
        supabase
          .from('vendors')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('purchases')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase.from('purchase_items').select('*').eq('user_id', userId),
        supabase
          .from('inventory_adjustments')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('customers')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        fetchEmployeesWithSchemaFallback(supabase, userId),
        supabase
          .from('expenses')
          .select('*')
          .eq('user_id', userId)
          .order('expense_date', { ascending: false }),
        supabase
          .from('store_settings')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      const localCached = loadLocalWorkspace(userId, shopName);

      if (!empRes.error && empRes.data) {
        resolvedCloudEmployees = mergeEmployeeLocalMeta(
          empRes.data.map((raw) => mapEmployeeFromRow(raw as Record<string, unknown>)),
          localCached.employees
        );
        resolvedEmployeesSource = 'supabase_direct';
      } else {
        employeeFallbackReason = empRes.error?.message || 'Client employees query returned empty';
        const serverBootstrap = await fetchBootstrapStatusFromServer();
        if (serverBootstrap?.ok && serverBootstrap.employees) {
          resolvedCloudEmployees = mergeEmployeeLocalMeta(
            serverBootstrap.employees,
            localCached.employees
          );
          resolvedEmployeesSource = 'server_api';
        }
      }

      const firstError =
        prodRes.error ||
        ordRes.error ||
        custRes.error ||
        entryRes.error ||
        vendRes.error ||
        purRes.error ||
        purItemsRes.error ||
        adjRes.error ||
        crmCustRes.error ||
        empRes.error ||
        expRes.error ||
        settingsRes.error;

      if (firstError) {
        if (!employeeFallbackReason) {
          employeeFallbackReason = `Partial query error: ${firstError.message}`;
        }
        const localFallback: ShopkeeperWorkspaceData = {
          ...localCached,
          employees: resolvedCloudEmployees ?? localCached.employees,
          employeesSource: resolvedCloudEmployees
            ? resolvedEmployeesSource
            : 'local_storage_fallback',
          employeeFallbackReason,
          cloudSyncError: isNetworkLossError(firstError.message)
            ? null
            : firstError.message,
          isOffline: isNetworkLossError(firstError.message),
        };
        logWorkspaceDiagnostic(localFallback, {
          partialErrorTableMessage: firstError.message,
          empQueryHadError: Boolean(empRes.error),
        });
        return localFallback;
      }

      const localProdById = new Map(localCached.products.map((p) => [p.id, p]));

      let products: Product[] = (prodRes.data ?? []).map((raw) => {
        const mapped = mapProductFromRow(raw as Record<string, unknown>);
        const cachedProd = localProdById.get(mapped.id);
        return {
          ...cachedProd,
          ...mapped,
          qrCode: mapped.qrCode ?? cachedProd?.qrCode,
          brand: mapped.brand ?? cachedProd?.brand,
          variant: mapped.variant ?? cachedProd?.variant,
          wholesalePrice: mapped.wholesalePrice ?? cachedProd?.wholesalePrice,
          minStock: mapped.minStock ?? cachedProd?.minStock,
          reorderLevel: mapped.reorderLevel ?? cachedProd?.reorderLevel,
          batchNumber: mapped.batchNumber ?? cachedProd?.batchNumber,
          expiryDate: mapped.expiryDate ?? cachedProd?.expiryDate,
          branchId: mapped.branchId ?? cachedProd?.branchId,
          branchStock: mapped.branchStock ?? cachedProd?.branchStock,
        };
      });
      let orders = (ordRes.data ?? []).map(mapOrderFromRow);
      const udhaarCustomers = (custRes.data ?? []).map(mapUdhaarCustomerFromRow);
      let udhaarEntries = (entryRes.data ?? []).map(mapUdhaarEntryFromRow);
      const vendors = (vendRes.data ?? []).map(mapVendorFromRow);

      const productsById = new Map(products.map((p) => [p.id, p]));
      const vendorsById = new Map(vendors.map((v) => [v.id, v]));

      const itemsByPurchase = new Map<string, PurchaseItem[]>();
      for (const rawItem of purItemsRes.data ?? []) {
        const mapped = mapPurchaseItemFromRow(
          rawItem as Record<string, unknown>,
          productsById
        );
        const list = itemsByPurchase.get(mapped.purchaseId) ?? [];
        list.push(mapped);
        itemsByPurchase.set(mapped.purchaseId, list);
      }
      const purchases = (purRes.data ?? []).map((row) =>
        mapPurchaseFromRow(
          row as Record<string, unknown>,
          itemsByPurchase,
          vendorsById
        )
      );
      const inventoryAdjustments = (adjRes.data ?? []).map((row) =>
        mapAdjustmentFromRow(row as Record<string, unknown>, productsById)
      );
      let customers = (crmCustRes.data ?? []).map(mapCustomerFromRow);
      const employees: Employee[] = resolvedCloudEmployees ?? [];
      const expenses = (expRes.data ?? []).map(mapExpenseFromRow);
      let storeSettings = {
        ...localCached.storeSettings,
        ...mapStoreSettingsFromRow(
          settingsRes.data as Record<string, unknown> | null,
          shopName
        ),
      };

      let seedError: string | null = null;
      const wasEmployeesBootstrapped = false;

      // Seed starter catalog on first login for a brand-new shopkeeper
      if (products.length === 0 && orders.length === 0) {
        const starter = buildStarterProducts(userId);
        const seedRes = await upsertProductsCompat(userId, starter);
        products = starter;
        if (seedRes.error) {
          seedError = seedRes.error.message;
        }
      }

      // Seed default store settings row if missing
      if (!settingsRes.data) {
        const defaultSettings = createDefaultStoreSettings(shopName || 'Khaas Retail');
        const { error: setSeedErr } = await supabase
          .from('store_settings')
          .upsert(mapStoreSettingsToRow(defaultSettings, userId));
        storeSettings = defaultSettings;
        if (setSeedErr && !seedError) {
          seedError = setSeedErr.message;
        }
      }

      // Merge any pending offline queued sales onto fetched cloud state so nothing disappears before sync
      const pendingQueue = getOfflineQueue(userId);
      if (pendingQueue.length > 0) {
        const existingOrderIds = new Set(orders.map((o) => o.id));
        const existingEntryIds = new Set(udhaarEntries.map((e) => e.id));
        for (const qItem of pendingQueue) {
          if (!existingOrderIds.has(qItem.order.id)) {
            orders = [...orders, qItem.order];
            existingOrderIds.add(qItem.order.id);
          }
          if (qItem.updatedProducts.length > 0) {
            const qProdMap = new Map(qItem.updatedProducts.map((p) => [p.id, p]));
            products = products.map((p) => qProdMap.get(p.id) ?? p);
          }
          if (
            qItem.newUdhaarCustomer &&
            !udhaarCustomers.some((c) => c.id === qItem.newUdhaarCustomer!.id)
          ) {
            udhaarCustomers.unshift(qItem.newUdhaarCustomer);
          }
          if (qItem.newUdhaarEntry && !existingEntryIds.has(qItem.newUdhaarEntry.id)) {
            udhaarEntries = [...udhaarEntries, qItem.newUdhaarEntry];
            existingEntryIds.add(qItem.newUdhaarEntry.id);
          }
          if (qItem.updatedCustomer) {
            customers = customers.map((c) =>
              c.id === qItem.updatedCustomer!.id ? qItem.updatedCustomer! : c
            );
          }
        }
      }

      const workspace: ShopkeeperWorkspaceData = {
        products,
        orders,
        udhaarCustomers,
        udhaarEntries,
        vendors,
        purchases,
        inventoryAdjustments,
        customers,
        employees,
        expenses,
        storeSettings,
        cloudSyncError: seedError,
        isOffline: false,
        wasEmployeesBootstrapped,
        employeesSource: resolvedEmployeesSource,
        employeeFallbackReason,
      };
      saveLocalWorkspace(userId, {
        products,
        orders,
        udhaarCustomers,
        udhaarEntries,
        vendors,
        purchases,
        inventoryAdjustments,
        customers,
        employees,
        expenses,
        storeSettings,
      });
      logWorkspaceDiagnostic(workspace, {
        supportsPinHashColumn: empRes.supportsPinHashColumn,
      });
      return workspace;
    } catch (err) {
      const localFallback = loadLocalWorkspace(userId, shopName);
      const errMsg =
        err instanceof Error ? err.message : 'Unable to reach Supabase.';
      const offlineErr = isNetworkLossError(errMsg) || browserOffline;
      if (!resolvedCloudEmployees && !offlineErr) {
        const serverBootstrap = await fetchBootstrapStatusFromServer();
        if (serverBootstrap?.ok && serverBootstrap.employees) {
          resolvedCloudEmployees = mergeEmployeeLocalMeta(
            serverBootstrap.employees,
            localFallback.employees
          );
          resolvedEmployeesSource = 'server_api';
        }
      }
      const wsResult: ShopkeeperWorkspaceData = {
        ...localFallback,
        employees: resolvedCloudEmployees ?? localFallback.employees,
        employeesSource: resolvedCloudEmployees
          ? resolvedEmployeesSource
          : 'local_storage_fallback',
        employeeFallbackReason: errMsg,
        cloudSyncError: offlineErr ? null : errMsg,
        isOffline: offlineErr,
      };
      logWorkspaceDiagnostic(wsResult, { caughtException: true });
      return wsResult;
    }
  }

  const localOnlyWs: ShopkeeperWorkspaceData = {
    ...loadLocalWorkspace(userId, shopName),
    cloudSyncError: null,
    isOffline: browserOffline,
    employeesSource: isSupabaseConfigured ? 'local_storage_fallback' : 'local_mode',
    employeeFallbackReason: isSupabaseConfigured
      ? browserOffline
        ? 'Browser offline'
        : 'Supabase client unavailable'
      : null,
  };
  logWorkspaceDiagnostic(localOnlyWs);
  return localOnlyWs;
}

export async function upsertProductRecord(
  userId: string,
  product: Product
): Promise<string | null> {
  const ws = loadLocalWorkspace(userId);
  const exists = ws.products.some((p) => p.id === product.id);
  ws.products = exists
    ? ws.products.map((p) => (p.id === product.id ? product : p))
    : [product, ...ws.products];
  saveLocalWorkspace(userId, ws);

  if (isSupabaseConfigured && supabase) {
    const authErr = await authorizeServerAction('inventory.write');
    if (authErr) return authErr;
    const res = await upsertProductsCompat(userId, [product]);
    if (res.error) return res.error.message;
  }
  return null;
}

export async function deleteProductRecord(
  userId: string,
  productId: string
): Promise<string | null> {
  const ws = loadLocalWorkspace(userId);
  ws.products = ws.products.filter((p) => p.id !== productId);
  saveLocalWorkspace(userId, ws);

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)
      .eq('user_id', userId);
    if (error) return error.message;
  }
  return null;
}

async function pushOrderBundleToSupabase(
  userId: string,
  order: OrderRecord,
  updatedProducts: Product[],
  newUdhaarEntry?: UdhaarEntry,
  updatedCustomer?: Customer,
  newUdhaarCustomer?: UdhaarCustomer
): Promise<{ error: string | null; networkFailure: boolean }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: null, networkFailure: false };
  }

  try {
    const { error: ordErr } = await supabase
      .from('orders')
      .upsert(mapOrderToRow(order, userId, true), { onConflict: 'id' });
    if (ordErr) {
      if (isMissingColumnError(ordErr.message)) {
        const { error: legacyOrdErr } = await supabase
          .from('orders')
          .upsert(mapOrderToRow(order, userId, false), { onConflict: 'id' });
        if (legacyOrdErr) {
          if (
            /transaction_id|return_status|refunded_amount|returned_at|return_note/i.test(
              legacyOrdErr.message
            )
          ) {
            const { error: coreOrdErr } = await supabase.from('orders').upsert(
              {
                id: order.id,
                user_id: userId,
                receipt_number: order.receiptNumber,
                created_at: order.createdAt,
                customer_id: order.customerId ?? null,
                customer_name: order.customerName,
                udhaar_customer_id: order.udhaarCustomerId ?? null,
                payment_method: order.paymentMethod,
                items: order.items,
                subtotal: order.subtotal,
                discount_percent: order.discountPercent,
                discount_amount: order.discountAmount,
                tax_rate: order.taxRate,
                tax_amount: order.taxAmount,
                total: order.total,
                amount_tendered: order.amountTendered,
                change_due: order.changeDue,
              },
              { onConflict: 'id' }
            );
            if (coreOrdErr) {
              return {
                error: coreOrdErr.message,
                networkFailure: isNetworkLossError(coreOrdErr.message),
              };
            }
          } else {
            return {
              error: legacyOrdErr.message,
              networkFailure: isNetworkLossError(legacyOrdErr.message),
            };
          }
        }
      } else {
        return {
          error: ordErr.message,
          networkFailure: isNetworkLossError(ordErr.message),
        };
      }
    }

    const stockDeltas = Array.from(
      order.items.reduce((acc, item) => {
        const delta = roundQuantity((acc.get(item.productId) ?? 0) - item.quantity);
        acc.set(item.productId, delta);
        return acc;
      }, new Map<string, number>()).entries()
    ).map(([product_id, delta]) => ({ product_id, delta }));

    if (stockDeltas.length > 0) {
      const { error: deltaErr } = await supabase.rpc('apply_order_stock_delta', {
        p_deltas: stockDeltas,
      });
      if (deltaErr) {
        if (/PGRST202|Could not find the function/i.test(deltaErr.message)) {
          const soldIds = new Set(order.items.map((i) => i.productId));
          const productsToUpdate = updatedProducts.filter((p) => soldIds.has(p.id));
          if (productsToUpdate.length > 0) {
            const stockRes = await upsertProductsCompat(userId, productsToUpdate);
            if (stockRes.error) {
              return {
                error: stockRes.error.message,
                networkFailure: isNetworkLossError(stockRes.error.message),
              };
            }
          }
        } else {
          return {
            error: deltaErr.message,
            networkFailure: isNetworkLossError(deltaErr.message),
          };
        }
      }
    }

    if (newUdhaarCustomer) {
      const { error: khataCustErr } = await supabase
        .from('udhaar_customers')
        .upsert(mapUdhaarCustomerToRow(newUdhaarCustomer, userId), {
          onConflict: 'id',
        });
      if (khataCustErr) {
        return {
          error: khataCustErr.message,
          networkFailure: isNetworkLossError(khataCustErr.message),
        };
      }
    }

    if (newUdhaarEntry) {
      const { error: ueErr } = await supabase.from('udhaar_entries').upsert(
        {
          id: newUdhaarEntry.id,
          user_id: userId,
          customer_id: newUdhaarEntry.customerId,
          type: newUdhaarEntry.type,
          amount: newUdhaarEntry.amount,
          note: newUdhaarEntry.note,
          receipt_number: newUdhaarEntry.receiptNumber ?? null,
          created_at: newUdhaarEntry.createdAt,
        },
        { onConflict: 'id' }
      );
      if (ueErr) {
        return {
          error: ueErr.message,
          networkFailure: isNetworkLossError(ueErr.message),
        };
      }
    }

    if (updatedCustomer) {
      const { error: custErr } = await supabase
        .from('customers')
        .upsert(mapCustomerToRow(updatedCustomer, userId));
      if (custErr) {
        return {
          error: custErr.message,
          networkFailure: isNetworkLossError(custErr.message),
        };
      }
    }

    return { error: null, networkFailure: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return { error: msg, networkFailure: true };
  }
}

export async function insertOrderRecord(
  userId: string,
  order: OrderRecord,
  updatedProducts: Product[],
  newUdhaarEntry?: UdhaarEntry,
  updatedCustomer?: Customer,
  newUdhaarCustomer?: UdhaarCustomer
): Promise<{ syncError: string | null; queuedOffline: boolean }> {
  const ws = loadLocalWorkspace(userId);
  ws.orders = [...ws.orders, order];
  ws.products = updatedProducts;
  if (newUdhaarCustomer) {
    const khataExists = ws.udhaarCustomers.some(
      (c) => c.id === newUdhaarCustomer.id
    );
    ws.udhaarCustomers = khataExists
      ? ws.udhaarCustomers.map((c) =>
          c.id === newUdhaarCustomer.id ? newUdhaarCustomer : c
        )
      : [newUdhaarCustomer, ...ws.udhaarCustomers];
  }
  if (newUdhaarEntry) {
    ws.udhaarEntries = [...ws.udhaarEntries, newUdhaarEntry];
  }
  if (updatedCustomer) {
    const custExists = ws.customers.some((c) => c.id === updatedCustomer.id);
    ws.customers = custExists
      ? ws.customers.map((c) =>
          c.id === updatedCustomer.id ? updatedCustomer : c
        )
      : [updatedCustomer, ...ws.customers];
  }
  saveLocalWorkspace(userId, ws);

  const browserOffline =
    typeof navigator !== 'undefined' && navigator.onLine === false;

  if (browserOffline) {
    enqueueOfflineSale({
      id: order.id,
      userId,
      createdAt: order.createdAt,
      order,
      updatedProducts,
      newUdhaarCustomer,
      newUdhaarEntry,
      updatedCustomer,
    });
    return { syncError: null, queuedOffline: true };
  }

  if (isSupabaseConfigured && supabase) {
    const res = await pushOrderBundleToSupabase(
      userId,
      order,
      updatedProducts,
      newUdhaarEntry,
      updatedCustomer,
      newUdhaarCustomer
    );
    if (res.networkFailure) {
      enqueueOfflineSale({
        id: order.id,
        userId,
        createdAt: order.createdAt,
        order,
        updatedProducts,
        newUdhaarCustomer,
        newUdhaarEntry,
        updatedCustomer,
      });
      return { syncError: null, queuedOffline: true };
    }
    if (res.error) {
      return { syncError: res.error, queuedOffline: false };
    }
  }

  return { syncError: null, queuedOffline: false };
}

export async function updateOrderReturnRecord(
  userId: string,
  updatedOrder: OrderRecord,
  restockedProducts: Product[],
  restockDeltas?: { productId: string; delta: number }[]
): Promise<string | null> {
  const ws = loadLocalWorkspace(userId);
  ws.orders = ws.orders.map((o) =>
    o.id === updatedOrder.id ? updatedOrder : o
  );
  if (restockedProducts.length > 0) {
    const restockMap = new Map(restockedProducts.map((p) => [p.id, p]));
    ws.products = ws.products.map((p) => restockMap.get(p.id) ?? p);
  }
  saveLocalWorkspace(userId, ws);

  if (isSupabaseConfigured && supabase) {
    const deltasPayload = (restockDeltas ?? [])
      .filter((d) => d.delta !== 0)
      .map((d) => ({ product_id: d.productId, delta: roundQuantity(d.delta) }));

    if (deltasPayload.length > 0) {
      const { error: deltaErr } = await supabase.rpc('apply_order_stock_delta', {
        p_deltas: deltasPayload,
      });
      if (deltaErr) {
        if (/PGRST202|Could not find the function/i.test(deltaErr.message)) {
          if (restockedProducts.length > 0) {
            const prodRes = await upsertProductsCompat(userId, restockedProducts);
            if (prodRes.error) return prodRes.error.message;
          }
        } else {
          return deltaErr.message;
        }
      }
    } else if (restockedProducts.length > 0) {
      const prodRes = await upsertProductsCompat(userId, restockedProducts);
      if (prodRes.error) return prodRes.error.message;
    }

    const { error: ordErr } = await supabase
      .from('orders')
      .upsert(mapOrderToRow(updatedOrder, userId, true), { onConflict: 'id' });

    if (ordErr) {
      if (isMissingColumnError(ordErr.message)) {
        const { error: legacyErr } = await supabase
          .from('orders')
          .upsert(mapOrderToRow(updatedOrder, userId, false), { onConflict: 'id' });
        if (!legacyErr) return null;
        if (/return_status|refunded_amount|returned_at|return_note/i.test(legacyErr.message)) {
          const { error: fallbackErr } = await supabase
            .from('orders')
            .update({
              items: updatedOrder.items,
              subtotal: updatedOrder.subtotal,
              discount_amount: updatedOrder.discountAmount,
              tax_amount: updatedOrder.taxAmount,
              total: updatedOrder.total,
            })
            .eq('id', updatedOrder.id)
            .eq('user_id', userId);
          if (fallbackErr) return fallbackErr.message;
          return legacyErr.message;
        }
        return legacyErr.message;
      }
      return ordErr.message;
    }
  }

  return null;
}

export async function syncOfflineQueue(userId: string): Promise<{
  syncedCount: number;
  remainingCount: number;
  syncError: string | null;
  offlineStill: boolean;
  events: SyncHistoryEntry[];
}> {
  const allQueue = getOfflineQueue();
  const userQueue = allQueue
    .filter((item) => item.userId === userId)
    .sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  const events: SyncHistoryEntry[] = [];

  if (userQueue.length === 0) {
    return {
      syncedCount: 0,
      remainingCount: 0,
      syncError: null,
      offlineStill: false,
      events,
    };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      syncedCount: 0,
      remainingCount: userQueue.length,
      syncError: null,
      offlineStill: true,
      events,
    };
  }

  if (!isSupabaseConfigured || !supabase) {
    const otherUsers = allQueue.filter((item) => item.userId !== userId);
    saveOfflineQueue(otherUsers);
    events.push({
      id: generateUuid(),
      actionType: 'sale_sync',
      summary: `Synced ${userQueue.length} offline order(s) to IndexedDB/local ledger`,
      status: 'synced',
      detail: 'Local/offline-first workspace committed cleanly.',
      createdAt: new Date().toISOString(),
    });
    return {
      syncedCount: userQueue.length,
      remainingCount: 0,
      syncError: null,
      offlineStill: false,
      events,
    };
  }

  const syncedIds = new Set<string>();
  let lastError: string | null = null;
  let offlineStill = false;

  for (const item of userQueue) {
    // Duplicate transaction check: if order ID already exists in cloud, skip stock delta to prevent double deduction
    const { data: existingCloudOrder, error: checkErr } = await supabase
      .from('orders')
      .select('id, created_at')
      .eq('id', item.order.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (checkErr && isNetworkLossError(checkErr.message)) {
      offlineStill = true;
      break;
    }

    if (existingCloudOrder?.id) {
      syncedIds.add(item.id);
      events.push({
        id: generateUuid(),
        actionType: 'conflict_detected',
        summary: `Skipped duplicate order ${item.order.receiptNumber}`,
        status: 'conflict',
        detail: 'Order already exists in cloud; preserved newer cloud record without double stock deduction.',
        createdAt: new Date().toISOString(),
      });
      continue;
    }

    const res = await pushOrderBundleToSupabase(
      userId,
      item.order,
      item.updatedProducts,
      item.newUdhaarEntry,
      item.updatedCustomer,
      item.newUdhaarCustomer
    );

    if (res.networkFailure) {
      offlineStill = true;
      break;
    }
    if (res.error) {
      lastError = res.error;
      events.push({
        id: generateUuid(),
        actionType: 'sync_error',
        summary: `Failed to sync ${item.order.receiptNumber}`,
        status: 'failed',
        detail: res.error,
        createdAt: new Date().toISOString(),
      });
      break;
    }

    syncedIds.add(item.id);
    events.push({
      id: generateUuid(),
      actionType: 'sale_sync',
      summary: `Synced ${item.order.receiptNumber}`,
      status: 'synced',
      detail: `Order total Rs. ${Math.round(item.order.total)} persisted to cloud.`,
      createdAt: new Date().toISOString(),
    });
  }

  if (syncedIds.size > 0) {
    const updatedQueue = allQueue.filter((item) => !syncedIds.has(item.id));
    saveOfflineQueue(updatedQueue);
  }

  const remainingForUser = userQueue.length - syncedIds.size;
  return {
    syncedCount: syncedIds.size,
    remainingCount: remainingForUser,
    syncError: lastError,
    offlineStill,
    events,
  };
}

export async function insertUdhaarCustomerRecord(
  userId: string,
  customer: UdhaarCustomer,
  openingEntry?: UdhaarEntry
): Promise<string | null> {
  const ws = loadLocalWorkspace(userId);
  ws.udhaarCustomers = [customer, ...ws.udhaarCustomers];
  if (openingEntry) {
    ws.udhaarEntries = [...ws.udhaarEntries, openingEntry];
  }
  saveLocalWorkspace(userId, ws);

  if (isSupabaseConfigured && supabase) {
    const firstCustErr = await supabase
      .from('udhaar_customers')
      .upsert(mapUdhaarCustomerToRow(customer, userId, true));
    if (firstCustErr.error) {
      if (isMissingColumnError(firstCustErr.error.message)) {
        const fallbackErr = await supabase
          .from('udhaar_customers')
          .upsert(mapUdhaarCustomerToRow(customer, userId, false));
        if (fallbackErr.error) return fallbackErr.error.message;
      } else {
        return firstCustErr.error.message;
      }
    }

    if (openingEntry) {
      const { error: ueErr } = await supabase.from('udhaar_entries').insert({
        id: openingEntry.id,
        user_id: userId,
        customer_id: openingEntry.customerId,
        type: openingEntry.type,
        amount: openingEntry.amount,
        note: openingEntry.note,
        receipt_number: openingEntry.receiptNumber ?? null,
        created_at: openingEntry.createdAt,
      });
      if (ueErr) return ueErr.message;
    }
  }
  return null;
}

export async function updateUdhaarCustomerRecord(
  userId: string,
  customer: UdhaarCustomer
): Promise<string | null> {
  const ws = loadLocalWorkspace(userId);
  ws.udhaarCustomers = ws.udhaarCustomers.map((c) =>
    c.id === customer.id ? customer : c
  );
  saveLocalWorkspace(userId, ws);

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('udhaar_customers')
      .upsert(mapUdhaarCustomerToRow(customer, userId, true));
    if (error) {
      if (isMissingColumnError(error.message)) {
        const fallback = await supabase
          .from('udhaar_customers')
          .upsert(mapUdhaarCustomerToRow(customer, userId, false));
        if (fallback.error) return fallback.error.message;
        return null;
      }
      return error.message;
    }
  }
  return null;
}

export async function insertUdhaarEntryRecord(
  userId: string,
  entry: UdhaarEntry
): Promise<string | null> {
  const ws = loadLocalWorkspace(userId);
  ws.udhaarEntries = [...ws.udhaarEntries, entry];
  saveLocalWorkspace(userId, ws);

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('udhaar_entries').insert({
      id: entry.id,
      user_id: userId,
      customer_id: entry.customerId,
      type: entry.type,
      amount: entry.amount,
      note: entry.note,
      receipt_number: entry.receiptNumber ?? null,
      created_at: entry.createdAt,
    });
    if (error) return error.message;
  }
  return null;
}

// Phase 2: Vendors, Purchases & Inventory Adjustments Persistence

export async function upsertVendorRecord(
  userId: string,
  vendor: Vendor
): Promise<string | null> {
  const ws = loadLocalWorkspace(userId);
  const exists = ws.vendors.some((v) => v.id === vendor.id);
  ws.vendors = exists
    ? ws.vendors.map((v) => (v.id === vendor.id ? vendor : v))
    : [vendor, ...ws.vendors];
  saveLocalWorkspace(userId, ws);

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('vendors')
      .upsert(mapVendorToRow(vendor, userId));
    if (error) return error.message;
  }
  return null;
}

let useCorePurchasesSchema = false;
let useCorePurchaseItemsSchema = false;
let useCoreAdjustmentsSchema = false;
let useCoreUdhaarCustomersSchema = false;

function isMissingColumnError(message: string): boolean {
  return /Could not find the|column .* does not exist|PGRST204/i.test(message);
}

async function insertPurchasesCompat(
  userId: string,
  purchases: PurchaseRecord[]
): Promise<{ error: { code?: string; message: string } | null }> {
  if (!supabase || purchases.length === 0) return { error: null };

  const buildCoreRows = () =>
    purchases.map((p) => ({
      id: p.id,
      user_id: userId,
      vendor_id: p.vendorId,
      invoice_number: p.invoiceNumber,
      total_amount: p.totalAmount,
      paid_amount: p.paidAmount,
      status: 'received',
      notes: p.note,
      created_at: p.createdAt,
    }));

  if (useCorePurchasesSchema) {
    const res = await supabase.from('purchases').insert(buildCoreRows());
    return { error: res.error };
  }

  const extendedRows = purchases.map((p) => ({
    id: p.id,
    user_id: userId,
    vendor_id: p.vendorId,
    vendor_name: p.vendorName,
    invoice_number: p.invoiceNumber,
    total_amount: p.totalAmount,
    paid_amount: p.paidAmount,
    balance_due: p.balanceDue,
    note: p.note,
    notes: p.note,
    status: p.status ?? 'received',
    branch_id: p.branchId ?? null,
    returned_amount: p.returnedAmount ?? 0,
    created_at: p.createdAt,
  }));

  const first = await supabase.from('purchases').insert(extendedRows);
  if (!first.error) return { error: null };

  if (isMissingColumnError(first.error.message)) {
    useCorePurchasesSchema = true;
    const fallback = await supabase.from('purchases').insert(buildCoreRows());
    return { error: fallback.error };
  }

  return { error: first.error };
}

async function insertPurchaseItemsCompat(
  userId: string,
  items: PurchaseItem[]
): Promise<{ error: { code?: string; message: string } | null }> {
  if (!supabase || items.length === 0) return { error: null };

  const buildCoreRows = () =>
    items.map((item) => ({
      id: item.id,
      user_id: userId,
      purchase_id: item.purchaseId,
      product_id: item.productId,
      quantity: item.quantity,
      cost_price: item.unitCost,
    }));

  if (useCorePurchaseItemsSchema) {
    const res = await supabase.from('purchase_items').insert(buildCoreRows());
    return { error: res.error };
  }

  const extendedRows = items.map((item) => ({
    id: item.id,
    user_id: userId,
    purchase_id: item.purchaseId,
    product_id: item.productId,
    product_name: item.productName,
    sku: item.sku,
    selling_unit: normalizeSellingUnit(item.sellingUnit),
    quantity: roundQuantity(item.quantity),
    unit_cost: item.unitCost,
    cost_price: item.unitCost,
    line_total: item.lineTotal,
    batch_number: item.batchNumber ?? null,
    expiry_date: item.expiryDate || null,
  }));

  const first = await supabase.from('purchase_items').insert(extendedRows);
  if (!first.error) return { error: null };

  if (isMissingColumnError(first.error.message)) {
    useCorePurchaseItemsSchema = true;
    const fallback = await supabase.from('purchase_items').insert(buildCoreRows());
    return { error: fallback.error };
  }

  return { error: first.error };
}

async function insertAdjustmentsCompat(
  userId: string,
  adjustments: InventoryAdjustment[]
): Promise<{ error: { code?: string; message: string } | null }> {
  if (!supabase || adjustments.length === 0) return { error: null };

  const buildCoreRows = () =>
    adjustments.map((a) => ({
      id: a.id,
      user_id: userId,
      product_id: a.productId,
      adjustment_type: a.adjustmentType,
      quantity_change: roundQuantity(a.quantityChange),
      reason: a.reason,
      created_at: a.createdAt,
    }));

  if (useCoreAdjustmentsSchema) {
    const res = await supabase
      .from('inventory_adjustments')
      .insert(buildCoreRows());
    return { error: res.error };
  }

  const extendedRows = adjustments.map((a) => ({
    id: a.id,
    user_id: userId,
    product_id: a.productId,
    product_name: a.productName,
    sku: a.sku,
    selling_unit: normalizeSellingUnit(a.sellingUnit),
    branch_id: a.branchId ?? null,
    adjustment_type: a.adjustmentType,
    quantity_change: roundQuantity(a.quantityChange),
    previous_stock: roundQuantity(a.previousStock),
    new_stock: roundQuantity(a.newStock),
    reason: a.reason,
    actor_name: a.actorName ?? null,
    created_at: a.createdAt,
  }));

  const first = await supabase.from('inventory_adjustments').insert(extendedRows);
  if (!first.error) return { error: null };

  if (isMissingColumnError(first.error.message)) {
    useCoreAdjustmentsSchema = true;
    const fallback = await supabase
      .from('inventory_adjustments')
      .insert(buildCoreRows());
    return { error: fallback.error };
  }

  return { error: first.error };
}

async function insertUdhaarCustomersCompat(
  userId: string,
  customers: UdhaarCustomer[]
): Promise<{ error: { code?: string; message: string } | null }> {
  if (!supabase || customers.length === 0) return { error: null };

  const buildCoreRows = () =>
    customers.map((c) => ({
      id: c.id,
      user_id: userId,
      name: c.name,
      phone: c.phone,
      notes: c.notes ?? '',
      created_at: c.createdAt,
    }));

  if (useCoreUdhaarCustomersSchema) {
    const res = await supabase.from('udhaar_customers').insert(buildCoreRows());
    return { error: res.error };
  }

  const first = await supabase
    .from('udhaar_customers')
    .insert(customers.map((c) => mapUdhaarCustomerToRow(c, userId)));
  if (!first.error) return { error: null };

  if (isMissingColumnError(first.error.message)) {
    useCoreUdhaarCustomersSchema = true;
    const fallback = await supabase
      .from('udhaar_customers')
      .insert(buildCoreRows());
    return { error: fallback.error };
  }

  return { error: first.error };
}

export async function insertPurchaseRecord(
  userId: string,
  purchase: PurchaseRecord,
  updatedProducts: Product[],
  updatedVendor: Vendor
): Promise<string | null> {
  const ws = loadLocalWorkspace(userId);
  ws.purchases = [purchase, ...ws.purchases];
  ws.products = updatedProducts;
  ws.vendors = ws.vendors.map((v) =>
    v.id === updatedVendor.id ? updatedVendor : v
  );
  saveLocalWorkspace(userId, ws);

  if (isSupabaseConfigured && supabase) {
    let purRes = await insertPurchasesCompat(userId, [purchase]);
    if (
      purRes.error &&
      (purRes.error.code === '23503' ||
        /foreign key constraint/i.test(purRes.error.message))
    ) {
      // Ensure parent vendor exists in Supabase if purchase followed vendor creation immediately
      const prePurchaseVendor: Vendor = {
        ...updatedVendor,
        balance: Math.max(0, updatedVendor.balance - purchase.balanceDue),
      };
      const { error: ensureVendErr } = await supabase
        .from('vendors')
        .upsert(mapVendorToRow(prePurchaseVendor, userId));
      if (!ensureVendErr) {
        purRes = await insertPurchasesCompat(userId, [purchase]);
      }
    }
    if (purRes.error) return purRes.error.message;

    if (purchase.items.length > 0) {
      const itemsRes = await insertPurchaseItemsCompat(userId, purchase.items);
      if (itemsRes.error) return itemsRes.error.message;
    }

    const receivedIds = new Set(purchase.items.map((i) => i.productId));
    const productsToUpdate = updatedProducts.filter((p) => receivedIds.has(p.id));
    if (productsToUpdate.length > 0) {
      const prodRes = await upsertProductsCompat(userId, productsToUpdate);
      if (prodRes.error) return prodRes.error.message;
    }

    if (purchase.balanceDue > 0) {
      const { error: vendErr } = await supabase
        .from('vendors')
        .update({ balance: updatedVendor.balance })
        .eq('id', updatedVendor.id)
        .eq('user_id', userId);
      if (vendErr) return vendErr.message;
    }
  }

  return null;
}

export async function insertInventoryAdjustmentRecord(
  userId: string,
  adjustment: InventoryAdjustment,
  updatedProduct: Product
): Promise<string | null> {
  const ws = loadLocalWorkspace(userId);
  ws.inventoryAdjustments = [adjustment, ...ws.inventoryAdjustments];
  ws.products = ws.products.map((p) =>
    p.id === updatedProduct.id ? updatedProduct : p
  );
  saveLocalWorkspace(userId, ws);

  if (isSupabaseConfigured && supabase) {
    const adjRes = await insertAdjustmentsCompat(userId, [adjustment]);
    if (adjRes.error) return adjRes.error.message;

    const prodRes = await upsertProductsCompat(userId, [updatedProduct]);
    if (prodRes.error) return prodRes.error.message;
  }

  return null;
}

// Phase 3: Customers, Employees & Store Settings Persistence

export async function upsertCustomerRecord(
  userId: string,
  customer: Customer
): Promise<string | null> {
  const ws = loadLocalWorkspace(userId);
  const exists = ws.customers.some((c) => c.id === customer.id);
  ws.customers = exists
    ? ws.customers.map((c) => (c.id === customer.id ? customer : c))
    : [customer, ...ws.customers];
  saveLocalWorkspace(userId, ws);

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('customers')
      .upsert(mapCustomerToRow(customer, userId, true));
    if (error) {
      if (isMissingColumnError(error.message)) {
        const fallback = await supabase
          .from('customers')
          .upsert(mapCustomerToRow(customer, userId, false));
        if (fallback.error) return fallback.error.message;
        return null;
      }
      return error.message;
    }
  }
  return null;
}

export async function deleteCustomerRecord(
  userId: string,
  customerId: string
): Promise<string | null> {
  const ws = loadLocalWorkspace(userId);
  ws.customers = ws.customers.filter((c) => c.id !== customerId);
  saveLocalWorkspace(userId, ws);

  if (isSupabaseConfigured && supabase) {
    const authErr = await authorizeServerAction('customers.delete');
    if (authErr) return authErr;
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', customerId)
      .eq('user_id', userId);
    if (error) return error.message;
  }
  return null;
}

export interface VerifyStaffPinResult {
  ok: boolean;
  token?: string;
  employeeId?: string;
  role?: Employee['role'];
  expiresAt?: string;
  error?: string;
}

export async function verifyStaffPinRecord(
  userId: string,
  pin: string,
  targetEmployeeId?: string
): Promise<VerifyStaffPinResult> {
  const cleanPin = pin.trim();
  if (!isValidPinFormat(cleanPin)) {
    return { ok: false, error: 'PIN must be exactly 4 numeric digits.' };
  }

  const browserOffline =
    typeof navigator !== 'undefined' && navigator.onLine === false;

  if (isSupabaseConfigured && supabase && !browserOffline) {
    const accessToken = await getSupabaseAccessToken();
    if (accessToken && typeof fetch === 'function') {
      try {
        const resp = await fetch('/api/staff/verify-pin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            pin: cleanPin,
            employeeId: targetEmployeeId || undefined,
          }),
        });
        if (resp.status !== 404 && resp.status < 500 && isJsonApiResponse(resp)) {
          const data = (await resp.json().catch(() => ({}))) as VerifyStaffPinResult;
          if (resp.ok && data.ok && data.token && data.employeeId && data.role) {
            setStaffSessionHeaderToken(data.token);
            return data;
          }
          return { ok: false, error: data.error || 'Invalid or inactive staff PIN.' };
        }
      } catch {
        // Fallback to direct Postgres SECURITY DEFINER RPC
      }
    }

    const { data, error } = await supabase.rpc('verify_staff_pin', {
      p_pin: cleanPin,
      p_employee_id: targetEmployeeId ?? null,
    });
    if (error && /PGRST202|Could not find the function/i.test(error.message)) {
      const empLookup = await fetchEmployeesWithSchemaFallback(supabase, userId, {
        employeeId: targetEmployeeId,
        activeOnly: true,
      });
      for (const row of empLookup.data ?? []) {
        const storedHash = typeof row.pin_hash === 'string' ? row.pin_hash.trim() : '';
        const storedPinCode = typeof row.pin_code === 'string' ? row.pin_code.trim() : '';
        const hashCandidate = storedHash.startsWith('pbkdf2_sha256$')
          ? storedHash
          : storedPinCode.startsWith('pbkdf2_sha256$')
          ? storedPinCode
          : '';
        const matched = hashCandidate
          ? await verifyPinHashAsync(cleanPin, hashCandidate)
          : isValidPinFormat(storedPinCode) && storedPinCode === cleanPin;
        if (matched) {
          const token = `sbz_local_${String(row.role)}_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 10)}`;
          const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
          setStaffSessionHeaderToken(token);
          return {
            ok: true,
            token,
            employeeId: String(row.id),
            role: row.role as Employee['role'],
            expiresAt,
          };
        }
      }
      return { ok: false, error: 'Invalid or inactive staff PIN.' };
    }
    if (error) {
      return { ok: false, error: error.message };
    }
    const result = (data ?? {}) as VerifyStaffPinResult;
    if (!result.ok || !result.token || !result.employeeId || !result.role) {
      return { ok: false, error: result.error || 'Invalid or inactive staff PIN.' };
    }
    setStaffSessionHeaderToken(result.token);
    return result;
  }

  await migrateLegacyLocalPins(userId);
  const ws = loadLocalWorkspace(userId);
  const candidates = ws.employees.filter(
    (e) => e.isActive && (!targetEmployeeId || e.id === targetEmployeeId)
  );
  for (const emp of candidates) {
    if (await verifyPinHashAsync(cleanPin, emp.pinHash)) {
      const token = `local_${emp.role}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      setStaffSessionHeaderToken(token);
      return {
        ok: true,
        token,
        employeeId: emp.id,
        role: emp.role,
        expiresAt,
      };
    }
  }
  return { ok: false, error: 'Invalid or inactive staff PIN.' };
}

export interface SetupInitialAdminResult {
  ok: boolean;
  employee?: Employee;
  session?: StaffSessionInfo;
  error?: string;
}

export async function setupInitialAdminRecord(
  userId: string,
  input: { name: string; phone?: string; pin: string }
): Promise<SetupInitialAdminResult> {
  const cleanName = input.name.trim();
  const cleanPhone = (input.phone ?? '').trim();
  const cleanPin = input.pin.trim();

  if (!cleanName || cleanName.length > 80) {
    return { ok: false, error: 'Please enter a valid Admin name.' };
  }
  if (!isValidPinFormat(cleanPin)) {
    return { ok: false, error: 'PIN must be exactly 4 numeric digits.' };
  }

  const ws = loadLocalWorkspace(userId);
  const browserOffline =
    typeof navigator !== 'undefined' && navigator.onLine === false;

  if (isSupabaseConfigured && supabase && !browserOffline) {
    const accessToken = await getSupabaseAccessToken();
    if (accessToken && typeof fetch === 'function') {
      try {
        const resp = await fetch('/api/staff/bootstrap-admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            name: cleanName,
            phone: cleanPhone,
            pin: cleanPin,
          }),
        });
        if (resp.status !== 404 && resp.status < 500 && isJsonApiResponse(resp)) {
          const data = (await resp.json().catch(() => ({}))) as {
            ok?: boolean;
            employee?: Employee;
            session?: StaffSessionInfo;
            error?: string;
          };
          if (resp.ok && data.ok && data.employee && data.session) {
            const createdEmp: Employee = { ...data.employee, pinHash: '', hasPin: true };
            const existsLocally = ws.employees.some((e) => e.id === createdEmp.id);
            ws.employees = existsLocally
              ? ws.employees.map((e) => (e.id === createdEmp.id ? createdEmp : e))
              : [...ws.employees, createdEmp];
            saveLocalWorkspace(userId, ws);
            setStaffSessionHeaderToken(data.session.token);
            return { ok: true, employee: createdEmp, session: data.session };
          }
          return {
            ok: false,
            error: data.error || 'Failed to save initial Admin PIN.',
          };
        }
      } catch {
        // Fallback to direct RPC / Supabase check below
      }
    }

    // Direct Supabase fallback if Express route is unavailable
    const liveLookup = await fetchEmployeesWithSchemaFallback(supabase, userId);
    if (liveLookup.error) {
      return { ok: false, error: liveLookup.error.message };
    }
    const mappedLive = (liveLookup.data ?? []).map((r) =>
      mapEmployeeFromRow(r as Record<string, unknown>)
    );
    if (hasConfiguredAdmin(mappedLive)) {
      return {
        ok: false,
        error: 'An active Store Admin PIN is already configured. Sign in with your Admin PIN.',
      };
    }

    const existingUnpinnedAdmin = mappedLive.find(
      (e) => e.role === 'admin' && e.isActive && !e.hasPin
    );
    const targetId = existingUnpinnedAdmin?.id || `${userId.slice(0, 8)}-emp-admin`;
    const createdAt = existingUnpinnedAdmin?.createdAt || new Date().toISOString();

    const { error: setErr } = await supabase.rpc('set_staff_pin', {
      p_employee_id: targetId,
      p_name: cleanName,
      p_role: 'admin',
      p_phone: cleanPhone,
      p_pin: cleanPin,
      p_is_active: true,
    });
    if (setErr) {
      if (!/PGRST202|Could not find the function/i.test(setErr.message)) {
        if (setErr.code === '42501' || /Only an authenticated Admin/i.test(setErr.message)) {
          return {
            ok: false,
            error:
              'Initial Admin setup for stores with existing staff requires the backend /api/staff/bootstrap-admin endpoint to be active.',
          };
        }
        return { ok: false, error: setErr.message };
      }
      const pbkdf2Hash = await hashPinAsync(cleanPin);
      let upErr: { code?: string; message: string } | null = null;
      if (liveLookup.supportsPinHashColumn) {
        const resUp = await supabase.from('employees').upsert(
          {
            id: targetId,
            user_id: userId,
            name: cleanName,
            phone: cleanPhone,
            role: 'admin',
            pin_code: REDACTED_PIN_SENTINEL,
            pin_hash: pbkdf2Hash,
            pin_updated_at: new Date().toISOString(),
            is_active: true,
            created_at: createdAt,
          },
          { onConflict: 'id' }
        );
        upErr = resUp.error;
      }
      if (!liveLookup.supportsPinHashColumn || isMissingEmployeeColumnError(upErr)) {
        const legacyUp = await supabase.from('employees').upsert(
          {
            id: targetId,
            user_id: userId,
            name: cleanName,
            phone: cleanPhone,
            role: 'admin',
            pin_code: pbkdf2Hash,
            is_active: true,
            created_at: createdAt,
          },
          { onConflict: 'id' }
        );
        upErr = legacyUp.error;
      }
      if (upErr) return { ok: false, error: upErr.message };
      const empRecord: Employee = {
        id: targetId,
        name: cleanName,
        phone: cleanPhone,
        role: 'admin',
        pinHash: '',
        hasPin: true,
        isActive: true,
        createdAt,
      };
      const session: StaffSessionInfo = {
        token: `sbz_local_admin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        employeeId: targetId,
        role: 'admin',
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      };
      ws.employees = ws.employees.some((e) => e.id === targetId)
        ? ws.employees.map((e) => (e.id === targetId ? empRecord : e))
        : [...ws.employees, empRecord];
      saveLocalWorkspace(userId, ws);
      setStaffSessionHeaderToken(session.token);
      return { ok: true, employee: empRecord, session };
    }

    const verified = await verifyStaffPinRecord(userId, cleanPin, targetId);
    if (!verified.ok || !verified.token || !verified.employeeId || !verified.role || !verified.expiresAt) {
      return { ok: false, error: verified.error || 'Admin PIN created, but failed to verify session.' };
    }
    const empRecord: Employee = {
      id: targetId,
      name: cleanName,
      phone: cleanPhone,
      role: 'admin',
      pinHash: '',
      hasPin: true,
      isActive: true,
      createdAt,
    };
    const session: StaffSessionInfo = {
      token: verified.token,
      employeeId: verified.employeeId,
      role: verified.role,
      expiresAt: verified.expiresAt,
    };
    ws.employees = ws.employees.some((e) => e.id === targetId)
      ? ws.employees.map((e) => (e.id === targetId ? empRecord : e))
      : [...ws.employees, empRecord];
    saveLocalWorkspace(userId, ws);
    setStaffSessionHeaderToken(session.token);
    return { ok: true, employee: empRecord, session };
  }

  // Local / Offline mode: verify no Admin PIN exists, hash PIN with PBKDF2, and store without removing existing employees
  if (hasConfiguredAdmin(ws.employees)) {
    return {
      ok: false,
      error: 'An active Store Admin PIN is already configured. Sign in with your Admin PIN.',
    };
  }
  const existingUnpinnedAdmin = ws.employees.find(
    (e) => e.role === 'admin' && e.isActive && !e.hasPin
  );
  const targetId = existingUnpinnedAdmin?.id || `${userId.slice(0, 8)}-emp-admin`;
  const createdAt = existingUnpinnedAdmin?.createdAt || new Date().toISOString();
  const pinHash = await hashPinAsync(cleanPin);

  const nextAdmin: Employee = {
    id: targetId,
    name: cleanName,
    phone: cleanPhone,
    role: 'admin',
    pinHash,
    hasPin: true,
    isActive: true,
    createdAt,
  };

  ws.employees = existingUnpinnedAdmin
    ? ws.employees.map((e) => (e.id === targetId ? nextAdmin : e))
    : [...ws.employees, nextAdmin];
  saveLocalWorkspace(userId, ws);

  const session: StaffSessionInfo = {
    token: `local_admin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    employeeId: targetId,
    role: 'admin',
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  };
  setStaffSessionHeaderToken(session.token);
  return { ok: true, employee: nextAdmin, session };
}

export interface SaveEmployeeInput {
  id: string;
  name: string;
  phone: string;
  role: Employee['role'];
  pin?: string;
  isActive: boolean;
  branchId?: string;
  shiftAssignment?: string;
  customPermissions?: string[];
  createdAt: string;
}

export async function saveEmployeeRecord(
  userId: string,
  input: SaveEmployeeInput
): Promise<{ employee?: Employee; error: string | null }> {
  const cleanPin = (input.pin ?? '').trim();
  if (cleanPin && !isValidPinFormat(cleanPin)) {
    return { error: 'PIN must be exactly 4 numeric digits.' };
  }

  const ws = loadLocalWorkspace(userId);
  const existing = ws.employees.find((e) => e.id === input.id);
  if (!existing && !cleanPin) {
    return { error: 'A 4-digit PIN is required for new staff members.' };
  }

  let nextPinHash = existing?.pinHash ?? '';
  if (cleanPin) {
    const others = ws.employees.filter((e) => e.id !== input.id);
    for (const other of others) {
      if (other.pinHash && (await verifyPinHashAsync(cleanPin, other.pinHash))) {
        return { error: 'This 4-digit PIN is already assigned to another staff member.' };
      }
    }
    nextPinHash = await hashPinAsync(cleanPin);
  }

  const nextEmployee: Employee = {
    id: input.id,
    name: input.name.trim(),
    phone: input.phone.trim(),
    role: input.role,
    pinHash: isSupabaseConfigured ? '' : nextPinHash,
    hasPin: Boolean(existing?.hasPin || cleanPin || nextPinHash),
    isActive: input.isActive,
    branchId: input.branchId,
    shiftAssignment: input.shiftAssignment,
    customPermissions: input.customPermissions,
    createdAt: existing?.createdAt ?? input.createdAt,
  };

  if (isSupabaseConfigured && supabase) {
    const accessToken = await getSupabaseAccessToken();
    const staffToken = getStaffSessionHeaderToken();
    if (accessToken && typeof fetch === 'function') {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        };
        if (staffToken) headers['x-staff-session'] = staffToken;
        const resp = await fetch('/api/staff/save-employee', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            id: nextEmployee.id,
            name: nextEmployee.name,
            phone: nextEmployee.phone,
            role: nextEmployee.role,
            pin: cleanPin || undefined,
            isActive: nextEmployee.isActive,
            branchId: nextEmployee.branchId,
            shiftAssignment: nextEmployee.shiftAssignment,
            customPermissions: nextEmployee.customPermissions,
          }),
        });
        if (resp.status !== 404 && resp.status < 500 && isJsonApiResponse(resp)) {
          const body = (await resp.json().catch(() => ({}))) as { error?: string };
          if (!resp.ok) {
            return { error: body.error || 'Failed to save employee.' };
          }
          ws.employees = existing
            ? ws.employees.map((e) => (e.id === nextEmployee.id ? nextEmployee : e))
            : [...ws.employees, nextEmployee];
          saveLocalWorkspace(userId, ws);
          return { employee: nextEmployee, error: null };
        }
      } catch {
        // Fallback to direct RPC
      }
    }

    const { error: rpcErr } = await supabase.rpc('set_staff_pin', {
      p_employee_id: nextEmployee.id,
      p_name: nextEmployee.name,
      p_role: nextEmployee.role,
      p_phone: nextEmployee.phone,
      p_pin: cleanPin || null,
      p_is_active: nextEmployee.isActive,
    });
    if (rpcErr) {
      if (!/PGRST202|Could not find the function/i.test(rpcErr.message)) {
        return { error: rpcErr.message };
      }
      if (!cleanPin && existing) {
        const { error: patchErr } = await supabase
          .from('employees')
          .update({
            name: nextEmployee.name,
            phone: nextEmployee.phone,
            role: nextEmployee.role,
            is_active: nextEmployee.isActive,
          })
          .eq('id', nextEmployee.id)
          .eq('user_id', userId);
        if (patchErr) return { error: patchErr.message };
      } else {
        const resUp = await supabase.from('employees').upsert(
          {
            id: nextEmployee.id,
            user_id: userId,
            name: nextEmployee.name,
            phone: nextEmployee.phone,
            role: nextEmployee.role,
            pin_code: REDACTED_PIN_SENTINEL,
            pin_hash: nextPinHash,
            pin_updated_at: new Date().toISOString(),
            is_active: nextEmployee.isActive,
            created_at: nextEmployee.createdAt,
          },
          { onConflict: 'id' }
        );
        if (resUp.error) {
          if (!isMissingEmployeeColumnError(resUp.error)) {
            return { error: resUp.error.message };
          }
          const legacyUp = await supabase.from('employees').upsert(
            {
              id: nextEmployee.id,
              user_id: userId,
              name: nextEmployee.name,
              phone: nextEmployee.phone,
              role: nextEmployee.role,
              pin_code: nextPinHash,
              is_active: nextEmployee.isActive,
              created_at: nextEmployee.createdAt,
            },
            { onConflict: 'id' }
          );
          if (legacyUp.error) return { error: legacyUp.error.message };
        }
      }
    }
  }

  ws.employees = existing
    ? ws.employees.map((e) => (e.id === nextEmployee.id ? nextEmployee : e))
    : [...ws.employees, nextEmployee];
  saveLocalWorkspace(userId, ws);
  return { employee: nextEmployee, error: null };
}

export async function deleteEmployeeRecord(
  userId: string,
  employeeId: string
): Promise<string | null> {
  const ws = loadLocalWorkspace(userId);
  const target = ws.employees.find((e) => e.id === employeeId);
  if (
    target?.role === 'admin' &&
    ws.employees.filter((e) => e.role === 'admin' && e.isActive).length <= 1
  ) {
    return 'Cannot remove the only active store admin.';
  }

  if (isSupabaseConfigured && supabase) {
    const accessToken = await getSupabaseAccessToken();
    const staffToken = getStaffSessionHeaderToken();
    if (accessToken && typeof fetch === 'function') {
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${accessToken}`,
        };
        if (staffToken) headers['x-staff-session'] = staffToken;
        const resp = await fetch(`/api/staff/${encodeURIComponent(employeeId)}`, {
          method: 'DELETE',
          headers,
        });
        if (resp.status !== 404 && resp.status < 500 && isJsonApiResponse(resp)) {
          const body = (await resp.json().catch(() => ({}))) as { error?: string };
          if (!resp.ok) {
            return body.error || 'Failed to delete employee.';
          }
          ws.employees = ws.employees.filter((e) => e.id !== employeeId);
          saveLocalWorkspace(userId, ws);
          return null;
        }
      } catch {
        // Fallback to direct RPC
      }
    }

    const { error: rpcErr } = await supabase.rpc('delete_staff_member', {
      p_employee_id: employeeId,
    });
    if (rpcErr) {
      if (!/PGRST202|Could not find the function/i.test(rpcErr.message)) {
        return rpcErr.message;
      }
      const { error: delErr } = await supabase
        .from('employees')
        .delete()
        .eq('id', employeeId)
        .eq('user_id', userId);
      if (delErr) return delErr.message;
    }
  }

  ws.employees = ws.employees.filter((e) => e.id !== employeeId);
  saveLocalWorkspace(userId, ws);
  return null;
}

export async function upsertStoreSettingsRecord(
  userId: string,
  settings: StoreSettings
): Promise<string | null> {
  const ws = loadLocalWorkspace(userId);
  ws.storeSettings = settings;
  saveLocalWorkspace(userId, ws);

  if (isSupabaseConfigured && supabase) {
    const first = await supabase
      .from('store_settings')
      .upsert(mapStoreSettingsToRow(settings, userId, 'extended'));
    if (first.error) {
      if (isMissingColumnError(first.error.message)) {
        const wallets = await supabase
          .from('store_settings')
          .upsert(mapStoreSettingsToRow(settings, userId, 'wallets'));
        if (!wallets.error) return null;
        if (isMissingColumnError(wallets.error.message)) {
          const core = await supabase
            .from('store_settings')
            .upsert(mapStoreSettingsToRow(settings, userId, 'core'));
          if (core.error) return core.error.message;
          return null;
        }
        return wallets.error.message;
      }
      return first.error.message;
    }
  }
  return null;
}

export async function fetchLatestCustomersForPos(userId: string): Promise<{
  customers: Customer[];
  udhaarCustomers: UdhaarCustomer[];
} | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;

  try {
    const [crmRes, khataRes] = await Promise.all([
      supabase
        .from('customers')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('udhaar_customers')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
    ]);

    if (crmRes.error || khataRes.error) return null;

    const customers = (crmRes.data ?? []).map((r) =>
      mapCustomerFromRow(r as Record<string, unknown>)
    );
    const udhaarCustomers = (khataRes.data ?? []).map((r) =>
      mapUdhaarCustomerFromRow(r as Record<string, unknown>)
    );

    const ws = loadLocalWorkspace(userId);
    if (customers.length > 0 || ws.customers.length === 0) {
      ws.customers = customers;
    }
    if (udhaarCustomers.length > 0 || ws.udhaarCustomers.length === 0) {
      ws.udhaarCustomers = udhaarCustomers;
    }
    saveLocalWorkspace(userId, ws);

    return { customers: ws.customers, udhaarCustomers: ws.udhaarCustomers };
  } catch {
    return null;
  }
}

export async function resetUserDemoWorkspace(
  userId: string,
  shopName?: string
): Promise<ShopkeeperWorkspaceData> {
  const demoData = buildStarterWorkspace(userId, true, shopName);
  const browserOffline =
    typeof navigator !== 'undefined' && navigator.onLine === false;

  if (isSupabaseConfigured && supabase && !browserOffline) {
    const authErr = await authorizeServerAction('workspace.reset');
    if (authErr) {
      const currentCloud = await fetchWorkspaceData(userId, shopName).catch(
        () => loadLocalWorkspace(userId, shopName)
      );
      return {
        ...currentCloud,
        cloudSyncError: authErr,
      };
    }

    const failWithCurrentCloudState = async (message: string) => {
      const currentCloud = await fetchWorkspaceData(userId, shopName).catch(
        () => loadLocalWorkspace(userId, shopName)
      );
      return {
        ...currentCloud,
        cloudSyncError: message,
      };
    };

    // Tier 1: Delete child tables first
    const delResults = await Promise.all([
      supabase.from('purchase_items').delete().eq('user_id', userId),
      supabase.from('inventory_adjustments').delete().eq('user_id', userId),
      supabase.from('udhaar_entries').delete().eq('user_id', userId),
    ]);
    const delErr1 = delResults.find((r) => r.error)?.error;
    if (delErr1) return failWithCurrentCloudState(delErr1.message);

    // Tier 2: Delete intermediate parent tables (employees deleted here triggers cascade delete of old staff_sessions;
    // since employees is now empty, Tier 4-6 inserts pass is_staff_role_in bootstrap rule until Tier 7 re-creates staff)
    const delResults2 = await Promise.all([
      supabase.from('purchases').delete().eq('user_id', userId),
      supabase.from('udhaar_customers').delete().eq('user_id', userId),
      supabase.from('orders').delete().eq('user_id', userId),
      supabase.from('products').delete().eq('user_id', userId),
      supabase.from('customers').delete().eq('user_id', userId),
      supabase.from('employees').delete().eq('user_id', userId),
      supabase.from('expenses').delete().eq('user_id', userId),
    ]);
    const delErr2 = delResults2.find((r) => r.error)?.error;
    if (delErr2) return failWithCurrentCloudState(delErr2.message);
    setStaffSessionHeaderToken(null);

    // Tier 3: Delete vendors (parent of purchases)
    const delVend = await supabase.from('vendors').delete().eq('user_id', userId);
    if (delVend.error) return failWithCurrentCloudState(delVend.error.message);

    // Tier 4: Insert independent root/parent tables in parallel (employees seeded in Tier 7 with hashed PINs)
    const tier4Results = await Promise.all([
      upsertProductsCompat(userId, demoData.products),
      supabase
        .from('orders')
        .insert(demoData.orders.map((o) => mapOrderToRow(o, userId))),
      insertUdhaarCustomersCompat(userId, demoData.udhaarCustomers),
      supabase
        .from('vendors')
        .insert(demoData.vendors.map((v) => mapVendorToRow(v, userId))),
      demoData.customers.length > 0
        ? supabase
            .from('customers')
            .insert(demoData.customers.map((c) => mapCustomerToRow(c, userId)))
        : Promise.resolve({ error: null }),
      supabase
        .from('store_settings')
        .upsert(mapStoreSettingsToRow(demoData.storeSettings, userId)),
      demoData.expenses.length > 0
        ? supabase
            .from('expenses')
            .insert(demoData.expenses.map((e) => mapExpenseToRow(e, userId)))
        : Promise.resolve({ error: null }),
    ]);
    const tier4Err = tier4Results.find((r) => r.error)?.error;
    if (tier4Err) return failWithCurrentCloudState(tier4Err.message);

    // Tier 5: Insert child tables that reference Tier 4 parents
    const tier5Results = await Promise.all([
      demoData.udhaarEntries.length > 0
        ? supabase.from('udhaar_entries').insert(
            demoData.udhaarEntries.map((e) => ({
              id: e.id,
              user_id: userId,
              customer_id: e.customerId,
              type: e.type,
              amount: e.amount,
              note: e.note,
              receipt_number: e.receiptNumber ?? null,
              created_at: e.createdAt,
            }))
          )
        : Promise.resolve({ error: null }),
      insertPurchasesCompat(userId, demoData.purchases),
      demoData.inventoryAdjustments.length > 0
        ? insertAdjustmentsCompat(userId, demoData.inventoryAdjustments)
        : Promise.resolve({ error: null }),
    ]);
    const tier5Err = tier5Results.find((r) => r.error)?.error;
    if (tier5Err) return failWithCurrentCloudState(tier5Err.message);

    // Tier 6: Insert grandchild purchase_items (depends on purchases)
    const allPurchaseItems = demoData.purchases.flatMap((p) => p.items);
    if (allPurchaseItems.length > 0) {
      const insPurItems = await insertPurchaseItemsCompat(
        userId,
        allPurchaseItems
      );
      if (insPurItems.error) {
        return failWithCurrentCloudState(insPurItems.error.message);
      }
    }

    // Tier 7: Seed demo employees via set_staff_pin RPC so Postgres hashes default PINs
    const demoPinBySuffix: Array<{ emp: Employee; pin: string }> = demoData.employees.map(
      (emp) => ({
        emp,
        pin: emp.role === 'admin' ? '1234' : emp.role === 'manager' ? '2222' : '1111',
      })
    );
    for (const item of demoPinBySuffix) {
      const { error: rpcErr } = await supabase.rpc('set_staff_pin', {
        p_employee_id: item.emp.id,
        p_name: item.emp.name,
        p_role: item.emp.role,
        p_phone: item.emp.phone,
        p_pin: item.pin,
        p_is_active: item.emp.isActive,
      });
      if (rpcErr) {
        if (/PGRST202|Could not find the function/i.test(rpcErr.message)) {
          const { error: fallbackErr } = await supabase
            .from('employees')
            .upsert(mapEmployeeToRow(item.emp, userId), { onConflict: 'id' });
          if (fallbackErr) return failWithCurrentCloudState(fallbackErr.message);
        } else {
          return failWithCurrentCloudState(rpcErr.message);
        }
      }
    }

    // Re-authenticate owner session token cleanly after reset
    const adminEmp = demoData.employees.find((e) => e.role === 'admin');
    const verifiedSession = adminEmp
      ? await verifyStaffPinRecord(userId, '1234', adminEmp.id)
      : null;

    saveLocalWorkspace(userId, demoData);
    return {
      ...demoData,
      cloudSyncError: null,
      isOffline: false,
      refreshedStaffSession:
        verifiedSession?.ok &&
        verifiedSession.token &&
        verifiedSession.employeeId &&
        verifiedSession.role &&
        verifiedSession.expiresAt
          ? {
              token: verifiedSession.token,
              employeeId: verifiedSession.employeeId,
              role: verifiedSession.role,
              expiresAt: verifiedSession.expiresAt,
            }
          : null,
    };
  }

  saveLocalWorkspace(userId, demoData);
  return { ...demoData, cloudSyncError: null, isOffline: browserOffline };
}

// Phase 5: Shop Expenses Persistence

export async function upsertExpenseRecord(
  userId: string,
  expense: ExpenseRecord
): Promise<string | null> {
  const ws = loadLocalWorkspace(userId);
  const exists = ws.expenses.some((e) => e.id === expense.id);
  ws.expenses = exists
    ? ws.expenses.map((e) => (e.id === expense.id ? expense : e))
    : [expense, ...ws.expenses];
  saveLocalWorkspace(userId, ws);

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('expenses')
      .upsert(mapExpenseToRow(expense, userId, true));
    if (error) {
      if (isMissingColumnError(error.message)) {
        const fallback = await supabase
          .from('expenses')
          .upsert(mapExpenseToRow(expense, userId, false));
        if (fallback.error) return fallback.error.message;
        return null;
      }
      return error.message;
    }
  }
  return null;
}

export async function deleteExpenseRecord(
  userId: string,
  expenseId: string
): Promise<string | null> {
  const ws = loadLocalWorkspace(userId);
  ws.expenses = ws.expenses.filter((e) => e.id !== expenseId);
  saveLocalWorkspace(userId, ws);

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId)
      .eq('user_id', userId);
    if (error) return error.message;
  }
  return null;
}

// Phase 5: SaaS Subscriptions & Super Admin Control

function loadLocalSubscriptions(): SubscriptionRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_SUBSCRIPTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as SubscriptionRecord[];
    }
  } catch {
    // ignore
  }
  return [];
}

function saveLocalSubscriptions(list: SubscriptionRecord[]): void {
  try {
    localStorage.setItem(LOCAL_SUBSCRIPTIONS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function createTrialSubscription(
  userId: string,
  email: string,
  shopName?: string
): SubscriptionRecord {
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    userId,
    email: email.trim().toLowerCase(),
    shopName: shopName || 'Khaas Retail',
    planName: '30-Day Free Trial',
    expiresAt: expires.toISOString(),
    isBlocked: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export async function ensureUserSubscription(
  userId: string,
  email: string,
  shopName?: string
): Promise<{ subscription: SubscriptionRecord; syncError: string | null }> {
  const localSubs = loadLocalSubscriptions();
  const cached = localSubs.find((s) => s.userId === userId);
  const browserOffline =
    typeof navigator !== 'undefined' && navigator.onLine === false;

  if (isSupabaseConfigured && supabase && !browserOffline) {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        const fallback = cached ?? createTrialSubscription(userId, email, shopName);
        if (!cached) saveLocalSubscriptions([...localSubs, fallback]);
        return {
          subscription: fallback,
          syncError: isNetworkLossError(error.message) ? null : error.message,
        };
      }

      if (data) {
        const mapped = mapSubscriptionFromRow(data as Record<string, unknown>);
        const nextLocal = localSubs.some((s) => s.userId === mapped.userId)
          ? localSubs.map((s) => (s.userId === mapped.userId ? mapped : s))
          : [...localSubs, mapped];
        saveLocalSubscriptions(nextLocal);
        return { subscription: mapped, syncError: null };
      }

      // First-time signup/login: insert initial 30-day free trial row
      const initial = createTrialSubscription(userId, email, shopName);
      const { error: insErr } = await supabase.from('subscriptions').insert({
        user_id: initial.userId,
        email: initial.email,
        shop_name: initial.shopName ?? '',
        plan_name: initial.planName,
        expires_at: initial.expiresAt,
        is_blocked: false,
        created_at: initial.createdAt,
        updated_at: initial.updatedAt,
      });

      const nextLocal = [...localSubs.filter((s) => s.userId !== initial.userId), initial];
      saveLocalSubscriptions(nextLocal);
      return {
        subscription: initial,
        syncError: insErr && !isNetworkLossError(insErr.message) ? insErr.message : null,
      };
    } catch (err) {
      const fallback = cached ?? createTrialSubscription(userId, email, shopName);
      if (!cached) saveLocalSubscriptions([...localSubs, fallback]);
      const msg = err instanceof Error ? err.message : '';
      return {
        subscription: fallback,
        syncError: isNetworkLossError(msg) ? null : msg,
      };
    }
  }

  const localRecord = cached ?? createTrialSubscription(userId, email, shopName);
  if (!cached) {
    saveLocalSubscriptions([...localSubs, localRecord]);
  }
  return { subscription: localRecord, syncError: null };
}

export async function fetchAllSubscriptions(): Promise<{
  subscriptions: SubscriptionRecord[];
  error: string | null;
}> {
  if (isSupabaseConfigured && supabase) {
    const accessToken = await getSupabaseAccessToken();
    if (accessToken && typeof fetch === 'function') {
      try {
        const resp = await fetch('/api/admin/subscriptions', {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (resp.status !== 404 && resp.status < 500) {
          const body = (await resp.json().catch(() => ({}))) as {
            subscriptions?: Record<string, unknown>[];
            error?: string;
          };
          if (!resp.ok) {
            return {
              subscriptions: [],
              error: body.error || 'Forbidden: explicit super_admin role required.',
            };
          }
          const mapped = (body.subscriptions ?? []).map((row) =>
            mapSubscriptionFromRow(row)
          );
          saveLocalSubscriptions(mapped);
          return { subscriptions: mapped, error: null };
        }
      } catch {
        // Fallback to RLS-protected direct Supabase query
      }
    }

    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        return {
          subscriptions: loadLocalSubscriptions(),
          error: isNetworkLossError(error.message) ? null : error.message,
        };
      }

      const mapped = (data ?? []).map((row) =>
        mapSubscriptionFromRow(row as Record<string, unknown>)
      );
      saveLocalSubscriptions(mapped);
      return { subscriptions: mapped, error: null };
    } catch (err) {
      return {
        subscriptions: loadLocalSubscriptions(),
        error: err instanceof Error ? err.message : 'Unable to load subscriptions.',
      };
    }
  }

  return { subscriptions: loadLocalSubscriptions(), error: null };
}

export async function adminUpdateSubscription(
  targetUserId: string,
  action: 'extend_30_days' | 'extend_1_year' | 'toggle_block',
  currentRecord: SubscriptionRecord
): Promise<{ updated: SubscriptionRecord; error: string | null }> {
  const now = new Date();
  const baseMs = Math.max(now.getTime(), new Date(currentRecord.expiresAt).getTime());

  let nextExpiresAt = currentRecord.expiresAt;
  let nextPlanName = currentRecord.planName;
  let nextBlocked = currentRecord.isBlocked;

  if (action === 'extend_30_days') {
    nextExpiresAt = new Date(baseMs + 30 * 24 * 60 * 60 * 1000).toISOString();
    nextBlocked = false;
    if (nextPlanName === '30-Day Free Trial') {
      nextPlanName = 'Monthly License';
    }
  } else if (action === 'extend_1_year') {
    nextExpiresAt = new Date(baseMs + 365 * 24 * 60 * 60 * 1000).toISOString();
    nextBlocked = false;
    nextPlanName = 'Annual License';
  } else if (action === 'toggle_block') {
    nextBlocked = !currentRecord.isBlocked;
  }

  const updated: SubscriptionRecord = {
    ...currentRecord,
    planName: nextPlanName,
    expiresAt: nextExpiresAt,
    isBlocked: nextBlocked,
    updatedAt: now.toISOString(),
  };

  if (isSupabaseConfigured && supabase) {
    const accessToken = await getSupabaseAccessToken();
    if (accessToken && typeof fetch === 'function') {
      try {
        const resp = await fetch(
          `/api/admin/subscriptions/${encodeURIComponent(targetUserId)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              planName: updated.planName,
              expiresAt: updated.expiresAt,
              isBlocked: updated.isBlocked,
            }),
          }
        );
        if (resp.status !== 404 && resp.status < 500) {
          const body = (await resp.json().catch(() => ({}))) as { error?: string };
          if (!resp.ok) {
            return {
              updated: currentRecord,
              error: body.error || 'Forbidden: explicit super_admin role required.',
            };
          }
          const localSubs = loadLocalSubscriptions();
          const nextLocal = localSubs.some((s) => s.userId === updated.userId)
            ? localSubs.map((s) => (s.userId === updated.userId ? updated : s))
            : [updated, ...localSubs];
          saveLocalSubscriptions(nextLocal);
          return { updated, error: null };
        }
      } catch {
        // Fallback to RLS-protected direct Supabase update
      }
    }

    const { error } = await supabase
      .from('subscriptions')
      .update({
        plan_name: updated.planName,
        expires_at: updated.expiresAt,
        is_blocked: updated.isBlocked,
        updated_at: updated.updatedAt,
      })
      .eq('user_id', targetUserId);

    if (error) {
      return { updated: currentRecord, error: error.message };
    }
  }

  const localSubs = loadLocalSubscriptions();
  const nextLocal = localSubs.some((s) => s.userId === updated.userId)
    ? localSubs.map((s) => (s.userId === updated.userId ? updated : s))
    : [updated, ...localSubs];
  saveLocalSubscriptions(nextLocal);

  return { updated, error: null };
}

export async function adminUpdateSubscriptionMeta(
  targetUserId: string,
  patch: {
    planName?: string;
    maxBranches?: number;
    maxEmployees?: number;
    paymentEntry?: NonNullable<SubscriptionRecord['paymentHistory']>[number];
  },
  currentRecord: SubscriptionRecord
): Promise<{ updated: SubscriptionRecord; error: string | null }> {
  const nextHistory = patch.paymentEntry
    ? [patch.paymentEntry, ...(currentRecord.paymentHistory ?? [])]
    : currentRecord.paymentHistory ?? [];

  const updated: SubscriptionRecord = {
    ...currentRecord,
    planName: patch.planName ?? currentRecord.planName,
    maxBranches: patch.maxBranches ?? currentRecord.maxBranches ?? 3,
    maxEmployees: patch.maxEmployees ?? currentRecord.maxEmployees ?? 15,
    paymentHistory: nextHistory,
    updatedAt: new Date().toISOString(),
  };

  if (isSupabaseConfigured && supabase) {
    const accessToken = await getSupabaseAccessToken();
    if (accessToken && typeof fetch === 'function') {
      try {
        const resp = await fetch(
          `/api/admin/subscriptions/${encodeURIComponent(targetUserId)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              planName: updated.planName,
              maxBranches: updated.maxBranches,
              maxEmployees: updated.maxEmployees,
              paymentHistory: updated.paymentHistory,
            }),
          }
        );
        if (resp.status !== 404 && resp.status < 500) {
          const body = (await resp.json().catch(() => ({}))) as { error?: string };
          if (!resp.ok) {
            return {
              updated: currentRecord,
              error: body.error || 'Forbidden: explicit super_admin role required.',
            };
          }
          const localSubs = loadLocalSubscriptions();
          const nextLocal = localSubs.some((s) => s.userId === updated.userId)
            ? localSubs.map((s) => (s.userId === updated.userId ? updated : s))
            : [updated, ...localSubs];
          saveLocalSubscriptions(nextLocal);
          return { updated, error: null };
        }
      } catch {
        // Fallback to RLS-protected direct Supabase update
      }
    }

    const { error } = await supabase
      .from('subscriptions')
      .update({
        plan_name: updated.planName,
        max_branches: updated.maxBranches,
        max_employees: updated.maxEmployees,
        payment_history: updated.paymentHistory,
        updated_at: updated.updatedAt,
      })
      .eq('user_id', targetUserId);

    if (error && !isMissingColumnError(error.message)) {
      return { updated: currentRecord, error: error.message };
    }
  }

  const localSubs = loadLocalSubscriptions();
  const nextLocal = localSubs.some((s) => s.userId === updated.userId)
    ? localSubs.map((s) => (s.userId === updated.userId ? updated : s))
    : [updated, ...localSubs];
  saveLocalSubscriptions(nextLocal);
  return { updated, error: null };
}

export async function bulkUpsertProductsRecord(
  userId: string,
  items: Product[]
): Promise<string | null> {
  if (items.length === 0) return null;
  const ws = loadLocalWorkspace(userId);
  const byId = new Map(ws.products.map((p) => [p.id, p]));
  for (const item of items) {
    byId.set(item.id, item);
  }
  ws.products = Array.from(byId.values());
  saveLocalWorkspace(userId, ws);

  if (isSupabaseConfigured && supabase) {
    const authErr = await authorizeServerAction('inventory.write');
    if (authErr) return authErr;
    const res = await upsertProductsCompat(userId, items);
    if (res.error) return res.error.message;
  }
  return null;
}

export async function updatePurchaseRecordCompat(
  userId: string,
  updatedPurchase: PurchaseRecord,
  updatedProducts?: Product[],
  updatedVendor?: Vendor
): Promise<string | null> {
  const ws = loadLocalWorkspace(userId);
  ws.purchases = ws.purchases.map((p) =>
    p.id === updatedPurchase.id ? updatedPurchase : p
  );
  if (updatedProducts) ws.products = updatedProducts;
  if (updatedVendor) {
    ws.vendors = ws.vendors.map((v) =>
      v.id === updatedVendor.id ? updatedVendor : v
    );
  }
  saveLocalWorkspace(userId, ws);

  if (isSupabaseConfigured && supabase) {
    const { error: purErr } = await supabase
      .from('purchases')
      .update({
        status: updatedPurchase.status ?? 'received',
        returned_amount: updatedPurchase.returnedAmount ?? 0,
        balance_due: updatedPurchase.balanceDue,
      })
      .eq('id', updatedPurchase.id)
      .eq('user_id', userId);
    if (purErr && !isMissingColumnError(purErr.message)) {
      return purErr.message;
    }
    if (updatedProducts && updatedProducts.length > 0) {
      const prodRes = await upsertProductsCompat(userId, updatedProducts);
      if (prodRes.error) return prodRes.error.message;
    }
    if (updatedVendor) {
      const { error: vendErr } = await supabase
        .from('vendors')
        .update({ balance: updatedVendor.balance })
        .eq('id', updatedVendor.id)
        .eq('user_id', userId);
      if (vendErr) return vendErr.message;
    }
  }
  return null;
}

export function restoreWorkspaceSnapshotLocally(
  userId: string,
  workspace: Partial<ShopkeeperWorkspaceData>
): ShopkeeperWorkspaceData {
  const current = loadLocalWorkspace(userId);
  const merged: ShopkeeperWorkspaceData = {
    products: Array.isArray(workspace.products) ? workspace.products : current.products,
    orders: Array.isArray(workspace.orders) ? workspace.orders : current.orders,
    udhaarCustomers: Array.isArray(workspace.udhaarCustomers)
      ? workspace.udhaarCustomers
      : current.udhaarCustomers,
    udhaarEntries: Array.isArray(workspace.udhaarEntries)
      ? workspace.udhaarEntries
      : current.udhaarEntries,
    vendors: Array.isArray(workspace.vendors) ? workspace.vendors : current.vendors,
    purchases: Array.isArray(workspace.purchases) ? workspace.purchases : current.purchases,
    inventoryAdjustments: Array.isArray(workspace.inventoryAdjustments)
      ? workspace.inventoryAdjustments
      : current.inventoryAdjustments,
    customers: Array.isArray(workspace.customers) ? workspace.customers : current.customers,
    employees: Array.isArray(workspace.employees)
      ? workspace.employees.map(normalizeEmployeeRecord)
      : current.employees,
    expenses: Array.isArray(workspace.expenses) ? workspace.expenses : current.expenses,
    storeSettings: workspace.storeSettings
      ? { ...current.storeSettings, ...workspace.storeSettings }
      : current.storeSettings,
  };
  saveLocalWorkspace(userId, merged);
  return merged;
}


