import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, WifiOff, X } from 'lucide-react';
import { AuditBackupView } from './components/AuditBackupView';
import { AuthView } from './components/AuthView';
import { BranchesView } from './components/BranchesView';
import { CashDrawerView } from './components/CashDrawerView';
import { CloudSyncBanner } from './components/CloudSyncBanner';
import { CustomerDisplayView } from './components/CustomerDisplayView';
import { CustomersView } from './components/CustomersView';
import { ExecutiveDashboardView } from './components/ExecutiveDashboardView';
import { ExpensesView } from './components/ExpensesView';
import { InventoryReportView } from './components/InventoryReportView';
import { InventoryView } from './components/InventoryView';
import {
  PosBillingView,
  type InlineUdhaarCustomerPayload,
  type PosCheckoutPayload,
} from './components/PosBillingView';
import {
  PurchasesView,
  type DraftPurchaseLine,
} from './components/PurchasesView';
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
import type { ImportedProductDraft } from './lib/csvUtils';
import {
  broadcastCustomerDisplay,
  triggerCashDrawerKick,
} from './lib/hardwareBridge';
import {
  buildWorkspaceBackupJson,
  createDefaultExtendedModules,
  loadExtendedModulesAsync,
  loadExtendedModulesSync,
  parseWorkspaceBackupJson,
  saveExtendedModules,
  type ExtendedWorkspaceModules,
} from './lib/posExtendedStore';
import {
  adminUpdateSubscription,
  adminUpdateSubscriptionMeta,
  authorizeServerAction,
  bulkUpsertProductsRecord,
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
  restoreWorkspaceSnapshotLocally,
  saveEmployeeRecord,
  setupInitialAdminRecord,
  signInShopkeeper,
  signOutShopkeeper,
  signUpShopkeeper,
  syncOfflineQueue,
  updateOrderReturnRecord,
  updatePurchaseRecordCompat,
  updateUdhaarCustomerRecord,
  upsertCustomerRecord,
  upsertExpenseRecord,
  upsertProductRecord,
  upsertStoreSettingsRecord,
  upsertVendorRecord,
  verifyStaffPinRecord,
  type AdminSubscriptionAction,
} from './lib/posRepository';
import { hasConfiguredAdmin } from './lib/pinSecurity';
import { generateUuid } from './lib/idUtils';
import { canAccessTab, hasRolePermission, type RoleAction } from './lib/rbac';
import {
  isSupabaseConfigured,
  setStaffSessionHeaderToken,
  supabase,
} from './lib/supabaseClient';
import {
  formatQuantityWithUnit,
  normalizeSellingUnit,
  roundCurrency,
  roundQuantity,
} from './lib/unitUtils';
import {
  dispatchWhatsAppMessage,
  formatWhatsAppReceiptMessage,
  formatWhatsAppReminderMessage,
  formatWhatsAppStatementMessage,
} from './lib/whatsappService';
import type {
  AdjustmentType,
  AuditCategory,
  AuditLogEntry,
  Branch,
  CartItem,
  CashDrawerMovement,
  CashShift,
  Customer,
  Employee,
  EmployeeActivityLog,
  EmployeeRole,
  ExpenseRecord,
  HeldBill,
  InventoryAdjustment,
  Language,
  NavTab,
  OrderLineItem,
  OrderRecord,
  PaymentMethod,
  Product,
  PurchaseItem,
  PurchaseOrderStatus,
  PurchaseRecord,
  PurchaseReturnRecord,
  ReminderSchedule,
  SaasAuditLogEntry,
  SellingUnit,
  ShopSubscriptionStatus,
  ShopkeeperUser,
  StaffSessionInfo,
  StockTransfer,
  StoreSettings,
  SubscriptionPaymentEntry,
  SubscriptionRecord,
  SupplierPayment,
  UdhaarCustomer,
  UdhaarEntry,
  UdhaarEntryType,
  Vendor,
} from './types';

const LANG_STORAGE_KEY = 'khaas_pos_lang_v1';

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
  const [workspaceLoadedUserId, setWorkspaceLoadedUserId] = useState<string | null>(null);
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
  const [saasAuditLogs, setSaasAuditLogs] = useState<SaasAuditLogEntry[]>([]);
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
  const [activeReceiptIsReprint, setActiveReceiptIsReprint] = useState<boolean>(false);
  const [latestNewOrderId, setLatestNewOrderId] = useState<string | null>(null);

  const [extendedModules, setExtendedModules] = useState<ExtendedWorkspaceModules>(() =>
    createDefaultExtendedModules()
  );
  const [showCustomerDisplayPreview, setShowCustomerDisplayPreview] = useState(false);

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

  const isStandaloneCustomerDisplay =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('display') === 'customer';

  const t = TRANSLATIONS[lang];
  const isWorkspaceBootstrapReady = Boolean(
    user && workspaceLoadedUserId === user.id && !loadingData
  );
  const adminConfigured = hasConfiguredAdmin(employees, {
    allowDemoFixturePins: user?.id === 'demo-shopkeeper-1',
  });
  const needsInitialAdminSetup = !adminConfigured;
  const isEffectiveOnline = browserOnline && networkReachable;
  const isSubscriptionLocked = Boolean(
    user &&
      !isSuperAdmin &&
      subscription &&
      (subscription.isBlocked ||
        subscription.status === 'suspended' ||
        subscription.status === 'blocked' ||
        new Date(subscription.expiresAt).getTime() <= Date.now())
  );

  useEffect(() => {
    if (!user || typeof console === 'undefined' || typeof console.info !== 'function') {
      return;
    }
    console.info('[SmartBitz Auth/Bootstrap]', {
      userId: user.id,
      shopName: user.shopName,
      loadingData,
      workspaceLoadedUserIdMatchesUser: workspaceLoadedUserId === user.id,
      isWorkspaceBootstrapReady,
      hasConfiguredAdmin: adminConfigured,
      needsInitialAdminSetup,
      isScreenLocked,
      showStaffModal,
      isSubscriptionLocked,
      employeesSummary: employees.map((e) => ({
        id: e.id,
        name: e.name,
        role: e.role,
        isActive: e.isActive,
        hasPin: Boolean(e.hasPin),
        pinState: e.pinState ?? (e.isDemoFixturePin ? 'demo_fixture' : 'unknown'),
      })),
    });
  }, [
    user,
    loadingData,
    workspaceLoadedUserId,
    isWorkspaceBootstrapReady,
    adminConfigured,
    needsInitialAdminSetup,
    isScreenLocked,
    showStaffModal,
    isSubscriptionLocked,
    employees,
  ]);

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
          const nextId = session.user.id;
          const nextEmail = session.user.email ?? '';
          const nextShop =
            (session.user.user_metadata?.shop_name as string) || 'Khaas Retail';
          setUser((prev) =>
            prev &&
            prev.id === nextId &&
            prev.email === nextEmail &&
            prev.shopName === nextShop
              ? prev
              : {
                  id: nextId,
                  email: nextEmail,
                  shopName: nextShop,
                }
          );
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
      const adminConfigured = hasConfiguredAdmin(ws.employees, {
        allowDemoFixturePins: userId === 'demo-shopkeeper-1',
      });

      if (!adminConfigured) {
        saveStoredStaffSession(userId, null);
        setStaffSession(null);
        setActiveEmployeeId(null);
        setPendingSwitchEmployeeId(null);
        setIsScreenLocked(true);
        return;
      }

      const candidateSession =
        ws.refreshedStaffSession ?? loadStoredStaffSession(userId);
      const sessionEmployee = candidateSession
        ? activeList.find(
            (e) => e.id === candidateSession.employeeId && e.hasPin !== false
          )
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
      setActiveEmployeeId(null);
      setIsScreenLocked(true);
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

  const updateExtended = useCallback(
    (updater: (prev: ExtendedWorkspaceModules) => ExtendedWorkspaceModules) => {
      setExtendedModules((prev) => {
        const next = updater(prev);
        if (user) {
          saveExtendedModules(user.id, next);
        }
        return next;
      });
    },
    [user]
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

        if (res.events && res.events.length > 0) {
          setExtendedModules((prev) => {
            const next: ExtendedWorkspaceModules = {
              ...prev,
              syncHistory: [...res.events, ...prev.syncHistory].slice(0, 150),
            };
            saveExtendedModules(targetUserId, next);
            return next;
          });
        }

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
      setWorkspaceLoadedUserId(null);
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
      setSaasAuditLogs([]);
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
      setActiveReceiptIsReprint(false);
      setLatestNewOrderId(null);
      setExtendedModules(createDefaultExtendedModules());
      setCloudSyncError(null);
      setPendingSyncCount(0);
      setOfflineSaleNotice(false);
      setSyncToastMessage(null);
      setRbacNotice(null);
      return;
    }

    setWorkspaceLoadedUserId((prev) => (prev === user.id ? prev : null));
    setEmployees([]);
    setStaffSession(null);
    setActiveEmployeeId(null);
    setPendingSwitchEmployeeId(null);
    setShowStaffModal(false);
    setIsScreenLocked(false);

    setExtendedModules(loadExtendedModulesSync(user.id, user.shopName));
    void loadExtendedModulesAsync(user.id, user.shopName).then((ext) => {
      if (active) setExtendedModules(ext);
    });

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
            setSaasAuditLogs(res.auditLogs ?? []);
            if (res.error) {
              setCloudSyncError((prev) => prev ?? res.error);
            }
          })
          .finally(() => {
            if (active) setLoadingAllSubs(false);
          });
      } else {
        setAllSubscriptions([]);
        setSaasAuditLogs([]);
      }
    });

    fetchWorkspaceData(user.id, user.shopName)
      .then((ws) => {
        if (!active) return;
        applyWorkspaceData(user.id, ws);
        setWorkspaceLoadedUserId(user.id);
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

  const activeBranch = useMemo(
    () =>
      extendedModules.branches.find((b) => b.id === extendedModules.activeBranchId) ??
      extendedModules.branches[0] ??
      null,
    [extendedModules.branches, extendedModules.activeBranchId]
  );

  const activeShift = useMemo(
    () =>
      extendedModules.cashShifts.find(
        (s) =>
          s.status === 'open' &&
          (!activeBranch || !s.branchId || s.branchId === activeBranch.id)
      ) ??
      extendedModules.cashShifts.find((s) => s.status === 'open') ??
      null,
    [extendedModules.cashShifts, activeBranch]
  );

  // Persist selected active employee per shopkeeper user
  useEffect(() => {
    if (!user || !activeEmployee) return;
    try {
      localStorage.setItem(activeStaffStorageKey(user.id), activeEmployee.id);
    } catch {
      // ignore
    }
  }, [user, activeEmployee]);

  // Enforce role permissions on activeTab using central rbac.canAccessTab
  useEffect(() => {
    if (!canAccessTab(activeRole, activeTab, isSuperAdmin)) {
      setActiveTab('pos');
    }
  }, [activeRole, activeTab, isSuperAdmin]);

  const recordAudit = useCallback(
    (
      category: AuditCategory,
      action: string,
      details: string,
      extra?: {
        targetId?: string;
        targetName?: string;
        previousValue?: string;
        newValue?: string;
      }
    ) => {
      if (!user) return;
      const entry: AuditLogEntry = {
        id: generateUuid(),
        category,
        actorId: activeEmployee?.id || user.id,
        actorName: activeEmployee?.name || user.shopName || 'Store Admin',
        actorRole: activeRole,
        action,
        details,
        targetId: extra?.targetId,
        targetName: extra?.targetName,
        previousValue: extra?.previousValue,
        newValue: extra?.newValue,
        branchId: activeBranch?.id,
        createdAt: new Date().toISOString(),
      };
      updateExtended((prev) => ({
        ...prev,
        auditLogs: [entry, ...prev.auditLogs].slice(0, 400),
      }));
    },
    [user, activeEmployee, activeRole, activeBranch, updateExtended]
  );

  const recordEmployeeActivity = useCallback(
    (
      employeeId: string,
      employeeName: string,
      role: EmployeeRole,
      eventType: EmployeeActivityLog['eventType']
    ) => {
      if (!user) return;
      const entry: EmployeeActivityLog = {
        id: generateUuid(),
        employeeId,
        employeeName,
        role,
        eventType,
        branchId: activeBranch?.id,
        createdAt: new Date().toISOString(),
      };
      updateExtended((prev) => ({
        ...prev,
        employeeActivityLogs: [entry, ...prev.employeeActivityLogs].slice(0, 300),
      }));
    },
    [user, activeBranch, updateExtended]
  );

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
    if (activeEmployee) {
      recordEmployeeActivity(activeEmployee.id, activeEmployee.name, activeRole, 'logout');
    }
    await signOutShopkeeper();
    if (prevUserId) {
      saveStoredStaffSession(prevUserId, null);
    }
    setUser(null);
    setWorkspaceLoadedUserId(null);
    setIsSuperAdmin(false);
    setStaffSession(null);
    setActiveEmployeeId(null);
    setPendingSwitchEmployeeId(null);
    setIsScreenLocked(false);
    setShowStaffModal(false);
    setMobileMenuOpen(false);
    setCart([]);
    setActiveReceiptOrder(null);
    setActiveReceiptIsReprint(false);
    setLatestNewOrderId(null);
    setRbacNotice(null);
  };

  const guardAction = (action: RoleAction): boolean => {
    if (isSubscriptionLocked) {
      setRbacNotice(t.subLockSuspendedDesc);
      return false;
    }
    if (!hasRolePermission(activeRole, action, activeEmployee?.customPermissions)) {
      setRbacNotice(t.rbacUnauthorizedError);
      return false;
    }
    setRbacNotice(null);
    void authorizeServerAction(action, activeEmployee?.customPermissions).then((err) => {
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
    isReturn = false,
    enteredUnit?: SellingUnit
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
            ? {
                ...item,
                quantity: nextQty,
                enteredUnit: enteredUnit ?? item.enteredUnit,
              }
            : item
        )
        .filter((item) => item.quantity > 0);
    });
  };

  const handleSetCartItemDiscount = (
    productId: string,
    isReturn: boolean,
    discountPercent: number
  ) => {
    const clamped = Math.max(0, Math.min(100, Number(discountPercent) || 0));
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId && Boolean(item.isReturn) === isReturn
          ? { ...item, itemDiscountPercent: clamped }
          : item
      )
    );
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

  const handleHoldCurrentBill = (payload: {
    customerId?: string;
    customerName: string;
    discountPercent: number;
    discountMode: 'percent' | 'fixed';
    fixedDiscountAmount: number;
    label?: string;
  }) => {
    if (!user || cart.length === 0) return;
    const held: HeldBill = {
      id: generateUuid(),
      label:
        payload.label?.trim() ||
        payload.customerName.trim() ||
        `Hold #${extendedModules.heldBills.length + 1}`,
      createdAt: new Date().toISOString(),
      cashierName: activeEmployee?.name || user.shopName || 'Cashier',
      branchId: activeBranch?.id,
      cart: [...cart],
      customerId: payload.customerId,
      customerName: payload.customerName,
      discountPercent: payload.discountPercent,
      discountMode: payload.discountMode,
      fixedDiscountAmount: payload.fixedDiscountAmount,
    };
    updateExtended((prev) => ({
      ...prev,
      heldBills: [held, ...prev.heldBills],
    }));
    setCart([]);
  };

  const handleResumeHeldBill = (bill: HeldBill) => {
    setCart(bill.cart);
    updateExtended((prev) => ({
      ...prev,
      heldBills: prev.heldBills.filter((b) => b.id !== bill.id),
    }));
  };

  const handleDiscardHeldBill = (billId: string) => {
    updateExtended((prev) => ({
      ...prev,
      heldBills: prev.heldBills.filter((b) => b.id !== billId),
    }));
  };

  const handleSendWhatsAppForCustomer = async (
    customer: Customer,
    type: 'reminder' | 'statement'
  ): Promise<{ manualUrl?: string; statusText?: string }> => {
    const entriesForCust = udhaarEntries.filter((e) => {
      const kh = udhaarCustomers.find(
        (k) =>
          k.id === e.customerId &&
          (k.id === customer.id ||
            (customer.phone && k.phone && k.phone === customer.phone) ||
            k.name.trim().toLowerCase() === customer.name.trim().toLowerCase())
      );
      return Boolean(kh);
    });

    const content =
      type === 'statement'
        ? formatWhatsAppStatementMessage({
            shopSettings: storeSettings,
            customer,
            entries: entriesForCust,
          })
        : formatWhatsAppReminderMessage({
            shopSettings: storeSettings,
            customer,
            templateOverride: storeSettings.whatsappTemplateReminder,
          });

    const res = await dispatchWhatsAppMessage({
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone,
      messageType: type,
      content,
      whatsappOptIn: customer.whatsappOptIn !== false,
    });

    updateExtended((prev) => ({
      ...prev,
      whatsappLogs: [res.logEntry, ...prev.whatsappLogs].slice(0, 300),
    }));

    return {
      manualUrl: res.manualFallbackUrl,
      statusText:
        res.logEntry.status === 'sent_api'
          ? 'Sent via WhatsApp Cloud API'
          : res.logEntry.errorMessage,
    };
  };

  const handleSendWhatsAppUdhaarReminder = async (
    customer: UdhaarCustomer,
    balance: number
  ): Promise<{ manualUrl?: string; statusText?: string }> => {
    const content = formatWhatsAppReminderMessage({
      shopSettings: storeSettings,
      customer: {
        name: customer.name,
        balance,
        dueDate: customer.dueDate,
      },
      templateOverride: storeSettings.whatsappTemplateReminder,
    });

    const res = await dispatchWhatsAppMessage({
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone,
      messageType: 'reminder',
      content,
      whatsappOptIn: customer.whatsappOptIn !== false,
    });

    updateExtended((prev) => ({
      ...prev,
      whatsappLogs: [res.logEntry, ...prev.whatsappLogs].slice(0, 300),
    }));

    return {
      manualUrl: res.manualFallbackUrl,
      statusText:
        res.logEntry.status === 'sent_api'
          ? 'Sent via WhatsApp Cloud API'
          : res.logEntry.errorMessage,
    };
  };

  const handleSendWhatsAppForOrder = async (
    order: OrderRecord
  ): Promise<{ manualUrl?: string; statusText?: string }> => {
    const crmCust = order.customerId
      ? customers.find((c) => c.id === order.customerId)
      : undefined;
    const khCust = order.udhaarCustomerId
      ? udhaarCustomers.find((k) => k.id === order.udhaarCustomerId)
      : undefined;
    const phone = crmCust?.phone || khCust?.phone || '';
    const optIn = (crmCust?.whatsappOptIn ?? khCust?.whatsappOptIn ?? true) !== false;
    const outstanding = crmCust?.balance ?? 0;

    const content = formatWhatsAppReceiptMessage({
      shopSettings: storeSettings,
      order,
      customerName: order.customerName || 'Walk-in Customer',
      outstandingBalance: outstanding,
      templateOverride: storeSettings.whatsappTemplateReceipt,
    });

    const res = await dispatchWhatsAppMessage({
      customerId: crmCust?.id || khCust?.id,
      customerName: order.customerName || 'Walk-in Customer',
      phone,
      messageType: order.paymentMethod === 'udhaar' ? 'udhaar_receipt' : 'receipt',
      content,
      whatsappOptIn: optIn,
    });

    updateExtended((prev) => ({
      ...prev,
      whatsappLogs: [res.logEntry, ...prev.whatsappLogs].slice(0, 300),
    }));

    return {
      manualUrl: res.manualFallbackUrl,
      statusText:
        res.logEntry.status === 'sent_api'
          ? 'Receipt sent via WhatsApp Cloud API'
          : res.logEntry.errorMessage,
    };
  };

  const handleCompleteSale = ({
    customerId,
    customerName,
    udhaarCustomerId,
    discountPercent,
    discountMode = 'percent',
    fixedDiscountAmount = 0,
    overrideTaxRate,
    paymentMethod,
    paymentSplits,
    amountTendered,
    transactionId,
    clientTxRef,
    inlineNewUdhaarCustomer,
  }: PosCheckoutPayload): OrderRecord | null => {
    if (!user || cart.length === 0 || isSubscriptionLocked) return null;

    if (clientTxRef) {
      const existingByRef = orders.find((o) => o.clientTxRef === clientTxRef);
      if (existingByRef) {
        setActiveReceiptIsReprint(false);
        setActiveReceiptOrder(existingByRef);
        return existingByRef;
      }
    }

    const lineItems: OrderLineItem[] = [];
    for (const cartItem of cart) {
      const product = products.find((p) => p.id === cartItem.productId);
      const isRet = Boolean(cartItem.isReturn);
      const qty = roundQuantity(cartItem.quantity);
      if (!product || qty <= 0 || (!isRet && product.stock + 0.0001 < qty)) continue;

      const signedQty = isRet ? -qty : qty;
      const itemDiscPct = Math.max(0, Math.min(100, cartItem.itemDiscountPercent || 0));
      const grossLine = roundCurrency(product.price * qty);
      const itemDiscAmt = roundCurrency(grossLine * (itemDiscPct / 100));
      const netLine = roundCurrency(grossLine - itemDiscAmt);
      const signedLineTotal = isRet ? -netLine : netLine;
      const itemTaxRate =
        overrideTaxRate !== undefined
          ? overrideTaxRate
          : (product.taxRate ?? 0) > 0
          ? product.taxRate
          : storeSettings.defaultTaxRate ?? 0;

      lineItems.push({
        productId: product.id,
        sku: product.sku,
        nameEn: product.nameEn,
        nameUr: product.nameUr,
        category: product.category,
        sellingUnit: normalizeSellingUnit(product.sellingUnit),
        enteredUnit: cartItem.enteredUnit
          ? normalizeSellingUnit(cartItem.enteredUnit)
          : undefined,
        itemDiscountAmount: itemDiscAmt > 0 ? itemDiscAmt : undefined,
        unitPrice: product.price,
        unitCost: product.cost,
        taxRate: itemTaxRate,
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
      subtotal <= 0
        ? 0
        : discountMode === 'fixed'
        ? Math.min(subtotal, Math.max(0, Math.round(fixedDiscountAmount)))
        : Math.round(subtotal * (discountPercent / 100));
    const effectiveDiscountPct =
      subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;
    const discountFactor = subtotal > 0 ? 1 - effectiveDiscountPct / 100 : 1;
    const taxAmount = Math.round(
      lineItems.reduce((sum, item) => {
        const discountedLine = item.lineTotal * discountFactor;
        return sum + discountedLine * ((item.taxRate ?? 0) / 100);
      }, 0)
    );
    const taxable = roundCurrency(subtotal - discountAmount);
    const effectiveTaxRate = taxable !== 0 ? taxAmount / taxable : 0;
    const total = roundCurrency(taxable + taxAmount);

    const activeSplits =
      Array.isArray(paymentSplits) && paymentSplits.length > 0
        ? paymentSplits.filter((sp) => sp.amount > 0)
        : undefined;

    const udhaarPortion = activeSplits
      ? roundCurrency(
          activeSplits
            .filter((sp) => sp.method === 'udhaar')
            .reduce((s, sp) => s + sp.amount, 0)
        )
      : paymentMethod === 'udhaar'
      ? Math.max(0, total)
      : 0;

    const cashPortion = activeSplits
      ? roundCurrency(
          activeSplits
            .filter((sp) => sp.method === 'cash')
            .reduce((s, sp) => s + sp.amount, 0)
        )
      : paymentMethod === 'cash'
      ? total
      : 0;

    // Enforce Customer Credit Limit before posting Udhaar debt
    if (udhaarPortion > 0 && !inlineNewUdhaarCustomer) {
      const targetCrm = customerId ? customers.find((c) => c.id === customerId) : undefined;
      const targetKh = udhaarCustomerId
        ? udhaarCustomers.find((k) => k.id === udhaarCustomerId)
        : undefined;
      const limit = targetCrm?.creditLimit ?? targetKh?.creditLimit ?? 0;
      const currentBal = targetCrm?.balance ?? 0;
      if (limit > 0 && currentBal + udhaarPortion > limit) {
        setRbacNotice(t.creditLimitExceededMsg);
        return null;
      }
    }

    const paidAmount = activeSplits
      ? roundCurrency(Math.max(0, total - udhaarPortion))
      : paymentMethod === 'udhaar'
      ? 0
      : Math.max(0, total);
    const balanceDue = roundCurrency(Math.max(0, udhaarPortion));

    const effectiveTendered = activeSplits
      ? roundCurrency(activeSplits.reduce((s, sp) => s + sp.amount, 0))
      : paymentMethod === 'cash'
      ? total > 0
        ? Math.max(total, amountTendered)
        : total
      : paymentMethod === 'udhaar'
      ? 0
      : total;
    const changeDue =
      !activeSplits && paymentMethod === 'cash' && total > 0
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

    if (udhaarPortion > 0) {
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
          whatsappOptIn: true,
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
            balance: roundCurrency(existingCrm.balance + udhaarPortion),
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
            balance: Math.max(0, udhaarPortion),
            whatsappOptIn: true,
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
            whatsappOptIn: true,
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
            balance: roundCurrency(resolvedCrm.balance + udhaarPortion),
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
            balance: Math.max(0, udhaarPortion),
            whatsappOptIn: true,
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
    const primaryMethod: PaymentMethod = activeSplits
      ? activeSplits[0].method
      : paymentMethod;

    const newOrder: OrderRecord = {
      id: `ord-${nowTs}`,
      receiptNumber: `KR-2026-${nextSeq}`,
      createdAt: nowIso,
      branchId: activeBranch?.id,
      branchName: activeBranch?.name,
      cashierId: activeEmployee?.id,
      cashierName: activeEmployee?.name || user.shopName || 'Cashier',
      shiftId: activeShift?.id,
      customerId: effectiveCustomerId,
      customerName: effectiveCustomerName,
      udhaarCustomerId: effectiveUdhaarCustomerId,
      paymentMethod: primaryMethod,
      paymentSplits: activeSplits,
      transactionId: transactionId?.trim() || undefined,
      clientTxRef: clientTxRef || generateUuid(),
      items: lineItems,
      subtotal,
      discountPercent: Math.round(effectiveDiscountPct * 100) / 100,
      discountMode,
      discountAmount,
      taxRate: effectiveTaxRate,
      taxAmount,
      total,
      paidAmount,
      balanceDue,
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
      const nextStock = Math.max(0, roundQuantity(prod.stock + delta));
      const nextBranchStock =
        activeBranch && prod.branchStock
          ? {
              ...prod.branchStock,
              [activeBranch.id]: Math.max(
                0,
                roundQuantity((prod.branchStock[activeBranch.id] ?? prod.stock) + delta)
              ),
            }
          : prod.branchStock;
      return {
        ...prod,
        stock: nextStock,
        branchStock: nextBranchStock,
      };
    });

    let newUdhaarEntry: UdhaarEntry | undefined;
    if (udhaarPortion > 0 && effectiveUdhaarCustomerId) {
      const summaryLabel = lineItems
        .map((li) => `${li.quantity}x ${lang === 'ur' ? li.nameUr : li.nameEn}`)
        .join(', ');
      newUdhaarEntry = {
        id: `ue-${nowTs}`,
        customerId: effectiveUdhaarCustomerId,
        type: 'credit',
        amount: udhaarPortion,
        note: `POS Bill ${newOrder.receiptNumber} (${summaryLabel})`,
        receiptNumber: newOrder.receiptNumber,
        createdAt: newOrder.createdAt,
      };
      setUdhaarEntries((prev) => [...prev, newUdhaarEntry!]);
    }

    // Update open cash shift if cash moved
    if (activeShift && cashPortion !== 0) {
      const movement: CashDrawerMovement = {
        id: generateUuid(),
        shiftId: activeShift.id,
        branchId: activeBranch?.id,
        type: cashPortion > 0 ? 'cash_sale' : 'cash_refund',
        amount: Math.abs(cashPortion),
        note: `Receipt ${newOrder.receiptNumber}`,
        employeeId: activeEmployee?.id || user.id,
        employeeName: activeEmployee?.name || 'Cashier',
        createdAt: nowIso,
      };
      updateExtended((prev) => ({
        ...prev,
        cashShifts: prev.cashShifts.map((s) =>
          s.id !== activeShift.id
            ? s
            : {
                ...s,
                cashSalesTotal:
                  s.cashSalesTotal + (cashPortion > 0 ? cashPortion : 0),
                cashRefundsTotal:
                  s.cashRefundsTotal + (cashPortion < 0 ? Math.abs(cashPortion) : 0),
                expectedCash: roundCurrency(s.expectedCash + cashPortion),
                movements: [movement, ...s.movements],
              }
        ),
      }));
    }

    if (storeSettings.autoKickDrawer && cashPortion > 0) {
      void triggerCashDrawerKick();
    }

    if (storeSettings.showCustomerDisplay !== false) {
      broadcastCustomerDisplay({
        storeName: storeSettings.storeName || user.shopName || t.brandName,
        lang,
        items: lineItems.map((li) => ({
          name: lang === 'ur' ? li.nameUr : li.nameEn,
          qtyLabel: formatQuantityWithUnit(li.quantity, li.sellingUnit || 'piece', lang),
          lineTotal: li.lineTotal,
        })),
        subtotal,
        discountAmount,
        taxAmount,
        grandTotal: total,
        status: 'completed',
        lastReceiptNumber: newOrder.receiptNumber,
        updatedAt: nowIso,
      });
    }

    if (storeSettings.whatsappAutoReceipts && (updatedCustomer?.phone || newUdhaarCustomer?.phone)) {
      void handleSendWhatsAppForOrder(newOrder);
    }

    setProducts(updatedProducts);
    setOrders((prev) => [...prev, newOrder]);
    setCart([]);
    setLatestNewOrderId(newOrder.id);
    setActiveReceiptIsReprint(false);
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

    if (mode === 'refund' && addedRefundAmount > 0 && activeShift && targetOrder.paymentMethod === 'cash') {
      const movement: CashDrawerMovement = {
        id: generateUuid(),
        shiftId: activeShift.id,
        branchId: activeBranch?.id,
        type: 'cash_refund',
        amount: addedRefundAmount,
        note: `Refund for ${targetOrder.receiptNumber}`,
        employeeId: activeEmployee?.id || user.id,
        employeeName: activeEmployee?.name || 'Staff',
        createdAt: new Date().toISOString(),
      };
      updateExtended((prev) => ({
        ...prev,
        cashShifts: prev.cashShifts.map((s) =>
          s.id !== activeShift.id
            ? s
            : {
                ...s,
                cashRefundsTotal: s.cashRefundsTotal + addedRefundAmount,
                expectedCash: Math.max(0, roundCurrency(s.expectedCash - addedRefundAmount)),
                movements: [movement, ...s.movements],
              }
        ),
      }));
    }

    recordAudit(
      'refund',
      `Processed ${mode} on ${targetOrder.receiptNumber}`,
      reason || `${totalReturnedNow} unit(s) returned`,
      {
        targetId: targetOrder.id,
        targetName: targetOrder.receiptNumber,
        previousValue: String(targetOrder.total),
        newValue: String(updatedOrder.total),
      }
    );

    updateOrderReturnRecord(user.id, updatedOrder, restockedProducts).then(
      (syncErr) => {
        if (syncErr) setCloudSyncError(syncErr);
      }
    );
  };

  const handleCancelOrder = (orderId: string, reason: string) => {
    if (!user || !guardAction('orders.cancel')) return;
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder || targetOrder.returnStatus === 'cancelled') return;

    const restockMap = new Map<string, number>();
    for (const li of targetOrder.items) {
      if (li.quantity > 0) {
        const notYetReturned = Math.max(
          0,
          roundQuantity(li.quantity - (li.returnedQty ?? 0))
        );
        if (notYetReturned > 0) {
          restockMap.set(
            li.productId,
            roundQuantity((restockMap.get(li.productId) ?? 0) + notYetReturned)
          );
        }
      }
    }

    const restockedProducts: Product[] = [];
    const updatedProducts = products.map((p) => {
      const addBack = restockMap.get(p.id) ?? 0;
      if (addBack <= 0) return p;
      const next = { ...p, stock: roundQuantity(p.stock + addBack) };
      restockedProducts.push(next);
      return next;
    });

    const cancelledOrder: OrderRecord = {
      ...targetOrder,
      returnStatus: 'cancelled',
      cancellationReason: reason || 'Cancelled by authorized staff',
      cancelledBy: activeEmployee?.name || 'Admin',
      cancelledAt: new Date().toISOString(),
    };

    setOrders((prev) =>
      prev.map((o) => (o.id === cancelledOrder.id ? cancelledOrder : o))
    );
    setProducts(updatedProducts);

    if (activeShift && targetOrder.paymentMethod === 'cash' && targetOrder.total > 0) {
      const reversal = Math.max(0, targetOrder.total - (targetOrder.refundedAmount ?? 0));
      if (reversal > 0) {
        const movement: CashDrawerMovement = {
          id: generateUuid(),
          shiftId: activeShift.id,
          branchId: activeBranch?.id,
          type: 'cash_refund',
          amount: reversal,
          note: `Voided bill ${targetOrder.receiptNumber}`,
          employeeId: activeEmployee?.id || user.id,
          employeeName: activeEmployee?.name || 'Admin',
          createdAt: new Date().toISOString(),
        };
        updateExtended((prev) => ({
          ...prev,
          cashShifts: prev.cashShifts.map((s) =>
            s.id !== activeShift.id
              ? s
              : {
                  ...s,
                  cashRefundsTotal: s.cashRefundsTotal + reversal,
                  expectedCash: Math.max(0, roundCurrency(s.expectedCash - reversal)),
                  movements: [movement, ...s.movements],
                }
          ),
        }));
      }
    }

    recordAudit(
      'sale_cancel',
      `Cancelled receipt ${targetOrder.receiptNumber}`,
      reason || 'Order voided',
      {
        targetId: targetOrder.id,
        targetName: targetOrder.receiptNumber,
        previousValue: String(targetOrder.total),
        newValue: 'cancelled',
      }
    );

    updateOrderReturnRecord(user.id, cancelledOrder, restockedProducts).then(
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
      branchId: newProd.branchId ?? activeBranch?.id,
      id: `${user.id.slice(0, 8)}-prod-${Date.now()}`,
    };
    setProducts((prev) => [created, ...prev]);
    upsertProductRecord(user.id, created).then((syncErr) => {
      if (syncErr) setCloudSyncError(syncErr);
    });
  };

  const handleUpdateProduct = (updated: Product) => {
    if (!user || !guardAction('inventory.write')) return;
    const prevProd = products.find((p) => p.id === updated.id);
    const normalized: Product = {
      ...updated,
      sellingUnit: normalizeSellingUnit(updated.sellingUnit),
      stock: Math.max(0, roundQuantity(updated.stock)),
    };
    if (prevProd && prevProd.price !== normalized.price) {
      recordAudit(
        'price_change',
        `Updated retail price for ${normalized.nameEn}`,
        `SKU ${normalized.sku}`,
        {
          targetId: normalized.id,
          targetName: normalized.nameEn,
          previousValue: String(prevProd.price),
          newValue: String(normalized.price),
        }
      );
    }
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

  const handleBulkImportProducts = (drafts: ImportedProductDraft[]) => {
    if (!user || drafts.length === 0 || !guardAction('inventory.write')) return;
    const prefix = user.id.slice(0, 8);
    const nowTs = Date.now();
    const existingBySku = new Map(
      products.map((p) => [p.sku.trim().toLowerCase(), p])
    );

    const toUpsert: Product[] = drafts.map((d, idx) => {
      const existing = existingBySku.get(d.sku.trim().toLowerCase());
      return {
        id: existing?.id ?? `${prefix}-imp-${nowTs}-${idx}`,
        sku: d.sku,
        barcode: d.barcode,
        qrCode: d.qrCode,
        nameEn: d.nameEn,
        nameUr: d.nameUr,
        category: d.category,
        brand: d.brand,
        variant: d.variant,
        sellingUnit: normalizeSellingUnit(d.sellingUnit),
        cost: d.cost,
        price: d.price,
        wholesalePrice: d.wholesalePrice,
        taxRate: d.taxRate,
        stock: roundQuantity(d.stock),
        minStock: d.minStock ?? existing?.minStock ?? 5,
        reorderLevel: d.reorderLevel ?? existing?.reorderLevel ?? 10,
        batchNumber: d.batchNumber,
        expiryDate: d.expiryDate,
        branchId: existing?.branchId ?? activeBranch?.id,
        image: existing?.image || '',
      };
    });

    setProducts((prev) => {
      const mergedMap = new Map(prev.map((p) => [p.id, p]));
      for (const item of toUpsert) {
        mergedMap.set(item.id, item);
      }
      return Array.from(mergedMap.values());
    });

    recordAudit(
      'stock_adjustment',
      `CSV bulk imported ${toUpsert.length} product(s)`,
      'Inventory CSV import'
    );

    bulkUpsertProductsRecord(user.id, toUpsert).then((syncErr) => {
      if (syncErr) setCloudSyncError(syncErr);
    });
  };

  const handleBulkUpdateProducts = (ids: string[], patch: Partial<Product>) => {
    if (!user || ids.length === 0 || !guardAction('inventory.write')) return;
    const idSet = new Set(ids);
    const modified: Product[] = [];
    setProducts((prev) =>
      prev.map((p) => {
        if (!idSet.has(p.id)) return p;
        const next: Product = {
          ...p,
          ...patch,
          stock: patch.stock !== undefined ? Math.max(0, roundQuantity(patch.stock)) : p.stock,
        };
        modified.push(next);
        return next;
      })
    );
    recordAudit(
      'price_change',
      `Bulk updated ${modified.length} product(s)`,
      Object.keys(patch).join(', ')
    );
    if (modified.length > 0) {
      bulkUpsertProductsRecord(user.id, modified).then((syncErr) => {
        if (syncErr) setCloudSyncError(syncErr);
      });
    }
  };

  // Udhaar / Khata Handlers
  const handleAddUdhaarCustomer = ({
    name,
    phone,
    notes,
    openingBalance,
    reminderSchedule,
    dueDate,
    creditLimit,
    discountPercent,
    whatsappOptIn,
  }: {
    name: string;
    phone: string;
    notes: string;
    openingBalance: number;
    reminderSchedule?: ReminderSchedule;
    dueDate?: string;
    creditLimit?: number;
    discountPercent?: number;
    whatsappOptIn?: boolean;
  }): UdhaarCustomer => {
    const nowIso = new Date().toISOString();
    const prefix = user?.id.slice(0, 8) ?? 'shop';
    const customer: UdhaarCustomer = {
      id: `${prefix}-khata-${Date.now()}`,
      name,
      phone,
      notes,
      creditLimit,
      discountPercent,
      reminderSchedule: reminderSchedule ?? 'none',
      dueDate: dueDate || undefined,
      whatsappOptIn: whatsappOptIn !== false,
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

  const handleRecordVendorPayment = (
    vendorId: string,
    amount: number,
    paymentMethod: SupplierPayment['paymentMethod'] = 'cash',
    note = '',
    purchaseId?: string
  ) => {
    if (!guardAction('vendors.write')) return;
    const target = vendors.find((v) => v.id === vendorId);
    if (!target || amount <= 0) return;

    const updated: Vendor = {
      ...target,
      balance: Math.max(0, roundCurrency(target.balance - amount)),
    };
    setVendors((prev) =>
      prev.map((v) => (v.id === vendorId ? updated : v))
    );

    const paymentEntry: SupplierPayment = {
      id: generateUuid(),
      vendorId,
      purchaseId,
      amount: roundCurrency(amount),
      paymentMethod,
      note: note.trim() || `Payment to ${target.name}`,
      employeeName: activeEmployee?.name || 'Admin',
      createdAt: new Date().toISOString(),
    };
    updateExtended((prev) => ({
      ...prev,
      supplierPayments: [paymentEntry, ...prev.supplierPayments],
    }));

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
    status = 'received',
    lines,
  }: {
    vendorId: string;
    invoiceNumber: string;
    paidAmount: number;
    note: string;
    status?: PurchaseOrderStatus;
    lines: DraftPurchaseLine[];
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
        batchNumber: line.batchNumber,
        expiryDate: line.expiryDate,
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
      status,
      branchId: activeBranch?.id,
      totalAmount,
      paidAmount: cleanPaid,
      balanceDue,
      note,
      items,
      createdAt: nowIso,
    };

    const shouldReceiveStockNow = status === 'received' || status === 'partial';
    const qtyByProd = new Map<string, number>();
    const costByProd = new Map<string, number>();
    const batchByProd = new Map<string, string | undefined>();
    const expiryByProd = new Map<string, string | undefined>();
    for (const item of items) {
      qtyByProd.set(
        item.productId,
        roundQuantity((qtyByProd.get(item.productId) ?? 0) + item.quantity)
      );
      costByProd.set(item.productId, item.unitCost);
      if (item.batchNumber) batchByProd.set(item.productId, item.batchNumber);
      if (item.expiryDate) expiryByProd.set(item.productId, item.expiryDate);
    }

    const updatedProducts = products.map((prod) => {
      const addedQty = qtyByProd.get(prod.id);
      if (!addedQty) return prod;
      const latestCost = costByProd.get(prod.id) ?? prod.cost;
      return {
        ...prod,
        stock: shouldReceiveStockNow
          ? roundQuantity(prod.stock + addedQty)
          : prod.stock,
        cost: latestCost,
        batchNumber: batchByProd.get(prod.id) ?? prod.batchNumber,
        expiryDate: expiryByProd.get(prod.id) ?? prod.expiryDate,
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

    if (cleanPaid > 0) {
      const paymentEntry: SupplierPayment = {
        id: generateUuid(),
        vendorId: vendor.id,
        purchaseId: purchase.id,
        amount: cleanPaid,
        paymentMethod: 'cash',
        note: `Advance/payment on ${invoiceNumber}`,
        employeeName: activeEmployee?.name || 'Admin',
        createdAt: nowIso,
      };
      updateExtended((prev) => ({
        ...prev,
        supplierPayments: [paymentEntry, ...prev.supplierPayments],
      }));
    }

    insertPurchaseRecord(user.id, purchase, updatedProducts, updatedVendor).then(
      (syncErr) => {
        if (syncErr) setCloudSyncError(syncErr);
      }
    );

    return purchase;
  };

  const handleUpdatePurchaseStatus = (
    purchaseId: string,
    nextStatus: PurchaseOrderStatus
  ) => {
    if (!user || !guardAction('purchases.write')) return;
    const target = purchases.find((p) => p.id === purchaseId);
    if (!target) return;

    const wasOrdered = target.status === 'ordered';
    const becomesReceived = nextStatus === 'received';
    let modifiedProducts: Product[] | undefined;

    if (wasOrdered && becomesReceived) {
      const qtyMap = new Map<string, number>();
      for (const item of target.items) {
        qtyMap.set(
          item.productId,
          roundQuantity((qtyMap.get(item.productId) ?? 0) + item.quantity)
        );
      }
      modifiedProducts = products.map((p) => {
        const added = qtyMap.get(p.id);
        if (!added) return p;
        return { ...p, stock: roundQuantity(p.stock + added) };
      });
      setProducts(modifiedProducts);
    }

    const updatedPurchase: PurchaseRecord = {
      ...target,
      status: nextStatus,
    };
    setPurchases((prev) =>
      prev.map((p) => (p.id === purchaseId ? updatedPurchase : p))
    );
    updatePurchaseRecordCompat(
      user.id,
      updatedPurchase,
      modifiedProducts?.filter((p) =>
        target.items.some((it) => it.productId === p.id)
      )
    ).then((syncErr) => {
      if (syncErr) setCloudSyncError(syncErr);
    });
  };

  const handlePurchaseReturn = ({
    purchaseId,
    items,
    reason,
  }: {
    purchaseId: string;
    items: { productId: string; quantity: number }[];
    reason: string;
  }) => {
    if (!user || !guardAction('purchases.write')) return;
    const target = purchases.find((p) => p.id === purchaseId);
    if (!target) return;

    const reqMap = new Map(
      items.filter((i) => i.quantity > 0).map((i) => [i.productId, i.quantity])
    );
    if (reqMap.size === 0) return;

    const returnedItems: PurchaseItem[] = [];
    let returnValue = 0;

    for (const pi of target.items) {
      const reqQty = roundQuantity(reqMap.get(pi.productId) ?? 0);
      const qtyToReturn = Math.min(pi.quantity, reqQty);
      if (qtyToReturn <= 0) continue;
      const lineAmt = roundCurrency(qtyToReturn * pi.unitCost);
      returnValue = roundCurrency(returnValue + lineAmt);
      returnedItems.push({
        ...pi,
        quantity: qtyToReturn,
        lineTotal: lineAmt,
      });
    }
    if (returnedItems.length === 0) return;

    const deductMap = new Map(
      returnedItems.map((it) => [it.productId, it.quantity])
    );
    const updatedProducts = products.map((p) => {
      const sub = deductMap.get(p.id) ?? 0;
      if (sub <= 0) return p;
      return { ...p, stock: Math.max(0, roundQuantity(p.stock - sub)) };
    });

    const targetVendor = vendors.find((v) => v.id === target.vendorId);
    const updatedVendor = targetVendor
      ? {
          ...targetVendor,
          balance: Math.max(0, roundCurrency(targetVendor.balance - returnValue)),
        }
      : undefined;

    const updatedPurchase: PurchaseRecord = {
      ...target,
      status: 'returned',
      returnedAmount: roundCurrency((target.returnedAmount ?? 0) + returnValue),
      balanceDue: Math.max(0, roundCurrency(target.balanceDue - returnValue)),
    };

    const returnRecord: PurchaseReturnRecord = {
      id: generateUuid(),
      purchaseId: target.id,
      vendorId: target.vendorId,
      vendorName: target.vendorName,
      invoiceNumber: target.invoiceNumber,
      branchId: activeBranch?.id,
      items: returnedItems,
      totalAmount: returnValue,
      reason: reason || 'Supplier return',
      employeeName: activeEmployee?.name || 'Admin',
      createdAt: new Date().toISOString(),
    };

    setPurchases((prev) =>
      prev.map((p) => (p.id === purchaseId ? updatedPurchase : p))
    );
    setProducts(updatedProducts);
    if (updatedVendor) {
      setVendors((prev) =>
        prev.map((v) => (v.id === updatedVendor.id ? updatedVendor : v))
      );
    }
    updateExtended((prev) => ({
      ...prev,
      purchaseReturns: [returnRecord, ...prev.purchaseReturns],
    }));

    recordAudit(
      'stock_adjustment',
      `Returned supplier items on PO ${target.invoiceNumber}`,
      reason || `Value Rs. ${returnValue}`,
      {
        targetId: target.id,
        targetName: target.invoiceNumber,
      }
    );

    updatePurchaseRecordCompat(
      user.id,
      updatedPurchase,
      updatedProducts.filter((p) => deductMap.has(p.id)),
      updatedVendor
    ).then((syncErr) => {
      if (syncErr) setCloudSyncError(syncErr);
    });
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
      branchId: activeBranch?.id,
      adjustmentType,
      quantityChange: actualDelta,
      previousStock,
      newStock,
      reason,
      actorName: activeEmployee?.name || 'Admin',
      createdAt: new Date().toISOString(),
    };

    setProducts((prev) =>
      prev.map((p) => (p.id === updatedProduct.id ? updatedProduct : p))
    );
    setInventoryAdjustments((prev) => [adjustment, ...prev]);

    recordAudit(
      'stock_adjustment',
      `${adjustmentType}: ${product.nameEn}`,
      `${previousStock} → ${newStock} (${reason})`,
      {
        targetId: product.id,
        targetName: product.nameEn,
        previousValue: String(previousStock),
        newValue: String(newStock),
      }
    );

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
    creditLimit,
    discountPercent,
    whatsappOptIn,
  }: {
    name: string;
    phone: string;
    address: string;
    balance: number;
    creditLimit?: number;
    discountPercent?: number;
    whatsappOptIn?: boolean;
  }): Customer => {
    const created: Customer = {
      id: generateUuid(),
      name,
      phone,
      address,
      balance: Math.max(0, balance),
      creditLimit,
      discountPercent,
      whatsappOptIn: whatsappOptIn !== false,
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
      balance: Math.max(0, roundCurrency(target.balance - amount)),
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
    branchId,
    shiftAssignment,
    customPermissions,
  }: {
    id?: string;
    name: string;
    phone: string;
    role: EmployeeRole;
    pin?: string;
    isActive: boolean;
    branchId?: string;
    shiftAssignment?: string;
    customPermissions?: string[];
  }): Promise<string | null> => {
    if (!user) return 'Not signed in.';
    if (!guardAction('staff.manage')) return t.rbacUnauthorizedError;

    const maxEmployeesLimit = subscription?.maxEmployees ?? 15;
    if (!id && employees.length >= maxEmployeesLimit) {
      return t.employeeLimitReachedMsg;
    }

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
      branchId,
      shiftAssignment,
      customPermissions,
      createdAt,
    });

    if (error || !employee) {
      return error || 'Failed to save staff member.';
    }

    if (
      existing &&
      JSON.stringify(existing.customPermissions ?? []) !==
        JSON.stringify(customPermissions ?? [])
    ) {
      recordAudit(
        'permission_change',
        `Updated custom permissions for ${employee.name}`,
        (customPermissions ?? []).join(', ') || 'Default role permissions',
        { targetId: employee.id, targetName: employee.name }
      );
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
      branchId: payload.branchId ?? activeBranch?.id,
      approvalStatus:
        payload.approvalStatus ?? (activeRole === 'admin' ? 'approved' : 'pending'),
      approvedBy:
        payload.approvalStatus === 'approved' || activeRole === 'admin'
          ? activeEmployee?.name || 'Admin'
          : undefined,
      id: generateUuid(),
      createdAt: new Date().toISOString(),
    };
    setExpenses((prev) => [created, ...prev]);

    if (created.paidFromDrawer && activeShift && created.amount > 0) {
      const movement: CashDrawerMovement = {
        id: generateUuid(),
        shiftId: activeShift.id,
        branchId: activeBranch?.id,
        type: 'expense',
        amount: created.amount,
        note: created.title,
        employeeId: activeEmployee?.id || user.id,
        employeeName: activeEmployee?.name || 'Staff',
        createdAt: new Date().toISOString(),
      };
      updateExtended((prev) => ({
        ...prev,
        cashShifts: prev.cashShifts.map((s) =>
          s.id !== activeShift.id
            ? s
            : {
                ...s,
                expenseTotal: roundCurrency(s.expenseTotal + created.amount),
                expectedCash: Math.max(0, roundCurrency(s.expectedCash - created.amount)),
                movements: [movement, ...s.movements],
              }
        ),
      }));
    }

    upsertExpenseRecord(user.id, created).then((syncErr) => {
      if (syncErr) setCloudSyncError(syncErr);
    });
  };

  const handleUpdateExpense = (updated: ExpenseRecord) => {
    if (!user) return;
    const prevExp = expenses.find((e) => e.id === updated.id);
    const isApprovalAction =
      prevExp && prevExp.approvalStatus !== updated.approvalStatus;
    if (isApprovalAction) {
      if (!guardAction('expenses.approve')) return;
    } else if (!guardAction('expenses.write')) {
      return;
    }
    const finalUpdated: ExpenseRecord = isApprovalAction
      ? {
          ...updated,
          approvedBy: activeEmployee?.name || 'Manager',
        }
      : updated;
    setExpenses((prev) =>
      prev.map((e) => (e.id === finalUpdated.id ? finalUpdated : e))
    );
    upsertExpenseRecord(user.id, finalUpdated).then((syncErr) => {
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

  // Phase 2 & 10 & 15: Cash Drawer Shifts, Multi-Branch Transfers & Backup/Restore
  const handleOpenShift = (openingCash: number, branchId?: string) => {
    if (!user || !guardAction('shifts.manage')) return;
    if (activeShift) return;
    const nowIso = new Date().toISOString();
    const shiftId = generateUuid();
    const cleanOpening = Math.max(0, roundCurrency(openingCash));
    const openingMovement: CashDrawerMovement = {
      id: generateUuid(),
      shiftId,
      branchId: branchId || activeBranch?.id,
      type: 'opening',
      amount: cleanOpening,
      note: 'Shift opening float',
      employeeId: activeEmployee?.id || user.id,
      employeeName: activeEmployee?.name || 'Cashier',
      createdAt: nowIso,
    };
    const newShift: CashShift = {
      id: shiftId,
      branchId: branchId || activeBranch?.id,
      cashierId: activeEmployee?.id || user.id,
      cashierName: activeEmployee?.name || user.shopName || 'Cashier',
      startedAt: nowIso,
      status: 'open',
      openingCash: cleanOpening,
      expectedCash: cleanOpening,
      cashSalesTotal: 0,
      cashRefundsTotal: 0,
      cashInTotal: 0,
      cashOutTotal: 0,
      expenseTotal: 0,
      movements: [openingMovement],
    };
    updateExtended((prev) => ({
      ...prev,
      cashShifts: [newShift, ...prev.cashShifts],
    }));
    recordAudit(
      'shift',
      `Opened cash shift with float Rs. ${cleanOpening}`,
      newShift.cashierName
    );
  };

  const handleDrawerMovement = (
    type: 'cash_in' | 'cash_out',
    amount: number,
    note: string
  ) => {
    if (!user || !activeShift || amount <= 0 || !guardAction('shifts.manage')) return;
    const cleanAmount = roundCurrency(amount);
    const movement: CashDrawerMovement = {
      id: generateUuid(),
      shiftId: activeShift.id,
      branchId: activeShift.branchId,
      type,
      amount: cleanAmount,
      note: note.trim() || (type === 'cash_in' ? 'Cash added' : 'Cash removed'),
      employeeId: activeEmployee?.id || user.id,
      employeeName: activeEmployee?.name || 'Cashier',
      createdAt: new Date().toISOString(),
    };
    updateExtended((prev) => ({
      ...prev,
      cashShifts: prev.cashShifts.map((s) =>
        s.id !== activeShift.id
          ? s
          : {
              ...s,
              cashInTotal:
                type === 'cash_in' ? roundCurrency(s.cashInTotal + cleanAmount) : s.cashInTotal,
              cashOutTotal:
                type === 'cash_out' ? roundCurrency(s.cashOutTotal + cleanAmount) : s.cashOutTotal,
              expectedCash: Math.max(
                0,
                roundCurrency(
                  type === 'cash_in' ? s.expectedCash + cleanAmount : s.expectedCash - cleanAmount
                )
              ),
              movements: [movement, ...s.movements],
            }
      ),
    }));
    recordAudit(
      'drawer_movement',
      `${type === 'cash_in' ? 'Cash In' : 'Cash Out'}: Rs. ${cleanAmount}`,
      movement.note
    );
  };

  const handleCloseShift = (actualCash: number, note: string) => {
    if (!user || !activeShift || !guardAction('shifts.close')) return;
    const cleanActual = Math.max(0, roundCurrency(actualCash));
    const diff = roundCurrency(cleanActual - activeShift.expectedCash);
    const nowIso = new Date().toISOString();
    const closingMove: CashDrawerMovement = {
      id: generateUuid(),
      shiftId: activeShift.id,
      branchId: activeShift.branchId,
      type: 'closing',
      amount: cleanActual,
      note: note.trim() || `Shift closed (diff Rs. ${diff})`,
      employeeId: activeEmployee?.id || user.id,
      employeeName: activeEmployee?.name || 'Manager',
      createdAt: nowIso,
    };
    updateExtended((prev) => ({
      ...prev,
      cashShifts: prev.cashShifts.map((s) =>
        s.id !== activeShift.id
          ? s
          : {
              ...s,
              status: 'closed',
              closedAt: nowIso,
              actualCash: cleanActual,
              cashDifference: diff,
              closedById: activeEmployee?.id || user.id,
              closedByName: activeEmployee?.name || 'Manager',
              closingNote: note.trim(),
              movements: [closingMove, ...s.movements],
            }
      ),
    }));
    recordAudit(
      'shift',
      `Closed shift (${activeShift.cashierName})`,
      `Expected Rs. ${activeShift.expectedCash}, Counted Rs. ${cleanActual}, Diff Rs. ${diff}`
    );
  };

  const handleSelectBranch = (branchId: string) => {
    updateExtended((prev) => ({ ...prev, activeBranchId: branchId }));
  };

  const handleSaveBranch = (
    payload: Omit<Branch, 'id' | 'createdAt'> & { id?: string }
  ) => {
    if (!user || !guardAction('branches.manage')) return;
    const limit = subscription?.maxBranches ?? 3;
    if (!payload.id && extendedModules.branches.length >= limit) {
      setRbacNotice(t.branchLimitReachedMsg);
      return;
    }
    if (payload.id) {
      updateExtended((prev) => ({
        ...prev,
        branches: prev.branches.map((b) =>
          b.id === payload.id ? { ...b, ...payload } : b
        ),
      }));
    } else {
      const created: Branch = {
        ...payload,
        id: generateUuid(),
        createdAt: new Date().toISOString(),
      };
      updateExtended((prev) => ({
        ...prev,
        branches: [...prev.branches, created],
      }));
    }
  };

  const handleCreateTransfer = (payload: {
    fromBranchId: string;
    toBranchId: string;
    productId: string;
    quantity: number;
    note: string;
  }) => {
    if (!user) return;
    const prod = products.find((p) => p.id === payload.productId);
    const fromBr = extendedModules.branches.find((b) => b.id === payload.fromBranchId);
    const toBr = extendedModules.branches.find((b) => b.id === payload.toBranchId);
    if (!prod || !fromBr || !toBr || payload.quantity <= 0) return;

    const transfer: StockTransfer = {
      id: generateUuid(),
      fromBranchId: fromBr.id,
      fromBranchName: fromBr.name,
      toBranchId: toBr.id,
      toBranchName: toBr.name,
      status: 'pending',
      items: [
        {
          productId: prod.id,
          sku: prod.sku,
          nameEn: prod.nameEn,
          nameUr: prod.nameUr,
          quantity: roundQuantity(payload.quantity),
          sellingUnit: normalizeSellingUnit(prod.sellingUnit),
        },
      ],
      requestedBy: activeEmployee?.name || 'Staff',
      note: payload.note,
      createdAt: new Date().toISOString(),
    };
    updateExtended((prev) => ({
      ...prev,
      stockTransfers: [transfer, ...prev.stockTransfers],
    }));
    recordAudit(
      'transfer',
      `Requested stock transfer ${fromBr.name} → ${toBr.name}`,
      `${payload.quantity} ${prod.sellingUnit} ${prod.nameEn}`
    );
  };

  const handleUpdateTransferStatus = (
    transferId: string,
    status: 'completed' | 'rejected'
  ) => {
    if (!user || !guardAction('transfers.approve')) return;
    const target = extendedModules.stockTransfers.find((tr) => tr.id === transferId);
    if (!target || target.status !== 'pending') return;

    const nowIso = new Date().toISOString();
    if (status === 'completed') {
      const updatedProducts: Product[] = products.map((p) => {
        const line = target.items.find((it) => it.productId === p.id);
        if (!line) return p;
        const currentMap = { ...(p.branchStock || { [target.fromBranchId]: p.stock }) };
        const fromAvail = currentMap[target.fromBranchId] ?? p.stock;
        const toAvail = currentMap[target.toBranchId] ?? 0;
        currentMap[target.fromBranchId] = Math.max(
          0,
          roundQuantity(fromAvail - line.quantity)
        );
        currentMap[target.toBranchId] = roundQuantity(toAvail + line.quantity);
        return {
          ...p,
          branchStock: currentMap,
        };
      });
      setProducts(updatedProducts);
      const changed = updatedProducts.filter((p) =>
        target.items.some((it) => it.productId === p.id)
      );
      if (changed.length > 0) {
        void bulkUpsertProductsRecord(user.id, changed);
      }
    }

    updateExtended((prev) => ({
      ...prev,
      stockTransfers: prev.stockTransfers.map((tr) =>
        tr.id === transferId
          ? {
              ...tr,
              status,
              approvedBy: activeEmployee?.name || 'Manager',
              completedAt: status === 'completed' ? nowIso : undefined,
            }
          : tr
      ),
    }));
    recordAudit(
      'transfer',
      `Stock transfer ${status}`,
      `${target.fromBranchName} → ${target.toBranchName}`
    );
  };

  const handleDownloadBackup = () => {
    if (!user || !guardAction('backup.manage')) return;
    const json = buildWorkspaceBackupJson({
      userId: user.id,
      shopName: storeSettings.storeName || user.shopName || 'Khaas Retail',
      workspace: {
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
      },
      extended: extendedModules,
    });
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smartbitz-pos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    recordAudit('backup', 'Exported full POS JSON backup', `${products.length} products, ${orders.length} orders`);
  };

  const handleRestoreBackupJson = (
    rawJson: string
  ): { ok: boolean; error?: string } => {
    if (!user || !guardAction('backup.manage')) {
      return { ok: false, error: t.rbacUnauthorizedError };
    }
    const parsed = parseWorkspaceBackupJson(rawJson);
    if (!parsed.valid) {
      return { ok: false, error: parsed.error };
    }
    const restoredWs = restoreWorkspaceSnapshotLocally(
      user.id,
      parsed.payload.workspace
    );
    applyWorkspaceData(user.id, restoredWs);
    saveExtendedModules(user.id, parsed.payload.extended);
    setExtendedModules(parsed.payload.extended);
    recordAudit(
      'backup',
      'Restored workspace snapshot from JSON backup',
      `Exported at ${parsed.payload.exportedAt}`
    );
    return { ok: true };
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
      setSaasAuditLogs(res.auditLogs ?? []);
      if (res.error) setCloudSyncError(res.error);
    } finally {
      setLoadingAllSubs(false);
    }
  };

  const handleAdminSubscriptionAction = async (
    sub: SubscriptionRecord,
    action: AdminSubscriptionAction,
    options?: { suspendedReason?: string }
  ) => {
    if (!user || !isSuperAdmin) return;
    setUpdatingSubUserId(sub.userId);
    try {
      const res = await adminUpdateSubscription(sub.userId, action, sub, options);
      setAllSubscriptions((prev) =>
        prev.map((item) => (item.userId === sub.userId ? res.updated : item))
      );
      if (res.auditLog) {
        setSaasAuditLogs((prev) => [res.auditLog!, ...prev].slice(0, 100));
      }
      if (sub.userId === user.id) {
        setSubscription(res.updated);
      }
      if (res.error) setCloudSyncError(res.error);
    } finally {
      setUpdatingSubUserId(null);
    }
  };

  const handleAdminUpdateSubscriptionMeta = async (
    sub: SubscriptionRecord,
    patch: {
      planName?: string;
      maxBranches?: number;
      maxEmployees?: number;
      status?: ShopSubscriptionStatus;
      suspendedReason?: string;
      paymentEntry?: SubscriptionPaymentEntry;
    }
  ) => {
    if (!user || !isSuperAdmin) return;
    setUpdatingSubUserId(sub.userId);
    try {
      const res = await adminUpdateSubscriptionMeta(sub.userId, patch, sub);
      setAllSubscriptions((prev) =>
        prev.map((item) => (item.userId === sub.userId ? res.updated : item))
      );
      if (res.auditLog) {
        setSaasAuditLogs((prev) => [res.auditLog!, ...prev].slice(0, 100));
      }
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

    const switchedEmp = employees.find((e) => e.id === result.employeeId);
    if (switchedEmp) {
      recordEmployeeActivity(
        switchedEmp.id,
        switchedEmp.name,
        result.role,
        activeEmployee ? 'pin_switch' : 'login'
      );
    }

    if (!canAccessTab(result.role, activeTab, isSuperAdmin)) {
      setActiveTab('pos');
    }
    return { ok: true };
  };

  const handleSetupInitialAdmin = async (payload: {
    name: string;
    phone: string;
    pin: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!user) return { ok: false, error: 'Not signed in.' };
    const result = await setupInitialAdminRecord(user.id, payload);
    if (!result.ok || !result.employee || !result.session) {
      return { ok: false, error: result.error || 'Failed to create initial Admin PIN.' };
    }

    const createdEmployee = result.employee;
    const nextSession = result.session;

    setEmployees((prev) =>
      prev.some((e) => e.id === createdEmployee.id)
        ? prev.map((e) => (e.id === createdEmployee.id ? createdEmployee : e))
        : [...prev, createdEmployee]
    );
    saveStoredStaffSession(user.id, nextSession);
    setStaffSession(nextSession);
    setActiveEmployeeId(createdEmployee.id);
    setPendingSwitchEmployeeId(null);
    setIsScreenLocked(false);
    setShowStaffModal(false);
    setRbacNotice(null);
    recordEmployeeActivity(createdEmployee.id, createdEmployee.name, 'admin', 'login');
    recordAudit(
      'permission_change',
      'Initial Store Admin PIN configured',
      createdEmployee.name,
      {
        targetId: createdEmployee.id,
        targetName: createdEmployee.name,
      }
    );
    return { ok: true };
  };

  const handleLockScreen = () => {
    if (activeEmployee) {
      recordEmployeeActivity(activeEmployee.id, activeEmployee.name, activeRole, 'lock');
    }
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
        setActiveReceiptIsReprint(false);
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

  if (isStandaloneCustomerDisplay) {
    return (
      <CustomerDisplayView
        fallbackLang={lang}
        fallbackStoreName={storeSettings.storeName || user?.shopName || t.brandName}
      />
    );
  }

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

  // Wait until initial workspace load & bootstrap-admin detection complete before rendering Staff PIN modal
  if (workspaceLoadedUserId !== user.id) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm font-medium text-slate-600">{t.loadingWorkspace}</div>
      </div>
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
                heldBills={extendedModules.heldBills}
                activeBranchName={activeBranch?.name}
                canViewDashboard={hasRolePermission(activeRole, 'dashboard.view', activeEmployee?.customPermissions)}
                onRefreshUdhaarCustomers={handleRefreshCustomersForPos}
                onCreateInlineKhataCustomer={handleCreateInlineKhataCustomer}
                onAddToCart={handleAddToCart}
                onUpdateQuantity={handleUpdateQuantity}
                onSetQuantity={handleSetCartQuantity}
                onSetCartItemDiscount={handleSetCartItemDiscount}
                onToggleReturn={handleToggleCartItemReturn}
                onRemoveFromCart={handleRemoveFromCart}
                onClearCart={handleClearCart}
                onHoldCurrentBill={handleHoldCurrentBill}
                onResumeHeldBill={handleResumeHeldBill}
                onDiscardHeldBill={handleDiscardHeldBill}
                onOpenCustomerDisplay={() => {
                  if (window.smartbitzDesktop?.openCustomerDisplay) {
                    void window.smartbitzDesktop.openCustomerDisplay();
                  } else {
                    setShowCustomerDisplayPreview(true);
                  }
                }}
                onCompleteSale={handleCompleteSale}
                onGoToDashboard={() => setActiveTab('dashboard')}
                lastCompletedOrder={latestCompletedOrder}
                scannerDisabled={
                  Boolean(activeReceiptOrder) ||
                  showStaffModal ||
                  isScreenLocked ||
                  isSubscriptionLocked ||
                  showCustomerDisplayPreview
                }
                lang={lang}
                t={t}
              />
            )}

            {activeTab === 'dashboard' &&
              hasRolePermission(activeRole, 'dashboard.view', activeEmployee?.customPermissions) && (
                <ExecutiveDashboardView
                  storeName={activeStoreName}
                  orders={orders}
                  expenses={expenses}
                  products={products}
                  purchases={purchases}
                  cashShifts={extendedModules.cashShifts}
                  branches={extendedModules.branches}
                  latestNewOrderId={latestNewOrderId}
                  canResetDemo={activeRole === 'admin'}
                  suppressPrint={Boolean(activeReceiptOrder)}
                  isLoading={loadingData}
                  error={cloudSyncError}
                  onRetry={handleRetrySync}
                  onPrintReceipt={(order) => {
                    setActiveReceiptIsReprint(true);
                    setActiveReceiptOrder(order);
                  }}
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
                canCancelOrders={hasRolePermission(activeRole, 'orders.cancel', activeEmployee?.customPermissions)}
                onPrintReceipt={(order, isReprint) => {
                  setActiveReceiptIsReprint(Boolean(isReprint ?? true));
                  setActiveReceiptOrder(order);
                }}
                onProcessReturn={handleProcessOrderReturn}
                onCancelOrder={handleCancelOrder}
                onSendWhatsApp={(order) => {
                  setActiveReceiptIsReprint(true);
                  setActiveReceiptOrder(order);
                }}
                lang={lang}
                t={t}
              />
            )}

            {activeTab === 'shifts' && (
              <CashDrawerView
                shifts={extendedModules.cashShifts}
                activeShift={activeShift}
                activeEmployee={activeEmployee}
                branches={extendedModules.branches}
                selectedBranchId={extendedModules.activeBranchId}
                canCloseShift={hasRolePermission(activeRole, 'shifts.close', activeEmployee?.customPermissions)}
                onOpenShift={handleOpenShift}
                onDrawerMovement={handleDrawerMovement}
                onCloseShift={handleCloseShift}
                lang={lang}
                t={t}
              />
            )}

            {activeTab === 'inventory' &&
              hasRolePermission(activeRole, 'inventory.write', activeEmployee?.customPermissions) && (
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
                  onBulkImportProducts={handleBulkImportProducts}
                  onBulkUpdateProducts={handleBulkUpdateProducts}
                  lang={lang}
                  t={t}
                />
              )}

            {activeTab === 'inventory_report' &&
              hasRolePermission(activeRole, 'reports.view', activeEmployee?.customPermissions) && (
                <InventoryReportView
                  storeName={activeStoreName}
                  products={products}
                  adjustments={inventoryAdjustments}
                  suppressPrint={Boolean(activeReceiptOrder)}
                  lang={lang}
                  t={t}
                />
              )}

            {activeTab === 'purchases' &&
              hasRolePermission(activeRole, 'purchases.write', activeEmployee?.customPermissions) && (
                <PurchasesView
                  vendors={vendors}
                  products={products}
                  purchases={purchases}
                  onReceiveInventory={handleReceiveInventory}
                  onUpdatePurchaseStatus={handleUpdatePurchaseStatus}
                  onPurchaseReturn={handlePurchaseReturn}
                  onGoToVendors={() => setActiveTab('vendors')}
                  lang={lang}
                  t={t}
                />
              )}

            {activeTab === 'vendors' &&
              hasRolePermission(activeRole, 'vendors.write', activeEmployee?.customPermissions) && (
                <VendorsView
                  vendors={vendors}
                  purchases={purchases}
                  supplierPayments={extendedModules.supplierPayments}
                  storeName={activeStoreName}
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
                entries={udhaarEntries}
                storeSettings={storeSettings}
                canDelete={activeRole === 'admin'}
                onAddCustomer={handleAddCustomer}
                onUpdateCustomer={handleUpdateCustomer}
                onDeleteCustomer={handleDeleteCustomer}
                onRecordPayment={handleRecordCustomerPayment}
                onPrintReceipt={(order) => {
                  setActiveReceiptIsReprint(true);
                  setActiveReceiptOrder(order);
                }}
                onSendWhatsAppMessage={handleSendWhatsAppForCustomer}
                lang={lang}
                t={t}
              />
            )}

            {activeTab === 'expenses' &&
              hasRolePermission(activeRole, 'expenses.write', activeEmployee?.customPermissions) && (
                <ExpensesView
                  expenses={expenses}
                  canDelete={activeRole === 'admin'}
                  activeShiftOpen={Boolean(activeShift)}
                  canApproveExpenses={hasRolePermission(activeRole, 'expenses.approve', activeEmployee?.customPermissions)}
                  onAddExpense={handleAddExpense}
                  onUpdateExpense={handleUpdateExpense}
                  onDeleteExpense={handleDeleteExpense}
                  lang={lang}
                  t={t}
                />
              )}

            {activeTab === 'udhaar' &&
              hasRolePermission(activeRole, 'udhaar.write', activeEmployee?.customPermissions) && (
                <UdhaarView
                  storeName={activeStoreName}
                  customers={udhaarCustomers}
                  entries={udhaarEntries}
                  onAddCustomer={handleAddUdhaarCustomer}
                  onUpdateCustomer={handleUpdateUdhaarCustomer}
                  onAddEntry={handleAddUdhaarEntry}
                  onSendWhatsAppReminder={handleSendWhatsAppUdhaarReminder}
                  lang={lang}
                  t={t}
                />
              )}

            {activeTab === 'branches' &&
              canAccessTab(activeRole, 'branches', isSuperAdmin) && (
                <BranchesView
                  branches={extendedModules.branches}
                  activeBranchId={extendedModules.activeBranchId}
                  maxBranchesAllowed={subscription?.maxBranches ?? 3}
                  products={products}
                  orders={orders}
                  transfers={extendedModules.stockTransfers}
                  canManageBranches={hasRolePermission(activeRole, 'branches.manage', activeEmployee?.customPermissions)}
                  canApproveTransfers={hasRolePermission(activeRole, 'transfers.approve', activeEmployee?.customPermissions)}
                  onSelectBranch={handleSelectBranch}
                  onSaveBranch={handleSaveBranch}
                  onCreateTransfer={handleCreateTransfer}
                  onUpdateTransferStatus={handleUpdateTransferStatus}
                  lang={lang}
                  t={t}
                />
              )}

            {activeTab === 'staff' && activeRole === 'admin' && (
              <StaffView
                employees={employees}
                activeEmployeeId={activeEmployee?.id ?? null}
                branches={extendedModules.branches}
                maxEmployees={subscription?.maxEmployees ?? 15}
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

            {activeTab === 'audit_logs' &&
              hasRolePermission(activeRole, 'audit.view', activeEmployee?.customPermissions) && (
                <AuditBackupView
                  auditLogs={extendedModules.auditLogs}
                  activityLogs={extendedModules.employeeActivityLogs}
                  syncHistory={extendedModules.syncHistory}
                  offlineQueue={getOfflineQueue(user.id)}
                  whatsappLogs={extendedModules.whatsappLogs}
                  canManageBackup={hasRolePermission(activeRole, 'backup.manage', activeEmployee?.customPermissions)}
                  onDownloadBackup={handleDownloadBackup}
                  onRestoreBackupJson={handleRestoreBackupJson}
                  onRetrySyncNow={() => void runOfflineSync(user.id, user.shopName)}
                  t={t}
                />
              )}

            {activeTab === 'saas_admin' && isSuperAdmin && (
              <SaasAdminView
                subscriptions={allSubscriptions}
                auditLogs={saasAuditLogs}
                currentUserId={user.id}
                loading={loadingAllSubs}
                updatingUserId={updatingSubUserId}
                onRefresh={() => void handleRefreshAllSubscriptions()}
                onAdminAction={(sub, action, options) =>
                  void handleAdminSubscriptionAction(sub, action, options)
                }
                onUpdateSubscriptionMeta={(sub, patch) =>
                  void handleAdminUpdateSubscriptionMeta(sub, patch)
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
        isReprint={activeReceiptIsReprint}
        onSendWhatsApp={handleSendWhatsAppForOrder}
        onClose={() => {
          setActiveReceiptOrder(null);
          setActiveReceiptIsReprint(false);
        }}
        lang={lang}
        t={t}
      />

      {showCustomerDisplayPreview && (
        <div className="fixed inset-0 z-50">
          <CustomerDisplayView
            fallbackLang={lang}
            fallbackStoreName={activeStoreName}
            onClose={() => setShowCustomerDisplayPreview(false)}
          />
        </div>
      )}

      {!isSubscriptionLocked && isWorkspaceBootstrapReady && (
        <StaffPinModal
          isOpen={showStaffModal}
          isLocked={isScreenLocked}
          needsInitialAdminSetup={needsInitialAdminSetup}
          defaultAdminName={
            employees.find((e) => e.role === 'admin' && e.isActive)?.name ||
            (user?.shopName ? `${user.shopName} Owner` : '')
          }
          userEmail={user?.email}
          employees={employees}
          activeEmployee={activeEmployee}
          initialTargetEmployeeId={pendingSwitchEmployeeId}
          shopName={activeStoreName}
          onVerifyPin={handleVerifyStaffPin}
          onSetupInitialAdmin={handleSetupInitialAdmin}
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
