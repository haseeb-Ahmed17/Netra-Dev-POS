import {
  INITIAL_PRODUCTS,
  createDefaultStoreSettings,
  createInitialCustomers,
  createInitialEmployees,
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
  InventoryAdjustment,
  OfflineQueuedSale,
  OrderRecord,
  Product,
  PurchaseItem,
  PurchaseRecord,
  ShopkeeperUser,
  StoreSettings,
  UdhaarCustomer,
  UdhaarEntry,
  Vendor,
} from '../types';
import { isSupabaseConfigured, supabase } from './supabaseClient';

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

function buildStarterWorkspace(
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
      storeSettings: defaultSettings,
    };
  }
  const prefix = userId.slice(0, 8);
  return {
    products,
    orders: createInitialOrders().map((o) => ({
      ...o,
      id: `${prefix}-${o.id}`,
      customerId: o.customerId ? `${prefix}-${o.customerId}` : undefined,
      udhaarCustomerId: o.udhaarCustomerId ? `${prefix}-${o.udhaarCustomerId}` : undefined,
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
      id: `${prefix}-${v.id}`,
    })),
    purchases: createInitialPurchases().map((p) => ({
      ...p,
      id: `${prefix}-${p.id}`,
      vendorId: `${prefix}-${p.vendorId}`,
      items: p.items.map((pi) => ({
        ...pi,
        id: `${prefix}-${pi.id}`,
        purchaseId: `${prefix}-${pi.purchaseId}`,
        productId: `${prefix}-${pi.productId}`,
      })),
    })),
    inventoryAdjustments: createInitialInventoryAdjustments().map((a) => ({
      ...a,
      id: `${prefix}-${a.id}`,
      productId: `${prefix}-${a.productId}`,
    })),
    customers: createInitialCustomers().map((c) => ({
      ...c,
      id: `${prefix}-${c.id}`,
    })),
    employees: createInitialEmployees().map((emp) => ({
      ...emp,
      id: `${prefix}-${emp.id}`,
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
            id: `${userId.slice(0, 8)}-${c.id}`,
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
  };
}

function mapUdhaarCustomerFromRow(row: Record<string, unknown>): UdhaarCustomer {
  return {
    id: String(row.id),
    name: String(row.name),
    phone: String(row.phone ?? ''),
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at),
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

function mapPurchaseItemFromRow(row: Record<string, unknown>): PurchaseItem {
  return {
    id: String(row.id),
    purchaseId: String(row.purchase_id),
    productId: String(row.product_id),
    productName: String(row.product_name),
    sku: String(row.sku ?? ''),
    quantity: Number(row.quantity ?? 0),
    unitCost: Number(row.unit_cost ?? 0),
    lineTotal: Number(row.line_total ?? 0),
  };
}

function mapPurchaseFromRow(
  row: Record<string, unknown>,
  itemsByPurchase: Map<string, PurchaseItem[]>
): PurchaseRecord {
  const id = String(row.id);
  return {
    id,
    vendorId: String(row.vendor_id),
    vendorName: String(row.vendor_name ?? ''),
    invoiceNumber: String(row.invoice_number ?? ''),
    totalAmount: Number(row.total_amount ?? 0),
    paidAmount: Number(row.paid_amount ?? 0),
    balanceDue: Number(row.balance_due ?? 0),
    note: String(row.note ?? ''),
    items: itemsByPurchase.get(id) ?? [],
    createdAt: String(row.created_at),
  };
}

function mapAdjustmentFromRow(row: Record<string, unknown>): InventoryAdjustment {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    productName: String(row.product_name),
    sku: String(row.sku ?? ''),
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
    updated_at: new Date().toISOString(),
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

      const itemsByPurchase = new Map<string, PurchaseItem[]>();
      for (const rawItem of purItemsRes.data ?? []) {
        const mapped = mapPurchaseItemFromRow(rawItem as Record<string, unknown>);
        const list = itemsByPurchase.get(mapped.purchaseId) ?? [];
        list.push(mapped);
        itemsByPurchase.set(mapped.purchaseId, list);
      }
      const purchases = (purRes.data ?? []).map((row) =>
        mapPurchaseFromRow(row as Record<string, unknown>, itemsByPurchase)
      );
      const inventoryAdjustments = (adjRes.data ?? []).map(mapAdjustmentFromRow);
      let customers = (crmCustRes.data ?? []).map(mapCustomerFromRow);
      let employees = (empRes.data ?? []).map(mapEmployeeFromRow);
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
          .insert(starter.map((p) => mapProductToRow(p, userId)));
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
          .insert(mapEmployeeToRow(defaultAdmin, userId));
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
  updatedCustomer?: Customer
): Promise<{ error: string | null; networkFailure: boolean }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: null, networkFailure: false };
  }

  try {
    const { error: ordErr } = await supabase
      .from('orders')
      .upsert(mapOrderToRow(order, userId), { onConflict: 'id' });
    if (ordErr) {
      return {
        error: ordErr.message,
        networkFailure: isNetworkLossError(ordErr.message),
      };
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
  updatedCustomer?: Customer
): Promise<{ syncError: string | null; queuedOffline: boolean }> {
  const ws = loadLocalWorkspace(userId);
  ws.orders = [...ws.orders, order];
  ws.products = updatedProducts;
  if (newUdhaarEntry) {
    ws.udhaarEntries = [...ws.udhaarEntries, newUdhaarEntry];
  }
  if (updatedCustomer) {
    ws.customers = ws.customers.map((c) =>
      c.id === updatedCustomer.id ? updatedCustomer : c
    );
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
      updatedCustomer
    );
    if (res.networkFailure) {
      enqueueOfflineSale({
        id: order.id,
        userId,
        createdAt: order.createdAt,
        order,
        updatedProducts,
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
      item.updatedCustomer
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
    const { error: custErr } = await supabase.from('udhaar_customers').insert({
      id: customer.id,
      user_id: userId,
      name: customer.name,
      phone: customer.phone,
      notes: customer.notes ?? '',
      created_at: customer.createdAt,
    });
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
    const { error: purErr } = await supabase.from('purchases').insert({
      id: purchase.id,
      user_id: userId,
      vendor_id: purchase.vendorId,
      vendor_name: purchase.vendorName,
      invoice_number: purchase.invoiceNumber,
      total_amount: purchase.totalAmount,
      paid_amount: purchase.paidAmount,
      balance_due: purchase.balanceDue,
      note: purchase.note,
      created_at: purchase.createdAt,
    });
    if (purErr) return purErr.message;

    if (purchase.items.length > 0) {
      const { error: itemsErr } = await supabase.from('purchase_items').insert(
        purchase.items.map((item) => ({
          id: item.id,
          user_id: userId,
          purchase_id: purchase.id,
          product_id: item.productId,
          product_name: item.productName,
          sku: item.sku,
          quantity: item.quantity,
          unit_cost: item.unitCost,
          line_total: item.lineTotal,
        }))
      );
      if (itemsErr) return itemsErr.message;
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
    const { error: adjErr } = await supabase
      .from('inventory_adjustments')
      .insert({
        id: adjustment.id,
        user_id: userId,
        product_id: adjustment.productId,
        product_name: adjustment.productName,
        sku: adjustment.sku,
        adjustment_type: adjustment.adjustmentType,
        quantity_change: adjustment.quantityChange,
        previous_stock: adjustment.previousStock,
        new_stock: adjustment.newStock,
        reason: adjustment.reason,
        created_at: adjustment.createdAt,
      });
    if (adjErr) return adjErr.message;

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
    if (error) return error.message;
  }
  return null;
}

export async function resetUserDemoWorkspace(
  userId: string,
  shopName?: string
): Promise<ShopkeeperWorkspaceData> {
  const demoData = buildStarterWorkspace(userId, true, shopName);
  saveLocalWorkspace(userId, demoData);

  if (isSupabaseConfigured && supabase) {
    const delResults = await Promise.all([
      supabase.from('purchase_items').delete().eq('user_id', userId),
      supabase.from('inventory_adjustments').delete().eq('user_id', userId),
      supabase.from('udhaar_entries').delete().eq('user_id', userId),
    ]);
    const delErr1 = delResults.find((r) => r.error)?.error;
    if (delErr1) return { ...demoData, cloudSyncError: delErr1.message };

    const delResults2 = await Promise.all([
      supabase.from('purchases').delete().eq('user_id', userId),
      supabase.from('udhaar_customers').delete().eq('user_id', userId),
      supabase.from('orders').delete().eq('user_id', userId),
      supabase.from('products').delete().eq('user_id', userId),
      supabase.from('customers').delete().eq('user_id', userId),
      supabase.from('employees').delete().eq('user_id', userId),
    ]);
    const delErr2 = delResults2.find((r) => r.error)?.error;
    if (delErr2) return { ...demoData, cloudSyncError: delErr2.message };

    const delVend = await supabase.from('vendors').delete().eq('user_id', userId);
    if (delVend.error) return { ...demoData, cloudSyncError: delVend.error.message };

    const insProd = await supabase
      .from('products')
      .insert(demoData.products.map((p) => mapProductToRow(p, userId)));
    if (insProd.error) {
      return { ...demoData, cloudSyncError: insProd.error.message };
    }

    const insOrd = await supabase
      .from('orders')
      .insert(demoData.orders.map((o) => mapOrderToRow(o, userId)));
    if (insOrd.error) {
      return { ...demoData, cloudSyncError: insOrd.error.message };
    }

    const insCust = await supabase.from('udhaar_customers').insert(
      demoData.udhaarCustomers.map((c) => ({
        id: c.id,
        user_id: userId,
        name: c.name,
        phone: c.phone,
        notes: c.notes ?? '',
        created_at: c.createdAt,
      }))
    );
    if (insCust.error) {
      return { ...demoData, cloudSyncError: insCust.error.message };
    }

    const insEnt = await supabase.from('udhaar_entries').insert(
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
    );
    if (insEnt.error) {
      return { ...demoData, cloudSyncError: insEnt.error.message };
    }

    const insVend = await supabase
      .from('vendors')
      .insert(demoData.vendors.map((v) => mapVendorToRow(v, userId)));
    if (insVend.error) {
      return { ...demoData, cloudSyncError: insVend.error.message };
    }

    const insPur = await supabase.from('purchases').insert(
      demoData.purchases.map((p) => ({
        id: p.id,
        user_id: userId,
        vendor_id: p.vendorId,
        vendor_name: p.vendorName,
        invoice_number: p.invoiceNumber,
        total_amount: p.totalAmount,
        paid_amount: p.paidAmount,
        balance_due: p.balanceDue,
        note: p.note,
        created_at: p.createdAt,
      }))
    );
    if (insPur.error) {
      return { ...demoData, cloudSyncError: insPur.error.message };
    }

    const allPurchaseItems = demoData.purchases.flatMap((p) =>
      p.items.map((item) => ({
        id: item.id,
        user_id: userId,
        purchase_id: p.id,
        product_id: item.productId,
        product_name: item.productName,
        sku: item.sku,
        quantity: item.quantity,
        unit_cost: item.unitCost,
        line_total: item.lineTotal,
      }))
    );
    if (allPurchaseItems.length > 0) {
      const insPurItems = await supabase
        .from('purchase_items')
        .insert(allPurchaseItems);
      if (insPurItems.error) {
        return { ...demoData, cloudSyncError: insPurItems.error.message };
      }
    }

    if (demoData.inventoryAdjustments.length > 0) {
      const insAdj = await supabase.from('inventory_adjustments').insert(
        demoData.inventoryAdjustments.map((a) => ({
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
        }))
      );
      if (insAdj.error) {
        return { ...demoData, cloudSyncError: insAdj.error.message };
      }
    }

    if (demoData.customers.length > 0) {
      const insCrm = await supabase
        .from('customers')
        .insert(demoData.customers.map((c) => mapCustomerToRow(c, userId)));
      if (insCrm.error) {
        return { ...demoData, cloudSyncError: insCrm.error.message };
      }
    }

    if (demoData.employees.length > 0) {
      const insEmp = await supabase
        .from('employees')
        .insert(demoData.employees.map((e) => mapEmployeeToRow(e, userId)));
      if (insEmp.error) {
        return { ...demoData, cloudSyncError: insEmp.error.message };
      }
    }

    const insSet = await supabase
      .from('store_settings')
      .upsert(mapStoreSettingsToRow(demoData.storeSettings, userId));
    if (insSet.error) {
      return { ...demoData, cloudSyncError: insSet.error.message };
    }
  }

  return { ...demoData, cloudSyncError: null };
}
