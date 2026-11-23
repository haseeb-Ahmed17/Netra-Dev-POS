import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, WifiOff, X } from 'lucide-react';
import { AuthView } from './components/AuthView';
import { CloudSyncBanner } from './components/CloudSyncBanner';
import { CustomersView } from './components/CustomersView';
import { ExecutiveDashboardView } from './components/ExecutiveDashboardView';
import { ExpensesView } from './components/ExpensesView';
import { InventoryReportView } from './components/InventoryReportView';
import { InventoryView } from './components/InventoryView';
import {
  PosBillingView,
  type InlineUdhaarCustomerPayload,
} from './components/PosBillingView';
import { PurchasesView } from './components/PurchasesView';
import { ReceiptModal } from './components/ReceiptModal';
import { SaasAdminView } from './components/SaasAdminView';
import { SidebarNav } from './components/SidebarNav';
import { StaffPinModal } from './components/StaffPinModal';
import { StaffView } from './components/StaffView';
import { StoreSettingsView } from './components/StoreSettingsView';
import { SubscriptionLockModal } from './components/SubscriptionLockModal';
import { TopBar } from './components/TopBar';
import {
  TransactionsView,
  type ReturnRequestPayload,
} from './components/TransactionsView';
import { UdhaarView } from './components/UdhaarView';
import { VendorsView } from './components/VendorsView';
import { createDefaultStoreSettings } from './data/initialData';
import { TRANSLATIONS } from './i18n';
import {
  adminUpdateSubscription,
  authorizeServerAction,
  checkIsSuperAdmin,
  deleteCustomerRecord,
  deleteEmployeeRecord,
  deleteExpenseRecord,
  deleteProductRecord,
  ensureUserSubscription,
  fetchAllSubscriptions,
  fetchLatestCustomersForPos,
  fetchWorkspaceData,
  getActiveShopkeeper,
  getOfflineQueue,
  insertInventoryAdjustmentRecord,
  insertOrderRecord,
  insertPurchaseRecord,
  insertUdhaarCustomerRecord,
  insertUdhaarEntryRecord,
  resetUserDemoWorkspace,
  saveEmployeeRecord,
  signInShopkeeper,
  signOutShopkeeper,
  signUpShopkeeper,
  syncOfflineQueue,
  updateOrderReturnRecord,
  updateUdhaarCustomerRecord,
  upsertCustomerRecord,
  upsertExpenseRecord,
  upsertProductRecord,
  upsertStoreSettingsRecord,
  upsertVendorRecord,
  verifyStaffPinRecord,
} from './lib/posRepository';
import { generateUuid } from './lib/idUtils';
import { hasRolePermission, type RoleAction } from './lib/rbac';
import {
  isSupabaseConfigured,
  setStaffSessionHeaderToken,
  supabase,
} from './lib/supabaseClient';
import {
  normalizeSellingUnit,
  roundCurrency,
  roundQuantity,
} from './lib/unitUtils';
import type {
  AdjustmentType,
  CartItem,
  Customer,
  Employee,
  EmployeeRole,
  ExpenseRecord,
  InventoryAdjustment,
  Language,
  NavTab,
  OrderLineItem,
  OrderRecord,
  PaymentMethod,
  Product,
  PurchaseItem,
  PurchaseRecord,
  ReminderSchedule,
  SellingUnit,
  ShopkeeperUser,
  StaffSessionInfo,
  StoreSettings,
  SubscriptionRecord,
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
    'expenses',
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
    'expenses',
    'customers',
    'udhaar',
  ],
  cashier: ['pos', 'transactions', 'customers'],
};

function activeStaffStorageKey(userId: string): string {
  return `khaas_pos_active_staff_${userId}_v1`;
}

function staffSessionStorageKey(userId: string): string {
  return `khaas_pos_staff_session_${userId}_v1`;
}

function loadStoredStaffSession(userId: string): StaffSessionInfo | null {
  try {
    const raw = sessionStorage.getItem(staffSessionStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StaffSessionInfo;
    if (!parsed?.token || !parsed?.employeeId || !parsed?.expiresAt) return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStoredStaffSession(
  userId: string,
  session: StaffSessionInfo | null
): void {
  try {
    if (session) {
      sessionStorage.setItem(staffSessionStorageKey(userId), JSON.stringify(session));
      setStaffSessionHeaderToken(session.token);
    } else {
      sessionStorage.removeItem(staffSessionStorageKey(userId));
      setStaffSessionHeaderToken(null);
    }
  } catch {
    setStaffSessionHeaderToken(session?.token ?? null);
  }
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
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(() =>
    createDefaultStoreSettings()
  );

  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [allSubscriptions, setAllSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [loadingAllSubs, setLoadingAllSubs] = useState(false);
  const [updatingSubUserId, setUpdatingSubUserId] = useState<string | null>(null);

  const [staffSession, setStaffSession] = useState<StaffSessionInfo | null>(null);
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(null);
  const [pendingSwitchEmployeeId, setPendingSwitchEmployeeId] = useState<string | null>(
    null
  );
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [isScreenLocked, setIsScreenLocked] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
  const [rbacNotice, setRbacNotice] = useState<string | null>(null);
  const syncInFlightRef = useRef<boolean>(false);

  const t = TRANSLATIONS[lang];
  const isEffectiveOnline = browserOnline && networkReachable;
  const isSubscriptionLocked = Boolean(
    user &&
      !isSuperAdmin &&
      subscription &&
      (subscription.isBlocked ||
        new Date(subscription.expiresAt).getTime() <= Date.now())
  );

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
      setExpenses(ws.expenses);
      setStoreSettings(ws.storeSettings);
      setCloudSyncError(ws.cloudSyncError ?? null);
      setNetworkReachable(!ws.isOffline);
      setPendingSyncCount(getOfflineQueue(userId).length);

      const activeList = ws.employees.filter((e) => e.isActive);
      const candidateSession =
        ws.refreshedStaffSession ?? loadStoredStaffSession(userId);
      const sessionEmployee = candidateSession
        ? activeList.find((e) => e.id === candidateSession.employeeId)
        : undefined;

      if (candidateSession && sessionEmployee) {
        const syncedSession: StaffSessionInfo = {
          ...candidateSession,
          role: sessionEmployee.role,
        };
        saveStoredStaffSession(userId, syncedSession);
        setStaffSession(syncedSession);
        setActiveEmployeeId(sessionEmployee.id);
        setIsScreenLocked(false);
        return;
      }

      saveStoredStaffSession(userId, null);
      setStaffSession(null);

      const fallbackAdmin =
        activeList.find((e) => e.role === 'admin') ?? activeList[0] ?? null;

      if (ws.wasEmployeesBootstrapped && fallbackAdmin) {
        void verifyStaffPinRecord(userId, '1234', fallbackAdmin.id).then((res) => {
          if (res.ok && res.token && res.employeeId && res.role && res.expiresAt) {
            const newSession: StaffSessionInfo = {
              token: res.token,
              employeeId: res.employeeId,
              role: res.role,
              expiresAt: res.expiresAt,
            };
            saveStoredStaffSession(userId, newSession);
            setStaffSession(newSession);
            setActiveEmployeeId(res.employeeId);
            setIsScreenLocked(false);
          } else {
            setActiveEmployeeId(null);
            setIsScreenLocked(true);
          }
        });
        return;
      }

      if (activeList.length > 0) {
        setActiveEmployeeId(null);
        setIsScreenLocked(true);
      } else {
        setActiveEmployeeId(null);
        setIsScreenLocked(false);
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
      setExpenses([]);
      setStoreSettings(createDefaultStoreSettings());
      setIsSuperAdmin(false);
      setSubscription(null);
      setCheckingSubscription(false);
      setAllSubscriptions([]);
      setLoadingAllSubs(false);
      setUpdatingSubUserId(null);
      setStaffSession(null);
      setStaffSessionHeaderToken(null);
      setActiveEmployeeId(null);
      setPendingSwitchEmployeeId(null);
      setShowStaffModal(false);
      setIsScreenLocked(false);
      setCart([]);
      setActiveReceiptOrder(null);
      setLatestNewOrderId(null);
      setCloudSyncError(null);
      setPendingSyncCount(0);
      setOfflineSaleNotice(false);
      setSyncToastMessage(null);
      setRbacNotice(null);
      return;
    }

    const storedSession = loadStoredStaffSession(user.id);
    setStaffSessionHeaderToken(storedSession?.token ?? null);

    setLoadingData(true);
    setCheckingSubscription(true);

    ensureUserSubscription(user.id, user.email, user.shopName)
      .then((subRes) => {
        if (!active) return;
        setSubscription(subRes.subscription);
        if (subRes.syncError) {
          setCloudSyncError((prev) => prev ?? subRes.syncError);
        }
      })
      .finally(() => {
        if (active) setCheckingSubscription(false);
      });

    checkIsSuperAdmin(user.id).then((adminOk) => {
      if (!active) return;
      setIsSuperAdmin(adminOk);
      if (adminOk) {
        setLoadingAllSubs(true);
        fetchAllSubscriptions()
          .then((res) => {
            if (!active) return;
            setAllSubscriptions(res.subscriptions);
            if (res.error) {
              setCloudSyncError((prev) => prev ?? res.error);
            }
          })
          .finally(() => {
            if (active) setLoadingAllSubs(false);
          });
      } else {
        setAllSubscriptions([]);
      }
    });

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
    if (!staffSession || isScreenLocked) return null;
    return activeList.find((e) => e.id === (activeEmployeeId ?? staffSession.employeeId)) ?? null;
  }, [employees, activeEmployeeId, staffSession, isScreenLocked]);

  const activeRole: EmployeeRole = activeEmployee?.role ?? staffSession?.role ?? 'cashier';

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
    if (activeTab === 'saas_admin') {
      if (!isSuperAdmin) setActiveTab('pos');
      return;
    }
    const allowed = ROLE_ALLOWED_TABS[activeRole];
    if (!allowed.includes(activeTab)) {
      setActiveTab('pos');
    }
  }, [activeRole, activeTab, isSuperAdmin]);

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
    const prevUserId = user?.id;
    await signOutShopkeeper();
    if (prevUserId) {
      saveStoredStaffSession(prevUserId, null);
    }
    setUser(null);
    setIsSuperAdmin(false);
    setStaffSession(null);
    setActiveEmployeeId(null);
    setPendingSwitchEmployeeId(null);
    setIsScreenLocked(false);
    setShowStaffModal(false);
    setMobileMenuOpen(false);
    setCart([]);
    setActiveReceiptOrder(null);
    setLatestNewOrderId(null);
    setRbacNotice(null);
  };

  const guardAction = (action: RoleAction): boolean => {
    if (!hasRolePermission(activeRole, action)) {
      setRbacNotice(t.rbacUnauthorizedError);
      return false;
    }
    setRbacNotice(null);
    void authorizeServerAction(action).then((err) => {
      if (err) {
        setCloudSyncError(err);
      }
    });
    return true;
  };

  const handleAddToCart = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    setCart((prev) => {
      const usedPositiveQty = roundQuantity(
        prev
          .filter((i) => i.productId === productId && !i.isReturn)
          .reduce((s, i) => s + i.quantity, 0)
      );
      const remaining = roundQuantity(product.stock - usedPositiveQty);
      if (remaining <= 0) return prev;

      const increment = remaining < 1 ? remaining : 1;
      const existing = prev.find(
        (item) => item.productId === productId && !item.isReturn
      );
      if (existing) {
        return prev.map((item) =>
          item.productId === productId && !item.isReturn
            ? {
                ...item,
                quantity: roundQuantity(
                  Math.min(product.stock, item.quantity + increment)
                ),
              }
            : item
        );
      }
      return [...prev, { productId, quantity: increment, isReturn: false }];
    });
  };

  const handleUpdateQuantity = (
    productId: string,
    delta: number,
    isReturn = false
  ) => {
    const product = products.find((p) => p.id === productId);
    const maxStock = product?.stock ?? 0;

    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId !== productId || Boolean(item.isReturn) !== isReturn) {
            return item;
          }
          const rawNext = roundQuantity(item.quantity + delta);
          const nextQty = isReturn
            ? rawNext
            : roundQuantity(Math.min(maxStock, rawNext));
          return { ...item, quantity: nextQty };
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const handleSetCartQuantity = (
    productId: string,
    quantity: number,
    isReturn = false
  ) => {
    const product = products.find((p) => p.id === productId);
    const maxStock = product?.stock ?? 0;
    const rounded = roundQuantity(quantity);

    setCart((prev) => {
      if (!Number.isFinite(rounded) || rounded <= 0) {
        return prev.filter(
          (item) =>
            !(item.productId === productId && Boolean(item.isReturn) === isReturn)
        );
      }
      const nextQty = isReturn ? rounded : roundQuantity(Math.min(maxStock, rounded));
      return prev
        .map((item) =>
          item.productId === productId && Boolean(item.isReturn) === isReturn
            ? { ...item, quantity: nextQty }
            : item
        )
        .filter((item) => item.quantity > 0);
    });
  };

  const handleToggleCartItemReturn = (
    productId: string,
    currentIsReturn: boolean
  ) => {
    const product = products.find((p) => p.id === productId);
    const maxStock = product?.stock ?? 0;

    setCart((prev) => {
      const target = prev.find(
        (item) =>
          item.productId === productId && Boolean(item.isReturn) === currentIsReturn
      );
      if (!target) return prev;

      const nextIsReturn = !currentIsReturn;
      const existingOpposite = prev.find(
        (item) =>
          item.productId === productId && Boolean(item.isReturn) === nextIsReturn
      );

      if (existingOpposite) {
        return prev
          .filter(
            (item) =>
              !(
                item.productId === productId &&
                Boolean(item.isReturn) === currentIsReturn
              )
          )
          .map((item) => {
            if (
              item.productId === productId &&
              Boolean(item.isReturn) === nextIsReturn
            ) {
              const merged = item.quantity + target.quantity;
              return {
                ...item,
                quantity: nextIsReturn ? merged : Math.min(maxStock, merged),
              };
            }
            return item;
          })
          .filter((item) => item.quantity > 0);
      }

      return prev
        .map((item) => {
          if (
            item.productId === productId &&
            Boolean(item.isReturn) === currentIsReturn
          ) {
            const clampedQty = nextIsReturn
              ? item.quantity
              : Math.min(maxStock, item.quantity);
            return {
              ...item,
              isReturn: nextIsReturn,
              quantity: clampedQty,
            };
          }
          return item;
        })
        .filter((item) => item.quantity > 0);
    });
  };

  const handleRemoveFromCart = (productId: string, isReturn = false) => {
    setCart((prev) =>
      prev.filter(
        (item) =>
          !(item.productId === productId && Boolean(item.isReturn) === isReturn)
      )
    );
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
    transactionId,
    inlineNewUdhaarCustomer,
  }: {
    customerId?: string;
    customerName: string;
    udhaarCustomerId?: string;
    discountPercent: number;
    paymentMethod: PaymentMethod;
    amountTendered: number;
    transactionId?: string;
    inlineNewUdhaarCustomer?: InlineUdhaarCustomerPayload;
  }): OrderRecord | null => {
    if (!user || cart.length === 0) return null;

    const lineItems: OrderLineItem[] = [];
    for (const cartItem of cart) {
      const product = products.find((p) => p.id === cartItem.productId);
      const isRet = Boolean(cartItem.isReturn);
      const qty = roundQuantity(cartItem.quantity);
      if (!product || qty <= 0 || (!isRet && product.stock + 0.0001 < qty)) continue;

      const signedQty = isRet ? -qty : qty;
      const absLineTotal = roundCurrency(product.price * qty);
      const signedLineTotal = isRet ? -absLineTotal : absLineTotal;

      lineItems.push({
        productId: product.id,
        sku: product.sku,
        nameEn: product.nameEn,
        nameUr: product.nameUr,
        category: product.category,
        sellingUnit: normalizeSellingUnit(product.sellingUnit),
        unitPrice: product.price,
        unitCost: product.cost,
        taxRate: product.taxRate ?? 0,
        quantity: signedQty,
        lineTotal: signedLineTotal,
        isReturn: isRet,
      });
    }

    if (lineItems.length === 0) return null;

    const subtotal = roundCurrency(
      lineItems.reduce((sum, item) => sum + item.lineTotal, 0)
    );
    const discountAmount =
      subtotal > 0 ? Math.round(subtotal * (discountPercent / 100)) : 0;
    const discountFactor = subtotal > 0 ? 1 - discountPercent / 100 : 1;
    const taxAmount = Math.round(
      lineItems.reduce((sum, item) => {
        const discountedLine = item.lineTotal * discountFactor;
        return sum + discountedLine * ((item.taxRate ?? 0) / 100);
      }, 0)
    );
    const taxable = roundCurrency(subtotal - discountAmount);
    const effectiveTaxRate = taxable !== 0 ? taxAmount / taxable : 0;
    const total = roundCurrency(taxable + taxAmount);

    const effectiveTendered =
      paymentMethod === 'cash'
        ? total > 0
          ? Math.max(total, amountTendered)
          : total
        : paymentMethod === 'udhaar'
        ? 0
        : total;
    const changeDue =
      paymentMethod === 'cash' && total > 0
        ? Math.max(0, effectiveTendered - total)
        : 0;

    const nowTs = Date.now();
    const nowIso = new Date(nowTs).toISOString();
    const prefix = user.id.slice(0, 8);
    const normalizePhone = (p: string) => p.replace(/\D/g, '');

    let newUdhaarCustomer: UdhaarCustomer | undefined;
    let updatedCustomer: Customer | undefined;
    let effectiveCustomerId = customerId;
    let effectiveUdhaarCustomerId = udhaarCustomerId;
    let effectiveCustomerName = customerName;

    if (paymentMethod === 'udhaar') {
      if (inlineNewUdhaarCustomer && inlineNewUdhaarCustomer.name.trim()) {
        const inlineName = inlineNewUdhaarCustomer.name.trim();
        const inlinePhone = inlineNewUdhaarCustomer.phone.trim();
        const inlineDigits = normalizePhone(inlinePhone);

        const createdKhata: UdhaarCustomer = {
          id: `${prefix}-khata-${nowTs}`,
          name: inlineName,
          phone: inlinePhone,
          notes: '',
          reminderSchedule: inlineNewUdhaarCustomer.reminderSchedule,
          dueDate: inlineNewUdhaarCustomer.dueDate,
          createdAt: nowIso,
        };
        newUdhaarCustomer = createdKhata;
        effectiveUdhaarCustomerId = createdKhata.id;
        effectiveCustomerName = createdKhata.name;
        setUdhaarCustomers((prev) => [createdKhata, ...prev]);

        const existingCrm = customers.find((c) => {
          const cDigits = normalizePhone(c.phone);
          if (inlineDigits && cDigits && inlineDigits === cDigits) return true;
          return c.name.trim().toLowerCase() === inlineName.toLowerCase();
        });

        if (existingCrm) {
          updatedCustomer = {
            ...existingCrm,
            balance: existingCrm.balance + total,
          };
          effectiveCustomerId = updatedCustomer.id;
          setCustomers((prev) =>
            prev.map((c) => (c.id === updatedCustomer!.id ? updatedCustomer! : c))
          );
        } else {
          const createdCrm: Customer = {
            id: generateUuid(),
            name: inlineName,
            phone: inlinePhone,
            address: '',
            balance: Math.max(0, total),
            createdAt: nowIso,
          };
          updatedCustomer = createdCrm;
          effectiveCustomerId = createdCrm.id;
          setCustomers((prev) => [createdCrm, ...prev]);
        }
      } else {
        let resolvedKhata = effectiveUdhaarCustomerId
          ? udhaarCustomers.find((c) => c.id === effectiveUdhaarCustomerId)
          : undefined;

        let resolvedCrm = effectiveCustomerId
          ? customers.find((c) => c.id === effectiveCustomerId)
          : undefined;

        if (!resolvedCrm && resolvedKhata) {
          const khDigits = normalizePhone(resolvedKhata.phone);
          const khName = resolvedKhata.name.trim().toLowerCase();
          resolvedCrm = customers.find((c) => {
            if (c.id === resolvedKhata!.id) return true;
            const cDigits = normalizePhone(c.phone);
            if (khDigits && cDigits && khDigits === cDigits) return true;
            return c.name.trim().toLowerCase() === khName;
          });
        }

        if (!resolvedKhata && resolvedCrm) {
          const cDigits = normalizePhone(resolvedCrm.phone);
          const cName = resolvedCrm.name.trim().toLowerCase();
          resolvedKhata = udhaarCustomers.find((kh) => {
            if (kh.id === resolvedCrm!.id) return true;
            const khDigits = normalizePhone(kh.phone);
            if (cDigits && khDigits && cDigits === khDigits) return true;
            return kh.name.trim().toLowerCase() === cName;
          });
        }

        if (!resolvedKhata) {
          const fallbackName =
            resolvedCrm?.name || effectiveCustomerName.trim() || 'Khata Customer';
          const createdKhata: UdhaarCustomer = {
            id: `${prefix}-khata-${nowTs}`,
            name: fallbackName,
            phone: resolvedCrm?.phone ?? '',
            notes: '',
            reminderSchedule: 'none',
            createdAt: nowIso,
          };
          newUdhaarCustomer = createdKhata;
          resolvedKhata = createdKhata;
          setUdhaarCustomers((prev) => [createdKhata, ...prev]);
        }

        effectiveUdhaarCustomerId = resolvedKhata.id;
        effectiveCustomerName = resolvedKhata.name || effectiveCustomerName;

        if (resolvedCrm) {
          updatedCustomer = {
            ...resolvedCrm,
            balance: resolvedCrm.balance + total,
          };
          effectiveCustomerId = updatedCustomer.id;
          setCustomers((prev) =>
            prev.map((c) => (c.id === updatedCustomer!.id ? updatedCustomer! : c))
          );
        } else {
          const createdCrm: Customer = {
            id: generateUuid(),
            name: resolvedKhata.name,
            phone: resolvedKhata.phone,
            address: '',
            balance: Math.max(0, total),
            createdAt: nowIso,
          };
          updatedCustomer = createdCrm;
          effectiveCustomerId = createdCrm.id;
          setCustomers((prev) => [createdCrm, ...prev]);
        }
      }
    } else {
      let resolvedCustomer = effectiveCustomerId
        ? customers.find((c) => c.id === effectiveCustomerId)
        : undefined;
      if (!resolvedCustomer && effectiveCustomerName) {
        const lowerName = effectiveCustomerName.trim().toLowerCase();
        resolvedCustomer = customers.find(
          (c) => c.name.trim().toLowerCase() === lowerName
        );
      }
      if (resolvedCustomer) {
        effectiveCustomerId = resolvedCustomer.id;
      }
    }

    const hasReturnItems = lineItems.some((li) => Boolean(li.isReturn));
    const hasSaleItems = lineItems.some((li) => !li.isReturn);
    const returnStatus: OrderRecord['returnStatus'] =
      hasReturnItems && !hasSaleItems
        ? 'refunded'
        : hasReturnItems && hasSaleItems
        ? 'exchanged'
        : 'completed';
    const refundedAmount = hasReturnItems && total < 0 ? Math.abs(total) : 0;

    const nextSeq = 1001 + orders.length;
    const newOrder: OrderRecord = {
      id: `ord-${nowTs}`,
      receiptNumber: `KR-2026-${nextSeq}`,
      createdAt: nowIso,
      customerId: effectiveCustomerId,
      customerName: effectiveCustomerName,
      udhaarCustomerId: effectiveUdhaarCustomerId,
      paymentMethod,
      transactionId: transactionId?.trim() || undefined,
      items: lineItems,
      subtotal,
      discountPercent,
      discountAmount,
      taxRate: effectiveTaxRate,
      taxAmount,
      total,
      amountTendered: effectiveTendered,
      changeDue,
      returnStatus,
      refundedAmount,
    };

    // Net stock delta per productId (deduct positive purchases, add back returns)
    const netDeltaByProduct = new Map<string, number>();
    for (const li of lineItems) {
      const delta = li.isReturn ? Math.abs(li.quantity) : -li.quantity;
      netDeltaByProduct.set(
        li.productId,
        (netDeltaByProduct.get(li.productId) ?? 0) + delta
      );
    }

    const updatedProducts = products.map((prod) => {
      const delta = netDeltaByProduct.get(prod.id);
      if (!delta) return prod;
      return {
        ...prod,
        stock: Math.max(0, roundQuantity(prod.stock + delta)),
      };
    });

    let newUdhaarEntry: UdhaarEntry | undefined;
    if (paymentMethod === 'udhaar' && effectiveUdhaarCustomerId) {
      const summaryLabel = lineItems
        .map((li) => `${li.quantity}x ${lang === 'ur' ? li.nameUr : li.nameEn}`)
        .join(', ');
      newUdhaarEntry = {
        id: `ue-${nowTs}`,
        customerId: effectiveUdhaarCustomerId,
        type: 'credit',
        amount: total,
        note: `POS Bill ${newOrder.receiptNumber} (${summaryLabel})`,
        receiptNumber: newOrder.receiptNumber,
        createdAt: newOrder.createdAt,
      };
      setUdhaarEntries((prev) => [...prev, newUdhaarEntry!]);
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
      updatedCustomer,
      newUdhaarCustomer
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

  const handleProcessOrderReturn = ({
    orderId,
    mode,
    items,
    reason,
  }: ReturnRequestPayload) => {
    if (!user) return;
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder) return;

    const reqQtyMap = new Map<string, number>();
    for (const entry of items) {
      if (entry.quantity > 0) {
        reqQtyMap.set(
          entry.productId,
          (reqQtyMap.get(entry.productId) ?? 0) + entry.quantity
        );
      }
    }
    if (reqQtyMap.size === 0) return;

    const appliedQtyMap = new Map<string, number>();
    let totalRemainingBefore = 0;
    let totalReturnedNow = 0;
    let returnedSubtotal = 0;
    let returnedTax = 0;
    const discountFactor = 1 - targetOrder.discountPercent / 100;

    const updatedItems = targetOrder.items.map((item) => {
      const remaining = Math.max(
        0,
        roundQuantity(item.quantity - (item.returnedQty ?? 0))
      );
      totalRemainingBefore = roundQuantity(totalRemainingBefore + remaining);

      const requested = roundQuantity(reqQtyMap.get(item.productId) ?? 0);
      const qtyToApply = Math.min(remaining, Math.max(0, requested));
      if (qtyToApply <= 0) return item;

      appliedQtyMap.set(item.productId, qtyToApply);
      totalReturnedNow = roundQuantity(totalReturnedNow + qtyToApply);

      const lineSub = roundCurrency(item.unitPrice * qtyToApply);
      returnedSubtotal = roundCurrency(returnedSubtotal + lineSub);
      returnedTax += lineSub * discountFactor * ((item.taxRate ?? 0) / 100);

      return {
        ...item,
        returnedQty: roundQuantity((item.returnedQty ?? 0) + qtyToApply),
        refundedQty:
          mode === 'refund'
            ? roundQuantity((item.refundedQty ?? 0) + qtyToApply)
            : item.refundedQty ?? 0,
        exchangedQty:
          mode === 'exchange'
            ? roundQuantity((item.exchangedQty ?? 0) + qtyToApply)
            : item.exchangedQty ?? 0,
      };
    });

    if (totalReturnedNow === 0) return;

    const returnedAllRemaining = totalReturnedNow >= totalRemainingBefore;

    let nextSubtotal = targetOrder.subtotal;
    let nextDiscountAmount = targetOrder.discountAmount;
    let nextTaxAmount = targetOrder.taxAmount;
    let nextTotal = targetOrder.total;
    let addedRefundAmount = 0;

    if (mode === 'refund') {
      if (returnedAllRemaining) {
        addedRefundAmount = targetOrder.total;
        nextSubtotal = 0;
        nextDiscountAmount = 0;
        nextTaxAmount = 0;
        nextTotal = 0;
      } else {
        const returnedDiscount = Math.round(
          returnedSubtotal * (targetOrder.discountPercent / 100)
        );
        const roundedTax = Math.round(returnedTax);
        const computedRefund = Math.max(
          0,
          roundCurrency(returnedSubtotal - returnedDiscount + roundedTax)
        );
        addedRefundAmount = Math.min(targetOrder.total, computedRefund);
        nextTotal = Math.max(0, roundCurrency(targetOrder.total - addedRefundAmount));
        nextSubtotal = Math.max(
          0,
          roundCurrency(targetOrder.subtotal - returnedSubtotal)
        );
        nextDiscountAmount = Math.max(
          0,
          roundCurrency(targetOrder.discountAmount - returnedDiscount)
        );
        nextTaxAmount = Math.max(0, roundCurrency(targetOrder.taxAmount - roundedTax));
      }
    }

    let nextReturnStatus: OrderRecord['returnStatus'] =
      targetOrder.returnStatus ?? 'completed';
    if (mode === 'refund') {
      const allUnitsRefunded = updatedItems.every(
        (li) => roundQuantity(li.refundedQty ?? 0) >= roundQuantity(li.quantity)
      );
      nextReturnStatus = allUnitsRefunded ? 'refunded' : 'partially_refunded';
    } else if (nextReturnStatus !== 'partially_refunded') {
      nextReturnStatus = 'exchanged';
    }

    const updatedOrder: OrderRecord = {
      ...targetOrder,
      items: updatedItems,
      subtotal: nextSubtotal,
      discountAmount: nextDiscountAmount,
      taxAmount: nextTaxAmount,
      total: nextTotal,
      returnStatus: nextReturnStatus,
      refundedAmount: roundCurrency(
        (targetOrder.refundedAmount ?? 0) + addedRefundAmount
      ),
      returnedAt: new Date().toISOString(),
      returnNote: reason || targetOrder.returnNote,
    };

    const restockedProducts: Product[] = [];
    const updatedProducts = products.map((prod) => {
      const addBackQty = appliedQtyMap.get(prod.id) ?? 0;
      if (addBackQty <= 0) return prod;
      const nextProd = {
        ...prod,
        stock: roundQuantity(prod.stock + addBackQty),
      };
      restockedProducts.push(nextProd);
      return nextProd;
    });

    setOrders((prev) =>
      prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
    );
    setProducts(updatedProducts);

    updateOrderReturnRecord(user.id, updatedOrder, restockedProducts).then(
      (syncErr) => {
        if (syncErr) setCloudSyncError(syncErr);
      }
    );
  };

  // Stock Management Handlers
  const handleAdjustStock = (productId: string, delta: number) => {
    if (!user || !guardAction('inventory.write')) return;
    let updatedTarget: Product | null = null;
    setProducts((prev) =>
      prev.map((prod) => {
        if (prod.id !== productId) return prod;
        updatedTarget = {
          ...prod,
          stock: Math.max(0, roundQuantity(prod.stock + delta)),
        };
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
    if (!user || !guardAction('inventory.write')) return;
    const created: Product = {
      ...newProd,
      sellingUnit: normalizeSellingUnit(newProd.sellingUnit),
      stock: Math.max(0, roundQuantity(newProd.stock)),
      id: `${user.id.slice(0, 8)}-prod-${Date.now()}`,
    };
    setProducts((prev) => [created, ...prev]);
    upsertProductRecord(user.id, created).then((syncErr) => {
      if (syncErr) setCloudSyncError(syncErr);
    });
  };

  const handleUpdateProduct = (updated: Product) => {
    if (!user || !guardAction('inventory.write')) return;
    const normalized: Product = {
      ...updated,
      sellingUnit: normalizeSellingUnit(updated.sellingUnit),
      stock: Math.max(0, roundQuantity(updated.stock)),
    };
    setProducts((prev) =>
      prev.map((prod) => (prod.id === normalized.id ? normalized : prod))
    );
    upsertProductRecord(user.id, normalized).then((syncErr) => {
      if (syncErr) setCloudSyncError(syncErr);
    });
  };

  const handleDeleteProduct = (productId: string) => {
    if (!user || !guardAction('inventory.write')) return;
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
    reminderSchedule,
    dueDate,
  }: {
    name: string;
    phone: string;
    notes: string;
    openingBalance: number;
    reminderSchedule?: ReminderSchedule;
    dueDate?: string;
  }): UdhaarCustomer => {
    const nowIso = new Date().toISOString();
    const prefix = user?.id.slice(0, 8) ?? 'shop';
    const customer: UdhaarCustomer = {
      id: `${prefix}-khata-${Date.now()}`,
      name,
      phone,
      notes,
      reminderSchedule: reminderSchedule ?? 'none',
      dueDate: dueDate || undefined,
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

  const handleUpdateUdhaarCustomer = (updated: UdhaarCustomer) => {
    setUdhaarCustomers((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
    if (user) {
      updateUdhaarCustomerRecord(user.id, updated).then((syncErr) => {
        if (syncErr) setCloudSyncError(syncErr);
      });
    }
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
    const created: Vendor = {
      id: generateUuid(),
      name,
      company,
      phone,
      address,
      balance: Math.max(0, balance),
      createdAt: new Date().toISOString(),
    };
    if (!guardAction('vendors.write')) return created;
    setVendors((prev) => [created, ...prev]);
    if (user) {
      upsertVendorRecord(user.id, created).then((syncErr) => {
        if (syncErr) setCloudSyncError(syncErr);
      });
    }
    return created;
  };

  const handleUpdateVendor = (updated: Vendor) => {
    if (!guardAction('vendors.write')) return;
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
    if (!guardAction('vendors.write')) return;
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
      sellingUnit?: SellingUnit;
      quantity: number;
      unitCost: number;
    }[];
  }): PurchaseRecord | null => {
    if (!user || lines.length === 0 || !guardAction('purchases.write')) return null;
    const vendor = vendors.find((v) => v.id === vendorId);
    if (!vendor) return null;

    const nowIso = new Date().toISOString();
    const purchaseId = generateUuid();

    const items: PurchaseItem[] = lines.map((line) => {
      const prod = products.find((p) => p.id === line.productId);
      const qty = roundQuantity(line.quantity);
      return {
        id: generateUuid(),
        purchaseId,
        productId: line.productId,
        productName: line.productName,
        sku: line.sku,
        sellingUnit: normalizeSellingUnit(line.sellingUnit ?? prod?.sellingUnit),
        quantity: qty,
        unitCost: line.unitCost,
        lineTotal: roundCurrency(qty * line.unitCost),
      };
    });

    const totalAmount = roundCurrency(
      items.reduce((sum, item) => sum + item.lineTotal, 0)
    );
    const cleanPaid = Math.max(0, paidAmount);
    const balanceDue = Math.max(0, roundCurrency(totalAmount - cleanPaid));

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
      qtyByProd.set(
        item.productId,
        roundQuantity((qtyByProd.get(item.productId) ?? 0) + item.quantity)
      );
      costByProd.set(item.productId, item.unitCost);
    }

    const updatedProducts = products.map((prod) => {
      const addedQty = qtyByProd.get(prod.id);
      if (!addedQty) return prod;
      const latestCost = costByProd.get(prod.id) ?? prod.cost;
      return {
        ...prod,
        stock: roundQuantity(prod.stock + addedQty),
        cost: latestCost,
      };
    });

    const updatedVendor: Vendor = {
      ...vendor,
      balance: roundCurrency(vendor.balance + balanceDue),
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
    if (!user || quantityChange === 0 || !guardAction('inventory.write')) return;
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const previousStock = roundQuantity(product.stock);
    const newStock = Math.max(0, roundQuantity(previousStock + quantityChange));
    const actualDelta = roundQuantity(newStock - previousStock);

    const updatedProduct: Product = {
      ...product,
      stock: newStock,
    };

    const adjustment: InventoryAdjustment = {
      id: generateUuid(),
      productId: product.id,
      productName: lang === 'ur' ? product.nameUr : product.nameEn,
      sku: product.sku,
      sellingUnit: normalizeSellingUnit(product.sellingUnit),
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
    const created: Customer = {
      id: generateUuid(),
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
    if (!user || !guardAction('customers.delete')) return;
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

  const handleSaveEmployee = async ({
    id,
    name,
    phone,
    role,
    pin,
    isActive,
  }: {
    id?: string;
    name: string;
    phone: string;
    role: EmployeeRole;
    pin?: string;
    isActive: boolean;
  }): Promise<string | null> => {
    if (!user) return 'Not signed in.';
    if (!guardAction('staff.manage')) return t.rbacUnauthorizedError;

    const prefix = user.id.slice(0, 8);
    const existing = id ? employees.find((e) => e.id === id) : undefined;
    const empId = existing?.id ?? `${prefix}-emp-${Date.now()}`;
    const createdAt = existing?.createdAt ?? new Date().toISOString();

    const { employee, error } = await saveEmployeeRecord(user.id, {
      id: empId,
      name,
      phone,
      role,
      pin,
      isActive,
      createdAt,
    });

    if (error || !employee) {
      return error || 'Failed to save staff member.';
    }

    setEmployees((prev) =>
      existing
        ? prev.map((e) => (e.id === employee.id ? employee : e))
        : [...prev, employee]
    );
    return null;
  };

  const handleDeleteEmployee = async (employeeId: string): Promise<string | null> => {
    if (!user) return 'Not signed in.';
    if (!guardAction('staff.manage')) return t.rbacUnauthorizedError;

    const err = await deleteEmployeeRecord(user.id, employeeId);
    if (err) return err;

    setEmployees((prev) => prev.filter((e) => e.id !== employeeId));
    return null;
  };

  const handleSaveStoreSettings = (nextSettings: StoreSettings) => {
    if (!user || !guardAction('settings.write')) return;
    setStoreSettings(nextSettings);
    upsertStoreSettingsRecord(user.id, nextSettings).then((syncErr) => {
      if (syncErr) setCloudSyncError(syncErr);
    });
  };

  // Phase 5: Daily Shop Expenses & SaaS Subscription Handlers
  const handleAddExpense = (payload: Omit<ExpenseRecord, 'id' | 'createdAt'>) => {
    if (!user || !guardAction('expenses.write')) return;
    const created: ExpenseRecord = {
      ...payload,
      id: generateUuid(),
      createdAt: new Date().toISOString(),
    };
    setExpenses((prev) => [created, ...prev]);
    upsertExpenseRecord(user.id, created).then((syncErr) => {
      if (syncErr) setCloudSyncError(syncErr);
    });
  };

  const handleUpdateExpense = (updated: ExpenseRecord) => {
    if (!user || !guardAction('expenses.write')) return;
    setExpenses((prev) =>
      prev.map((e) => (e.id === updated.id ? updated : e))
    );
    upsertExpenseRecord(user.id, updated).then((syncErr) => {
      if (syncErr) setCloudSyncError(syncErr);
    });
  };

  const handleDeleteExpense = (expenseId: string) => {
    if (!user || !guardAction('expenses.write')) return;
    setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
    deleteExpenseRecord(user.id, expenseId).then((syncErr) => {
      if (syncErr) setCloudSyncError(syncErr);
    });
  };

  const handleRefreshSubscriptionStatus = async () => {
    if (!user) return;
    setCheckingSubscription(true);
    try {
      const res = await ensureUserSubscription(
        user.id,
        user.email,
        storeSettings.storeName || user.shopName
      );
      setSubscription(res.subscription);
      if (res.syncError) setCloudSyncError(res.syncError);
    } finally {
      setCheckingSubscription(false);
    }
  };

  const handleRefreshAllSubscriptions = async () => {
    if (!user || !isSuperAdmin) return;
    setLoadingAllSubs(true);
    try {
      const res = await fetchAllSubscriptions();
      setAllSubscriptions(res.subscriptions);
      if (res.error) setCloudSyncError(res.error);
    } finally {
      setLoadingAllSubs(false);
    }
  };

  const handleAdminSubscriptionAction = async (
    sub: SubscriptionRecord,
    action: 'extend_30_days' | 'extend_1_year' | 'toggle_block'
  ) => {
    if (!user || !isSuperAdmin) return;
    setUpdatingSubUserId(sub.userId);
    try {
      const res = await adminUpdateSubscription(sub.userId, action, sub);
      setAllSubscriptions((prev) =>
        prev.map((item) => (item.userId === sub.userId ? res.updated : item))
      );
      if (sub.userId === user.id) {
        setSubscription(res.updated);
      }
      if (res.error) setCloudSyncError(res.error);
    } finally {
      setUpdatingSubUserId(null);
    }
  };

  const handleVerifyStaffPin = async (
    pin: string,
    targetEmployeeId?: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!user) return { ok: false, error: 'Not signed in.' };
    const result = await verifyStaffPinRecord(user.id, pin, targetEmployeeId);
    if (!result.ok || !result.token || !result.employeeId || !result.role || !result.expiresAt) {
      return { ok: false, error: result.error || t.invalidPinError };
    }

    const nextSession: StaffSessionInfo = {
      token: result.token,
      employeeId: result.employeeId,
      role: result.role,
      expiresAt: result.expiresAt,
    };
    saveStoredStaffSession(user.id, nextSession);
    setStaffSession(nextSession);
    setActiveEmployeeId(result.employeeId);
    setPendingSwitchEmployeeId(null);
    setIsScreenLocked(false);
    setShowStaffModal(false);
    setRbacNotice(null);

    if (activeTab === 'saas_admin') {
      if (!isSuperAdmin) setActiveTab('pos');
      return { ok: true };
    }
    if (!ROLE_ALLOWED_TABS[result.role].includes(activeTab)) {
      setActiveTab('pos');
    }
    return { ok: true };
  };

  const handleLockScreen = () => {
    if (user) {
      saveStoredStaffSession(user.id, null);
    }
    setStaffSession(null);
    setActiveEmployeeId(null);
    setPendingSwitchEmployeeId(null);
    setShowStaffModal(false);
    setIsScreenLocked(true);
  };

  const handleResetDemo = () => {
    if (!user || !guardAction('workspace.reset')) return;
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

  const handleRefreshCustomersForPos = useCallback(() => {
    if (!user) return;
    void fetchLatestCustomersForPos(user.id).then((latest) => {
      if (!latest) return;
      setCustomers(latest.customers);
      setUdhaarCustomers(latest.udhaarCustomers);
    });
  }, [user]);

  const handleCreateInlineKhataCustomer = (payload: InlineUdhaarCustomerPayload) => {
    const cleanName = payload.name.trim();
    const cleanPhone = payload.phone.trim();
    const normalizePhone = (p: string) => p.replace(/\D/g, '');
    const digits = normalizePhone(cleanPhone);

    const existingCrm = customers.find((c) => {
      const cDigits = normalizePhone(c.phone);
      if (digits && cDigits && digits === cDigits) return true;
      return c.name.trim().toLowerCase() === cleanName.toLowerCase();
    });

    const crmCustomer =
      existingCrm ??
      handleAddCustomer({
        name: cleanName,
        phone: cleanPhone,
        address: '',
        balance: 0,
      });

    const khataCustomer = handleAddUdhaarCustomer({
      name: cleanName,
      phone: cleanPhone,
      notes: '',
      openingBalance: 0,
      reminderSchedule: payload.reminderSchedule,
      dueDate: payload.dueDate,
    });

    return { crmCustomer, khataCustomer };
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
        onSelectTab={setActiveTab}
        onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
        mobileMenuOpen={mobileMenuOpen}
        isSuperAdmin={isSuperAdmin}
        subscription={subscription}
        onLockScreen={handleLockScreen}
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

      <SidebarNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        activeRole={activeRole}
        activeEmployeeName={activeEmployee?.name ?? t.roleCashier}
        isSuperAdmin={isSuperAdmin}
        onOpenStaffSwitcher={() => {
          setPendingSwitchEmployeeId(null);
          setShowStaffModal(true);
        }}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        shopName={activeStoreName}
        t={t}
      />

      <div className="flex-1 lg:ps-64 min-w-0 flex flex-col">
        {cloudSyncError && (
          <CloudSyncBanner
            error={cloudSyncError}
            retrying={retryingSync}
            onRetry={handleRetrySync}
            t={t}
          />
        )}

        {rbacNotice && (
          <div className="no-print bg-red-50 border-b border-red-200 px-4 sm:px-6 py-2.5">
            <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-3 text-xs font-semibold text-red-900">
              <span>{rbacNotice}</span>
              <button
                type="button"
                onClick={() => setRbacNotice(null)}
                aria-label={t.closeBtn}
                className="p-1 text-red-700 hover:text-red-950 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
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
        {loadingData && activeTab !== 'dashboard' ? (
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
                storeSettings={storeSettings}
                canViewDashboard={activeRole !== 'cashier'}
                onRefreshUdhaarCustomers={handleRefreshCustomersForPos}
                onCreateInlineKhataCustomer={handleCreateInlineKhataCustomer}
                onAddToCart={handleAddToCart}
                onUpdateQuantity={handleUpdateQuantity}
                onSetQuantity={handleSetCartQuantity}
                onToggleReturn={handleToggleCartItemReturn}
                onRemoveFromCart={handleRemoveFromCart}
                onClearCart={handleClearCart}
                onCompleteSale={handleCompleteSale}
                onGoToDashboard={() => setActiveTab('dashboard')}
                lastCompletedOrder={latestCompletedOrder}
                scannerDisabled={
                  Boolean(activeReceiptOrder) ||
                  showStaffModal ||
                  isScreenLocked ||
                  isSubscriptionLocked
                }
                lang={lang}
                t={t}
              />
            )}

            {activeTab === 'dashboard' && activeRole !== 'cashier' && (
              <ExecutiveDashboardView
                storeName={activeStoreName}
                orders={orders}
                expenses={expenses}
                products={products}
                purchases={purchases}
                latestNewOrderId={latestNewOrderId}
                canResetDemo={activeRole === 'admin'}
                suppressPrint={Boolean(activeReceiptOrder)}
                isLoading={loadingData}
                error={cloudSyncError}
                onRetry={handleRetrySync}
                onPrintReceipt={(order) => setActiveReceiptOrder(order)}
                onGoToPos={() => setActiveTab('pos')}
                onGoToInventory={() => setActiveTab('inventory')}
                onResetDemo={handleResetDemo}
                lang={lang}
                t={t}
              />
            )}

            {activeTab === 'transactions' && (
              <TransactionsView
                orders={orders}
                onPrintReceipt={(order) => setActiveReceiptOrder(order)}
                onProcessReturn={handleProcessOrderReturn}
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
                canDelete={activeRole === 'admin' || activeRole === 'manager'}
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
                storeName={activeStoreName}
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

            {activeTab === 'expenses' && activeRole !== 'cashier' && (
              <ExpensesView
                expenses={expenses}
                canDelete={activeRole === 'admin'}
                onAddExpense={handleAddExpense}
                onUpdateExpense={handleUpdateExpense}
                onDeleteExpense={handleDeleteExpense}
                lang={lang}
                t={t}
              />
            )}

            {activeTab === 'udhaar' && activeRole !== 'cashier' && (
              <UdhaarView
                storeName={activeStoreName}
                customers={udhaarCustomers}
                entries={udhaarEntries}
                onAddCustomer={handleAddUdhaarCustomer}
                onUpdateCustomer={handleUpdateUdhaarCustomer}
                onAddEntry={handleAddUdhaarEntry}
                lang={lang}
                t={t}
              />
            )}

            {activeTab === 'staff' && activeRole === 'admin' && (
              <StaffView
                employees={employees}
                activeEmployeeId={activeEmployee?.id ?? null}
                onSaveEmployee={handleSaveEmployee}
                onDeleteEmployee={handleDeleteEmployee}
                onRequestSwitchEmployee={(empId) => {
                  setPendingSwitchEmployeeId(empId);
                  setShowStaffModal(true);
                }}
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

            {activeTab === 'saas_admin' && isSuperAdmin && (
              <SaasAdminView
                subscriptions={allSubscriptions}
                loading={loadingAllSubs}
                updatingUserId={updatingSubUserId}
                onRefresh={() => void handleRefreshAllSubscriptions()}
                onAdminAction={(sub, action) =>
                  void handleAdminSubscriptionAction(sub, action)
                }
                lang={lang}
                t={t}
              />
            )}
          </>
        )}
        </main>
      </div>

      <ReceiptModal
        order={activeReceiptOrder}
        storeSettings={storeSettings}
        cashierName={activeEmployee?.name}
        onClose={() => setActiveReceiptOrder(null)}
        lang={lang}
        t={t}
      />

      {!isSubscriptionLocked && (
        <StaffPinModal
          isOpen={showStaffModal}
          isLocked={isScreenLocked}
          employees={employees}
          activeEmployee={activeEmployee}
          initialTargetEmployeeId={pendingSwitchEmployeeId}
          shopName={activeStoreName}
          onVerifyPin={handleVerifyStaffPin}
          onLockScreen={handleLockScreen}
          onClose={() => {
            setPendingSwitchEmployeeId(null);
            setShowStaffModal(false);
          }}
          onLogout={handleLogout}
          t={t}
        />
      )}

      {isSubscriptionLocked && subscription && (
        <SubscriptionLockModal
          subscription={subscription}
          shopName={activeStoreName}
          checkingStatus={checkingSubscription}
          onRefreshStatus={() => void handleRefreshSubscriptionStatus()}
          onLogout={() => void handleLogout()}
          lang={lang}
          t={t}
        />
      )}
    </div>
  );
}
