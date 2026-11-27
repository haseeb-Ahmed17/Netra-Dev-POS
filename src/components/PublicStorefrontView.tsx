import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  MapPin,
  Minus,
  Phone,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import { formatCurrency } from '../i18n';
import { fetchPublicStorefront, submitPublicStorefrontOrder } from '../lib/posRepository';
import {
  getDefaultStepForUnit,
  resolveProductStockForBranch,
} from '../lib/omnichannelOrders';
import {
  formatQuantity,
  getUnitLabel,
  roundCurrency,
  roundQuantity,
} from '../lib/unitUtils';
import type {
  CategoryId,
  OmnichannelPaymentMethod,
  PublicStorefrontData,
  PublicStorefrontProduct,
} from '../types';
import { ProductImage } from './ProductImage';

interface PublicStorefrontViewProps {
  storeSlug: string;
}

interface StorefrontCartLine {
  product: PublicStorefrontProduct;
  quantity: number;
}

export function PublicStorefrontView({ storeSlug }: PublicStorefrontViewProps) {
  const [storefront, setStorefront] = useState<PublicStorefrontData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<CategoryId>('all');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [cart, setCart] = useState<StorefrontCartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  // Checkout form
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<OmnichannelPaymentMethod>('cod');
  const [idempotencyKey, setIdempotencyKey] = useState(
    () => `sf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [confirmedOrder, setConfirmedOrder] = useState<{
    orderNumber: string;
    total: number;
    paymentMethod: OmnichannelPaymentMethod;
    createdAt: string;
  } | null>(null);

  const loadStore = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const res = await fetchPublicStorefront(storeSlug);
    if (res.ok === false) {
      setLoadError(res.error);
      setLoading(false);
      return;
    }
    setStorefront(res.storefront);
    const defaultBranch =
      res.storefront.branches.find((b) => b.isMain)?.id ||
      res.storefront.branches[0]?.id ||
      '';
    setSelectedBranchId((prev) => prev || defaultBranch);
    if (!res.storefront.codEnabled) {
      setPaymentMethod('bank_transfer');
    }
    setLoading(false);
  }, [storeSlug]);

  useEffect(() => {
    void loadStore();
  }, [loadStore]);

  const filteredProducts = useMemo(() => {
    if (!storefront) return [];
    const q = searchQuery.trim().toLowerCase();
    return storefront.products.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      const avail = resolveProductStockForBranch(p, selectedBranchId || undefined);
      if (avail <= 0) return false;
      if (!q) return true;
      return (
        p.nameEn.toLowerCase().includes(q) ||
        p.nameUr.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q)
      );
    });
  }, [storefront, searchQuery, category, selectedBranchId]);

  const addToCart = (product: PublicStorefrontProduct) => {
    const step = getDefaultStepForUnit(product.sellingUnit);
    const maxAvail = resolveProductStockForBranch(product, selectedBranchId || undefined);
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        const nextQty = Math.min(maxAvail, roundQuantity(existing.quantity + step));
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, quantity: nextQty } : l
        );
      }
      const initialQty = Math.min(maxAvail, step);
      if (initialQty <= 0) return prev;
      return [...prev, { product, quantity: initialQty }];
    });
  };

  const updateCartQty = (productId: string, nextQty: number) => {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.product.id !== productId) return line;
          const maxAvail = resolveProductStockForBranch(
            line.product,
            selectedBranchId || undefined
          );
          const bounded = Math.min(maxAvail, roundQuantity(nextQty));
          return { ...line, quantity: bounded };
        })
        .filter((line) => line.quantity > 0)
    );
  };

  const subtotal = useMemo(
    () =>
      roundCurrency(
        cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0)
      ),
    [cart]
  );

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storefront || cart.length === 0 || submitting) return;
    setSubmitError('');
    setSubmitting(true);

    const res = await submitPublicStorefrontOrder(storefront.storeSlug, {
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      deliveryAddress: deliveryAddress.trim(),
      notes: notes.trim() || undefined,
      branchId: selectedBranchId || undefined,
      paymentMethod,
      idempotencyKey,
      items: cart.map((c) => ({ productId: c.product.id, quantity: c.quantity })),
    });

    setSubmitting(false);
    if (res.ok === false) {
      setSubmitError(res.error);
      return;
    }

    setConfirmedOrder({
      orderNumber: res.order.orderNumber,
      total: res.order.total,
      paymentMethod: res.order.paymentMethod,
      createdAt: res.order.createdAt,
    });
    setCart([]);
    setCartOpen(false);
    setIdempotencyKey(`sf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    void loadStore();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-sm w-full text-center shadow-sm">
          <Store className="w-10 h-10 text-teal-700 mx-auto mb-3 animate-pulse" />
          <p className="text-sm font-semibold text-slate-800">Loading Online Storefront...</p>
          <p className="text-xs text-slate-500 mt-1">Fetching live product prices and availability</p>
        </div>
      </div>
    );
  }

  if (loadError || !storefront) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md w-full text-center shadow-sm">
          <AlertCircle className="w-10 h-10 text-rose-600 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-slate-900">Storefront Unavailable</h1>
          <p className="text-sm text-slate-600 mt-2">
            {loadError || 'This shop storefront could not be found or is currently disabled.'}
          </p>
        </div>
      </div>
    );
  }

  const totalCartItems = cart.length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {storefront.storeName}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                {storefront.address && (
                  <span className="inline-flex items-center gap-1 truncate max-w-xs">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    {storefront.address}
                  </span>
                )}
                {storefront.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    {storefront.phone}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-colors shadow-xs shrink-0"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Cart ({totalCartItems})</span>
            {subtotal > 0 && (
              <span className="hidden sm:inline font-mono text-xs bg-teal-800/80 px-2 py-0.5 rounded-md tabular-nums">
                {formatCurrency(subtotal)}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {storefront.storeDescription && (
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700">
            {storefront.storeDescription}
          </div>
        )}

        {confirmedOrder && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-bold text-emerald-950">
                  Order Submitted! #{confirmedOrder.orderNumber}
                </h2>
                <p className="text-sm text-emerald-800 mt-1">
                  Total: <span className="font-semibold tabular-nums">{formatCurrency(confirmedOrder.total)}</span>{' '}
                  ({confirmedOrder.paymentMethod === 'cod' ? 'Cash on Delivery' : confirmedOrder.paymentMethod}).
                  The shop team will review and confirm your order shortly.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConfirmedOrder(null)}
              className="px-3.5 py-2 rounded-lg bg-white border border-emerald-300 text-emerald-900 text-xs font-semibold hover:bg-emerald-100 self-start sm:self-center"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Filter Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products by name, brand, or SKU..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'beverages', 'bakery', 'pantry'] as CategoryId[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize border transition-colors ${
                  category === cat
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {cat}
              </button>
            ))}

            {storefront.branches.length > 1 && (
              <select
                value={selectedBranchId}
                onChange={(e) => {
                  setSelectedBranchId(e.target.value);
                  setCart([]);
                }}
                aria-label="Select branch"
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                {storefront.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
            <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No available products found</p>
            <p className="text-xs text-slate-500 mt-1">
              Try clearing your search or selecting another category.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map((product) => {
              const avail = resolveProductStockForBranch(product, selectedBranchId || undefined);
              const inCart = cart.find((c) => c.product.id === product.id);
              const unitLabel = getUnitLabel(product.sellingUnit, 'en');
              return (
                <div
                  key={product.id}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-xs hover:border-teal-300 transition-colors"
                >
                  <div className="aspect-[4/3] bg-slate-100 overflow-hidden relative">
                    <ProductImage
                      src={product.image}
                      alt={product.nameEn}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-white/95 border border-slate-200 text-[11px] font-semibold text-slate-700 tabular-nums">
                      {formatQuantity(avail)} {unitLabel} left
                    </span>
                  </div>
                  <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
                        {product.brand || product.category}
                      </p>
                      <h3 className="text-sm font-bold text-slate-900 line-clamp-2 mt-0.5">
                        {product.nameEn}
                      </h3>
                      {product.variant && (
                        <p className="text-xs text-slate-500 mt-0.5">{product.variant}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-base font-bold text-teal-800 tabular-nums">
                          {formatCurrency(product.price)}
                        </span>
                        <span className="text-xs text-slate-500">/ {unitLabel}</span>
                      </div>

                      {inCart ? (
                        <div className="flex items-center justify-between gap-1 bg-teal-50 border border-teal-200 rounded-lg p-1">
                          <button
                            type="button"
                            onClick={() =>
                              updateCartQty(
                                product.id,
                                inCart.quantity - getDefaultStepForUnit(product.sellingUnit)
                              )
                            }
                            className="p-1.5 rounded-md bg-white border border-teal-200 text-teal-800 hover:bg-teal-100"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-xs font-bold text-teal-900 tabular-nums">
                            {formatQuantity(inCart.quantity)} {unitLabel}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateCartQty(
                                product.id,
                                inCart.quantity + getDefaultStepForUnit(product.sellingUnit)
                              )
                            }
                            className="p-1.5 rounded-md bg-white border border-teal-200 text-teal-800 hover:bg-teal-100"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addToCart(product)}
                          className="w-full py-2 px-3 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors"
                        >
                          Add to Cart
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Checkout Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-teal-700" />
                <h2 className="text-base font-bold text-slate-900">Your Order Cart</h2>
              </div>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Close cart"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {cart.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">
                  Your cart is empty. Add products from the store to place an order.
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {cart.map((line) => {
                      const unitLabel = getUnitLabel(line.product.sellingUnit, 'en');
                      const step = getDefaultStepForUnit(line.product.sellingUnit);
                      return (
                        <div
                          key={line.product.id}
                          className="border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {line.product.nameEn}
                            </p>
                            <p className="text-xs text-slate-500 tabular-nums">
                              {formatCurrency(line.product.price)} / {unitLabel}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => updateCartQty(line.product.id, line.quantity - step)}
                              className="p-1 rounded border border-slate-200 hover:bg-slate-100"
                              aria-label="Decrease"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              step={step}
                              min={step}
                              value={line.quantity}
                              onChange={(e) =>
                                updateCartQty(line.product.id, Number(e.target.value) || 0)
                              }
                              className="w-16 text-center text-xs font-semibold border border-slate-200 rounded py-1 tabular-nums"
                            />
                            <button
                              type="button"
                              onClick={() => updateCartQty(line.product.id, line.quantity + step)}
                              className="p-1 rounded border border-slate-200 hover:bg-slate-100"
                              aria-label="Increase"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => updateCartQty(line.product.id, 0)}
                              className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                              aria-label="Remove item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Estimated Subtotal</span>
                    <span className="text-base font-bold text-slate-900 tabular-nums">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>

                  <form id="storefront-checkout-form" onSubmit={handleCheckout} className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="e.g. Ayesha Khan"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Phone / WhatsApp Number *
                      </label>
                      <input
                        type="tel"
                        required
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="03XX-XXXXXXX"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Delivery Address *
                      </label>
                      <textarea
                        required
                        rows={2}
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="House / Street / Area / Landmark"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Payment Method
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as OmnichannelPaymentMethod)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                      >
                        {storefront.codEnabled && <option value="cod">Cash on Delivery (COD)</option>}
                        <option value="bank_transfer">Bank Transfer (Confirm with shop)</option>
                        <option value="jazzcash">JazzCash</option>
                        <option value="easypaisa">EasyPaisa</option>
                      </select>
                      {!storefront.onlinePaymentConfigured && (
                        <p className="text-[11px] text-slate-500 mt-1">
                          Automated card gateway is not active; pay via Cash on Delivery or direct wallet/bank transfer upon confirmation.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Order Notes (Optional)
                      </label>
                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Delivery instructions..."
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    {submitError && (
                      <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                        {submitError}
                      </div>
                    )}
                  </form>
                </>
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-4 border-t border-slate-200 bg-slate-50">
                <button
                  type="submit"
                  form="storefront-checkout-form"
                  disabled={submitting}
                  className="w-full py-3 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-bold transition-colors"
                >
                  {submitting
                    ? 'Submitting Order...'
                    : `Place Order (${formatCurrency(subtotal)})`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
