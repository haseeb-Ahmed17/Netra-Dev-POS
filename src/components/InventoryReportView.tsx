import { useMemo } from 'react';
import { Download, Printer } from 'lucide-react';
import {
  formatCurrency,
  formatDateTime,
  getCategoryLabel,
  type TranslationStrings,
} from '../i18n';
import type {
  AdjustmentType,
  InventoryAdjustment,
  Language,
  Product,
} from '../types';

interface InventoryReportViewProps {
  storeName: string;
  products: Product[];
  adjustments: InventoryAdjustment[];
  suppressPrint?: boolean;
  lang: Language;
  t: TranslationStrings;
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsvFile(filename: string, rows: (string | number)[][]) {
  const csvBody = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csvBody], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getAdjustmentTypeLabel(
  type: AdjustmentType,
  t: TranslationStrings
): string {
  switch (type) {
    case 'Damaged':
      return t.adjTypeDamaged;
    case 'Expired':
      return t.adjTypeExpired;
    case 'Lost/Theft':
      return t.adjTypeLost;
    case 'Stock Count Correction':
      return t.adjTypeCorrection;
  }
}

export function InventoryReportView({
  storeName,
  products,
  adjustments,
  suppressPrint = false,
  lang,
  t,
}: InventoryReportViewProps) {
  const report = useMemo(() => {
    let totalUnits = 0;
    let totalCostValue = 0;
    let totalRetailValue = 0;

    const valuationRows = products
      .map((p) => {
        const costValue = p.stock * p.cost;
        const retailValue = p.stock * p.price;
        const potentialProfit = retailValue - costValue;
        totalUnits += p.stock;
        totalCostValue += costValue;
        totalRetailValue += retailValue;
        return {
          product: p,
          costValue,
          retailValue,
          potentialProfit,
        };
      })
      .sort((a, b) => b.costValue - a.costValue);

    const potentialProfit = totalRetailValue - totalCostValue;
    const potentialMarginPct =
      totalRetailValue > 0
        ? Math.round((potentialProfit / totalRetailValue) * 100)
        : 0;

    const lowStockItems = [...products]
      .filter((p) => p.stock <= 5)
      .sort((a, b) => a.stock - b.stock);

    const adjustmentCounts: Record<AdjustmentType, { count: number; netQty: number }> = {
      Damaged: { count: 0, netQty: 0 },
      Expired: { count: 0, netQty: 0 },
      'Lost/Theft': { count: 0, netQty: 0 },
      'Stock Count Correction': { count: 0, netQty: 0 },
    };

    for (const adj of adjustments) {
      const bucket = adjustmentCounts[adj.adjustmentType];
      if (bucket) {
        bucket.count += 1;
        bucket.netQty += adj.quantityChange;
      }
    }

    const recentAdjustments = [...adjustments].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return {
      totalUnits,
      totalCostValue,
      totalRetailValue,
      potentialProfit,
      potentialMarginPct,
      valuationRows,
      lowStockItems,
      adjustmentCounts,
      recentAdjustments,
    };
  }, [products, adjustments]);

  const handleExportCsv = () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const rows: (string | number)[][] = [
      [storeName, t.invReportTitle, todayIso],
      [],
      [t.totalUnitsInStockLabel, report.totalUnits],
      [t.totalStockValueLabel, Math.round(report.totalCostValue)],
      [t.totalExpectedRetailLabel, Math.round(report.totalRetailValue)],
      [t.potentialProfitLabel, Math.round(report.potentialProfit)],
      [],
      [
        t.productCol,
        t.skuLabel,
        t.barcodeLabel,
        t.categoryLabel,
        t.stockCol,
        t.costCol,
        t.priceCol,
        t.stockValueCol,
        t.retailValueCol,
        t.potentialProfitCol,
      ],
      ...report.valuationRows.map((row) => [
        lang === 'ur' ? row.product.nameUr : row.product.nameEn,
        row.product.sku,
        row.product.barcode || '',
        getCategoryLabel(row.product.category, t),
        row.product.stock,
        row.product.cost,
        row.product.price,
        Math.round(row.costValue),
        Math.round(row.retailValue),
        Math.round(row.potentialProfit),
      ]),
      [],
      [t.adjustmentHistoryTitle],
      [
        t.entryDateCol,
        t.productCol,
        t.adjustmentTypeLabel,
        t.qtyChangeLabel,
        t.previousNewCol,
        t.reasonCol,
      ],
      ...report.recentAdjustments.map((adj) => [
        formatDateTime(adj.createdAt),
        adj.productName,
        adj.adjustmentType,
        adj.quantityChange,
        `${adj.previousStock} -> ${adj.newStock}`,
        adj.reason,
      ]),
    ];

    downloadCsvFile(`inventory-valuation-report-${todayIso}.csv`, rows);
  };

  return (
    <div
      id="printable-report-area"
      className={`max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6 ${
        suppressPrint ? 'no-print' : ''
      }`}
    >
      {/* Print-only Header */}
      <div className="hidden print:block border-b border-slate-300 pb-3 mb-4">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{storeName}</h2>
            <p className="text-sm font-semibold text-slate-700">{t.invReportTitle}</p>
          </div>
          <p className="text-xs font-mono text-slate-600 tabular-nums">
            {new Date().toLocaleDateString('en-PK', {
              year: 'numeric',
              month: 'short',
              day: '2-digit',
            })}
          </p>
        </div>
      </div>

      {/* Screen Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t.invReportTitle}
          </h1>
          <p className="text-sm text-slate-600 mt-1">{t.invReportSubtitle}</p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 no-print">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-lg whitespace-nowrap transition-colors min-h-[40px] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{t.exportCsvBtn}</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap transition-colors min-h-[40px] cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{t.printReportBtn}</span>
          </button>
        </div>
      </div>

      {/* 4-Column Valuation KPI Strip */}
      <section
        aria-label="Inventory Valuation Metrics"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.totalUnitsInStockLabel}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {report.totalUnits.toLocaleString('en-PK')}
          </p>
          <p className="text-xs text-slate-500 mt-2 tabular-nums">
            {products.length} {t.productCol}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.totalStockValueLabel}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {formatCurrency(report.totalCostValue, lang)}
          </p>
          <p className="text-xs text-slate-500 mt-2">{t.costCol}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.totalExpectedRetailLabel}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {formatCurrency(report.totalRetailValue, lang)}
          </p>
          <p className="text-xs text-slate-500 mt-2">{t.priceCol}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.potentialProfitLabel}</p>
          <p className="font-mono text-2xl font-bold text-emerald-700 tabular-nums mt-2">
            {formatCurrency(report.potentialProfit, lang)}
          </p>
          <p className="text-xs text-emerald-700 font-medium mt-2 tabular-nums">
            {report.potentialMarginPct}% {t.marginLabel}
          </p>
        </div>
      </section>

      {/* Low Stock & Adjustments Summary Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Low Stock Alert List */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">
              {t.lowStockSectionTitle}
            </h2>
            <span className="font-mono text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded tabular-nums">
              {report.lowStockItems.length}
            </span>
          </div>

          {report.lowStockItems.length === 0 ? (
            <div className="p-8 text-center text-sm text-emerald-700">
              {t.noLowStockItems}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-5 text-start font-medium">{t.productCol}</th>
                    <th className="py-2.5 px-4 text-start font-medium">{t.categoryLabel}</th>
                    <th className="py-2.5 px-4 text-end font-medium">{t.stockCol}</th>
                    <th className="py-2.5 px-5 text-end font-medium">{t.statusCol}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.lowStockItems.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-5">
                        <div className="font-medium text-slate-900">
                          {lang === 'ur' ? p.nameUr : p.nameEn}
                        </div>
                        <div className="text-xs font-mono text-slate-400">
                          {p.barcode || p.sku}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600">
                        {getCategoryLabel(p.category, t)}
                      </td>
                      <td className="py-2.5 px-4 text-end font-mono font-bold text-slate-900 tabular-nums">
                        {p.stock}
                      </td>
                      <td className="py-2.5 px-5 text-end">
                        <span
                          className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${
                            p.stock === 0
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {p.stock === 0 ? t.statusOut : t.statusLow}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Adjustments Breakdown Summary */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-4">
              {t.adjustmentsSummaryTitle}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              {(
                ['Damaged', 'Expired', 'Lost/Theft', 'Stock Count Correction'] as AdjustmentType[]
              ).map((type) => {
                const stats = report.adjustmentCounts[type];
                return (
                  <div
                    key={type}
                    className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70"
                  >
                    <p className="text-xs font-medium text-slate-600">
                      {getAdjustmentTypeLabel(type, t)}
                    </p>
                    <div className="flex items-baseline justify-between mt-1.5">
                      <span className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                        {stats.count}
                      </span>
                      <span
                        className={`font-mono text-xs font-semibold tabular-nums ${
                          stats.netQty < 0
                            ? 'text-red-700'
                            : stats.netQty > 0
                            ? 'text-emerald-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {stats.netQty > 0 ? `+${stats.netQty}` : stats.netQty} units
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {report.recentAdjustments.length > 0 ? (
            <div className="border-t border-slate-200 pt-3">
              <p className="text-xs font-semibold text-slate-600 mb-2">
                {t.adjustmentHistoryTitle}
              </p>
              <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
                {report.recentAdjustments.slice(0, 8).map((adj) => (
                  <div
                    key={adj.id}
                    className="py-2 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">
                        {adj.productName} ·{' '}
                        <span className="text-slate-500 font-normal">
                          {getAdjustmentTypeLabel(adj.adjustmentType, t)}
                        </span>
                      </p>
                      <p className="text-slate-500 truncate">{adj.reason}</p>
                    </div>
                    <div className="text-end shrink-0 font-mono tabular-nums">
                      <span
                        className={`font-semibold ${
                          adj.quantityChange < 0 ? 'text-red-700' : 'text-emerald-700'
                        }`}
                      >
                        {adj.quantityChange > 0
                          ? `+${adj.quantityChange}`
                          : adj.quantityChange}
                      </span>
                      <div className="text-[11px] text-slate-400">
                        {adj.previousStock} → {adj.newStock}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 border-t border-slate-100 pt-3">
              {t.noAdjustmentsRecorded}
            </p>
          )}
        </section>
      </div>

      {/* Full Stock Valuation Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">{t.stockValuationTitle}</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-5 text-start font-medium">{t.productCol}</th>
                <th className="py-3 px-4 text-start font-medium">{t.categoryLabel}</th>
                <th className="py-3 px-4 text-end font-medium">{t.stockCol}</th>
                <th className="py-3 px-4 text-end font-medium">{t.costCol}</th>
                <th className="py-3 px-4 text-end font-medium">{t.priceCol}</th>
                <th className="py-3 px-4 text-end font-medium">{t.stockValueCol}</th>
                <th className="py-3 px-4 text-end font-medium">{t.retailValueCol}</th>
                <th className="py-3 px-5 text-end font-medium">{t.potentialProfitCol}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.valuationRows.map((row) => (
                <tr key={row.product.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-5">
                    <div className="font-medium text-slate-900">
                      {lang === 'ur' ? row.product.nameUr : row.product.nameEn}
                    </div>
                    <div className="text-xs font-mono text-slate-400">
                      {row.product.barcode || row.product.sku}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                    {getCategoryLabel(row.product.category, t)}
                  </td>
                  <td className="py-3 px-4 text-end font-mono font-semibold text-slate-900 tabular-nums">
                    {row.product.stock}
                  </td>
                  <td className="py-3 px-4 text-end font-mono text-slate-700 tabular-nums whitespace-nowrap">
                    {formatCurrency(row.product.cost, lang)}
                  </td>
                  <td className="py-3 px-4 text-end font-mono text-slate-700 tabular-nums whitespace-nowrap">
                    {formatCurrency(row.product.price, lang)}
                  </td>
                  <td className="py-3 px-4 text-end font-mono font-medium text-slate-900 tabular-nums whitespace-nowrap">
                    {formatCurrency(row.costValue, lang)}
                  </td>
                  <td className="py-3 px-4 text-end font-mono font-medium text-slate-900 tabular-nums whitespace-nowrap">
                    {formatCurrency(row.retailValue, lang)}
                  </td>
                  <td className="py-3 px-5 text-end font-mono font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                    {formatCurrency(row.potentialProfit, lang)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
