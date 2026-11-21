import {
  INITIAL_PRODUCTS,
  createInitialOrders,
  createInitialUdhaarCustomers,
  createInitialUdhaarEntries,
} from '../data/initialData';
import type {
  OrderRecord,
  Product,
  ShopkeeperUser,
  UdhaarCustomer,
  UdhaarEntry,
} from '../types';
import { isSupabaseConfigured, supabase } from './supabaseClient';

export interface ShopkeeperWorkspaceData {
  products: Product[];
  orders: OrderRecord[];
  udhaarCustomers: UdhaarCustomer[];
  udhaarEntries: UdhaarEntry[];
  cloudSyncError?: string | null;
}

interface StoredLocalAccount {
  id: string;
  email: string;
  password: string;
  shopName: string;
}

const LOCAL_ACCOUNTS_KEY = 'khaas_pos_local_accounts_v1';
const LOCAL_SESSION_KEY = 'khaas_pos_local_session_v1';

function userDataKey(userId: string): string {
  return `khaas_pos_workspace_${userId}_v1`;
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

function buildStarterWorkspace(userId: string, includeDemoOrders: boolean): ShopkeeperWorkspaceData {
  const products = buildStarterProducts(userId);
  if (!includeDemoOrders) {
    return {
      products,
      orders: [],
      udhaarCustomers: [],
      udhaarEntries: [],
    };
  }
  const prefix = userId.slice(0, 8);
  return {
    products,
    orders: createInitialOrders().map((o) => ({
      ...o,
      id: `${prefix}-${o.id}`,
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
  };
}

function loadLocalWorkspace(userId: string): ShopkeeperWorkspaceData {
  try {
    const raw = localStorage.getItem(userDataKey(userId));
    if (raw) {
      return JSON.parse(raw) as ShopkeeperWorkspaceData;
    }
  } catch {
    // ignore
  }
  const isDemo = userId === 'demo-shopkeeper-1';
  const starter = buildStarterWorkspace(userId, isDemo);
  saveLocalWorkspace(userId, starter);
  return starter;
}

function saveLocalWorkspace(userId: string, data: ShopkeeperWorkspaceData): void {
  try {
    localStorage.setItem(userDataKey(userId), JSON.stringify(data));
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
  saveLocalWorkspace(newAccount.id, buildStarterWorkspace(newAccount.id, false));
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

export async function fetchWorkspaceData(
  userId: string
): Promise<ShopkeeperWorkspaceData> {
  if (isSupabaseConfigured && supabase) {
    try {
      const [prodRes, ordRes, custRes, entryRes] = await Promise.all([
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
      ]);

      const firstError =
        prodRes.error || ordRes.error || custRes.error || entryRes.error;

      if (firstError) {
        const localFallback = loadLocalWorkspace(userId);
        return {
          ...localFallback,
          cloudSyncError: firstError.message,
        };
      }

      let products = (prodRes.data ?? []).map(mapProductFromRow);
      const orders = (ordRes.data ?? []).map(mapOrderFromRow);
      const udhaarCustomers = (custRes.data ?? []).map(mapUdhaarCustomerFromRow);
      const udhaarEntries = (entryRes.data ?? []).map(mapUdhaarEntryFromRow);
      let seedError: string | null = null;

      // Seed starter catalog on first login for a brand-new shopkeeper
      if (products.length === 0 && orders.length === 0) {
        const starter = buildStarterProducts(userId);
        const { error: seedErr } = await supabase
          .from('products')
          .insert(starter.map((p) => mapProductToRow(p, userId)));
        if (!seedErr) {
          products = starter;
        } else {
          products = starter;
          seedError = seedErr.message;
        }
      }

      const workspace: ShopkeeperWorkspaceData = {
        products,
        orders,
        udhaarCustomers,
        udhaarEntries,
        cloudSyncError: seedError,
      };
      saveLocalWorkspace(userId, {
        products,
        orders,
        udhaarCustomers,
        udhaarEntries,
      });
      return workspace;
    } catch (err) {
      const localFallback = loadLocalWorkspace(userId);
      return {
        ...localFallback,
        cloudSyncError:
          err instanceof Error ? err.message : 'Unable to reach Supabase.',
      };
    }
  }

  return {
    ...loadLocalWorkspace(userId),
    cloudSyncError: null,
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

export async function insertOrderRecord(
  userId: string,
  order: OrderRecord,
  updatedProducts: Product[],
  newUdhaarEntry?: UdhaarEntry
): Promise<string | null> {
  const ws = loadLocalWorkspace(userId);
  ws.orders = [...ws.orders, order];
  ws.products = updatedProducts;
  if (newUdhaarEntry) {
    ws.udhaarEntries = [...ws.udhaarEntries, newUdhaarEntry];
  }
  saveLocalWorkspace(userId, ws);

  if (isSupabaseConfigured && supabase) {
    const { error: ordErr } = await supabase
      .from('orders')
      .insert(mapOrderToRow(order, userId));
    if (ordErr) return ordErr.message;

    // Persist decremented stock counts for sold products
    const soldIds = new Set(order.items.map((i) => i.productId));
    const productsToUpdate = updatedProducts.filter((p) => soldIds.has(p.id));
    if (productsToUpdate.length > 0) {
      const { error: stockErr } = await supabase
        .from('products')
        .upsert(productsToUpdate.map((p) => mapProductToRow(p, userId)));
      if (stockErr) return stockErr.message;
    }

    if (newUdhaarEntry) {
      const { error: ueErr } = await supabase.from('udhaar_entries').insert({
        id: newUdhaarEntry.id,
        user_id: userId,
        customer_id: newUdhaarEntry.customerId,
        type: newUdhaarEntry.type,
        amount: newUdhaarEntry.amount,
        note: newUdhaarEntry.note,
        receipt_number: newUdhaarEntry.receiptNumber ?? null,
        created_at: newUdhaarEntry.createdAt,
      });
      if (ueErr) return ueErr.message;
    }
  }
  return null;
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

export async function resetUserDemoWorkspace(
  userId: string
): Promise<ShopkeeperWorkspaceData> {
  const demoData = buildStarterWorkspace(userId, true);
  saveLocalWorkspace(userId, demoData);

  if (isSupabaseConfigured && supabase) {
    const results = await Promise.all([
      supabase.from('udhaar_entries').delete().eq('user_id', userId),
      supabase.from('udhaar_customers').delete().eq('user_id', userId),
      supabase.from('orders').delete().eq('user_id', userId),
      supabase.from('products').delete().eq('user_id', userId),
    ]);
    const delErr = results.find((r) => r.error)?.error;
    if (delErr) {
      return { ...demoData, cloudSyncError: delErr.message };
    }

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
  }

  return { ...demoData, cloudSyncError: null };
}
