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
  StoreSettings,
  SubscriptionRecord,
  UdhaarCustomer,
  UdhaarEntry,
  Vendor,
} from '../types';
import { deterministicDemoUuid } from './idUtils';
import { isSupabaseConfigured, supabase } from './supabaseClient';

export const SUPER_ADMIN_EMAIL = 'bc260436573mha@gmail.com';
export const SUPER_ADMIN_PREFIX = 'bc260436573';

export function isSuperAdminEmail(email?: string | null): boolean {
  const normalized = (email ?? '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === SUPER_ADMIN_EMAIL ||
    normalized.startsWith(SUPER_ADMIN_PREFIX)
  );
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
}

export function enqueueOfflineSale(item: OfflineQueuedSale): OfflineQueuedSale[] {
  const current = getOfflineQueue();
  const next = current.some((q) => q.id === item.id) ? current : [...current, item];
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

function buildDefaultAdminEmployee(userId: string): Employee {
  const prefix = userId.slice(0, 8);
  return {
    id: `${prefix}-emp-admin`,
    name: 'Store Owner (Admin)',
    phone: '',
    role: 'admin',
    pinCode: '1234',
    isActive: true,
    createdAt: new Date().toISOString(),
  };
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
      employees: [buildDefaultAdminEmployee(userId)],
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

function loadLocalWorkspace(userId: string, shopName?: string): ShopkeeperWorkspaceData {
  try {
    const raw = localStorage.getItem(userDataKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ShopkeeperWorkspaceData>;
      const isDemo = userId === 'demo-shopkeeper-1';
      const fallbackEmployees = isDemo
        ? createInitialEmployees().map((emp) => ({
            ...emp,
            id: `${userId.slice(0, 8)}-${emp.id}`,
          }))
        : [buildDefaultAdminEmployee(userId)];
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
      return {
        products: parsed.products ?? [],
        orders: parsed.orders ?? [],
        udhaarCustomers: parsed.udhaarCustomers ?? [],
        udhaarEntries: parsed.udhaarEntries ?? [],
        vendors: parsed.vendors ?? [],
        purchases: parsed.purchases ?? [],
        inventoryAdjustments: parsed.inventoryAdjustments ?? [],
        customers: parsed.customers ?? fallbackCustomers,
        employees:
          parsed.employees && parsed.employees.length > 0
            ? parsed.employees
            : fallbackEmployees,
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
  try {
    localStorage.setItem(userDataKey(userId), JSON.stringify(data));
    localStorage.setItem(
      offlineProductsCacheKey(userId),
      JSON.stringify(data.products)
    );
  } catch {
    // ignore
  }
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
    nameEn: String(row.name_en),
    nameUr: String(row.name_ur),
    category: row.category as Product['category'],
    price: Number(row.price),
    cost: Number(row.cost_price ?? row.cost ?? 0),
    taxRate: Number(row.tax_rate ?? 0),
    stock: Number(row.stock),
    image: String(row.image_url ?? row.image ?? ''),
  };
}

function mapProductToRow(product: Product, userId: string) {
  return {
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
    stock: product.stock,
    image_url: product.image,
  };
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
    rawStatus === 'exchanged'
      ? rawStatus
      : 'completed';

  return {
    id: String(row.id),
    receiptNumber: String(row.receipt_number),
    createdAt: String(row.created_at),
    customerId: row.customer_id ? String(row.customer_id) : undefined,
    customerName: String(row.customer_name ?? ''),
    udhaarCustomerId: row.udhaar_customer_id
      ? String(row.udhaar_customer_id)
      : undefined,
    paymentMethod: row.payment_method as OrderRecord['paymentMethod'],
    items: (row.items as OrderRecord['items']) ?? [],
    subtotal: Number(row.subtotal),
    discountPercent: Number(row.discount_percent),
    discountAmount: Number(row.discount_amount),
    taxRate: Number(row.tax_rate),
    taxAmount: Number(row.tax_amount),
    total: Number(row.total),
    amountTendered: Number(row.amount_tendered),
    changeDue: Number(row.change_due),
    transactionId: row.transaction_id ? String(row.transaction_id) : undefined,
    returnStatus,
    refundedAmount: Number(row.refunded_amount ?? 0),
    returnedAt: row.returned_at ? String(row.returned_at) : undefined,
    returnNote: row.return_note ? String(row.return_note) : undefined,
  };
}

function mapOrderToRow(order: OrderRecord, userId: string) {
  return {
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
}

function mapUdhaarCustomerFromRow(row: Record<string, unknown>): UdhaarCustomer {
  const schedule = (row.reminder_schedule as ReminderSchedule) || 'none';
  return {
    id: String(row.id),
    name: String(row.name),
    phone: String(row.customer_phone || row.phone || ''),
    notes: String(row.notes ?? ''),
    reminderSchedule: schedule,
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : undefined,
    createdAt: String(row.created_at),
  };
}

function mapUdhaarCustomerToRow(customer: UdhaarCustomer, userId: string) {
  return {
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
  const quantity = Number(row.quantity ?? 0);
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
    quantity,
    unitCost,
    lineTotal,
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

  return {
    id,
    vendorId,
    vendorName:
      typeof row.vendor_name === 'string' && row.vendor_name.trim()
        ? row.vendor_name
        : resolvedVendorName,
    invoiceNumber: String(row.invoice_number ?? ''),
    totalAmount,
    paidAmount,
    balanceDue,
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
    adjustmentType: row.adjustment_type as InventoryAdjustment['adjustmentType'],
    quantityChange: Number(row.quantity_change ?? 0),
    previousStock: Number(row.previous_stock ?? 0),
    newStock: Number(row.new_stock ?? 0),
    reason: String(row.reason ?? ''),
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
    createdAt: String(row.created_at),
  };
}

function mapCustomerToRow(customer: Customer, userId: string) {
  return {
    id: customer.id,
    user_id: userId,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    balance: Math.max(0, customer.balance),
    created_at: customer.createdAt,
  };
}

function mapEmployeeFromRow(row: Record<string, unknown>): Employee {
  return {
    id: String(row.id),
    name: String(row.name),
    phone: String(row.phone ?? ''),
    role: row.role as Employee['role'],
    pinCode: String(row.pin_code ?? '1234'),
    isActive: row.is_active !== false,
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
    pin_code: employee.pinCode,
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
  return {
    storeName: String(row.store_name || fallbackShopName || 'Khaas Retail'),
    phone: String(row.phone ?? '+92 42 3578 9021'),
    address: String(row.address ?? 'Plot 14-B, Gulberg III, Lahore'),
    taxNumber: String(row.tax_number ?? 'STRN: 32-08-9410-221-4'),
    receiptFooter: String(
      row.receipt_footer ?? 'Thank you for shopping at Khaas Retail!'
    ),
    jazzcashAccountTitle: String(row.jazzcash_account_title ?? ''),
    jazzcashAccountNumber: String(row.jazzcash_account_number ?? ''),
    easypaisaAccountTitle: String(row.easypaisa_account_title ?? ''),
    easypaisaAccountNumber: String(row.easypaisa_account_number ?? ''),
  };
}

function mapStoreSettingsToRow(settings: StoreSettings, userId: string) {
  return {
    user_id: userId,
    store_name: settings.storeName,
    phone: settings.phone,
    address: settings.address,
    tax_number: settings.taxNumber,
    receipt_footer: settings.receiptFooter,
    jazzcash_account_title: settings.jazzcashAccountTitle ?? '',
    jazzcash_account_number: settings.jazzcashAccountNumber ?? '',
    easypaisa_account_title: settings.easypaisaAccountTitle ?? '',
    easypaisa_account_number: settings.easypaisaAccountNumber ?? '',
    updated_at: new Date().toISOString(),
  };
}

function mapExpenseFromRow(row: Record<string, unknown>): ExpenseRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    category: (row.category as ExpenseRecord['category']) || 'Other',
    amount: Number(row.amount ?? 0),
    notes: String(row.notes ?? ''),
    expenseDate: String(row.expense_date ?? '').slice(0, 10),
    createdAt: String(row.created_at),
  };
}

function mapExpenseToRow(expense: ExpenseRecord, userId: string) {
  return {
    id: expense.id,
    user_id: userId,
    title: expense.title,
    category: expense.category,
    amount: Math.max(0, expense.amount),
    notes: expense.notes,
    expense_date: expense.expenseDate,
    created_at: expense.createdAt,
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
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function fetchWorkspaceData(
  userId: string,
  shopName?: string
): Promise<ShopkeeperWorkspaceData> {
  const browserOffline =
    typeof navigator !== 'undefined' && navigator.onLine === false;

  if (isSupabaseConfigured && supabase && !browserOffline) {
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
        supabase
          .from('employees')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: true }),
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
        const localFallback = loadLocalWorkspace(userId, shopName);
        if (isNetworkLossError(firstError.message)) {
          return {
            ...localFallback,
            cloudSyncError: null,
            isOffline: true,
          };
        }
        return {
          ...localFallback,
          cloudSyncError: firstError.message,
          isOffline: false,
        };
      }

      let products = (prodRes.data ?? []).map(mapProductFromRow);
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
      let employees = (empRes.data ?? []).map(mapEmployeeFromRow);
      const expenses = (expRes.data ?? []).map(mapExpenseFromRow);
      let storeSettings = mapStoreSettingsFromRow(
        settingsRes.data as Record<string, unknown> | null,
        shopName
      );

      let seedError: string | null = null;

      // Seed starter catalog on first login for a brand-new shopkeeper
      if (products.length === 0 && orders.length === 0) {
        const starter = buildStarterProducts(userId);
        const { error: seedErr } = await supabase
          .from('products')
          .upsert(starter.map((p) => mapProductToRow(p, userId)), {
            onConflict: 'id',
          });
        products = starter;
        if (seedErr) {
          seedError = seedErr.message;
        }
      }

      // Ensure at least one Admin employee exists so the shopkeeper is never locked out
      if (employees.length === 0) {
        const defaultAdmin = buildDefaultAdminEmployee(userId);
        const { error: empSeedErr } = await supabase
          .from('employees')
          .upsert(mapEmployeeToRow(defaultAdmin, userId), {
            onConflict: 'id',
          });
        employees = [defaultAdmin];
        if (empSeedErr && !seedError) {
          seedError = empSeedErr.message;
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
          if (qItem.newUdhaarCustomer && !udhaarCustomers.some((c) => c.id === qItem.newUdhaarCustomer!.id)) {
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
      return workspace;
    } catch (err) {
      const localFallback = loadLocalWorkspace(userId, shopName);
      const errMsg =
        err instanceof Error ? err.message : 'Unable to reach Supabase.';
      const offlineErr = isNetworkLossError(errMsg) || browserOffline;
      return {
        ...localFallback,
        cloudSyncError: offlineErr ? null : errMsg,
        isOffline: offlineErr,
      };
    }
  }

  return {
    ...loadLocalWorkspace(userId, shopName),
    cloudSyncError: null,
    isOffline: browserOffline,
  };
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
    const { error } = await supabase
      .from('products')
      .upsert(mapProductToRow(product, userId));
    if (error) return error.message;
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
      .upsert(mapOrderToRow(order, userId), { onConflict: 'id' });
    if (ordErr) {
      if (
        /transaction_id|return_status|refunded_amount|returned_at|return_note/i.test(
          ordErr.message
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
          error: ordErr.message,
          networkFailure: isNetworkLossError(ordErr.message),
        };
      }
    }

    const soldIds = new Set(order.items.map((i) => i.productId));
    const productsToUpdate = updatedProducts.filter((p) => soldIds.has(p.id));
    if (productsToUpdate.length > 0) {
      const { error: stockErr } = await supabase
        .from('products')
        .upsert(productsToUpdate.map((p) => mapProductToRow(p, userId)));
      if (stockErr) {
        return {
          error: stockErr.message,
          networkFailure: isNetworkLossError(stockErr.message),
        };
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
  restockedProducts: Product[]
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
    if (restockedProducts.length > 0) {
      const { error: prodErr } = await supabase
        .from('products')
        .upsert(restockedProducts.map((p) => mapProductToRow(p, userId)));
      if (prodErr) return prodErr.message;
    }

    const { error: ordErr } = await supabase
      .from('orders')
      .upsert(mapOrderToRow(updatedOrder, userId), { onConflict: 'id' });

    if (ordErr) {
      // Fallback if user has not yet added the optional return_* columns in SQL Editor
      if (/return_status|refunded_amount|returned_at|return_note/i.test(ordErr.message)) {
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
        return ordErr.message;
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
}> {
  const allQueue = getOfflineQueue();
  const userQueue = allQueue
    .filter((item) => item.userId === userId)
    .sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

  if (userQueue.length === 0) {
    return {
      syncedCount: 0,
      remainingCount: 0,
      syncError: null,
      offlineStill: false,
    };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      syncedCount: 0,
      remainingCount: userQueue.length,
      syncError: null,
      offlineStill: true,
    };
  }

  if (!isSupabaseConfigured || !supabase) {
    // Local-only mode: clear local queue cleanly
    const otherUsers = allQueue.filter((item) => item.userId !== userId);
    saveOfflineQueue(otherUsers);
    return {
      syncedCount: userQueue.length,
      remainingCount: 0,
      syncError: null,
      offlineStill: false,
    };
  }

  const syncedIds = new Set<string>();
  let lastError: string | null = null;
  let offlineStill = false;

  for (const item of userQueue) {
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
      break;
    }

    syncedIds.add(item.id);
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
    const { error: custErr } = await supabase
      .from('udhaar_customers')
      .upsert(mapUdhaarCustomerToRow(customer, userId));
    if (custErr) return custErr.message;

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
      .upsert(mapUdhaarCustomerToRow(customer, userId));
    if (error) return error.message;
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
    status: 'received',
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
    quantity: item.quantity,
    unit_cost: item.unitCost,
    cost_price: item.unitCost,
    line_total: item.lineTotal,
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
      quantity_change: a.quantityChange,
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
    adjustment_type: a.adjustmentType,
    quantity_change: a.quantityChange,
    previous_stock: a.previousStock,
    new_stock: a.newStock,
    reason: a.reason,
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
      const { error: prodErr } = await supabase
        .from('products')
        .upsert(productsToUpdate.map((p) => mapProductToRow(p, userId)));
      if (prodErr) return prodErr.message;
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

    const { error: prodErr } = await supabase
      .from('products')
      .upsert(mapProductToRow(updatedProduct, userId));
    if (prodErr) return prodErr.message;
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
      .upsert(mapCustomerToRow(customer, userId));
    if (error) return error.message;
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
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', customerId)
      .eq('user_id', userId);
    if (error) return error.message;
  }
  return null;
}

export async function upsertEmployeeRecord(
  userId: string,
  employee: Employee
): Promise<string | null> {
  const ws = loadLocalWorkspace(userId);
  const exists = ws.employees.some((e) => e.id === employee.id);
  ws.employees = exists
    ? ws.employees.map((e) => (e.id === employee.id ? employee : e))
    : [...ws.employees, employee];
  saveLocalWorkspace(userId, ws);

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('employees')
      .upsert(mapEmployeeToRow(employee, userId));
    if (error) return error.message;
  }
  return null;
}

export async function deleteEmployeeRecord(
  userId: string,
  employeeId: string
): Promise<string | null> {
  const ws = loadLocalWorkspace(userId);
  ws.employees = ws.employees.filter((e) => e.id !== employeeId);
  saveLocalWorkspace(userId, ws);

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', employeeId)
      .eq('user_id', userId);
    if (error) return error.message;
  }
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
    const { error } = await supabase
      .from('store_settings')
      .upsert(mapStoreSettingsToRow(settings, userId));
    if (error) {
      if (/jazzcash_account|easypaisa_account/i.test(error.message)) {
        const { error: coreErr } = await supabase.from('store_settings').upsert({
          user_id: userId,
          store_name: settings.storeName,
          phone: settings.phone,
          address: settings.address,
          tax_number: settings.taxNumber,
          receipt_footer: settings.receiptFooter,
          updated_at: new Date().toISOString(),
        });
        if (coreErr) return coreErr.message;
        return error.message;
      }
      return error.message;
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

    // Tier 2: Delete intermediate parent tables
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

    // Tier 3: Delete vendors (parent of purchases)
    const delVend = await supabase.from('vendors').delete().eq('user_id', userId);
    if (delVend.error) return failWithCurrentCloudState(delVend.error.message);

    // Tier 4: Insert independent root/parent tables in parallel
    const tier4Results = await Promise.all([
      supabase
        .from('products')
        .upsert(demoData.products.map((p) => mapProductToRow(p, userId)), {
          onConflict: 'id',
        }),
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
      demoData.employees.length > 0
        ? supabase
            .from('employees')
            .upsert(demoData.employees.map((e) => mapEmployeeToRow(e, userId)), {
              onConflict: 'id',
            })
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

    saveLocalWorkspace(userId, demoData);
    return { ...demoData, cloudSyncError: null, isOffline: false };
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
      .upsert(mapExpenseToRow(expense, userId));
    if (error) return error.message;
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
    planName: isSuperAdminEmail(email) ? 'Super Admin License' : '30-Day Free Trial',
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

  const localSubs = loadLocalSubscriptions();
  const nextLocal = localSubs.some((s) => s.userId === updated.userId)
    ? localSubs.map((s) => (s.userId === updated.userId ? updated : s))
    : [updated, ...localSubs];
  saveLocalSubscriptions(nextLocal);

  if (isSupabaseConfigured && supabase) {
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
      return { updated, error: error.message };
    }
  }

  return { updated, error: null };
}

