import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { formatCurrency, getCategoryLabel, type TranslationStrings } from '../i18n';
import type {
  CartItem,
  CategoryId,
  Language,
  OrderLineItem,
  OrderRecord,
  PaymentMethod,
  Product,
  UdhaarCustomer,
  UdhaarEntry,
} from '../types';
import { ProductImage } from './ProductImage';

interface PosBillingViewProps {
  products: Product[];
  cart: CartItem[];
  udhaarCustomers: UdhaarCustomer[];
  udhaarEntries: UdhaarEntry[];
  onAddToCart: (productId: string) => void;
  onUpdateQuantity: (productId: string, delta: number) => void;
  onRemoveFromCart: (productId: string) => void;
  onClearCart: () => void;
  onCompleteSale: (payload: {
    customerName: string;
    udhaarCustomerId?: string;
    discountPercent: number;
    paymentMethod: PaymentMethod;
    amountTendered: number;
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
  udhaarCustomers,
  udhaarEntries,
  onAddToCart,
  onUpdateQuantity,
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
  const [customerName, setCustomerName] = useState('');
  const [selectedUdhaarId, setSelectedUdhaarId] = useState<string>('');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashTenderedInput, setCashTenderedInput] = useState<string>('');
  const [showSaleBanner, setShowSaleBanner] = useState(false);

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
      map.set(item.productId, item.quantity);
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

  const lineItems: (OrderLineItem & { availableStock: number })[] = useMemo(() => {
    return cart
      .map((item) => {
        const prod = productMap.get(item.productId);
        if (!prod) return null;
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
          lineTotal: prod.price * item.quantity,
          availableStock: prod.stock,
        };
      })
      .filter((x): x is OrderLineItem & { availableStock: number } => x !== null);
  }, [cart, productMap]);

  const totalUnitsInCart = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.quantity, 0),
    [lineItems]
  );

  const subtotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.lineTotal, 0),
    [lineItems]
  );

  const discountAmount = Math.round(subtotal * (discountPercent / 100));

  // Per-product tax calculation after proportional discount
  const taxAmount = useMemo(() => {
    const discountFactor = 1 - discountPercent / 100;
    return Math.round(
      lineItems.reduce((sum, item) => {
        const discountedLine = item.lineTotal * discountFactor;
        return sum + discountedLine * ((item.taxRate ?? 0) / 100);
      }, 0)
    );
  }, [lineItems, discountPercent]);

  const grandTotal = Math.max(0, subtotal - discountAmount) + taxAmount;

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

  const isUdhaarInvalid = paymentMethod === 'udhaar' && !selectedUdhaarId;

  const changeDue =
    paymentMethod === 'cash' ? Math.max(0, parsedTendered - grandTotal) : 0;

  const handleCheckout = () => {
    if (lineItems.length === 0 || isCashInsufficient || isUdhaarInvalid) return;

    const selectedKhata =
      paymentMethod === 'udhaar'
        ? udhaarCustomers.find((c) => c.id === selectedUdhaarId)
        : undefined;

    const created = onCompleteSale({
      customerName: selectedKhata ? selectedKhata.name : customerName.trim(),
      udhaarCustomerId: selectedKhata?.id,
      discountPercent,
      paymentMethod,
      amountTendered: parsedTendered,
    });

    if (created) {
      setCustomerName('');
      setSelectedUdhaarId('');
      setDiscountPercent(0);
      setCashTenderedInput('');
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
            <button
              type="button"
              onClick={onGoToDashboard}
              className="font-semibold text-teal-800 underline underline-offset-4 hover:text-teal-900 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t.viewDashboardLink}
            </button>
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
            <div className="divide-y divide-slate-100 max-h-[280px] overflow-y-auto my-2">
              {lineItems.map((item) => {
                const name = lang === 'ur' ? item.nameUr : item.nameEn;
                const canIncrement = item.quantity < item.availableStock;
                return (
                  <div
                    key={item.productId}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {name}
                      </p>
                      <p className="text-xs font-mono text-slate-500 tabular-nums mt-0.5">
                        {formatCurrency(item.unitPrice, lang)}
                        {item.taxRate > 0 ? ` · +${item.taxRate}% ${t.taxCol}` : ''}
                      </p>
                    </div>

                    {/* Quantity Stepper */}
                    <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50 shrink-0">
                      <button
                        type="button"
                        aria-label={`Decrease quantity of ${name}`}
                        onClick={() => onUpdateQuantity(item.productId, -1)}
                        className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-200 rounded-s-lg transition-colors cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <span className="w-8 text-center font-mono text-xs font-semibold text-slate-900 tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase quantity of ${name}`}
                        disabled={!canIncrement}
                        onClick={() => onUpdateQuantity(item.productId, 1)}
                        className={`w-8 h-8 flex items-center justify-center rounded-e-lg transition-colors ${
                          canIncrement
                            ? 'text-slate-700 hover:bg-slate-200 cursor-pointer'
                            : 'text-slate-300 cursor-not-allowed'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums min-w-[72px] text-end">
                        {formatCurrency(item.lineTotal, lang)}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${name}`}
                        onClick={() => onRemoveFromCart(item.productId)}
                        className="p-1.5 text-slate-400 hover:text-red-700 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Customer & Discount Controls */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            {paymentMethod !== 'udhaar' && (
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={t.customerOptionalPlaceholder}
                className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 focus:bg-white transition-colors"
              />
            )}

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
              <span className="text-base font-bold text-slate-900">{t.grandTotalLabel}</span>
              <span className="font-mono text-xl font-bold text-slate-900 tabular-nums">
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
              <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-lg">
                {(['cash', 'card', 'mobile', 'udhaar'] as PaymentMethod[]).map((method) => {
                  const active = paymentMethod === method;
                  const label =
                    method === 'cash'
                      ? t.paymentCash
                      : method === 'card'
                      ? t.paymentCard
                      : method === 'mobile'
                      ? t.paymentMobile
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

            {paymentMethod === 'udhaar' && (
              <div className="space-y-2 bg-amber-50/70 border border-amber-200 rounded-lg p-3">
                <label
                  htmlFor="pos-udhaar-select"
                  className="block text-xs font-semibold text-amber-900"
                >
                  {t.selectUdhaarCustomerLabel}
                </label>
                <select
                  id="pos-udhaar-select"
                  value={selectedUdhaarId}
                  onChange={(e) => setSelectedUdhaarId(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white border border-amber-300 rounded-lg text-slate-900 focus:outline-none focus:border-amber-700"
                >
                  <option value="">{t.chooseCustomerOption}</option>
                  {udhaarCustomers.map((c) => {
                    const bal = Math.max(0, customerBalanceMap.get(c.id) ?? 0);
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone}) — {formatCurrency(bal, lang)}
                      </option>
                    );
                  })}
                </select>
                <p className="text-xs text-amber-800">
                  {!selectedUdhaarId ? t.udhaarCustomerRequired : t.udhaarBalanceNotice}
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
