import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Minus,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShoppingBag,
  Smartphone,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { formatCurrency, getCategoryLabel, type TranslationStrings } from '../i18n';
import type {
  CartItem,
  CategoryId,
  Customer,
  Language,
  OrderLineItem,
  OrderRecord,
  PaymentMethod,
  Product,
  ReminderSchedule,
  StoreSettings,
  UdhaarCustomer,
  UdhaarEntry,
} from '../types';
import { ProductImage } from './ProductImage';
import { calculateDueDateFromSchedule } from './UdhaarView';

export interface InlineUdhaarCustomerPayload {
  name: string;
  phone: string;
  reminderSchedule: ReminderSchedule;
  dueDate?: string;
}

interface PosBillingViewProps {
  products: Product[];
  cart: CartItem[];
  customers: Customer[];
  udhaarCustomers: UdhaarCustomer[];
  udhaarEntries: UdhaarEntry[];
  storeSettings: StoreSettings;
  canViewDashboard?: boolean;
  onRefreshUdhaarCustomers?: () => void;
  onCreateInlineKhataCustomer?: (payload: InlineUdhaarCustomerPayload) => {
    crmCustomer: Customer;
    khataCustomer: UdhaarCustomer;
  };
  onAddToCart: (productId: string) => void;
  onUpdateQuantity: (productId: string, delta: number, isReturn?: boolean) => void;
  onToggleReturn: (productId: string, currentIsReturn: boolean) => void;
  onRemoveFromCart: (productId: string, isReturn?: boolean) => void;
  onClearCart: () => void;
  onCompleteSale: (payload: {
    customerId?: string;
    customerName: string;
    udhaarCustomerId?: string;
    discountPercent: number;
    paymentMethod: PaymentMethod;
    amountTendered: number;
    transactionId?: string;
    inlineNewUdhaarCustomer?: InlineUdhaarCustomerPayload;
  }) => OrderRecord | null;
  onGoToDashboard: () => void;
  lastCompletedOrder: OrderRecord | null;
  lang: Language;
  t: TranslationStrings;
}

const CATEGORIES: CategoryId[] = ['all', 'beverages', 'bakery', 'pantry'];
const DISCOUNT_OPTIONS = [0, 5, 10, 15];

export function PosBillingView({
  products,
  cart,
  customers,
  udhaarCustomers,
  udhaarEntries,
  storeSettings,
  canViewDashboard = true,
  onRefreshUdhaarCustomers,
  onCreateInlineKhataCustomer,
  onAddToCart,
  onUpdateQuantity,
  onToggleReturn,
  onRemoveFromCart,
  onClearCart,
  onCompleteSale,
  onGoToDashboard,
  lastCompletedOrder,
  lang,
  t,
}: PosBillingViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [selectedUdhaarKey, setSelectedUdhaarKey] = useState<string>('');
  const [showQuickKhataForm, setShowQuickKhataForm] = useState(false);
  const [quickKhataName, setQuickKhataName] = useState('');
  const [quickKhataPhone, setQuickKhataPhone] = useState('');
  const [quickKhataSchedule, setQuickKhataSchedule] =
    useState<ReminderSchedule>('1_week');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashTenderedInput, setCashTenderedInput] = useState<string>('');
  const [transactionId, setTransactionId] = useState<string>('');
  const [showSaleBanner, setShowSaleBanner] = useState(false);

  useEffect(() => {
    if (paymentMethod === 'udhaar') {
      onRefreshUdhaarCustomers?.();
    }
  }, [paymentMethod, onRefreshUdhaarCustomers]);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) {
      map.set(p.id, p);
    }
    return map;
  }, [products]);

  const cartQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      if (!item.isReturn) {
        map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity);
      }
    }
    return map;
  }, [cart]);

  const customerBalanceMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of udhaarCustomers) {
      map.set(c.id, 0);
    }
    for (const e of udhaarEntries) {
      const prev = map.get(e.customerId) ?? 0;
      map.set(e.customerId, prev + (e.type === 'credit' ? e.amount : -e.amount));
    }
    return map;
  }, [udhaarCustomers, udhaarEntries]);

  const unifiedUdhaarOptions = useMemo(() => {
    const normalizePhone = (phone: string) => phone.replace(/\D/g, '');
    const matchedCrmIds = new Set<string>();
    const options: {
      value: string;
      name: string;
      phone: string;
      balance: number;
      udhaarCustomerId?: string;
      crmCustomerId?: string;
    }[] = [];

    for (const kh of udhaarCustomers) {
      const khPhone = normalizePhone(kh.phone);
      const khNameLower = kh.name.trim().toLowerCase();
      const matchedCrm = customers.find((c) => {
        if (c.id === kh.id) return true;
        const cPhone = normalizePhone(c.phone);
        if (khPhone && cPhone && khPhone === cPhone) return true;
        return c.name.trim().toLowerCase() === khNameLower;
      });
      if (matchedCrm) {
        matchedCrmIds.add(matchedCrm.id);
      }
      const khBal = Math.max(0, customerBalanceMap.get(kh.id) ?? 0);
      const crmBal = Math.max(0, matchedCrm?.balance ?? 0);
      options.push({
        value: `khata:${kh.id}`,
        name: kh.name,
        phone: kh.phone || matchedCrm?.phone || '',
        balance: khBal > 0 ? khBal : crmBal,
        udhaarCustomerId: kh.id,
        crmCustomerId: matchedCrm?.id,
      });
    }

    for (const c of customers) {
      if (matchedCrmIds.has(c.id)) continue;
      options.push({
        value: `crm:${c.id}`,
        name: c.name,
        phone: c.phone,
        balance: Math.max(0, c.balance),
        crmCustomerId: c.id,
      });
    }

    return options.sort((a, b) => a.name.localeCompare(b.name));
  }, [udhaarCustomers, customers, customerBalanceMap]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        p.nameEn.toLowerCase().includes(q) ||
        p.nameUr.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q)
      );
    });
  }, [products, searchQuery, selectedCategory]);

  const lineItems: (OrderLineItem & { isReturn: boolean; availableStock: number })[] =
    useMemo(() => {
      return cart
        .map((item) => {
          const prod = productMap.get(item.productId);
          if (!prod) return null;
          const isRet = Boolean(item.isReturn);
          const rawTotal = prod.price * item.quantity;
          return {
            productId: prod.id,
            sku: prod.sku,
            nameEn: prod.nameEn,
            nameUr: prod.nameUr,
            category: prod.category,
            unitPrice: prod.price,
            unitCost: prod.cost,
            taxRate: prod.taxRate ?? 0,
            quantity: item.quantity,
            lineTotal: isRet ? -rawTotal : rawTotal,
            isReturn: isRet,
            availableStock: prod.stock,
          };
        })
        .filter(
          (
            x
          ): x is OrderLineItem & { isReturn: boolean; availableStock: number } =>
            x !== null
        );
    }, [cart, productMap]);

  const totalUnitsInCart = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.quantity, 0),
    [lineItems]
  );

  const subtotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.lineTotal, 0),
    [lineItems]
  );

  const discountAmount =
    subtotal > 0 ? Math.round(subtotal * (discountPercent / 100)) : 0;

  // Per-product tax calculation after proportional discount
  const taxAmount = useMemo(() => {
    const discountFactor = subtotal > 0 ? 1 - discountPercent / 100 : 1;
    return Math.round(
      lineItems.reduce((sum, item) => {
        const discountedLine = item.lineTotal * discountFactor;
        return sum + discountedLine * ((item.taxRate ?? 0) / 100);
      }, 0)
    );
  }, [lineItems, discountPercent, subtotal]);

  const grandTotal = subtotal - discountAmount + taxAmount;

  const parsedTendered =
    paymentMethod === 'cash'
      ? cashTenderedInput.trim() === ''
        ? grandTotal
        : Math.max(0, Number(cashTenderedInput) || 0)
      : paymentMethod === 'udhaar'
      ? 0
      : grandTotal;

  const isCashInsufficient =
    paymentMethod === 'cash' &&
    grandTotal > 0 &&
    cashTenderedInput.trim() !== '' &&
    parsedTendered < grandTotal;

  const selectedUdhaarOption = useMemo(
    () =>
      unifiedUdhaarOptions.find((opt) => opt.value === selectedUdhaarKey) ?? null,
    [unifiedUdhaarOptions, selectedUdhaarKey]
  );

  const hasQuickKhataDraft =
    showQuickKhataForm && quickKhataName.trim().length > 0;

  const isUdhaarInvalid =
    paymentMethod === 'udhaar' &&
    !selectedUdhaarOption &&
    !selectedCustomerId &&
    !hasQuickKhataDraft;

  const changeDue =
    paymentMethod === 'cash' ? Math.max(0, parsedTendered - grandTotal) : 0;

  const selectedCrmCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );

  const handleSaveAndSelectQuickKhata = () => {
    const trimmedName = quickKhataName.trim();
    if (!trimmedName || !onCreateInlineKhataCustomer) return;
    const dueDate =
      quickKhataSchedule === 'none'
        ? undefined
        : calculateDueDateFromSchedule(quickKhataSchedule) || undefined;
    const { crmCustomer, khataCustomer } = onCreateInlineKhataCustomer({
      name: trimmedName,
      phone: quickKhataPhone.trim(),
      reminderSchedule: quickKhataSchedule,
      dueDate,
    });
    setSelectedUdhaarKey(`khata:${khataCustomer.id}`);
    setSelectedCustomerId(crmCustomer.id);
    setShowQuickKhataForm(false);
    setQuickKhataName('');
    setQuickKhataPhone('');
    setQuickKhataSchedule('1_week');
  };

  const handleCheckout = () => {
    if (lineItems.length === 0 || isCashInsufficient || isUdhaarInvalid) return;

    const inlineNewUdhaarCustomer: InlineUdhaarCustomerPayload | undefined =
      paymentMethod === 'udhaar' && hasQuickKhataDraft
        ? {
            name: quickKhataName.trim(),
            phone: quickKhataPhone.trim(),
            reminderSchedule: quickKhataSchedule,
            dueDate:
              quickKhataSchedule === 'none'
                ? undefined
                : calculateDueDateFromSchedule(quickKhataSchedule) || undefined,
          }
        : undefined;

    const resolvedUdhaarCustomerId =
      paymentMethod === 'udhaar' && !inlineNewUdhaarCustomer
        ? selectedUdhaarOption?.udhaarCustomerId
        : undefined;

    const resolvedCrmCustomerId =
      paymentMethod === 'udhaar' && !inlineNewUdhaarCustomer
        ? selectedUdhaarOption?.crmCustomerId ?? (selectedCrmCustomer?.id || undefined)
        : selectedCrmCustomer?.id;

    const resolvedName = inlineNewUdhaarCustomer
      ? inlineNewUdhaarCustomer.name
      : paymentMethod === 'udhaar' && selectedUdhaarOption
      ? selectedUdhaarOption.name
      : selectedCrmCustomer
      ? selectedCrmCustomer.name
      : customerName.trim();

    const resolvedTid =
      (paymentMethod === 'jazzcash' || paymentMethod === 'easypaisa') &&
      transactionId.trim()
        ? transactionId.trim()
        : undefined;

    const created = onCompleteSale({
      customerId: resolvedCrmCustomerId,
      customerName: resolvedName,
      udhaarCustomerId: resolvedUdhaarCustomerId,
      discountPercent,
      paymentMethod,
      amountTendered: parsedTendered,
      transactionId: resolvedTid,
      inlineNewUdhaarCustomer,
    });

    if (created) {
      setSelectedCustomerId('');
      setCustomerName('');
      setSelectedUdhaarKey('');
      setShowQuickKhataForm(false);
      setQuickKhataName('');
      setQuickKhataPhone('');
      setQuickKhataSchedule('1_week');
      setDiscountPercent(0);
      setCashTenderedInput('');
      setTransactionId('');
      setShowSaleBanner(true);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6">
      {/* Page Heading */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t.posTitle}
          </h1>
          <p className="text-sm text-slate-600 mt-1">{t.posSubtitle}</p>
        </div>

        {showSaleBanner && lastCompletedOrder && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>
              {t.lastSaleSuccess}{' '}
              <span className="font-mono font-semibold tabular-nums">
                ({lastCompletedOrder.receiptNumber})
              </span>
            </span>
            {canViewDashboard && (
              <button
                type="button"
                onClick={onGoToDashboard}
                className="font-semibold text-teal-800 underline underline-offset-4 hover:text-teal-900 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.viewDashboardLink}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Split Register Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Catalog Area */}
        <section className="lg:col-span-7 xl:col-span-8 space-y-5" aria-label="Product Catalog">
          {/* Search + Category Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search
                className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchProductsPlaceholder}
                className="w-full h-10 ps-9 pe-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 focus:bg-white transition-colors"
              />
            </div>

            <div
              role="tablist"
              aria-label="Product categories"
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto"
            >
              {CATEGORIES.map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    role="tab"
                    aria-selected={active}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {getCategoryLabel(cat, t)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Product Grid */}
          {filteredProducts.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
              <p className="text-sm text-slate-600 mb-4">{t.noProductsMatch}</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className="px-4 py-2 text-sm font-medium text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                {t.resetFilters}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredProducts.map((product) => {
                const inCartQty = cartQtyMap.get(product.id) ?? 0;
                const remainingStock = Math.max(0, product.stock - inCartQty);
                const isOutOfStock = remainingStock <= 0;
                const productName = lang === 'ur' ? product.nameUr : product.nameEn;

                return (
                  <article
                    key={product.id}
                    className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col transition-colors hover:border-slate-300"
                  >
                    <div className="aspect-square w-full bg-slate-100 overflow-hidden">
                      <ProductImage
                        src={product.image}
                        alt={productName}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="p-4 flex flex-col flex-1 justify-between gap-3">
                      <div>
                        {/* Quiet unboxed metadata line */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1 flex-wrap">
                          <span className="font-mono">{product.barcode || product.sku}</span>
                          <span aria-hidden="true">·</span>
                          <span>{getCategoryLabel(product.category, t)}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`tabular-nums ${
                              remainingStock === 0
                                ? 'text-red-700 font-medium'
                                : remainingStock <= 5
                                ? 'text-amber-700 font-medium'
                                : 'text-slate-500'
                            }`}
                          >
                            {remainingStock === 0
                              ? t.outOfStockLabel
                              : `${t.inStockLabel}: ${remainingStock}`}
                          </span>
                          {(product.taxRate ?? 0) > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                {t.taxCol} {product.taxRate}%
                              </span>
                            </>
                          )}
                        </div>

                        <h2 className="text-base font-semibold text-slate-900 leading-snug">
                          {productName}
                        </h2>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
                        <span className="font-mono text-base font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatCurrency(product.price, lang)}
                        </span>

                        <button
                          type="button"
                          disabled={isOutOfStock}
                          onClick={() => {
                            setShowSaleBanner(false);
                            onAddToCart(product.id);
                          }}
                          className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 min-h-[40px] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                            isOutOfStock
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : inCartQty > 0
                              ? 'bg-teal-800 hover:bg-teal-900 text-white'
                              : 'bg-teal-700 hover:bg-teal-800 text-white'
                          }`}
                        >
                          <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            {inCartQty > 0
                              ? `${t.addedMore} (${inCartQty})`
                              : t.addToCart}
                          </span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Billing Cart & Checkout Panel */}
        <aside
          className="lg:col-span-5 xl:col-span-4 bg-white border border-slate-200 rounded-xl p-5 lg:sticky lg:top-22"
          aria-label="Active Cart and Billing"
        >
          {/* Cart Header */}
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-bold text-slate-900">{t.currentBill}</h2>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                ({totalUnitsInCart} {t.itemsCount})
              </span>
            </div>

            {lineItems.length > 0 && (
              <button
                type="button"
                onClick={onClearCart}
                className="text-xs font-medium text-slate-600 hover:text-red-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.clearCart}
              </button>
            )}
          </div>

          {/* Cart Items List */}
          {lineItems.length === 0 ? (
            <div className="py-10 text-center">
              <ShoppingBag
                className="w-8 h-8 text-slate-300 mx-auto mb-3"
                aria-hidden="true"
              />
              <p className="text-sm font-semibold text-slate-800">{t.emptyCartTitle}</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                {t.emptyCartDesc}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto my-2">
              {lineItems.map((item) => {
                const name = lang === 'ur' ? item.nameUr : item.nameEn;
                const isRet = Boolean(item.isReturn);
                const canIncrement = isRet || item.quantity < item.availableStock;
                return (
                  <div
                    key={`${item.productId}-${isRet ? 'ret' : 'sale'}`}
                    className={`py-3 flex flex-col gap-2 ${
                      isRet ? 'bg-red-50/60 border-s-2 border-red-500 px-2.5 rounded-lg my-1' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {name}
                          </p>
                          {isRet && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-700 border border-red-200 shrink-0">
                              {t.posReturnBadge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono text-slate-500 tabular-nums mt-0.5">
                          {formatCurrency(item.unitPrice, lang)}
                          {item.taxRate > 0 ? ` · +${item.taxRate}% ${t.taxCol}` : ''}
                        </p>
                      </div>

                      <button
                        type="button"
                        aria-pressed={isRet}
                        onClick={() => onToggleReturn(item.productId, isRet)}
                        className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          isRet
                            ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                            : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        <RotateCcw className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span>{t.posReturnToggleBtn}</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      {/* Quantity Stepper */}
                      <div className="flex items-center border border-slate-200 rounded-lg bg-white shrink-0">
                        <button
                          type="button"
                          aria-label={`Decrease quantity of ${name}`}
                          onClick={() => onUpdateQuantity(item.productId, -1, isRet)}
                          className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 rounded-s-lg transition-colors cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <span
                          className={`w-9 text-center font-mono text-xs font-semibold tabular-nums ${
                            isRet ? 'text-red-700' : 'text-slate-900'
                          }`}
                        >
                          {isRet ? `-${item.quantity}` : item.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label={`Increase quantity of ${name}`}
                          disabled={!canIncrement}
                          onClick={() => onUpdateQuantity(item.productId, 1, isRet)}
                          className={`w-8 h-8 flex items-center justify-center rounded-e-lg transition-colors ${
                            canIncrement
                              ? 'text-slate-700 hover:bg-slate-100 cursor-pointer'
                              : 'text-slate-300 cursor-not-allowed'
                          }`}
                        >
                          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`font-mono text-sm font-semibold tabular-nums min-w-[76px] text-end ${
                            isRet ? 'text-red-700' : 'text-slate-900'
                          }`}
                        >
                          {formatCurrency(item.lineTotal, lang)}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${name}`}
                          onClick={() => onRemoveFromCart(item.productId, isRet)}
                          className="p-1.5 text-slate-400 hover:text-red-700 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Customer & Discount Controls */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="space-y-2">
              <label
                htmlFor="pos-crm-customer-select"
                className="block text-xs font-medium text-slate-600"
              >
                {t.selectSaleCustomerLabel}
              </label>
              <select
                id="pos-crm-customer-select"
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white transition-colors"
              >
                <option value="">{t.walkInOption}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` (${c.phone})` : ''}
                    {c.balance > 0
                      ? ` · ${t.posCustomerBalanceBadge} ${formatCurrency(c.balance, lang)}`
                      : ''}
                  </option>
                ))}
              </select>

              {!selectedCustomerId && paymentMethod !== 'udhaar' && (
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={t.customerOptionalPlaceholder}
                  className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 focus:bg-white transition-colors"
                />
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600">{t.discountLabel}</span>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {DISCOUNT_OPTIONS.map((pct) => {
                  const active = discountPercent === pct;
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setDiscountPercent(pct)}
                      className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md tabular-nums transition-colors cursor-pointer ${
                        active
                          ? 'bg-white text-slate-900 shadow-xs font-semibold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {pct}%
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Totals Calculation Breakdown */}
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-2 text-sm">
            <div className="flex items-center justify-between text-slate-600">
              <span>{t.subtotalLabel}</span>
              <span className="font-mono tabular-nums text-slate-900">
                {formatCurrency(subtotal, lang)}
              </span>
            </div>

            {discountAmount > 0 && (
              <div className="flex items-center justify-between text-emerald-700">
                <span>
                  {t.discountLabel} ({discountPercent}%)
                </span>
                <span className="font-mono tabular-nums">
                  -{formatCurrency(discountAmount, lang)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-slate-600">
              <span>{t.taxLabel}</span>
              <span className="font-mono tabular-nums text-slate-900">
                {formatCurrency(taxAmount, lang)}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <span
                className={`text-base font-bold ${
                  grandTotal < 0 ? 'text-red-700' : 'text-slate-900'
                }`}
              >
                {grandTotal < 0 ? t.netRefundDueLabel : t.grandTotalLabel}
              </span>
              <span
                className={`font-mono text-xl font-bold tabular-nums ${
                  grandTotal < 0 ? 'text-red-700' : 'text-slate-900'
                }`}
              >
                {formatCurrency(grandTotal, lang)}
              </span>
            </div>
          </div>

          {/* Payment Method & Tendered / Udhaar Controls */}
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-600">
                {t.paymentMethodLabel}
              </span>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  ['cash', 'jazzcash', 'easypaisa', 'card', 'udhaar'] as PaymentMethod[]
                ).map((method) => {
                  const active = paymentMethod === method;
                  const label =
                    method === 'cash'
                      ? t.paymentCash
                      : method === 'jazzcash'
                      ? t.paymentJazzCash
                      : method === 'easypaisa'
                      ? t.paymentEasyPaisa
                      : method === 'card'
                      ? t.paymentCard
                      : t.paymentUdhaar;
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`px-2 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                        active
                          ? method === 'udhaar'
                            ? 'bg-amber-700 text-white shadow-xs font-semibold'
                            : 'bg-white text-slate-900 shadow-xs font-semibold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {paymentMethod === 'cash' && grandTotal > 0 && (
              <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="cash-tendered-input"
                    className="text-xs font-medium text-slate-700"
                  >
                    {t.amountTenderedLabel}
                  </label>
                  <input
                    id="cash-tendered-input"
                    type="number"
                    min={0}
                    value={cashTenderedInput}
                    onChange={(e) => setCashTenderedInput(e.target.value)}
                    placeholder={String(grandTotal)}
                    className="w-32 h-9 px-2.5 text-end font-mono text-sm font-semibold bg-white border border-slate-300 rounded-md text-slate-900 tabular-nums focus:outline-none focus:border-teal-700"
                  />
                </div>

                <div className="flex items-center justify-between gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setCashTenderedInput(String(grandTotal))}
                    className="px-2 py-1 text-xs font-medium bg-white border border-slate-200 hover:border-slate-300 rounded text-slate-700 cursor-pointer"
                  >
                    {t.exactAmount}
                  </button>
                  {[1000, 2000, 5000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCashTenderedInput(String(preset))}
                      className="px-2 py-1 text-xs font-mono bg-white border border-slate-200 hover:border-slate-300 rounded text-slate-700 tabular-nums cursor-pointer"
                    >
                      {preset.toLocaleString('en-PK')}
                    </button>
                  ))}
                </div>

                {isCashInsufficient ? (
                  <p className="text-xs font-medium text-red-700">{t.insufficientCash}</p>
                ) : (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-xs">
                    <span className="font-medium text-slate-600">{t.changeDueLabel}</span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {formatCurrency(changeDue, lang)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {(paymentMethod === 'jazzcash' || paymentMethod === 'easypaisa') && (
              <div className="space-y-2.5 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Smartphone
                    className="w-4 h-4 text-teal-700 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800">
                      {t.transferToAccountLabel} (
                      {paymentMethod === 'jazzcash'
                        ? t.paymentJazzCash
                        : t.paymentEasyPaisa}
                      )
                    </p>
                    {(() => {
                      const title =
                        paymentMethod === 'jazzcash'
                          ? storeSettings.jazzcashAccountTitle
                          : storeSettings.easypaisaAccountTitle;
                      const number =
                        paymentMethod === 'jazzcash'
                          ? storeSettings.jazzcashAccountNumber
                          : storeSettings.easypaisaAccountNumber;
                      if (!title && !number) {
                        return (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {t.walletNotConfiguredMsg}
                          </p>
                        );
                      }
                      return (
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                          {title && (
                            <span className="font-semibold text-slate-900">
                              {title}
                            </span>
                          )}
                          {number && (
                            <span className="font-mono font-bold text-teal-800 tabular-nums">
                              {number}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="pos-wallet-tid"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {t.transactionIdLabel}
                  </label>
                  <input
                    id="pos-wallet-tid"
                    type="text"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder={t.transactionIdPlaceholder}
                    className="w-full h-9 px-2.5 text-xs font-mono bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 tabular-nums focus:outline-none focus:border-teal-700"
                  />
                </div>
              </div>
            )}

            {paymentMethod === 'udhaar' && (
              <div className="space-y-2.5 bg-amber-50/70 border border-amber-200 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="pos-udhaar-select"
                    className="block text-xs font-semibold text-amber-900"
                  >
                    {t.selectUdhaarCustomerLabel}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowQuickKhataForm((prev) => !prev)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-amber-900 bg-white border border-amber-300 hover:bg-amber-100 rounded-md whitespace-nowrap transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span>
                      {showQuickKhataForm
                        ? t.cancelNewKhataBtn
                        : t.newKhataCustomerInlineBtn}
                    </span>
                  </button>
                </div>

                <select
                  id="pos-udhaar-select"
                  value={selectedUdhaarKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedUdhaarKey(val);
                    const matched = unifiedUdhaarOptions.find(
                      (opt) => opt.value === val
                    );
                    if (matched?.crmCustomerId) {
                      setSelectedCustomerId(matched.crmCustomerId);
                    }
                    if (val) {
                      setShowQuickKhataForm(false);
                    }
                  }}
                  className="w-full h-10 px-3 text-sm bg-white border border-amber-300 rounded-lg text-slate-900 focus:outline-none focus:border-amber-700"
                >
                  <option value="">{t.chooseCustomerOption}</option>
                  {unifiedUdhaarOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.name}
                      {opt.phone ? ` (${opt.phone})` : ''} —{' '}
                      {formatCurrency(opt.balance, lang)}
                    </option>
                  ))}
                </select>

                {showQuickKhataForm && (
                  <div className="bg-white border border-amber-300 rounded-lg p-3 space-y-2.5">
                    <div>
                      <label
                        htmlFor="quick-khata-name"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        {t.customerNameLabel} *
                      </label>
                      <input
                        id="quick-khata-name"
                        type="text"
                        value={quickKhataName}
                        onChange={(e) => setQuickKhataName(e.target.value)}
                        placeholder={t.quickKhataNamePlaceholder}
                        className="w-full h-9 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-amber-700 focus:bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label
                          htmlFor="quick-khata-phone"
                          className="block text-[11px] font-medium text-slate-700 mb-1"
                        >
                          {t.customerWhatsappLabel}
                        </label>
                        <input
                          id="quick-khata-phone"
                          type="tel"
                          value={quickKhataPhone}
                          onChange={(e) => setQuickKhataPhone(e.target.value)}
                          placeholder={t.quickKhataPhonePlaceholder}
                          className="w-full h-9 px-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-amber-700 focus:bg-white"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="quick-khata-schedule"
                          className="block text-[11px] font-medium text-slate-700 mb-1"
                        >
                          {t.reminderScheduleLabel}
                        </label>
                        <select
                          id="quick-khata-schedule"
                          value={quickKhataSchedule}
                          onChange={(e) =>
                            setQuickKhataSchedule(e.target.value as ReminderSchedule)
                          }
                          className="w-full h-9 px-2 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-amber-700 focus:bg-white"
                        >
                          <option value="3_days">{t.schedule3Days}</option>
                          <option value="1_week">{t.schedule1Week}</option>
                          <option value="2_weeks">{t.schedule2Weeks}</option>
                          <option value="1_month">{t.schedule1Month}</option>
                          <option value="none">{t.scheduleNone}</option>
                        </select>
                      </div>
                    </div>

                    {onCreateInlineKhataCustomer && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={!quickKhataName.trim()}
                          onClick={handleSaveAndSelectQuickKhata}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:bg-slate-300 rounded-md whitespace-nowrap transition-colors cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>{t.saveSelectCustomerBtn}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-xs text-amber-800">
                  {isUdhaarInvalid ? t.udhaarCustomerRequired : t.udhaarBalanceNotice}
                </p>
              </div>
            )}

            <button
              type="button"
              disabled={lineItems.length === 0 || isCashInsufficient || isUdhaarInvalid}
              onClick={handleCheckout}
              className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-lg transition-colors min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                lineItems.length === 0 || isCashInsufficient || isUdhaarInvalid
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-teal-700 hover:bg-teal-800 text-white cursor-pointer'
              }`}
            >
              <Printer className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t.completeSalePrint}</span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
