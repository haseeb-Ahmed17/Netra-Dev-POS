import { useEffect, useState } from 'react';
import { ExecutiveDashboardView } from './components/ExecutiveDashboardView';
import { InventoryView } from './components/InventoryView';
import { PosBillingView } from './components/PosBillingView';
import { ReceiptModal } from './components/ReceiptModal';
import { TopBar } from './components/TopBar';
import { TransactionsView } from './components/TransactionsView';
import { UdhaarView } from './components/UdhaarView';
import {
  INITIAL_PRODUCTS,
  createInitialOrders,
  createInitialUdhaarCustomers,
  createInitialUdhaarEntries,
} from './data/initialData';
import { TRANSLATIONS } from './i18n';
import type {
  CartItem,
  Language,
  NavTab,
  OrderLineItem,
  OrderRecord,
  PaymentMethod,
  Product,
  UdhaarCustomer,
  UdhaarEntry,
  UdhaarEntryType,
} from './types';

const STORAGE_KEYS = {
  PRODUCTS: 'khaas_pos_products_v2',
  ORDERS: 'khaas_pos_orders_v2',
  UDHAAR_CUSTOMERS: 'khaas_pos_udhaar_customers_v2',
  UDHAAR_ENTRIES: 'khaas_pos_udhaar_entries_v2',
  LANG: 'khaas_pos_lang_v1',
} as const;

function loadStoredArray<T>(key: string, fallback: () => T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as T[];
  } catch {
    // ignore corrupted storage
  }
  return fallback();
}

function loadStoredLang(): Language {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LANG);
    if (raw === 'ur' || raw === 'en') return raw;
  } catch {
    // ignore
  }
  return 'en';
}

export default function App() {
  const [lang, setLang] = useState<Language>(loadStoredLang);
  const [activeTab, setActiveTab] = useState<NavTab>('pos');
  const [products, setProducts] = useState<Product[]>(() =>
    loadStoredArray(STORAGE_KEYS.PRODUCTS, () => INITIAL_PRODUCTS)
  );
  const [orders, setOrders] = useState<OrderRecord[]>(() =>
    loadStoredArray(STORAGE_KEYS.ORDERS, createInitialOrders)
  );
  const [udhaarCustomers, setUdhaarCustomers] = useState<UdhaarCustomer[]>(() =>
    loadStoredArray(STORAGE_KEYS.UDHAAR_CUSTOMERS, createInitialUdhaarCustomers)
  );
  const [udhaarEntries, setUdhaarEntries] = useState<UdhaarEntry[]>(() =>
    loadStoredArray(STORAGE_KEYS.UDHAAR_ENTRIES, createInitialUdhaarEntries)
  );
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeReceiptOrder, setActiveReceiptOrder] = useState<OrderRecord | null>(null);
  const [latestNewOrderId, setLatestNewOrderId] = useState<string | null>(null);

  const t = TRANSLATIONS[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem(STORAGE_KEYS.LANG, lang);
    } catch {
      // ignore storage errors
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    } catch {
      // ignore storage errors
    }
  }, [products]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
    } catch {
      // ignore storage errors
    }
  }, [orders]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.UDHAAR_CUSTOMERS,
        JSON.stringify(udhaarCustomers)
      );
    } catch {
      // ignore storage errors
    }
  }, [udhaarCustomers]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.UDHAAR_ENTRIES,
        JSON.stringify(udhaarEntries)
      );
    } catch {
      // ignore storage errors
    }
  }, [udhaarEntries]);

  const handleToggleLanguage = () => {
    setLang((prev) => (prev === 'en' ? 'ur' : 'en'));
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
    if (cart.length === 0) return null;

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

    // Decrement product stock automatically
    setProducts((prev) =>
      prev.map((prod) => {
        const sold = lineItems.find((li) => li.productId === prod.id);
        if (!sold) return prod;
        return {
          ...prod,
          stock: Math.max(0, prod.stock - sold.quantity),
        };
      })
    );

    // If Udhaar sale, post credit entry automatically to customer's Khata
    if (paymentMethod === 'udhaar' && udhaarCustomerId) {
      const summaryLabel = lineItems
        .map((li) => `${li.quantity}x ${lang === 'ur' ? li.nameUr : li.nameEn}`)
        .join(', ');
      const newEntry: UdhaarEntry = {
        id: `ue-${Date.now()}`,
        customerId: udhaarCustomerId,
        type: 'credit',
        amount: total,
        note: `POS Bill ${newOrder.receiptNumber} (${summaryLabel})`,
        receiptNumber: newOrder.receiptNumber,
        createdAt: newOrder.createdAt,
      };
      setUdhaarEntries((prev) => [...prev, newEntry]);
    }

    setOrders((prev) => [...prev, newOrder]);
    setCart([]);
    setLatestNewOrderId(newOrder.id);
    setActiveReceiptOrder(newOrder);

    return newOrder;
  };

  // Stock Management Handlers
  const handleAdjustStock = (productId: string, delta: number) => {
    setProducts((prev) =>
      prev.map((prod) =>
        prod.id === productId
          ? { ...prod, stock: Math.max(0, prod.stock + delta) }
          : prod
      )
    );
  };

  const handleAddProduct = (newProd: Omit<Product, 'id'>) => {
    const created: Product = {
      ...newProd,
      id: `prod-${Date.now()}`,
    };
    setProducts((prev) => [created, ...prev]);
  };

  const handleUpdateProduct = (updated: Product) => {
    setProducts((prev) =>
      prev.map((prod) => (prod.id === updated.id ? updated : prod))
    );
  };

  const handleDeleteProduct = (productId: string) => {
    setProducts((prev) => prev.filter((prod) => prod.id !== productId));
    setCart((prev) => prev.filter((item) => item.productId !== productId));
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
    const customer: UdhaarCustomer = {
      id: `khata-${Date.now()}`,
      name,
      phone,
      notes,
      createdAt: nowIso,
    };
    setUdhaarCustomers((prev) => [customer, ...prev]);

    if (openingBalance > 0) {
      const openingEntry: UdhaarEntry = {
        id: `ue-${Date.now()}-open`,
        customerId: customer.id,
        type: 'credit',
        amount: openingBalance,
        note: lang === 'ur' ? 'ابتدائی کھاتہ بیلنس' : 'Opening Udhaar balance',
        createdAt: nowIso,
      };
      setUdhaarEntries((prev) => [...prev, openingEntry]);
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
    const entry: UdhaarEntry = {
      id: `ue-${Date.now()}`,
      customerId,
      type,
      amount,
      note,
      createdAt: new Date().toISOString(),
    };
    setUdhaarEntries((prev) => [...prev, entry]);
  };

  const handleResetDemo = () => {
    setProducts(INITIAL_PRODUCTS);
    setOrders(createInitialOrders());
    setUdhaarCustomers(createInitialUdhaarCustomers());
    setUdhaarEntries(createInitialUdhaarEntries());
    setCart([]);
    setLatestNewOrderId(null);
    setActiveReceiptOrder(null);
  };

  const latestCompletedOrder =
    orders.find((o) => o.id === latestNewOrderId) ?? null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        lang={lang}
        onToggleLanguage={handleToggleLanguage}
        t={t}
      />

      <main className="flex-1 no-print">
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
