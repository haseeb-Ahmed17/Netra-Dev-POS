import { useEffect, useState } from 'react';
import { AuthView } from './components/AuthView';
import { ExecutiveDashboardView } from './components/ExecutiveDashboardView';
import { InventoryView } from './components/InventoryView';
import { PosBillingView } from './components/PosBillingView';
import { ReceiptModal } from './components/ReceiptModal';
import { TopBar } from './components/TopBar';
import { TransactionsView } from './components/TransactionsView';
import { UdhaarView } from './components/UdhaarView';
import { TRANSLATIONS } from './i18n';
import {
  deleteProductRecord,
  fetchWorkspaceData,
  getActiveShopkeeper,
  insertOrderRecord,
  insertUdhaarCustomerRecord,
  insertUdhaarEntryRecord,
  resetUserDemoWorkspace,
  signInShopkeeper,
  signOutShopkeeper,
  signUpShopkeeper,
  upsertProductRecord,
} from './lib/posRepository';
import { isSupabaseConfigured, supabase } from './lib/supabaseClient';
import type {
  CartItem,
  Language,
  NavTab,
  OrderLineItem,
  OrderRecord,
  PaymentMethod,
  Product,
  ShopkeeperUser,
  UdhaarCustomer,
  UdhaarEntry,
  UdhaarEntryType,
} from './types';

const LANG_STORAGE_KEY = 'khaas_pos_lang_v1';

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

  const [activeTab, setActiveTab] = useState<NavTab>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [udhaarCustomers, setUdhaarCustomers] = useState<UdhaarCustomer[]>([]);
  const [udhaarEntries, setUdhaarEntries] = useState<UdhaarEntry[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeReceiptOrder, setActiveReceiptOrder] = useState<OrderRecord | null>(null);
  const [latestNewOrderId, setLatestNewOrderId] = useState<string | null>(null);

  const t = TRANSLATIONS[lang];

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

  // Load private shopkeeper workspace data whenever user changes
  useEffect(() => {
    let active = true;

    if (!user) {
      setProducts([]);
      setOrders([]);
      setUdhaarCustomers([]);
      setUdhaarEntries([]);
      setCart([]);
      setActiveReceiptOrder(null);
      setLatestNewOrderId(null);
      return;
    }

    setLoadingData(true);
    fetchWorkspaceData(user.id)
      .then((ws) => {
        if (!active) return;
        setProducts(ws.products);
        setOrders(ws.orders);
        setUdhaarCustomers(ws.udhaarCustomers);
        setUdhaarEntries(ws.udhaarEntries);
      })
      .catch((err) => {
        console.error('Failed to load workspace data:', err);
      })
      .finally(() => {
        if (active) setLoadingData(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

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
    customerName,
    udhaarCustomerId,
    discountPercent,
    paymentMethod,
    amountTendered,
  }: {
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
        quantity: cartItem.quantity,
        lineTotal: product.price * cartItem.quantity,
      });
    }

    if (lineItems.length === 0) return null;

    const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const discountAmount = Math.round(subtotal * (discountPercent / 100));
    const taxable = Math.max(0, subtotal - discountAmount);
    const taxRate = 0.05;
    const taxAmount = Math.round(taxable * taxRate);
    const total = taxable + taxAmount;

    const effectiveTendered =
      paymentMethod === 'cash'
        ? Math.max(total, amountTendered)
        : paymentMethod === 'udhaar'
        ? 0
        : total;
    const changeDue =
      paymentMethod === 'cash' ? Math.max(0, effectiveTendered - total) : 0;

    const nextSeq = 1001 + orders.length;
    const newOrder: OrderRecord = {
      id: `ord-${Date.now()}`,
      receiptNumber: `KR-2026-${nextSeq}`,
      createdAt: new Date().toISOString(),
      customerName,
      udhaarCustomerId,
      paymentMethod,
      items: lineItems,
      subtotal,
      discountPercent,
      discountAmount,
      taxRate,
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

    setProducts(updatedProducts);
    setOrders((prev) => [...prev, newOrder]);
    setCart([]);
    setLatestNewOrderId(newOrder.id);
    setActiveReceiptOrder(newOrder);

    insertOrderRecord(user.id, newOrder, updatedProducts, newUdhaarEntry).catch(
      (err) => console.error('Failed to persist sale:', err)
    );

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
      upsertProductRecord(user.id, updatedTarget).catch((err) =>
        console.error('Failed to adjust stock:', err)
      );
    }
  };

  const handleAddProduct = (newProd: Omit<Product, 'id'>) => {
    if (!user) return;
    const created: Product = {
      ...newProd,
      id: `${user.id.slice(0, 8)}-prod-${Date.now()}`,
    };
    setProducts((prev) => [created, ...prev]);
    upsertProductRecord(user.id, created).catch((err) =>
      console.error('Failed to add product:', err)
    );
  };

  const handleUpdateProduct = (updated: Product) => {
    if (!user) return;
    setProducts((prev) =>
      prev.map((prod) => (prod.id === updated.id ? updated : prod))
    );
    upsertProductRecord(user.id, updated).catch((err) =>
      console.error('Failed to update product:', err)
    );
  };

  const handleDeleteProduct = (productId: string) => {
    if (!user) return;
    setProducts((prev) => prev.filter((prod) => prod.id !== productId));
    setCart((prev) => prev.filter((item) => item.productId !== productId));
    deleteProductRecord(user.id, productId).catch((err) =>
      console.error('Failed to delete product:', err)
    );
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
      insertUdhaarCustomerRecord(user.id, customer, openingEntry).catch((err) =>
        console.error('Failed to save Udhaar customer:', err)
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
      insertUdhaarEntryRecord(user.id, entry).catch((err) =>
        console.error('Failed to save Udhaar entry:', err)
      );
    }
  };

  const handleResetDemo = () => {
    if (!user) return;
    setLoadingData(true);
    resetUserDemoWorkspace(user.id)
      .then((ws) => {
        setProducts(ws.products);
        setOrders(ws.orders);
        setUdhaarCustomers(ws.udhaarCustomers);
        setUdhaarEntries(ws.udhaarEntries);
        setCart([]);
        setLatestNewOrderId(null);
        setActiveReceiptOrder(null);
      })
      .catch((err) => console.error('Failed to reset demo data:', err))
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        lang={lang}
        onToggleLanguage={handleToggleLanguage}
        shopName={user.shopName}
        onLogout={handleLogout}
        t={t}
      />

      <main className="flex-1 no-print">
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
                udhaarCustomers={udhaarCustomers}
                udhaarEntries={udhaarEntries}
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

            {activeTab === 'dashboard' && (
              <ExecutiveDashboardView
                orders={orders}
                latestNewOrderId={latestNewOrderId}
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

            {activeTab === 'inventory' && (
              <InventoryView
                products={products}
                onAdjustStock={handleAdjustStock}
                onAddProduct={handleAddProduct}
                onUpdateProduct={handleUpdateProduct}
                onDeleteProduct={handleDeleteProduct}
                lang={lang}
                t={t}
              />
            )}

            {activeTab === 'udhaar' && (
              <UdhaarView
                customers={udhaarCustomers}
                entries={udhaarEntries}
                onAddCustomer={handleAddUdhaarCustomer}
                onAddEntry={handleAddUdhaarEntry}
                lang={lang}
                t={t}
              />
            )}
          </>
        )}
      </main>

      <ReceiptModal
        order={activeReceiptOrder}
        onClose={() => setActiveReceiptOrder(null)}
        lang={lang}
        t={t}
      />
    </div>
  );
}
