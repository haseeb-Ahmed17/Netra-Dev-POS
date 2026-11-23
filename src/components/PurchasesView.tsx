import { Fragment, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  PackageCheck,
  PackagePlus,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { formatCurrency, formatDateTime, type TranslationStrings } from '../i18n';
import {
  formatQuantity,
  formatQuantityWithUnit,
  getUnitLabel,
  normalizeSellingUnit,
  roundCurrency,
  roundQuantity,
} from '../lib/unitUtils';
import type {
  Language,
  Product,
  PurchaseOrderStatus,
  PurchaseRecord,
  SellingUnit,
  Vendor,
} from '../types';

export interface DraftPurchaseLine {
  productId: string;
  productName: string;
  sku: string;
  sellingUnit: SellingUnit;
  quantity: number;
  unitCost: number;
  batchNumber?: string;
  expiryDate?: string;
}

interface PurchasesViewProps {
  vendors: Vendor[];
  products: Product[];
  purchases: PurchaseRecord[];
  onReceiveInventory: (payload: {
    vendorId: string;
    invoiceNumber: string;
    paidAmount: number;
    note: string;
    status?: PurchaseOrderStatus;
    lines: DraftPurchaseLine[];
  }) => PurchaseRecord | null;
  onUpdatePurchaseStatus?: (purchaseId: string, status: PurchaseOrderStatus) => void;
  onPurchaseReturn?: (payload: {
    purchaseId: string;
    items: { productId: string; quantity: number }[];
    reason: string;
  }) => void;
  onGoToVendors: () => void;
  lang: Language;
  t: TranslationStrings;
}

export function PurchasesView({
  vendors,
  products,
  purchases,
  onReceiveInventory,
  onUpdatePurchaseStatus,
  onPurchaseReturn,
  onGoToVendors,
  lang,
  t,
}: PurchasesViewProps) {
  const [selectedVendorId, setSelectedVendorId] = useState<string>(
    vendors[0]?.id ?? ''
  );
  const [invoiceNumber, setInvoiceNumber] = useState(
    () => `PO-2026-${401 + purchases.length}`
  );
  const [poStatus, setPoStatus] = useState<PurchaseOrderStatus>('received');
  const [selectedProductId, setSelectedProductId] = useState<string>(
    products[0]?.id ?? ''
  );
  const [draftLines, setDraftLines] = useState<DraftPurchaseLine[]>([]);
  const [paidAmountInput, setPaidAmountInput] = useState<string>('0');
  const [note, setNote] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedPurchaseId, setExpandedPurchaseId] = useState<string | null>(null);

  // Purchase return modal state
  const [returnPurchase, setReturnPurchase] = useState<PurchaseRecord | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState('');

  const effectiveVendorId = useMemo(() => {
    if (selectedVendorId && vendors.some((v) => v.id === selectedVendorId)) {
      return selectedVendorId;
    }
    return vendors[0]?.id ?? '';
  }, [selectedVendorId, vendors]);

  const effectiveProductId = useMemo(() => {
    if (selectedProductId && products.some((p) => p.id === selectedProductId)) {
      return selectedProductId;
    }
    return products[0]?.id ?? '';
  }, [selectedProductId, products]);

  const productUnitMap = useMemo(() => {
    const map = new Map<string, SellingUnit>();
    for (const p of products) {
      map.set(p.id, normalizeSellingUnit(p.sellingUnit));
    }
    return map;
  }, [products]);

  const totalAmount = useMemo(
    () =>
      roundCurrency(
        draftLines.reduce(
          (sum, line) => sum + Math.max(0, line.quantity) * Math.max(0, line.unitCost),
          0
        )
      ),
    [draftLines]
  );

  const paidAmount = Math.max(0, Number(paidAmountInput) || 0);
  const remainingPayable = Math.max(0, roundCurrency(totalAmount - paidAmount));

  const handleAddLine = () => {
    const prod = products.find((p) => p.id === effectiveProductId);
    if (!prod) return;

    setSuccessMessage(null);
    setDraftLines((prev) => {
      const existing = prev.find((l) => l.productId === prod.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === prod.id
            ? { ...l, quantity: roundQuantity(l.quantity + 1) }
            : l
        );
      }
      return [
        ...prev,
        {
          productId: prod.id,
          productName: lang === 'ur' ? prod.nameUr : prod.nameEn,
          sku: prod.sku,
          sellingUnit: normalizeSellingUnit(prod.sellingUnit),
          quantity: 10,
          unitCost: prod.cost,
          batchNumber: prod.batchNumber,
          expiryDate: prod.expiryDate,
        },
      ];
    });
  };

  const handleUpdateLineMeta = (
    productId: string,
    field: 'batchNumber' | 'expiryDate',
    value: string
  ) => {
    setDraftLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, [field]: value } : l))
    );
  };

  const handleUpdateLineQty = (productId: string, qty: number) => {
    const parsed = roundQuantity(qty);
    const cleanQty = Number.isFinite(parsed) && parsed > 0 ? parsed : 0.001;
    setDraftLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, quantity: cleanQty } : l))
    );
  };

  const handleUpdateLineCost = (productId: string, cost: number) => {
    const cleanCost = Math.max(0, cost || 0);
    setDraftLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, unitCost: cleanCost } : l))
    );
  };

  const handleRemoveLine = (productId: string) => {
    setDraftLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  const handleSubmitPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveVendorId || draftLines.length === 0) return;

    const created = onReceiveInventory({
      vendorId: effectiveVendorId,
      invoiceNumber:
        invoiceNumber.trim() || `PO-2026-${401 + purchases.length}`,
      paidAmount,
      note: note.trim(),
      status: poStatus,
      lines: draftLines,
    });

    if (created) {
      setDraftLines([]);
      setPaidAmountInput('0');
      setNote('');
      setPoStatus('received');
      setInvoiceNumber(`PO-2026-${402 + purchases.length}`);
      setSuccessMessage(t.purchaseSuccessMsg);
    }
  };

  const openReturnModal = (pur: PurchaseRecord) => {
    setReturnPurchase(pur);
    const init: Record<string, string> = {};
    for (const item of pur.items) {
      init[item.productId] = '0';
    }
    setReturnQuantities(init);
    setReturnReason('');
  };

  const handleConfirmPurchaseReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnPurchase || !onPurchaseReturn) return;
    const items = returnPurchase.items
      .map((item) => ({
        productId: item.productId,
        quantity: Math.min(
          item.quantity,
          Math.max(0, roundQuantity(Number(returnQuantities[item.productId]) || 0))
        ),
      }))
      .filter((x) => x.quantity > 0);
    if (items.length === 0) return;
    onPurchaseReturn({
      purchaseId: returnPurchase.id,
      items,
      reason: returnReason.trim() || 'Supplier return',
    });
    setReturnPurchase(null);
  };

  const sortedPurchases = useMemo(
    () =>
      [...purchases].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [purchases]
  );

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Page Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t.purchasesTitle}
        </h1>
        <p className="text-sm text-slate-600 mt-1">{t.purchasesSubtitle}</p>
      </div>

      {vendors.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
            <span>{t.noVendorsNotice}</span>
          </div>
          <button
            type="button"
            onClick={onGoToVendors}
            className="px-4 py-2 text-xs font-semibold text-white bg-amber-800 hover:bg-amber-900 rounded-lg whitespace-nowrap cursor-pointer"
          >
            {t.goToVendorsBtn}
          </button>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-2.5 text-sm font-medium text-emerald-900"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Purchase Entry Builder */}
      <form
        onSubmit={handleSubmitPurchase}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
      >
        {/* Left: Vendor & Line Items */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <h2 className="text-base font-bold text-slate-900">
            {t.newPurchaseTitle}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t.selectVendorLabel} *
              </label>
              <select
                required
                value={effectiveVendorId}
                onChange={(e) => setSelectedVendorId(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
              >
                {vendors.length === 0 ? (
                  <option value="">{t.chooseVendorOption}</option>
                ) : (
                  vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.company ? ` (${v.company})` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t.invoiceNoLabel}
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="PO-2026-403"
                className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t.poStatusLabel}
              </label>
              <select
                value={poStatus}
                onChange={(e) => setPoStatus(e.target.value as PurchaseOrderStatus)}
                className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
              >
                <option value="received">Received</option>
                <option value="partial">Partial</option>
                <option value="ordered">Ordered (Pending)</option>
              </select>
            </div>
          </div>

          {/* Product Selector Bar */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {t.addProductToPurchaseLabel}
            </label>
            <div className="flex items-center gap-2">
              <select
                value={effectiveProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="flex-1 h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
              >
                {products.length === 0 ? (
                  <option value="">{t.chooseProductOption}</option>
                ) : (
                  products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {lang === 'ur' ? p.nameUr : p.nameEn} ({p.sku}) · {t.inStockLabel}:{' '}
                      {formatQuantityWithUnit(p.stock, p.sellingUnit, lang)} ·{' '}
                      {formatCurrency(p.cost, lang)} / {getUnitLabel(p.sellingUnit, lang)}
                    </option>
                  ))
                )}
              </select>

              <button
                type="button"
                disabled={!effectiveProductId}
                onClick={handleAddLine}
                className="inline-flex items-center gap-1.5 px-4 h-10 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t.addRowBtn}</span>
              </button>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 text-start font-medium">{t.productCol}</th>
                    <th className="py-2.5 px-3 text-end font-medium">{t.qtyCol}</th>
                    <th className="py-2.5 px-3 text-end font-medium">{t.purchaseCostCol}</th>
                    <th className="py-2.5 px-3 text-end font-medium">{t.lineTotalCol}</th>
                    <th className="py-2.5 px-2 text-end font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draftLines.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-8 px-4 text-center text-xs text-slate-500"
                      >
                        {t.chooseProductOption}
                      </td>
                    </tr>
                  ) : (
                    draftLines.map((line) => (
                      <tr key={line.productId}>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-900 text-xs sm:text-sm">
                            {line.productName}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {line.sku}
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            <input
                              type="text"
                              placeholder={t.batchNumberLabel}
                              value={line.batchNumber ?? ''}
                              onChange={(e) =>
                                handleUpdateLineMeta(
                                  line.productId,
                                  'batchNumber',
                                  e.target.value
                                )
                              }
                              className="w-24 h-7 px-2 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded"
                            />
                            <input
                              type="date"
                              value={line.expiryDate ?? ''}
                              onChange={(e) =>
                                handleUpdateLineMeta(
                                  line.productId,
                                  'expiryDate',
                                  e.target.value
                                )
                              }
                              className="h-7 px-1.5 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded"
                            />
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-end">
                          <div className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0.001"
                              step="any"
                              value={line.quantity}
                              onChange={(e) =>
                                handleUpdateLineQty(
                                  line.productId,
                                  Number(e.target.value)
                                )
                              }
                              className="w-20 h-9 px-2 text-end font-mono text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-teal-700 focus:bg-white"
                            />
                            <span className="text-[11px] font-medium text-slate-500 shrink-0">
                              {getUnitLabel(line.sellingUnit, lang)}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-end">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.unitCost}
                            onChange={(e) =>
                              handleUpdateLineCost(
                                line.productId,
                                Number(e.target.value)
                              )
                            }
                            className="w-24 h-9 px-2 text-end font-mono text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-teal-700 focus:bg-white"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatCurrency(roundCurrency(line.quantity * line.unitCost), lang)}
                        </td>
                        <td className="py-2.5 px-2 text-end">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(line.productId)}
                            aria-label={`${t.deleteBtn} ${line.productName}`}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Right: Payment & Receive Inventory */}
        <aside className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <span className="text-sm font-medium text-slate-600">
              {t.purchaseTotalLabel}
            </span>
            <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {formatCurrency(totalAmount, lang)}
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-700">
                {t.paidAmountLabel}
              </label>
              <button
                type="button"
                disabled={totalAmount <= 0}
                onClick={() => setPaidAmountInput(String(totalAmount))}
                className="text-xs font-semibold text-teal-700 hover:text-teal-800 disabled:text-slate-400 cursor-pointer"
              >
                {t.payFullBtn}
              </button>
            </div>
            <input
              type="number"
              min="0"
              step="1"
              value={paidAmountInput}
              onChange={(e) => setPaidAmountInput(e.target.value)}
              className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
            />
          </div>

          <div
            className={`rounded-lg border p-3.5 flex items-center justify-between ${
              remainingPayable > 0
                ? 'bg-amber-50 border-amber-200'
                : 'bg-emerald-50 border-emerald-200'
            }`}
          >
            <span
              className={`text-xs font-medium ${
                remainingPayable > 0 ? 'text-amber-900' : 'text-emerald-900'
              }`}
            >
              {t.remainingPayableLabel}
            </span>
            <span
              className={`font-mono text-base font-bold tabular-nums ${
                remainingPayable > 0 ? 'text-amber-800' : 'text-emerald-800'
              }`}
            >
              {formatCurrency(remainingPayable, lang)}
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {t.purchaseNoteLabel}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.purchaseNotePlaceholder}
              className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={!effectiveVendorId || draftLines.length === 0}
            className="w-full h-11 inline-flex items-center justify-center gap-2 px-4 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-400 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <PackagePlus className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t.receiveInventoryBtn}</span>
          </button>
        </aside>
      </form>

      {/* Purchase History */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">
            {t.purchaseHistoryTitle}
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 text-start font-medium">{t.invoiceNoLabel}</th>
                <th className="py-3 px-4 text-start font-medium">{t.entryDateCol}</th>
                <th className="py-3 px-4 text-start font-medium">{t.vendorCol}</th>
                <th className="py-3 px-4 text-end font-medium">{t.itemsCol}</th>
                <th className="py-3 px-4 text-end font-medium">{t.totalCol}</th>
                <th className="py-3 px-4 text-end font-medium">{t.paidCol}</th>
                <th className="py-3 px-4 text-end font-medium">{t.balanceDueCol}</th>
                <th className="py-3 px-4 text-end font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedPurchases.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center text-sm text-slate-500">
                    {t.noPurchasesYet}
                  </td>
                </tr>
              ) : (
                sortedPurchases.map((pur) => {
                  const isExpanded = expandedPurchaseId === pur.id;
                  const totalUnits = roundQuantity(
                    pur.items.reduce((s, i) => s + i.quantity, 0)
                  );
                  const status = pur.status ?? 'received';
                  return (
                    <Fragment key={pur.id}>
                      <tr
                        onClick={() =>
                          setExpandedPurchaseId(isExpanded ? null : pur.id)
                        }
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                          <div>{pur.invoiceNumber}</div>
                          <span
                            className={`inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${
                              status === 'received'
                                ? 'bg-emerald-50 text-emerald-700'
                                : status === 'returned'
                                ? 'bg-red-50 text-red-700'
                                : 'bg-amber-50 text-amber-800'
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          {formatDateTime(pur.createdAt)}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-medium text-slate-900">
                          {pur.vendorName}
                        </td>
                        <td className="py-3.5 px-4 text-end font-mono text-xs text-slate-700 tabular-nums">
                          {formatQuantity(totalUnits)}
                        </td>
                        <td className="py-3.5 px-4 text-end font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatCurrency(pur.totalAmount, lang)}
                        </td>
                        <td className="py-3.5 px-4 text-end font-mono text-xs text-emerald-700 tabular-nums whitespace-nowrap">
                          {formatCurrency(pur.paidAmount, lang)}
                        </td>
                        <td className="py-3.5 px-4 text-end font-mono text-xs font-semibold tabular-nums whitespace-nowrap">
                          {pur.balanceDue > 0 ? (
                            <span className="text-amber-700">
                              {formatCurrency(pur.balanceDue, lang)}
                            </span>
                          ) : (
                            <span className="text-emerald-700">{t.settledStatus}</span>
                          )}
                        </td>
                        <td
                          className="py-3.5 px-4 text-end whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1.5">
                            {(status === 'ordered' || status === 'partial') &&
                              onUpdatePurchaseStatus && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdatePurchaseStatus(pur.id, 'received')
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded cursor-pointer"
                                >
                                  <PackageCheck className="w-3 h-3" aria-hidden="true" />
                                  <span>{t.receiveInventoryBtn}</span>
                                </button>
                              )}
                            {status !== 'returned' && onPurchaseReturn && (
                              <button
                                type="button"
                                onClick={() => openReturnModal(pur)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 rounded cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                                <span>{t.supplierReturnBtn}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedPurchaseId(isExpanded ? null : pur.id)
                              }
                              className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 inline" />
                              ) : (
                                <ChevronDown className="w-4 h-4 inline" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={8} className="px-6 py-3">
                            <div className="space-y-1.5 text-xs">
                              {pur.items.map((item) => {
                                const unit =
                                  item.sellingUnit ??
                                  productUnitMap.get(item.productId) ??
                                  'piece';
                                return (
                                  <div
                                    key={item.id}
                                    className="flex items-center justify-between text-slate-700"
                                  >
                                    <span>
                                      <span className="font-medium text-slate-900">
                                        {item.productName}
                                      </span>{' '}
                                      <span className="font-mono text-[11px] text-slate-400">
                                        ({item.sku})
                                      </span>
                                      {(item.batchNumber || item.expiryDate) && (
                                        <span className="ms-2 text-[11px] font-mono text-slate-500">
                                          {item.batchNumber ? `Batch: ${item.batchNumber}` : ''}{' '}
                                          {item.expiryDate ? `Exp: ${item.expiryDate}` : ''}
                                        </span>
                                      )}
                                    </span>
                                    <span className="font-mono tabular-nums">
                                      {formatQuantityWithUnit(item.quantity, unit, lang)} ×{' '}
                                      {formatCurrency(item.unitCost, lang)} ={' '}
                                      <strong className="text-slate-900">
                                        {formatCurrency(item.lineTotal, lang)}
                                      </strong>
                                    </span>
                                  </div>
                                );
                              })}
                              {pur.note && (
                                <p className="pt-1 text-[11px] text-slate-500">
                                  {pur.note}
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Purchase Return Modal */}
      {returnPurchase && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                {t.supplierReturnBtn} — {returnPurchase.invoiceNumber}
              </h2>
              <button
                type="button"
                onClick={() => setReturnPurchase(null)}
                aria-label={t.closeBtn}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleConfirmPurchaseReturn} className="p-5 space-y-4">
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {returnPurchase.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{item.productName}</p>
                      <p className="font-mono text-slate-500">
                        Max: {formatQuantity(item.quantity)} · {formatCurrency(item.unitCost, lang)}
                      </p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={item.quantity}
                      step="any"
                      value={returnQuantities[item.productId] ?? '0'}
                      onChange={(e) =>
                        setReturnQuantities((prev) => ({
                          ...prev,
                          [item.productId]: e.target.value,
                        }))
                      }
                      className="w-24 h-9 px-2 text-end font-mono bg-white border border-slate-300 rounded-md"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.returnReasonLabel}
                </label>
                <input
                  type="text"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Damaged / short delivery..."
                  className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReturnPurchase(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg cursor-pointer"
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg cursor-pointer"
                >
                  {t.supplierReturnBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
