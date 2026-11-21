import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, WifiOff, X } from 'lucide-react';
import { AuthView } from './components/AuthView';
import { CloudSyncBanner } from './components/CloudSyncBanner';
import { CustomersView } from './components/CustomersView';
import { ExecutiveDashboardView } from './components/ExecutiveDashboardView';
import { InventoryReportView } from './components/InventoryReportView';
import { InventoryView } from './components/InventoryView';
import { PosBillingView } from './components/PosBillingView';
import { PurchasesView } from './components/PurchasesView';
import { ReceiptModal } from './components/ReceiptModal';
import { StaffPinModal } from './components/StaffPinModal';
import { StaffView } from './components/StaffView';
import { StoreSettingsView } from './components/StoreSettingsView';
import { TopBar } from './components/TopBar';
import { TransactionsView } from './components/TransactionsView';
import { UdhaarView } from './components/UdhaarView';
import { VendorsView } from './components/VendorsView';
import { createDefaultStoreSettings } from './data/initialData';
import { TRANSLATIONS } from './i18n';
import {
  deleteCustomerRecord,
  deleteEmployeeRecord,
  deleteProductRecord,
  fetchWorkspaceData,
  getActiveShopkeeper,
  getOfflineQueue,
  insertInventoryAdjustmentRecord,
  insertOrderRecord,
  insertPurchaseRecord,
  insertUdhaarCustomerRecord,
  insertUdhaarEntryRecord,
  resetUserDemoWorkspace,
  signInShopkeeper,
  signOutShopkeeper,
  signUpShopkeeper,
  syncOfflineQueue,
  upsertCustomerRecord,
  upsertEmployeeRecord,
  upsertProductRecord,
  upsertStoreSettingsRecord,
  upsertVendorRecord,
} from './lib/posRepository';
import { isSupabaseConfigured, supabase } from './lib/supabaseClient';
import type {
  AdjustmentType,
  CartItem,
  Customer,
  Employee,
  EmployeeRole,
  InventoryAdjustment,
  Language,
  NavTab,
  OrderLineItem,
  OrderRecord,
  PaymentMethod,
  Product,
  PurchaseItem,
  PurchaseRecord,
  ShopkeeperUser,
  StoreSettings,
  UdhaarCustomer,
  UdhaarEntry,
  UdhaarEntryType,
  Vendor,
} from './types';

const LANG_STORAGE_KEY = 'khaas_pos_lang_v1';

const ROLE_ALLOWED_TABS: Record<EmployeeRole, NavTab[]> = {
  admin: [
    'pos',
    'dashboard',
    'transactions',
    'inventory',
    'inventory_report',
    'purchases',
    'vendors',
    'customers',
    'udhaar',
    'staff',
    'settings',
  ],
  manager: [
    'pos',
    'dashboard',
    'transactions',
    'inventory',
    'inventory_report',
    'purchases',
    'vendors',
    'customers',
    'udhaar',
  ],
  cashier: ['pos', 'transactions', 'customers'],
};

function activeStaffStorageKey(userId: string): string {
  return `khaas_pos_active_staff_${userId}_v1`;
}

function loadStoredLang(): Language {
  try {
    const raw = localStorage.getItem(LANG_STORAGE_KEY);
    if (raw === 'ur' || raw === 'en') return raw;
  } catch {
    // ignore
  }
  return 'en';
}

export default function App() {
  const [lang, setLang] = useState<Language>(loadStoredLang);
  const [user, setUser] = useState<ShopkeeperUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [retryingSync, setRetryingSync] = useState(false);

  const [activeTab, setActiveTab] = useState<NavTab>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [udhaarCustomers, setUdhaarCustomers] = useState<UdhaarCustomer[]>([]);
  const [udhaarEntries, setUdhaarEntries] = useState<UdhaarEntry[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [inventoryAdjustments, setInventoryAdjustments] = useState<InventoryAdjustment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(() =>
    createDefaultStoreSettings()
  );

  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(null);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [isScreenLocked, setIsScreenLocked] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeReceiptOrder, setActiveReceiptOrder] = useState<OrderRecord | null>(null);
  const [latestNewOrderId, setLatestNewOrderId] = useState<string | null>(null);

  const [browserOnline, setBrowserOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  );
  const [networkReachable, setNetworkReachable] = useState<boolean>(true);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isSyncingOffline, setIsSyncingOffline] = useState<boolean>(false);
  const [syncToastMessage, setSyncToastMessage] = useState<string | null>(null);
  const [offlineSaleNotice, setOfflineSaleNotice] = useState<boolean>(false);
  const syncInFlightRef = useRef<boolean>(false);

  const t = TRANSLATIONS[lang];
  const isEffectiveOnline = browserOnline && networkReachable;

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // ignore storage errors
    }
  }, [lang]);

  // Restore active shopkeeper session & subscribe to Supabase auth changes if configured
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const activeUser = await getActiveShopkeeper();
        if (mounted) {
          setUser(activeUser);
        }
      } finally {
        if (mounted) {
          setAuthReady(true);
        }
      }
    }

    initAuth();

    if (isSupabaseConfigured && supabase) {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return;
        if (session?.user) {
          setUser({
            id: session.user.id,
            email: session.user.email ?? '',
            shopName:
              (session.user.user_metadata?.shop_name as string) || 'Khaas Retail',
          });
        } else {
          setUser(null);
        }
      });
      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
    }

    return () => {
      mounted = false;
    };
  }, []);

  const applyWorkspaceData = useCallback(
    (
      userId: string,
      ws: Awaited<ReturnType<typeof fetchWorkspaceData>>
    ) => {
      setProducts(ws.products);
      setOrders(ws.orders);
      setUdhaarCustomers(ws.udhaarCustomers);
      setUdhaarEntries(ws.udhaarEntries);
      setVendors(ws.vendors);
      setPurchases(ws.purchases);
      setInventoryAdjustments(ws.inventoryAdjustments);
      setCustomers(ws.customers);
      setEmployees(ws.employees);
      setStoreSettings(ws.storeSettings);
      setCloudSyncError(ws.cloudSyncError ?? null);
      setNetworkReachable(!ws.isOffline);
      setPendingSyncCount(getOfflineQueue(userId).length);

      const activeList = ws.employees.filter((e) => e.isActive);
      let restoredId: string | null = null;
      try {
        restoredId = localStorage.getItem(activeStaffStorageKey(userId));
      } catch {
        restoredId = null;
      }
      const validRestored = activeList.find((e) => e.id === restoredId);
      if (validRestored) {
        setActiveEmployeeId(validRestored.id);
      } else {
        const fallbackAdmin =
          activeList.find((e) => e.role === 'admin') ?? activeList[0] ?? null;
        setActiveEmployeeId(fallbackAdmin?.id ?? null);
      }
    },
    []
  );

  const loadWorkspace = useCallback(
    async (userId: string, shopName?: string) => {
      const ws = await fetchWorkspaceData(userId, shopName);
      applyWorkspaceData(userId, ws);
    },
    [applyWorkspaceData]
  );

  const runOfflineSync = useCallback(
    async (targetUserId: string, targetShopName?: string) => {
      if (syncInFlightRef.current) return;
      const queuedForUser = getOfflineQueue(targetUserId);
      if (queuedForUser.length === 0) {
        setPendingSyncCount(0);
        return;
      }

      syncInFlightRef.current = true;
      setIsSyncingOffline(true);
      try {
        const res = await syncOfflineQueue(targetUserId);
        setPendingSyncCount(res.remainingCount);
        setNetworkReachable(!res.offlineStill);

        if (res.syncError) {
          setCloudSyncError(res.syncError);
        }

        if (res.syncedCount > 0) {
          setOfflineSaleNotice(false);
          setSyncToastMessage(
            `${res.syncedCount} ${TRANSLATIONS[lang].offlineSyncedToast}`
          );
          await loadWorkspace(targetUserId, targetShopName);
        }
      } finally {
        syncInFlightRef.current = false;
        setIsSyncingOffline(false);
      }
    },
    [lang, loadWorkspace]
  );

  // Auto-dismiss sync confirmation toast
  useEffect(() => {
    if (!syncToastMessage) return;
    const timer = window.setTimeout(() => {
      setSyncToastMessage(null);
    }, 6500);
    return () => window.clearTimeout(timer);
  }, [syncToastMessage]);

  // Listen for browser online / offline transitions and auto-sync queued sales
  useEffect(() => {
    const handleOnline = () => {
      setBrowserOnline(true);
      setNetworkReachable(true);
      if (user) {
        void runOfflineSync(user.id, user.shopName);
      }
    };
    const handleOffline = () => {
      setBrowserOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user, runOfflineSync]);

  // Load private shopkeeper workspace data whenever user changes
  useEffect(() => {
    let active = true;

    if (!user) {
      setProducts([]);
      setOrders([]);
      setUdhaarCustomers([]);
      setUdhaarEntries([]);
      setVendors([]);
      setPurchases([]);
      setInventoryAdjustments([]);
      setCustomers([]);
      setEmployees([]);
      setStoreSettings(createDefaultStoreSettings());
      setActiveEmployeeId(null);
      setShowStaffModal(false);
      setIsScreenLocked(false);
      setCart([]);
      setActiveReceiptOrder(null);
      setLatestNewOrderId(null);
      setCloudSyncError(null);
      setPendingSyncCount(0);
      setOfflineSaleNotice(false);
      setSyncToastMessage(null);
      return;
    }

    setLoadingData(true);
    fetchWorkspaceData(user.id, user.shopName)
      .then((ws) => {
        if (!active) return;
        applyWorkspaceData(user.id, ws);
        if (
          !ws.isOffline &&
          (typeof navigator === 'undefined' || navigator.onLine !== false) &&
          getOfflineQueue(user.id).length > 0
        ) {
          void runOfflineSync(user.id, user.shopName);
        }
      })
      .finally(() => {
        if (active) setLoadingData(false);
      });

    return () => {
      active = false;
    };
  }, [user, applyWorkspaceData, runOfflineSync]);

  const activeEmployee = useMemo(() => {
    const activeList = employees.filter((e) => e.isActive);
    return (
      activeList.find((e) => e.id === activeEmployeeId) ??
      activeList.find((e) => e.role === 'admin') ??
      activeList[0] ??
      null
    );
  }, [employees, activeEmployeeId]);

  const activeRole: EmployeeRole = activeEmployee?.role ?? 'admin';

  // Persist selected active employee per shopkeeper user
  useEffect(() => {
    if (!user || !activeEmployee) return;
    try {
      localStorage.setItem(activeStaffStorageKey(user.id), activeEmployee.id);
    } catch {
      // ignore
    }
  }, [user, activeEmployee]);

  // Enforce role permissions on activeTab
  useEffect(() => {
    const allowed = ROLE_ALLOWED_TABS[activeRole];
    if (!allowed.includes(activeTab)) {
      setActiveTab('pos');
    }
  }, [activeRole, activeTab]);

  const handleRetrySync = async () => {
    if (!user) return;
    setRetryingSync(true);
    try {
      await loadWorkspace(user.id, user.shopName);
      if (getOfflineQueue(user.id).length > 0) {
        await runOfflineSync(user.id, user.shopName);
      }
    } finally {
      setRetryingSync(false);
    }
  };

  const handleToggleLanguage = () => {
    setLang((prev) => (prev === 'en' ? 'ur' : 'en'));
  };

  const handleSignIn = async (email: string, password: string) => {
    const signedIn = await signInShopkeeper(email, password);
    setUser(signedIn);
    setActiveTab('pos');
  };

  const handleSignUp = async (
    email: string,
    password: string,
    shopName: string
  ) => {
    const created = await signUpShopkeeper(email, password, shopName);
    setUser(created);
    setActiveTab('pos');
  };

  const handleLogout = async () => {
    await signOutShopkeeper();
    setUser(null);
    setIsScreenLocked(false);
    setShowStaffModal(false);
    setCart([]);
    setActiveReceiptOrder(null);
    setLatestNewOrderId(null);
  };

  const handleAddToCart = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product || product.stock <= 0) return;

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === productId);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { productId, quantity: 1 }];
    });
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    const product = products.find((p) => p.id === productId);
    const maxStock = product?.stock ?? 0;

    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId !== productId) return item;
          const nextQty = Math.min(maxStock, item.quantity + delta);
          return { ...item, quantity: nextQty };
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  const handleCompleteSale = ({
    customerId,
    customerName,
    udhaarCustomerId,
    discountPercent,
    paymentMethod,
    amountTendered,
  }: {
    customerId?: string;
    customerName: string;
    udhaarCustomerId?: string;
    discountPercent: number;
    paymentMethod: PaymentMethod;
    amountTendered: number;
  }): OrderRecord | null => {
    if (!user || cart.length === 0) return null;

    const lineItems: OrderLineItem[] = [];
    for (const cartItem of cart) {
      const product = products.find((p) => p.id === cartItem.productId);
      if (!product || product.stock < cartItem.quantity) continue;
      lineItems.push({
        productId: product.id,
        sku: product.sku,
        nameEn: product.nameEn,
        nameUr: product.nameUr,
        category: product.category,
        unitPrice: product.price,
        unitCost: product.cost,
        taxRate: product.taxRate ?? 0,
        quantity: cartItem.quantity,
        lineTotal: product.price * cartItem.quantity,
      });
    }

    if (lineItems.length === 0) return null;

    const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const discountAmount = Math.round(subtotal * (discountPercent / 100));
    const taxable = Math.max(0, subtotal - discountAmount);
    const discountFactor = 1 - discountPercent / 100;
    const taxAmount = Math.round(
      lineItems.reduce((sum, item) => {
        const discountedLine = item.lineTotal * discountFactor;
        return sum + discountedLine * ((item.taxRate ?? 0) / 100);
      }, 0)
    );
    const effectiveTaxRate = taxable > 0 ? taxAmount / taxable : 0;
    const total = taxable + taxAmount;

    const effectiveTendered =
      paymentMethod === 'cash'
        ? Math.max(total, amountTendered)
        : paymentMethod === 'udhaar'
        ? 0
        : total;
    const changeDue =
      paymentMethod === 'cash' ? Math.max(0, effectiveTendered - total) : 0;

    // Resolve matching CRM customer if selected or matched by Khata customer name
    let resolvedCustomer = customerId
      ? customers.find((c) => c.id === customerId)
      : undefined;
    if (!resolvedCustomer && customerName) {
      const lowerName = customerName.trim().toLowerCase();
      resolvedCustomer = customers.find(
        (c) => c.name.trim().toLowerCase() === lowerName
      );
    }

    const nextSeq = 1001 + orders.length;
    const newOrder: OrderRecord = {
      id: `ord-${Date.now()}`,
      receiptNumber: `KR-2026-${nextSeq}`,
      createdAt: new Date().toISOString(),
      customerId: resolvedCustomer?.id ?? customerId,
      customerName,
      udhaarCustomerId,
      paymentMethod,
      items: lineItems,
      subtotal,
      discountPercent,
      discountAmount,
      taxRate: effectiveTaxRate,
      taxAmount,
      total,
      amountTendered: effectiveTendered,
      changeDue,
    };

    const updatedProducts = products.map((prod) => {
      const sold = lineItems.find((li) => li.productId === prod.id);
      if (!sold) return prod;
      return {
        ...prod,
        stock: Math.max(0, prod.stock - sold.quantity),
      };
    });

    let newUdhaarEntry: UdhaarEntry | undefined;
    if (paymentMethod === 'udhaar' && udhaarCustomerId) {
      const summaryLabel = lineItems
        .map((li) => `${li.quantity}x ${lang === 'ur' ? li.nameUr : li.nameEn}`)
        .join(', ');
      newUdhaarEntry = {
        id: `ue-${Date.now()}`,
        customerId: udhaarCustomerId,
        type: 'credit',
        amount: total,
        note: `POS Bill ${newOrder.receiptNumber} (${summaryLabel})`,
        receiptNumber: newOrder.receiptNumber,
        createdAt: newOrder.createdAt,
      };
      setUdhaarEntries((prev) => [...prev, newUdhaarEntry!]);
    }

    let updatedCustomer: Customer | undefined;
    if (paymentMethod === 'udhaar' && resolvedCustomer) {
      updatedCustomer = {
        ...resolvedCustomer,
        balance: resolvedCustomer.balance + total,
      };
      setCustomers((prev) =>
        prev.map((c) => (c.id === updatedCustomer!.id ? updatedCustomer! : c))
      );
    }

    setProducts(updatedProducts);
    setOrders((prev) => [...prev, newOrder]);
    setCart([]);
    setLatestNewOrderId(newOrder.id);
    setActiveReceiptOrder(newOrder);

    insertOrderRecord(
      user.id,
      newOrder,
      updatedProducts,
      newUdhaarEntry,
      updatedCustomer
    ).then(({ syncError, queuedOffline }) => {
      setPendingSyncCount(getOfflineQueue(user.id).length);
      if (queuedOffline) {
        setNetworkReachable(false);
        setOfflineSaleNotice(true);
      } else {
        setNetworkReachable(true);
        if (syncError) setCloudSyncError(syncError);
      }
    });

    return newOrder;
  };

  // Stock Management Handlers
  const handleAdjustStock = (productId: string, delta: number) => {
    if (!user) return;
    let updatedTarget: Product | null = null;
    setProducts((prev) =>
      prev.map((prod) => {
        if (prod.id !== productId) return prod;
        updatedTarget = { ...prod, stock: Math.max(0, prod.stock + delta) };
        return updatedTarget;
      })
    );
    if (updatedTarget) {
      upsertProductRecord(user.id, updatedTarget).then((syncErr) => {
        if (syncErr) setCloudSyncError(syncErr);
      });
    }
  };

  const handleAddProduct = (newProd: Omit<Product, 'id'>) => {
    if (!user) return;
    const created: Product = {
      ...newProd,
      id: `${user.id.slice(0, 8)}-prod-${Date.now()}`,
    };
    setProducts((prev) => [created, ...prev]);
    upsertProductRecord(user.id, created).then((syncErr) => {
      if (syncErr) setCloudSyncError(syncErr);
    });
  };

  const handleUpdateProduct = (updated: Product) => {
    if (!user) return;
    setProducts((prev) =>
      prev.map((prod) => (prod.id === updated.id ? updated : prod))
    );
    upsertProductRecord(user.id, updated).then((syncErr) => {
      if (syncErr) setCloudSyncError(syncErr);
    });
  };

  const handleDeleteProduct = (productId: string) => {
    if (!user || activeRole !== 'admin') return;
    setProducts((prev) => prev.filter((prod) => prod.id !== productId));
    setCart((prev) => prev.filter((item) => item.productId !== productId));
    deleteProductRecord(user.id, productId).then((syncErr) => {
      if (syncErr) setCloudSyncError(syncErr);
    });
  };

  // Udhaar / Khata Handlers
  const handleAddUdhaarCustomer = ({
    name,
    phone,
    notes,
    openingBalance,
  }: {
    name: string;
    phone: string;
    notes: string;
    openingBalance: number;
  }): UdhaarCustomer => {
    const nowIso = new Date().toISOString();
    const prefix = user?.id.slice(0, 8) ?? 'shop';
    const customer: UdhaarCustomer = {
      id: `${prefix}-khata-${Date.now()}`,
      name,
      phone,
      notes,
      createdAt: nowIso,
    };
    setUdhaarCustomers((prev) => [customer, ...prev]);

    let openingEntry: UdhaarEntry | undefined;
    if (openingBalance > 0) {
      openingEntry = {
        id: `${prefix}-ue-${Date.now()}-open`,
        customerId: customer.id,
        type: 'credit',
        amount: openingBalance,
        note: lang === 'ur' ? 'ابتدائی کھاتہ بیلنس' : 'Opening Udhaar balance',
        createdAt: nowIso,
      };
      setUdhaarEntries((prev) => [...prev, openingEntry!]);
    }

    if (user) {
      insertUdhaarCustomerRecord(user.id, customer, openingEntry).then(
        (syncErr) => {
          if (syncErr) setCloudSyncError(syncErr);
        }
      );
    }

    return customer;
  };

  const handleAddUdhaarEntry = ({
    customerId,
    type,
    amount,
    note,
  }: {
    customerId: string;
    type: UdhaarEntryType;
    amount: number;
    note: string;
  }) => {
    const prefix = user?.id.slice(0, 8) ?? 'shop';
    const entry: UdhaarEntry = {
      id: `${prefix}-ue-${Date.now()}`,
      customerId,
      type,
      amount,
      note,
      createdAt: new Date().toISOString(),
    };
    setUdhaarEntries((prev) => [...prev, entry]);
    if (user) {
      insertUdhaarEntryRecord(user.id, entry).then((syncErr) => {
        if (syncErr) setCloudSyncError(syncErr);
      });
    }
  };

  // Phase 2: Vendors, Purchases & Inventory Adjustment Handlers
  const handleAddVendor = ({
    name,
    company,
    phone,
    address,
    balance,
  }: {
    name: string;
    company: string;
    phone: string;
    address: string;
    balance: number;
  }): Vendor => {
    const prefix = user?.id.slice(0, 8) ?? 'shop';
    const created: Vendor = {
      id: `${prefix}-vend-${Date.now()}`,
      name,
      company,
      phone,
      address,
      balance: Math.max(0, balance),
      createdAt: new Date().toISOString(),
    };
    setVendors((prev) => [created, ...prev]);
    if (user) {
      upsertVendorRecord(user.id, created).then((syncErr) => {
        if (syncErr) setCloudSyncError(syncErr);
      });
    }
    return created;
  };

  const handleUpdateVendor = (updated: Vendor) => {
    setVendors((prev) =>
      prev.map((v) => (v.id === updated.id ? updated : v))
    );
    if (user) {
      upsertVendorRecord(user.id, updated).then((syncErr) => {
        if (syncErr) setCloudSyncError(syncErr);
      });
    }
  };

  const handleRecordVendorPayment = (vendorId: string, amount: number) => {
    const target = vendors.find((v) => v.id === vendorId);
    if (!target || amount <= 0) return;

    const updated: Vendor = {
      ...target,
      balance: Math.max(0, target.balance - amount),
    };
    setVendors((prev) =>
      prev.map((v) => (v.id === vendorId ? updated : v))
    );
    if (user) {
      upsertVendorRecord(user.id, updated).then((syncErr) => {
        if (syncErr) setCloudSyncError(syncErr);
      });
    }
  };

  const handleReceiveInventory = ({
    vendorId,
    invoiceNumber,
    paidAmount,
    note,
    lines,
  }: {
    vendorId: string;
    invoiceNumber: string;
    paidAmount: number;
    note: string;
    lines: {
      productId: string;
      productName: string;
      sku: string;
      quantity: number;
      unitCost: number;
    }[];
  }): PurchaseRecord | null => {
    if (!user || lines.length === 0) return null;
    const vendor = vendors.find((v) => v.id === vendorId);
    if (!vendor) return null;

    const nowIso = new Date().toISOString();
    const prefix = user.id.slice(0, 8);
    const purchaseId = `${prefix}-pur-${Date.now()}`;

    const items: PurchaseItem[] = lines.map((line, idx) => ({
      id: `${prefix}-pi-${Date.now()}-${idx}`,
      purchaseId,
      productId: line.productId,
      productName: line.productName,
      sku: line.sku,
      quantity: line.quantity,
      unitCost: line.unitCost,
      lineTotal: line.quantity * line.unitCost,
    }));

    const totalAmount = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const cleanPaid = Math.max(0, paidAmount);
    const balanceDue = Math.max(0, totalAmount - cleanPaid);

    const purchase: PurchaseRecord = {
      id: purchaseId,
      vendorId: vendor.id,
      vendorName: vendor.company
        ? `${vendor.name} (${vendor.company})`
        : vendor.name,
      invoiceNumber,
      totalAmount,
      paidAmount: cleanPaid,
      balanceDue,
      note,
      items,
      createdAt: nowIso,
    };

    const qtyByProd = new Map<string, number>();
    const costByProd = new Map<string, number>();
    for (const item of items) {
      qtyByProd.set(item.productId, (qtyByProd.get(item.productId) ?? 0) + item.quantity);
      costByProd.set(item.productId, item.unitCost);
    }

    const updatedProducts = products.map((prod) => {
      const addedQty = qtyByProd.get(prod.id);
      if (!addedQty) return prod;
      const latestCost = costByProd.get(prod.id) ?? prod.cost;
      return {
        ...prod,
        stock: prod.stock + addedQty,
        cost: latestCost,
      };
    });

    const updatedVendor: Vendor = {
      ...vendor,
      balance: vendor.balance + balanceDue,
    };

    setPurchases((prev) => [purchase, ...prev]);
    setProducts(updatedProducts);
    setVendors((prev) =>
      prev.map((v) => (v.id === updatedVendor.id ? updatedVendor : v))
    );

    insertPurchaseRecord(user.id, purchase, updatedProducts, updatedVendor).then(
      (syncErr) => {
        if (syncErr) setCloudSyncError(syncErr);
      }
    );

    return purchase;
  };

  const handleRecordInventoryAdjustment = ({
    productId,
    adjustmentType,
    quantityChange,
    reason,
  }: {
    productId: string;
    adjustmentType: AdjustmentType;
    quantityChange: number;
    reason: string;
  }) => {
    if (!user || quantityChange === 0) return;
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const previousStock = product.stock;
    const newStock = Math.max(0, previousStock + quantityChange);
    const actualDelta = newStock - previousStock;

    const updatedProduct: Product = {
      ...product,
      stock: newStock,
    };

    const prefix = user.id.slice(0, 8);
    const adjustment: InventoryAdjustment = {
      id: `${prefix}-adj-${Date.now()}`,
      productId: product.id,
      productName: lang === 'ur' ? product.nameUr : product.nameEn,
      sku: product.sku,
      adjustmentType,
      quantityChange: actualDelta,
      previousStock,
      newStock,
      reason,
      createdAt: new Date().toISOString(),
    };

    setProducts((prev) =>
      prev.map((p) => (p.id === updatedProduct.id ? updatedProduct : p))
    );
    setInventoryAdjustments((prev) => [adjustment, ...prev]);

    insertInventoryAdjustmentRecord(user.id, adjustment, updatedProduct).then(
      (syncErr) => {
        if (syncErr) setCloudSyncError(syncErr);
      }
    );
  };

  // Phase 3: Customers, Staff & Permissions, Store Settings Handlers
  const handleAddCustomer = ({
    name,
    phone,
    address,
    balance,
  }: {
    name: string;
    phone: string;
    address: string;
    balance: number;
  }): Customer => {
    const prefix = user?.id.slice(0, 8) ?? 'shop';
    const created: Customer = {
      id: `${prefix}-cust-${Date.now()}`,
      name,
      phone,
      address,
      balance: Math.max(0, balance),
      createdAt: new Date().toISOString(),
    };
    setCustomers((prev) => [created, ...prev]);
    if (user) {
      upsertCustomerRecord(user.id, created).then((syncErr) => {
        if (syncErr) setCloudSyncError(syncErr);
      });
    }
    return created;
  };

  const handleUpdateCustomer = (updated: Customer) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
    if (user) {
      upsertCustomerRecord(user.id, updated).then((syncErr) => {
        if (syncErr) setCloudSyncError(syncErr);
      });
    }
  };

  const handleDeleteCustomer = (customerId: string) => {
    if (!user || activeRole !== 'admin') return;
    setCustomers((prev) => prev.filter((c) => c.id !== customerId));
    deleteCustomerRecord(user.id, customerId).then((syncErr) => {
      if (syncErr) setCloudSyncError(syncErr);
    });
  };

  const handleRecordCustomerPayment = (customerId: string, amount: number) => {
    const target = customers.find((c) => c.id === customerId);
    if (!target || amount <= 0) return;

    const updated: Customer = {
      ...target,
      balance: Math.max(0, target.balance - amount),
    };
    setCustomers((prev) =>
      prev.map((c) => (c.id === customerId ? updated : c))
    );
    if (user) {
      upsertCustomerRecord(user.id, updated).then((syncErr) => {
        if (syncErr) setCloudSyncError(syncErr);
      });
    }
  };

  const handleAddEmployee = ({
    name,
    phone,
    role,
    pinCode,
    isActive,
  }: {
    name: string;
    phone: string;
    role: EmployeeRole;
    pinCode: string;
    isActive: boolean;
  }) => {
    if (!user || activeRole !== 'admin') return;
    const prefix = user.id.slice(0, 8);
    const created: Employee = {
      id: `${prefix}-emp-${Date.now()}`,
      name,
      phone,
      role,
      pinCode,
      isActive,
      createdAt: new Date().toISOString(),
    };
    setEmployees((prev) => [...prev, created]);
    upsertEmployeeRecord(user.id, created).then((syncErr) => {
      if (syncErr) setCloudSyncError(syncErr);
    });
  };

  const handleUpdateEmployee = (updated: Employee) => {
    if (!user || activeRole !== 'admin') return;
    setEmployees((prev) =>
      prev.map((e) => (e.id === updated.id ? updated : e))
    );
    upsertEmployeeRecord(user.id, updated).then((syncErr) => {
      if (syncErr) setCloudSyncError(syncErr);
    });
  };

  const handleDeleteEmployee = (employeeId: string) => {
    if (!user || activeRole !== 'admin') return;
    setEmployees((prev) => prev.filter((e) => e.id !== employeeId));
    deleteEmployeeRecord(user.id, employeeId).then((syncErr) => {
      if (syncErr) setCloudSyncError(syncErr);
    });
  };

  const handleSaveStoreSettings = (nextSettings: StoreSettings) => {
    if (!user || activeRole !== 'admin') return;
    setStoreSettings(nextSettings);
    upsertStoreSettingsRecord(user.id, nextSettings).then((syncErr) => {
      if (syncErr) setCloudSyncError(syncErr);
    });
  };

  const handleSelectEmployeeByPin = (emp: Employee) => {
    setActiveEmployeeId(emp.id);
    setIsScreenLocked(false);
    setShowStaffModal(false);
    if (!ROLE_ALLOWED_TABS[emp.role].includes(activeTab)) {
      setActiveTab('pos');
    }
  };

  const handleResetDemo = () => {
    if (!user || activeRole !== 'admin') return;
    setLoadingData(true);
    resetUserDemoWorkspace(user.id, storeSettings.storeName || user.shopName)
      .then((ws) => {
        applyWorkspaceData(user.id, ws);
        setCart([]);
        setLatestNewOrderId(null);
        setActiveReceiptOrder(null);
      })
      .finally(() => setLoadingData(false));
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm font-medium text-slate-600">{t.loadingWorkspace}</div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthView
        lang={lang}
        onToggleLanguage={handleToggleLanguage}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        t={t}
      />
    );
  }

  const latestCompletedOrder =
    orders.find((o) => o.id === latestNewOrderId) ?? null;
  const activeStoreName = storeSettings.storeName || user.shopName || t.brandName;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        activeRole={activeRole}
        activeEmployeeName={activeEmployee?.name ?? 'Admin'}
        onOpenStaffSwitcher={() => setShowStaffModal(true)}
        onLockScreen={() => setIsScreenLocked(true)}
        isOnline={isEffectiveOnline}
        pendingSyncCount={pendingSyncCount}
        isSyncingOffline={isSyncingOffline}
        onManualSync={() => user && void runOfflineSync(user.id, user.shopName)}
        lang={lang}
        onToggleLanguage={handleToggleLanguage}
        shopName={activeStoreName}
        onLogout={handleLogout}
        t={t}
      />

      {cloudSyncError && (
        <CloudSyncBanner
          error={cloudSyncError}
          retrying={retryingSync}
          onRetry={handleRetrySync}
          t={t}
        />
      )}

      {syncToastMessage && (
        <div className="no-print bg-emerald-50 border-b border-emerald-200 px-4 sm:px-6 py-2.5">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-3 text-xs font-semibold text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
              <span>{syncToastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setSyncToastMessage(null)}
              aria-label={t.closeBtn}
              className="p-1 text-emerald-700 hover:text-emerald-950 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {offlineSaleNotice && !isEffectiveOnline && (
        <div className="no-print bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-3 text-xs font-medium text-amber-950">
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
              <span>{t.offlineSaleQueuedNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setOfflineSaleNotice(false)}
              aria-label={t.closeBtn}
              className="p-1 text-amber-800 hover:text-amber-950 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1">
        {loadingData ? (
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-16 text-center text-sm text-slate-500">
            {t.loadingWorkspace}
          </div>
        ) : (
          <>
            {activeTab === 'pos' && (
              <PosBillingView
                products={products}
                cart={cart}
                customers={customers}
                udhaarCustomers={udhaarCustomers}
                udhaarEntries={udhaarEntries}
                canViewDashboard={activeRole !== 'cashier'}
                onAddToCart={handleAddToCart}
                onUpdateQuantity={handleUpdateQuantity}
                onRemoveFromCart={handleRemoveFromCart}
                onClearCart={handleClearCart}
                onCompleteSale={handleCompleteSale}
                onGoToDashboard={() => setActiveTab('dashboard')}
                lastCompletedOrder={latestCompletedOrder}
                lang={lang}
                t={t}
              />
            )}

            {activeTab === 'dashboard' && activeRole !== 'cashier' && (
              <ExecutiveDashboardView
                storeName={activeStoreName}
                orders={orders}
                latestNewOrderId={latestNewOrderId}
                canResetDemo={activeRole === 'admin'}
                suppressPrint={Boolean(activeReceiptOrder)}
                onPrintReceipt={(order) => setActiveReceiptOrder(order)}
                onGoToPos={() => setActiveTab('pos')}
                onResetDemo={handleResetDemo}
                lang={lang}
                t={t}
              />
            )}

            {activeTab === 'transactions' && (
              <TransactionsView
                orders={orders}
                onPrintReceipt={(order) => setActiveReceiptOrder(order)}
                lang={lang}
                t={t}
              />
            )}

            {activeTab === 'inventory' && activeRole !== 'cashier' && (
              <InventoryView
                userId={user.id}
                shopName={activeStoreName}
                products={products}
                adjustments={inventoryAdjustments}
                canDelete={activeRole === 'admin'}
                onAdjustStock={handleAdjustStock}
                onRecordAdjustment={handleRecordInventoryAdjustment}
                onAddProduct={handleAddProduct}
                onUpdateProduct={handleUpdateProduct}
                onDeleteProduct={handleDeleteProduct}
                lang={lang}
                t={t}
              />
            )}

            {activeTab === 'inventory_report' && activeRole !== 'cashier' && (
              <InventoryReportView
                storeName={activeStoreName}
                products={products}
                adjustments={inventoryAdjustments}
                suppressPrint={Boolean(activeReceiptOrder)}
                lang={lang}
                t={t}
              />
            )}

            {activeTab === 'purchases' && activeRole !== 'cashier' && (
              <PurchasesView
                vendors={vendors}
                products={products}
                purchases={purchases}
                onReceiveInventory={handleReceiveInventory}
                onGoToVendors={() => setActiveTab('vendors')}
                lang={lang}
                t={t}
              />
            )}

            {activeTab === 'vendors' && activeRole !== 'cashier' && (
              <VendorsView
                vendors={vendors}
                purchases={purchases}
                onAddVendor={handleAddVendor}
                onUpdateVendor={handleUpdateVendor}
                onRecordVendorPayment={handleRecordVendorPayment}
                lang={lang}
                t={t}
              />
            )}

            {activeTab === 'customers' && (
              <CustomersView
                customers={customers}
                orders={orders}
                canDelete={activeRole === 'admin'}
                onAddCustomer={handleAddCustomer}
                onUpdateCustomer={handleUpdateCustomer}
                onDeleteCustomer={handleDeleteCustomer}
                onRecordPayment={handleRecordCustomerPayment}
                onPrintReceipt={(order) => setActiveReceiptOrder(order)}
                lang={lang}
                t={t}
              />
            )}

            {activeTab === 'udhaar' && activeRole !== 'cashier' && (
              <UdhaarView
                customers={udhaarCustomers}
                entries={udhaarEntries}
                onAddCustomer={handleAddUdhaarCustomer}
                onAddEntry={handleAddUdhaarEntry}
                lang={lang}
                t={t}
              />
            )}

            {activeTab === 'staff' && activeRole === 'admin' && (
              <StaffView
                employees={employees}
                activeEmployeeId={activeEmployee?.id ?? null}
                onAddEmployee={handleAddEmployee}
                onUpdateEmployee={handleUpdateEmployee}
                onDeleteEmployee={handleDeleteEmployee}
                onSwitchActiveEmployee={(empId) => setActiveEmployeeId(empId)}
                t={t}
              />
            )}

            {activeTab === 'settings' && activeRole === 'admin' && (
              <StoreSettingsView
                settings={storeSettings}
                onSaveSettings={handleSaveStoreSettings}
                t={t}
              />
            )}
          </>
        )}
      </main>

      <ReceiptModal
        order={activeReceiptOrder}
        storeSettings={storeSettings}
        cashierName={activeEmployee?.name}
        onClose={() => setActiveReceiptOrder(null)}
        lang={lang}
        t={t}
      />

      <StaffPinModal
        isOpen={showStaffModal}
        isLocked={isScreenLocked}
        employees={employees}
        activeEmployee={activeEmployee}
        shopName={activeStoreName}
        onSelectEmployeeByPin={handleSelectEmployeeByPin}
        onLockScreen={() => {
          setShowStaffModal(false);
          setIsScreenLocked(true);
        }}
        onClose={() => setShowStaffModal(false)}
        onLogout={handleLogout}
        t={t}
      />
    </div>
  );
}
