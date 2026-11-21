import { useMemo, useState } from 'react';
import { ArrowUpRight, Download, Printer, RotateCcw } from 'lucide-react';
import {
  formatCurrency,
  formatTimeShort,
  getCategoryLabel,
  getPaymentLabel,
  type TranslationStrings,
} from '../i18n';
import type { CategoryId, ExpenseRecord, Language, OrderRecord } from '../types';

type TimeframeFilter = 'today' | 'month' | 'year' | 'custom';
type BreakdownMethod = 'cash' | 'jazzcash' | 'easypaisa' | 'card' | 'udhaar';

interface ExecutiveDashboardViewProps {
  storeName: string;
  orders: OrderRecord[];
  expenses: ExpenseRecord[];
  latestNewOrderId: string | null;
  canResetDemo?: boolean;
  suppressPrint?: boolean;
  onPrintReceipt: (order: OrderRecord) => void;
  onGoToPos: () => void;
  onResetDemo: () => void;
  lang: Language;
  t: TranslationStrings;
}

function toLocalDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

export function ExecutiveDashboardView({
  storeName,
  orders,
  expenses,
  latestNewOrderId,
  canResetDemo = true,
  suppressPrint = false,
  onPrintReceipt,
  onGoToPos,
  onResetDemo,
  lang,
  t,
}: ExecutiveDashboardViewProps) {
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [timeframe, setTimeframe] = useState<TimeframeFilter>('month');

  const todayDefaults = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      start: toLocalDateInputValue(startOfMonth),
      end: toLocalDateInputValue(now),
    };
  }, []);

  const [customStartDate, setCustomStartDate] = useState<string>(todayDefaults.start);
  const [customEndDate, setCustomEndDate] = useState<string>(todayDefaults.end);

  const periodLabel = useMemo(() => {
    switch (timeframe) {
      case 'today':
        return t.timeframeToday;
      case 'month':
        return t.timeframeMonth;
      case 'year':
        return t.timeframeYear;
      case 'custom':
        return `${customStartDate} → ${customEndDate}`;
    }
  }, [timeframe, customStartDate, customEndDate, t]);

  const filteredOrders = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
    const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0).getTime();

    const customStartMs = customStartDate
      ? new Date(`${customStartDate}T00:00:00`).getTime()
      : Number.NEGATIVE_INFINITY;
    const customEndMs = customEndDate
      ? new Date(`${customEndDate}T23:59:59.999`).getTime()
      : Number.POSITIVE_INFINITY;

    return orders.filter((order) => {
      const ts = new Date(order.createdAt).getTime();
      if (Number.isNaN(ts)) return false;
      if (timeframe === 'today') {
        return ts >= startOfToday && ts <= endOfToday;
      }
      if (timeframe === 'month') {
        return ts >= startOfMonth && ts <= endOfToday;
      }
      if (timeframe === 'year') {
        return ts >= startOfYear && ts <= endOfToday;
      }
      return ts >= customStartMs && ts <= customEndMs;
    });
  }, [orders, timeframe, customStartDate, customEndDate]);

  const filteredExpenses = useMemo(() => {
    const now = new Date();
    const todayStr = toLocalDateInputValue(now);
    const monthPrefix = todayStr.slice(0, 7);
    const yearPrefix = todayStr.slice(0, 4);

    return expenses.filter((exp) => {
      const dateStr = exp.expenseDate;
      if (!dateStr) return false;
      if (timeframe === 'today') return dateStr === todayStr;
      if (timeframe === 'month') return dateStr.startsWith(monthPrefix) && dateStr <= todayStr;
      if (timeframe === 'year') return dateStr.startsWith(yearPrefix) && dateStr <= todayStr;
      if (customStartDate && dateStr < customStartDate) return false;
      if (customEndDate && dateStr > customEndDate) return false;
      return true;
    });
  }, [expenses, timeframe, customStartDate, customEndDate]);

  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalCogs = 0;
    let totalDiscounts = 0;
    let totalTax = 0;
    let totalUnits = 0;

    const categoryTotals: Record<Exclude<CategoryId, 'all'>, { revenue: number; units: number }> = {
      beverages: { revenue: 0, units: 0 },
      bakery: { revenue: 0, units: 0 },
      pantry: { revenue: 0, units: 0 },
    };

    const paymentMap: Record<BreakdownMethod, { count: number; total: number }> = {
      cash: { count: 0, total: 0 },
      jazzcash: { count: 0, total: 0 },
      easypaisa: { count: 0, total: 0 },
      card: { count: 0, total: 0 },
      udhaar: { count: 0, total: 0 },
    };

    const productStats = new Map<
      string,
      {
        productId: string;
        sku: string;
        nameEn: string;
        nameUr: string;
        units: number;
        revenue: number;
        profit: number;
      }
    >();

    const hourlyMap = new Map<number, { revenue: number; orders: number }>();
    for (let h = 9; h <= 21; h++) {
      hourlyMap.set(h, { revenue: 0, orders: 0 });
    }

    for (const order of filteredOrders) {
      totalRevenue += order.total;
      totalDiscounts += order.discountAmount;
      totalTax += order.taxAmount;

      // Map legacy 'mobile' into 'jazzcash' so all breakdown rows reconcile cleanly to 100%
      const breakdownKey: BreakdownMethod =
        order.paymentMethod === 'mobile' ? 'jazzcash' : order.paymentMethod;
      paymentMap[breakdownKey].count += 1;
      paymentMap[breakdownKey].total += order.total;

      const orderHour = new Date(order.createdAt).getHours();
      const clampedHour = Math.max(9, Math.min(21, orderHour));
      const hourEntry = hourlyMap.get(clampedHour) ?? { revenue: 0, orders: 0 };
      hourEntry.revenue += order.total;
      hourEntry.orders += 1;
      hourlyMap.set(clampedHour, hourEntry);

      for (const item of order.items) {
        totalUnits += item.quantity;
        const itemCost = item.unitCost * item.quantity;
        totalCogs += itemCost;

        const catBucket = categoryTotals[item.category];
        if (catBucket) {
          catBucket.revenue += item.lineTotal;
          catBucket.units += item.quantity;
        }

        const existing = productStats.get(item.productId) ?? {
          productId: item.productId,
          sku: item.sku,
          nameEn: item.nameEn,
          nameUr: item.nameUr,
          units: 0,
          revenue: 0,
          profit: 0,
        };
        existing.units += item.quantity;
        existing.revenue += item.lineTotal;
        existing.profit += item.lineTotal - itemCost;
        productStats.set(item.productId, existing);
      }
    }

    const orderCount = filteredOrders.length;
    const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;
    const grossProfit = totalRevenue - totalCogs;
    const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const netProfitAfterExpenses = grossProfit - totalExpenses;
    const marginPct =
      totalRevenue > 0 ? Math.round((netProfitAfterExpenses / totalRevenue) * 100) : 0;

    const paymentBreakdown = (
      ['cash', 'jazzcash', 'easypaisa', 'card', 'udhaar'] as BreakdownMethod[]
    ).map((method) => {
      const row = paymentMap[method];
      const sharePct =
        totalRevenue > 0 ? Math.round((row.total / totalRevenue) * 100) : 0;
      return {
        method,
        count: row.count,
        total: row.total,
        sharePct,
      };
    });

    const categoryGrossSum =
      categoryTotals.beverages.revenue +
      categoryTotals.bakery.revenue +
      categoryTotals.pantry.revenue;

    const categoryRows = (['beverages', 'bakery', 'pantry'] as const).map((cat) => {
      const data = categoryTotals[cat];
      const sharePct =
        categoryGrossSum > 0 ? Math.round((data.revenue / categoryGrossSum) * 100) : 0;
      return {
        category: cat,
        revenue: data.revenue,
        units: data.units,
        sharePct,
      };
    });

    const topProducts = Array.from(productStats.values()).sort(
      (a, b) => b.revenue - a.revenue
    );

    const hourlySeries = Array.from(hourlyMap.entries()).map(([hour, data]) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      revenue: data.revenue,
      orders: data.orders,
    }));

    const maxHourlyRevenue = Math.max(
      1000,
      ...hourlySeries.map((pt) => pt.revenue)
    );

    const recentOrders = [...filteredOrders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return {
      totalRevenue,
      totalCogs,
      grossProfit,
      totalExpenses,
      netProfitAfterExpenses,
      totalDiscounts,
      totalTax,
      orderCount,
      totalUnits,
      avgOrderValue,
      marginPct,
      paymentBreakdown,
      categoryRows,
      topProducts,
      hourlySeries,
      maxHourlyRevenue,
      recentOrders,
    };
  }, [filteredOrders, filteredExpenses]);

  const latestOrder = useMemo(
    () => orders.find((o) => o.id === latestNewOrderId) ?? null,
    [orders, latestNewOrderId]
  );

  const activeHourInfo = useMemo(() => {
    if (hoveredHour === null) return null;
    return metrics.hourlySeries.find((h) => h.hour === hoveredHour) ?? null;
  }, [hoveredHour, metrics.hourlySeries]);

  const handleExportCsv = () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const rows: (string | number)[][] = [
      [storeName, t.dashboardTitle, `${t.reportGeneratedLabel}: ${periodLabel}`],
      [],
      [t.totalRevenue, Math.round(metrics.totalRevenue)],
      [t.totalCogsLabel, Math.round(metrics.totalCogs)],
      [t.grossProfit, Math.round(metrics.grossProfit)],
      [t.totalExpensesLabel, Math.round(metrics.totalExpenses)],
      [t.netProfitAfterExpensesLabel, Math.round(metrics.netProfitAfterExpenses)],
      [t.totalDiscountsLabel, Math.round(metrics.totalDiscounts)],
      [t.totalTaxCollectedLabel, Math.round(metrics.totalTax)],
      [t.ordersCompleted, metrics.orderCount],
      [],
      [t.paymentBreakdownTitle],
      [t.methodCol, t.ordersCompleted, t.amountCol, '%'],
      ...metrics.paymentBreakdown.map((p) => [
        getPaymentLabel(p.method, t),
        p.count,
        Math.round(p.total),
        `${p.sharePct}%`,
      ]),
      [],
      [t.topProductsTitle],
      [t.productCol, t.skuLabel, t.qtySoldCol, t.revenueCol, t.profitCol],
      ...metrics.topProducts.map((item) => [
        lang === 'ur' ? item.nameUr : item.nameEn,
        item.sku,
        item.units,
        Math.round(item.revenue),
        Math.round(item.profit),
      ]),
      [],
      [t.recentReceiptsTitle],
      [t.receiptCol, t.timeCol, t.customerCol, t.methodCol, t.discountLabel, t.taxCol, t.totalCol],
      ...metrics.recentOrders.map((o) => [
        o.receiptNumber,
        o.createdAt,
        o.customerName || t.walkInCustomer,
        getPaymentLabel(o.paymentMethod, t),
        Math.round(o.discountAmount),
        Math.round(o.taxAmount),
        Math.round(o.total),
      ]),
    ];

    downloadCsvFile(`sales-profit-report-${timeframe}-${todayIso}.csv`, rows);
  };

  return (
    <div
      id="printable-report-area"
      className={`max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6 ${
        suppressPrint ? 'no-print' : ''
      }`}
    >
      {/* Print-only Formal Report Header */}
      <div className="hidden print:block border-b border-slate-300 pb-3 mb-4">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{storeName}</h2>
            <p className="text-sm font-semibold text-slate-700">{t.dashboardTitle}</p>
          </div>
          <p className="text-xs font-mono text-slate-600 tabular-nums">
            {t.reportGeneratedLabel}: {periodLabel}
          </p>
        </div>
      </div>

      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t.dashboardTitle}
          </h1>
          <p className="text-sm text-slate-600 mt-1">{t.dashboardSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0 no-print">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap transition-colors min-h-[40px] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{t.exportCsvBtn}</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap transition-colors min-h-[40px] cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{t.printReportBtn}</span>
          </button>

          {canResetDemo && (
            <button
              type="button"
              onClick={onResetDemo}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap transition-colors min-h-[40px] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{t.resetDemoData}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onGoToPos}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap transition-colors min-h-[40px] cursor-pointer"
          >
            <span>{t.goToPos}</span>
            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Timeframe Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 no-print">
        <div
          role="tablist"
          aria-label="Report timeframe"
          className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto"
        >
          {(
            [
              { id: 'today', label: t.timeframeToday },
              { id: 'month', label: t.timeframeMonth },
              { id: 'year', label: t.timeframeYear },
              { id: 'custom', label: t.timeframeCustom },
            ] as const
          ).map((tf) => {
            const active = timeframe === tf.id;
            return (
              <button
                key={tf.id}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setTimeframe(tf.id)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tf.label}
              </button>
            );
          })}
        </div>

        {timeframe === 'custom' ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5 text-slate-600 font-medium">
              <span>{t.startDateLabel}</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="h-9 px-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-900 focus:outline-none focus:border-teal-700"
              />
            </label>
            <label className="flex items-center gap-1.5 text-slate-600 font-medium">
              <span>{t.endDateLabel}</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="h-9 px-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-900 focus:outline-none focus:border-teal-700"
              />
            </label>
          </div>
        ) : (
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            {t.reportGeneratedLabel}: <span className="font-semibold text-slate-800">{periodLabel}</span> · {metrics.orderCount} {t.ordersCompleted.toLowerCase()}
          </div>
        )}
      </div>

      {/* 6-Column Financial KPI Strip (Revenue, COGS, Gross Profit, Expenses, Net Profit After Expenses, Discounts & Tax) */}
      <section
        aria-label="Key Financial Metrics"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4"
      >
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.totalRevenue}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {formatCurrency(metrics.totalRevenue, lang)}
          </p>
          <p className="text-xs text-slate-500 mt-2 tabular-nums">
            {latestOrder ? (
              <span className="text-emerald-700 font-medium">
                {t.latestOrderDelta} +{formatCurrency(latestOrder.total, lang)}
              </span>
            ) : (
              <span>
                {metrics.orderCount} {t.ordersCompleted.toLowerCase()}
              </span>
            )}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.totalCogsLabel}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {formatCurrency(metrics.totalCogs, lang)}
          </p>
          <p className="text-xs text-slate-500 mt-2 tabular-nums">
            {metrics.totalUnits} {t.itemsSoldUnit}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.grossProfit}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {formatCurrency(metrics.grossProfit, lang)}
          </p>
          <p className="text-xs text-slate-500 mt-2 tabular-nums">
            {t.avgOrderValue}: {formatCurrency(metrics.avgOrderValue, lang)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.totalExpensesLabel}</p>
          <p className="font-mono text-2xl font-bold text-amber-800 tabular-nums mt-2">
            {formatCurrency(metrics.totalExpenses, lang)}
          </p>
          <p className="text-xs text-slate-500 mt-2 tabular-nums">
            {filteredExpenses.length} {t.navExpenses}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">
            {t.netProfitAfterExpensesLabel}
          </p>
          <p
            className={`font-mono text-2xl font-bold tabular-nums mt-2 ${
              metrics.netProfitAfterExpenses >= 0 ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {formatCurrency(metrics.netProfitAfterExpenses, lang)}
          </p>
          <p className="text-xs text-emerald-700 font-medium mt-2 tabular-nums">
            {metrics.marginPct}% {t.marginLabel}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.totalTaxCollectedLabel}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {formatCurrency(metrics.totalTax, lang)}
          </p>
          <p className="text-xs text-slate-500 mt-2 tabular-nums">
            {t.totalDiscountsLabel}: {formatCurrency(metrics.totalDiscounts, lang)}
          </p>
        </div>
      </section>

      {/* Payment Method Breakdown + Category Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
          <div className="mb-4">
            <h2 className="text-base font-bold text-slate-900">
              {t.paymentBreakdownTitle}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {t.paymentBreakdownSubtitle}
            </p>
          </div>

          <div className="space-y-4">
            {metrics.paymentBreakdown.map((row) => (
              <div key={row.method} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">
                      {getPaymentLabel(row.method, t)}
                    </span>
                    <span className="text-xs font-mono text-slate-500 tabular-nums">
                      ({row.count})
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono tabular-nums">
                    <span className="text-xs text-slate-500">{row.sharePct}%</span>
                    <span className="font-semibold text-slate-900 min-w-[96px] text-end">
                      {formatCurrency(row.total, lang)}
                    </span>
                  </div>
                </div>
                <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      row.method === 'udhaar' ? 'bg-amber-600' : 'bg-teal-700'
                    }`}
                    style={{ width: `${row.sharePct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Category Performance */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {t.categoryPerformanceTitle}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 mb-5">
              {t.categoryPerformanceSubtitle}
            </p>

            <div className="space-y-5">
              {metrics.categoryRows.map((row) => (
                <div key={row.category} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-800">
                      {getCategoryLabel(row.category, t)}
                    </span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {formatCurrency(row.revenue, lang)}
                    </span>
                  </div>

                  <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-700 rounded-full transition-all duration-300"
                      style={{ width: `${row.sharePct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 tabular-nums">
                    <span>
                      {row.units} {t.itemsSoldUnit}
                    </span>
                    <span className="font-mono">{row.sharePct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Hourly Sales Chart */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {t.hourlyRevenueTitle}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {t.hourlyRevenueSubtitle}
            </p>
          </div>

          <div className="text-xs font-mono text-slate-700 tabular-nums min-h-[20px]">
            {activeHourInfo ? (
              <span>
                {activeHourInfo.label} · {formatCurrency(activeHourInfo.revenue, lang)} ({activeHourInfo.orders})
              </span>
            ) : null}
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <div className="min-w-[520px]" dir="ltr">
            <svg
              viewBox="0 0 680 220"
              className="w-full h-56 overflow-visible"
              role="img"
              aria-label={t.hourlyRevenueTitle}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = 180 - ratio * 150;
                const val = Math.round(metrics.maxHourlyRevenue * ratio);
                return (
                  <g key={ratio}>
                    <line
                      x1="56"
                      x2="668"
                      y1={y}
                      y2={y}
                      stroke="#E2E8F0"
                      strokeWidth="1"
                    />
                    <text
                      x="48"
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-400 text-[10px] font-mono tabular-nums"
                    >
                      {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                    </text>
                  </g>
                );
              })}

              {metrics.hourlySeries.map((pt, idx) => {
                const slotWidth = 600 / metrics.hourlySeries.length;
                const barWidth = Math.min(28, slotWidth * 0.58);
                const x = 64 + idx * slotWidth + (slotWidth - barWidth) / 2;
                const barHeight =
                  pt.revenue > 0
                    ? Math.max(4, (pt.revenue / metrics.maxHourlyRevenue) * 150)
                    : 2;
                const y = 180 - barHeight;
                const isHovered = hoveredHour === pt.hour;

                return (
                  <g
                    key={pt.hour}
                    onMouseEnter={() => setHoveredHour(pt.hour)}
                    onMouseLeave={() => setHoveredHour(null)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      rx="4"
                      fill={
                        pt.revenue === 0
                          ? '#E2E8F0'
                          : isHovered
                          ? '#0F766E'
                          : '#14B8A6'
                      }
                    />
                    <text
                      x={x + barWidth / 2}
                      y="200"
                      textAnchor="middle"
                      className="fill-slate-500 text-[10px] font-mono tabular-nums"
                    >
                      {String(pt.hour).padStart(2, '0')}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </section>

      {/* Bottom Tables Row: Best-Selling Products + Receipts in Period */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Best-Selling Products */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900">{t.topProductsTitle}</h2>
          </div>

          {metrics.topProducts.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              {t.noOrdersInRange}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-5 text-start font-medium">{t.productCol}</th>
                    <th className="py-2.5 px-4 text-end font-medium">{t.qtySoldCol}</th>
                    <th className="py-2.5 px-4 text-end font-medium">{t.revenueCol}</th>
                    <th className="py-2.5 px-5 text-end font-medium">{t.profitCol}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {metrics.topProducts.map((item) => (
                    <tr key={item.productId} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-5">
                        <div className="font-medium text-slate-900">
                          {lang === 'ur' ? item.nameUr : item.nameEn}
                        </div>
                        <div className="text-xs font-mono text-slate-400">{item.sku}</div>
                      </td>
                      <td className="py-3 px-4 text-end font-mono text-slate-700 tabular-nums">
                        {item.units}
                      </td>
                      <td className="py-3 px-4 text-end font-mono font-semibold text-slate-900 tabular-nums">
                        {formatCurrency(item.revenue, lang)}
                      </td>
                      <td className="py-3 px-5 text-end font-mono text-emerald-700 tabular-nums">
                        {formatCurrency(item.profit, lang)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Recent Completed Receipts */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900">{t.recentReceiptsTitle}</h2>
          </div>

          {metrics.recentOrders.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              {t.noOrdersInRange}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-5 text-start font-medium">{t.receiptCol}</th>
                    <th className="py-2.5 px-4 text-start font-medium">{t.timeCol}</th>
                    <th className="py-2.5 px-4 text-start font-medium">{t.methodCol}</th>
                    <th className="py-2.5 px-4 text-end font-medium">{t.amountCol}</th>
                    <th className="py-2.5 px-5 text-end font-medium no-print">
                      {t.actionCol}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {metrics.recentOrders.slice(0, 8).map((order) => {
                    const isNewest = order.id === latestNewOrderId;
                    return (
                      <tr
                        key={order.id}
                        className={`transition-colors ${
                          isNewest ? 'bg-teal-50/50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3 px-5 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                          {order.receiptNumber}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          {formatTimeShort(order.createdAt, lang)}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">
                          {getPaymentLabel(order.paymentMethod, t)}
                        </td>
                        <td className="py-3 px-4 text-end font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatCurrency(order.total, lang)}
                        </td>
                        <td className="py-3 px-5 text-end no-print">
                          <button
                            type="button"
                            onClick={() => onPrintReceipt(order)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md whitespace-nowrap transition-colors cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>{t.printBtn}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
