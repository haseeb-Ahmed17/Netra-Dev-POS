import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Ban,
  Banknote,
  MessageCircle,
  Printer,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import {
  formatCurrency,
  formatDateTime,
  getPaymentLabel,
  type TranslationStrings,
} from '../i18n';
import {
  formatQuantity,
  formatQuantityWithUnit,
  getUnitLabel,
  roundQuantity,
} from '../lib/unitUtils';
import type { Language, OrderRecord, PaymentMethod } from '../types';

export type ReturnResolutionMode = 'refund' | 'exchange';

export interface ReturnRequestPayload {
  orderId: string;
  mode: ReturnResolutionMode;
  items: { productId: string; quantity: number }[];
  reason: string;
}

interface TransactionsViewProps {
  orders: OrderRecord[];
  canCancelOrders?: boolean;
  onPrintReceipt: (order: OrderRecord, isReprint?: boolean) => void;
  onProcessReturn: (payload: ReturnRequestPayload) => void;
  onCancelOrder?: (orderId: string, reason: string) => void;
  onSendWhatsApp?: (order: OrderRecord) => void;
  lang: Language;
  t: TranslationStrings;
}

export function TransactionsView({
  orders,
  canCancelOrders = false,
  onPrintReceipt,
  onProcessReturn,
  onCancelOrder,
  onSendWhatsApp,
  lang,
  t,
}: TransactionsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | PaymentMethod>('all');

  // Return / Exchange Modal state
  const [returnOrder, setReturnOrder] = useState<OrderRecord | null>(null);
  const [selectedQtys, setSelectedQtys] = useState<Record<string, number>>({});
  const [returnMode, setReturnMode] = useState<ReturnResolutionMode>('refund');
  const [returnReason, setReturnReason] = useState('');

  // Cancel Order Modal state
  const [cancelOrderTarget, setCancelOrderTarget] = useState<OrderRecord | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...orders]
      .sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .filter((order) => {
        if (paymentFilter !== 'all' && order.paymentMethod !== paymentFilter) {
          return false;
        }
        if (!q) return true;
        return (
          order.receiptNumber.toLowerCase().includes(q) ||
          order.customerName.toLowerCase().includes(q) ||
          (order.transactionId ?? '').toLowerCase().includes(q)
        );
      });
  }, [orders, searchQuery, paymentFilter]);

  const openReturnModal = (order: OrderRecord) => {
    const initialMap: Record<string, number> = {};
    for (const item of order.items) {
      const remaining = Math.max(0, item.quantity - (item.returnedQty ?? 0));
      if (remaining > 0) {
        initialMap[item.productId] = remaining;
      }
    }
    setSelectedQtys(initialMap);
    setReturnMode('refund');
    setReturnReason('');
    setReturnOrder(order);
  };

  const closeReturnModal = () => {
    setReturnOrder(null);
    setSelectedQtys({});
    setReturnReason('');
  };

  const toggleItemSelection = (productId: string, maxQty: number) => {
    if (maxQty <= 0) return;
    setSelectedQtys((prev) => {
      const current = prev[productId] ?? 0;
      if (current > 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: maxQty };
    });
  };

  const setItemQty = (productId: string, nextQty: number, maxQty: number) => {
    if (maxQty <= 0) return;
    const rounded = roundQuantity(nextQty);
    if (!Number.isFinite(rounded) || rounded <= 0) {
      setSelectedQtys((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
      return;
    }
    setSelectedQtys((prev) => ({
      ...prev,
      [productId]: Math.min(roundQuantity(maxQty), Math.max(0.001, rounded)),
    }));
  };

  const returnSummary = useMemo(() => {
    if (!returnOrder) {
      return { totalUnits: 0, deductionAmount: 0 };
    }

    let totalUnits = 0;
    let totalRemainingUnits = 0;
    let returnedSubtotal = 0;
    let returnedTax = 0;
    const discountFactor = 1 - returnOrder.discountPercent / 100;

    for (const item of returnOrder.items) {
      const remaining = Math.max(
        0,
        roundQuantity(item.quantity - (item.returnedQty ?? 0))
      );
      totalRemainingUnits = roundQuantity(totalRemainingUnits + remaining);

      const qty = Math.min(
        remaining,
        Math.max(0, roundQuantity(selectedQtys[item.productId] ?? 0))
      );
      if (qty > 0) {
        totalUnits = roundQuantity(totalUnits + qty);
        const lineSub = item.unitPrice * qty;
        returnedSubtotal += lineSub;
        const discountedLine = lineSub * discountFactor;
        returnedTax += discountedLine * ((item.taxRate ?? 0) / 100);
      }
    }

    if (returnMode === 'exchange' || totalUnits === 0) {
      return { totalUnits, deductionAmount: 0 };
    }

    if (totalUnits >= totalRemainingUnits) {
      return { totalUnits, deductionAmount: returnOrder.total };
    }

    const discountedSub = returnedSubtotal * discountFactor;
    const rawDeduction = Math.round(discountedSub + returnedTax);
    return {
      totalUnits,
      deductionAmount: Math.min(returnOrder.total, Math.max(0, rawDeduction)),
    };
  }, [returnOrder, selectedQtys, returnMode]);

  const handleConfirmReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnOrder || returnSummary.totalUnits <= 0) return;

    const itemsToReturn = Object.entries(selectedQtys)
      .filter(([, qty]) => qty > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));

    if (itemsToReturn.length === 0) return;

    onProcessReturn({
      orderId: returnOrder.id,
      mode: returnMode,
      items: itemsToReturn,
      reason: returnReason.trim(),
    });
    closeReturnModal();
  };

  const getStatusBadge = (order: OrderRecord) => {
    const status = order.returnStatus ?? 'completed';
    if (status === 'cancelled') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-200 text-slate-800 border border-slate-300 whitespace-nowrap">
          {t.statusCancelledLabel}
        </span>
      );
    }
    if (status === 'refunded') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
          {t.statusRefundedLabel}
        </span>
      );
    }
    if (status === 'partially_refunded') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
          {t.statusPartiallyRefundedLabel}
        </span>
      );
    }
    if (status === 'exchanged') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-teal-50 text-teal-800 border border-teal-200 whitespace-nowrap">
          {t.statusExchangedLabel}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
        {t.statusCompletedLabel}
      </span>
    );
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t.transactionsTitle}
        </h1>
        <p className="text-sm text-slate-600 mt-1">{t.transactionsSubtitle}</p>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search
            className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchReceiptsPlaceholder}
            className="w-full h-10 ps-9 pe-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 focus:bg-white transition-colors"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {(
            ['all', 'cash', 'jazzcash', 'easypaisa', 'card', 'bank_transfer', 'udhaar'] as const
          ).map(
            (method) => {
              const active = paymentFilter === method;
              const label =
                method === 'all' ? t.filterAllPayments : getPaymentLabel(method, t);
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentFilter(method)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            {t.noTransactionsMatch}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-5 text-start font-medium">{t.receiptCol}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.timeCol}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.customerCol}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.itemsCol}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.methodCol}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.statusCol}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.subtotalCol}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.taxCol}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.totalCol}</th>
                  <th className="py-3 px-5 text-end font-medium">{t.actionCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((order) => {
                  const unitCount = roundQuantity(
                    order.items.reduce((s, i) => s + i.quantity, 0)
                  );
                  const remainingReturnable = order.items.reduce(
                    (s, i) => s + Math.max(0, roundQuantity(i.quantity - (i.returnedQty ?? 0))),
                    0
                  );
                  const refundedAmt = order.refundedAmount ?? 0;

                  return (
                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-5 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                        {order.receiptNumber}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {formatDateTime(order.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        {order.customerName || t.walkInCustomer}
                      </td>
                      <td className="py-3 px-4 text-end font-mono text-slate-700 tabular-nums">
                        {formatQuantity(unitCount)}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        <div>{getPaymentLabel(order.paymentMethod, t)}</div>
                        {order.transactionId && (
                          <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                            {t.tidReceiptLabel}: {order.transactionId}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex flex-col items-start gap-0.5">
                          {getStatusBadge(order)}
                          {refundedAmt > 0 && (
                            <span className="text-[11px] font-mono text-red-700 tabular-nums">
                              -{formatCurrency(refundedAmt, lang)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-end font-mono text-slate-700 tabular-nums whitespace-nowrap">
                        {formatCurrency(order.subtotal, lang)}
                      </td>
                      <td className="py-3 px-4 text-end font-mono text-slate-600 tabular-nums whitespace-nowrap">
                        {formatCurrency(order.taxAmount, lang)}
                      </td>
                      <td className="py-3 px-4 text-end font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatCurrency(order.total, lang)}
                      </td>
                      <td className="py-3 px-5 text-end whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {remainingReturnable > 0 && order.returnStatus !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => openReturnModal(order)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md whitespace-nowrap transition-colors cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span>{t.returnExchangeBtn}</span>
                            </button>
                          )}

                          {canCancelOrders &&
                            onCancelOrder &&
                            order.returnStatus !== 'cancelled' &&
                            order.returnStatus !== 'refunded' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCancelOrderTarget(order);
                                  setCancelReason('');
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md whitespace-nowrap transition-colors cursor-pointer"
                              >
                                <Ban className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>{t.cancelOrderBtn}</span>
                              </button>
                            )}

                          {onSendWhatsApp && (
                            <button
                              type="button"
                              onClick={() => onSendWhatsApp(order)}
                              aria-label={t.sendWhatsappReceiptBtn}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md whitespace-nowrap transition-colors cursor-pointer"
                            >
                              <MessageCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onPrintReceipt(order, true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md whitespace-nowrap transition-colors cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>{t.printBtn}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Return / Refund & Exchange Modal */}
      {returnOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="return-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl my-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h2
                  id="return-modal-title"
                  className="text-base font-bold text-slate-900"
                >
                  {t.returnModalTitle} ·{' '}
                  <span className="font-mono text-teal-800">
                    {returnOrder.receiptNumber}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">{t.returnModalSubtitle}</p>
              </div>
              <button
                type="button"
                onClick={closeReturnModal}
                aria-label={t.closeBtn}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form
              onSubmit={handleConfirmReturn}
              className="p-5 space-y-5 max-h-[82vh] overflow-y-auto"
            >
              {/* Invoice Meta Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs">
                <div>
                  <span className="text-slate-500 block">{t.customerCol}</span>
                  <span className="font-semibold text-slate-900">
                    {returnOrder.customerName || t.walkInCustomer}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">{t.methodCol}</span>
                  <span className="font-semibold text-slate-900">
                    {getPaymentLabel(returnOrder.paymentMethod, t)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">{t.timeCol}</span>
                  <span className="font-mono text-slate-800">
                    {formatDateTime(returnOrder.createdAt)}
                  </span>
                </div>
                <div className="sm:text-end">
                  <span className="text-slate-500 block">{t.totalCol}</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {formatCurrency(returnOrder.total, lang)}
                  </span>
                </div>
              </div>

              {/* Selectable Items Table */}
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">
                  {t.returnSelectItemsLabel}
                </p>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 text-start w-9"></th>
                        <th className="py-2.5 px-3 text-start font-medium">
                          {t.productCol}
                        </th>
                        <th className="py-2.5 px-3 text-end font-medium">
                          {t.priceCol}
                        </th>
                        <th className="py-2.5 px-3 text-end font-medium">
                          {t.purchasedQtyCol}
                        </th>
                        <th className="py-2.5 px-3 text-end font-medium">
                          {t.returnQtyCol}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {returnOrder.items.map((item) => {
                        const alreadyReturned = roundQuantity(item.returnedQty ?? 0);
                        const remaining = Math.max(
                          0,
                          roundQuantity(item.quantity - alreadyReturned)
                        );
                        const selectedQty = selectedQtys[item.productId] ?? 0;
                        const isChecked = selectedQty > 0;
                        const itemName = lang === 'ur' ? item.nameUr : item.nameEn;
                        const unitLabel = getUnitLabel(item.sellingUnit, lang);

                        return (
                          <tr
                            key={item.productId}
                            className={remaining === 0 ? 'bg-slate-50/70 opacity-60' : ''}
                          >
                            <td className="py-2.5 px-3">
                              <input
                                type="checkbox"
                                disabled={remaining === 0}
                                checked={isChecked}
                                onChange={() =>
                                  toggleItemSelection(item.productId, remaining)
                                }
                                aria-label={itemName}
                                className="w-4 h-4 accent-teal-700 rounded cursor-pointer disabled:cursor-not-allowed"
                              />
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-slate-900">
                                {itemName}
                              </div>
                              <div className="text-[11px] font-mono text-slate-400">
                                {item.sku}
                                {alreadyReturned > 0 && (
                                  <span className="ms-2 text-amber-700">
                                    · {t.alreadyReturnedLabel}:{' '}
                                    {formatQuantityWithUnit(
                                      alreadyReturned,
                                      item.sellingUnit,
                                      lang
                                    )}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-end font-mono text-slate-700 tabular-nums whitespace-nowrap">
                              {formatCurrency(item.unitPrice, lang)} / {unitLabel}
                            </td>
                            <td className="py-2.5 px-3 text-end font-mono text-slate-700 tabular-nums whitespace-nowrap">
                              {formatQuantityWithUnit(
                                item.quantity,
                                item.sellingUnit,
                                lang
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-end">
                              {remaining === 0 ? (
                                <span className="text-[11px] font-semibold text-slate-500">
                                  {t.fullyReturnedLabel}
                                </span>
                              ) : (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setItemQty(
                                        item.productId,
                                        roundQuantity(selectedQty - 1),
                                        remaining
                                      )
                                    }
                                    className="w-7 h-7 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-mono font-semibold cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min={0}
                                    max={remaining}
                                    step="any"
                                    value={selectedQty}
                                    onChange={(e) =>
                                      setItemQty(
                                        item.productId,
                                        Number(e.target.value) || 0,
                                        remaining
                                      )
                                    }
                                    className="w-16 h-7 text-center font-mono font-semibold bg-slate-50 border border-slate-200 rounded-md text-slate-900 tabular-nums focus:outline-none focus:border-teal-700"
                                  />
                                  <button
                                    type="button"
                                    disabled={selectedQty >= remaining}
                                    onClick={() =>
                                      setItemQty(
                                        item.productId,
                                        roundQuantity(selectedQty + 1),
                                        remaining
                                      )
                                    }
                                    className="w-7 h-7 rounded-md border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 font-mono font-semibold cursor-pointer"
                                  >
                                    +
                                  </button>
                                  <span className="text-[10px] font-medium text-slate-500 ms-0.5">
                                    {unitLabel}
                                  </span>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Resolution Mode Options */}
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">
                  {t.returnResolutionLabel}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setReturnMode('refund')}
                    className={`text-start p-3.5 rounded-xl border transition-colors cursor-pointer ${
                      returnMode === 'refund'
                        ? 'bg-red-50 border-red-400 ring-1 ring-red-400'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Banknote
                        className={`w-4 h-4 shrink-0 ${
                          returnMode === 'refund' ? 'text-red-700' : 'text-slate-500'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="text-xs font-bold text-slate-900">
                        {t.returnRefundOptionTitle}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                      {t.returnRefundOptionDesc}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReturnMode('exchange')}
                    className={`text-start p-3.5 rounded-xl border transition-colors cursor-pointer ${
                      returnMode === 'exchange'
                        ? 'bg-teal-50 border-teal-600 ring-1 ring-teal-600'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <ArrowLeftRight
                        className={`w-4 h-4 shrink-0 ${
                          returnMode === 'exchange' ? 'text-teal-700' : 'text-slate-500'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="text-xs font-bold text-slate-900">
                        {t.returnExchangeOptionTitle}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                      {t.returnExchangeOptionDesc}
                    </p>
                  </button>
                </div>
              </div>

              {/* Reason Input */}
              <div>
                <label
                  htmlFor="return-reason-input"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  {t.returnReasonLabel}
                </label>
                <input
                  id="return-reason-input"
                  type="text"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder={t.returnReasonPlaceholder}
                  className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              {/* Summary Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">{t.returnSummaryStockLabel}</span>
                  <span className="font-mono font-bold text-emerald-700 tabular-nums">
                    +{formatQuantity(returnSummary.totalUnits)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">{t.returnSummaryRevenueLabel}</span>
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      returnSummary.deductionAmount > 0
                        ? 'text-red-700'
                        : 'text-slate-700'
                    }`}
                  >
                    {returnSummary.deductionAmount > 0
                      ? `-${formatCurrency(returnSummary.deductionAmount, lang)}`
                      : formatCurrency(0, lang)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeReturnModal}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg min-h-[40px] cursor-pointer"
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="submit"
                  disabled={returnSummary.totalUnits === 0}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-lg min-h-[40px] disabled:bg-slate-300 cursor-pointer ${
                    returnMode === 'refund'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-teal-700 hover:bg-teal-800'
                  }`}
                >
                  <RotateCcw className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>
                    {returnMode === 'refund'
                      ? t.confirmRefundBtn
                      : t.confirmExchangeBtn}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Order Modal */}
      {cancelOrderTarget && onCancelOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!cancelReason.trim()) return;
              onCancelOrder(cancelOrderTarget.id, cancelReason.trim());
              setCancelOrderTarget(null);
              setCancelReason('');
            }}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl"
          >
            <h2 className="text-base font-bold text-slate-900">
              {t.cancelOrderBtn} ·{' '}
              <span className="font-mono text-rose-700">{cancelOrderTarget.receiptNumber}</span>
            </h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t.cancelOrderReasonLabel} *
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g., Customer cancelled at counter"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelOrderTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                {t.closeBtn}
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
              >
                {t.cancelOrderBtn}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
