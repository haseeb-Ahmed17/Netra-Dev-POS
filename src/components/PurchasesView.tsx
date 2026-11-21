import { Fragment, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  PackagePlus,
  Plus,
  Trash2,
} from 'lucide-react';
import { formatCurrency, formatDateTime, type TranslationStrings } from '../i18n';
import type { Language, Product, PurchaseRecord, Vendor } from '../types';

interface DraftPurchaseLine {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitCost: number;
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
    lines: DraftPurchaseLine[];
  }) => PurchaseRecord | null;
  onGoToVendors: () => void;
  lang: Language;
  t: TranslationStrings;
}

export function PurchasesView({
  vendors,
  products,
  purchases,
  onReceiveInventory,
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
  const [selectedProductId, setSelectedProductId] = useState<string>(
    products[0]?.id ?? ''
  );
  const [draftLines, setDraftLines] = useState<DraftPurchaseLine[]>([]);
  const [paidAmountInput, setPaidAmountInput] = useState<string>('0');
  const [note, setNote] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedPurchaseId, setExpandedPurchaseId] = useState<string | null>(null);

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

  const totalAmount = useMemo(
    () =>
      draftLines.reduce(
        (sum, line) => sum + Math.max(0, line.quantity) * Math.max(0, line.unitCost),
        0
      ),
    [draftLines]
  );

  const paidAmount = Math.max(0, Number(paidAmountInput) || 0);
  const remainingPayable = Math.max(0, totalAmount - paidAmount);

  const handleAddLine = () => {
    const prod = products.find((p) => p.id === effectiveProductId);
    if (!prod) return;

    setSuccessMessage(null);
    setDraftLines((prev) => {
      const existing = prev.find((l) => l.productId === prod.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === prod.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...prev,
        {
          productId: prod.id,
          productName: lang === 'ur' ? prod.nameUr : prod.nameEn,
          sku: prod.sku,
          quantity: 10,
          unitCost: prod.cost,
        },
      ];
    });
  };

  const handleUpdateLineQty = (productId: string, qty: number) => {
    const cleanQty = Math.max(1, Math.floor(qty || 1));
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
      lines: draftLines,
    });

    if (created) {
      setDraftLines([]);
      setPaidAmountInput('0');
      setNote('');
      setInvoiceNumber(`PO-2026-${402 + purchases.length}`);
      setSuccessMessage(t.purchaseSuccessMsg);
    }
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      {p.stock} · {formatCurrency(p.cost, lang)}
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
                        </td>
                        <td className="py-2.5 px-3 text-end">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={line.quantity}
                            onChange={(e) =>
                              handleUpdateLineQty(
                                line.productId,
                                Number(e.target.value)
                              )
                            }
                            className="w-20 h-9 px-2 text-end font-mono text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-teal-700 focus:bg-white"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-end">
                          <input
                            type="number"
                            min="0"
                            step="1"
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
                          {formatCurrency(line.quantity * line.unitCost, lang)}
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
                  const totalUnits = pur.items.reduce((s, i) => s + i.quantity, 0);
                  return (
                    <Fragment key={pur.id}>
                      <tr
                        onClick={() =>
                          setExpandedPurchaseId(isExpanded ? null : pur.id)
                        }
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                          {pur.invoiceNumber}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          {formatDateTime(pur.createdAt)}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-medium text-slate-900">
                          {pur.vendorName}
                        </td>
                        <td className="py-3.5 px-4 text-end font-mono text-xs text-slate-700 tabular-nums">
                          {totalUnits}
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
                        <td className="py-3.5 px-4 text-end">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-slate-400 inline" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400 inline" />
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={8} className="px-6 py-3">
                            <div className="space-y-1.5 text-xs">
                              {pur.items.map((item) => (
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
                                  </span>
                                  <span className="font-mono tabular-nums">
                                    {item.quantity} × {formatCurrency(item.unitCost, lang)} ={' '}
                                    <strong className="text-slate-900">
                                      {formatCurrency(item.lineTotal, lang)}
                                    </strong>
                                  </span>
                                </div>
                              ))}
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
    </div>
  );
}
