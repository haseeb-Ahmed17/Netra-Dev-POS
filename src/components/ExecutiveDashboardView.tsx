import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  Download,
  Info,
  Minus,
  Printer,
  RefreshCw,
  RotateCcw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  formatCurrency,
  formatTimeShort,
  getCategoryLabel,
  getPaymentLabel,
  type TranslationStrings,
} from '../i18n';
import {
  buildSalesTrendSeries,
  computeInventoryAlerts,
  computeKpiDelta,
  computePeriodBreakdown,
  computeTopSellingProducts,
  filterExpensesInRange,
  filterOrdersInRange,
  filterPurchasesInRange,
  resolvePeriodWindow,
  summarizeFinancials,
  summarizeTopProductsFromOrders,
  toLocalYmd,
  type DashboardTimeframe,
  type KpiDeltaInfo,
  type PaymentBreakdownMethod,
  type SalesGranularity,
  type TopProductTimeframe,
} from '../lib/dashboardAnalytics';
import {
  formatQuantity,
  formatQuantityWithUnit,
  getUnitLabel,
} from '../lib/unitUtils';
import type {
  Branch,
  CashShift,
  ExpenseRecord,
  Language,
  OrderRecord,
  Product,
  PurchaseRecord,
} from '../types';
import { ProductImage } from './ProductImage';

type InventoryAlertTab = 'low_out' | 'fast' | 'slow';

interface ExecutiveDashboardViewProps {
  storeName: string;
  orders: OrderRecord[];
  expenses: ExpenseRecord[];
  products: Product[];
  purchases: PurchaseRecord[];
  cashShifts?: CashShift[];
  branches?: Branch[];
  latestNewOrderId: string | null;
  canResetDemo?: boolean;
  suppressPrint?: boolean;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onPrintReceipt: (order: OrderRecord) => void;
  onGoToPos: () => void;
  onGoToInventory: () => void;
  onResetDemo: () => void;
  lang: Language;
  t: TranslationStrings;
}

const PAYMENT_COLORS: Record<PaymentBreakdownMethod, string> = {
  cash: '#0F766E',
  jazzcash: '#0284C7',
  easypaisa: '#059669',
  card: '#4F46E5',
  bank_transfer: '#0EA5E9',
  udhaar: '#D97706',
};

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

interface KpiCardProps {
  label: string;
  value: string;
  tooltip: string;
  delta: KpiDeltaInfo;
  prevLabel: string;
  prevFormattedValue: string;
  valueClassName?: string;
  invertDeltaColors?: boolean;
  secondaryMeta?: string;
  newBadgeLabel: string;
}

function KpiMetricCard({
  label,
  value,
  tooltip,
  delta,
  prevLabel,
  prevFormattedValue,
  valueClassName = 'text-slate-900',
  invertDeltaColors = false,
  secondaryMeta,
  newBadgeLabel,
}: KpiCardProps) {
  const [hoveredTip, setHoveredTip] = useState(false);
  const [pinnedTip, setPinnedTip] = useState(false);
  const showTip = hoveredTip || pinnedTip;

  const pct = delta.pctChange;
  const isPositive = pct !== null && pct > 0;
  const isNegative = pct !== null && pct < 0;

  let badgeTone = 'bg-slate-100 text-slate-600 border-slate-200';
  if (delta.isNew) {
    if (delta.current < 0) {
      badgeTone = invertDeltaColors
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
        : 'bg-red-50 text-red-700 border-red-200';
    } else {
      badgeTone = invertDeltaColors
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-teal-50 text-teal-800 border-teal-200';
    }
  } else if (isPositive) {
    badgeTone = invertDeltaColors
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : 'bg-emerald-50 text-emerald-800 border-emerald-200';
  } else if (isNegative) {
    badgeTone = invertDeltaColors
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : 'bg-red-50 text-red-700 border-red-200';
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-3 relative">
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-slate-500 leading-snug">{label}</p>
          <div className="relative shrink-0 no-print">
            <button
              type="button"
              onClick={() => setPinnedTip(true)}
              onMouseEnter={() => setHoveredTip(true)}
              onMouseLeave={() => {
                setHoveredTip(false);
                setPinnedTip(false);
              }}
              onFocus={() => setHoveredTip(true)}
              onBlur={() => {
                setHoveredTip(false);
                setPinnedTip(false);
              }}
              aria-label={tooltip}
              className="p-0.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer focus-visible:outline-2 focus-visible:outline-teal-700"
            >
              <Info className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            {showTip && (
              <div
                role="tooltip"
                className="absolute z-30 end-0 top-6 w-56 p-2.5 text-[11px] leading-relaxed text-white bg-slate-900 rounded-lg shadow-lg pointer-events-none"
              >
                {tooltip}
              </div>
            )}
          </div>
        </div>

        <p
          dir="ltr"
          className={`font-mono text-xl sm:text-2xl font-bold tabular-nums mt-2 rtl:text-right ${valueClassName}`}
        >
          {value}
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold tabular-nums border ${badgeTone}`}
          >
            {delta.isNew ? (
              <>
                {delta.current < 0 ? (
                  <TrendingDown className="w-3 h-3 shrink-0" aria-hidden="true" />
                ) : (
                  <TrendingUp className="w-3 h-3 shrink-0" aria-hidden="true" />
                )}
                <span>{newBadgeLabel}</span>
              </>
            ) : isPositive ? (
              <>
                <TrendingUp className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>+{pct}%</span>
              </>
            ) : isNegative ? (
              <>
                <TrendingDown className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>{pct}%</span>
              </>
            ) : (
              <>
                <Minus className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>0%</span>
              </>
            )}
          </span>
          <span className="text-[11px] text-slate-500 font-mono tabular-nums truncate">
            <span dir="ltr" className="inline-block">
              {prevFormattedValue}
            </span>{' '}
            {prevLabel}
          </span>
        </div>

        {secondaryMeta && (
          <p className="text-[11px] text-slate-500 font-mono tabular-nums">
            {secondaryMeta}
          </p>
        )}
      </div>
    </div>
  );
}

export function ExecutiveDashboardView({
  storeName,
  orders,
  expenses,
  products,
  purchases,
  cashShifts = [],
  branches = [],
  latestNewOrderId,
  canResetDemo = true,
  suppressPrint = false,
  isLoading = false,
  error = null,
  onRetry,
  onPrintReceipt,
  onGoToPos,
  onGoToInventory,
  onResetDemo,
  lang,
  t,
}: ExecutiveDashboardViewProps) {
  const [timeframe, setTimeframe] = useState<DashboardTimeframe>('month');
  const [salesGranularity, setSalesGranularity] = useState<SalesGranularity>('daily');
  const [topProductsPeriod, setTopProductsPeriod] = useState<TopProductTimeframe>('month');
  const [alertTab, setAlertTab] = useState<InventoryAlertTab>('low_out');
  const [hoveredTrendKey, setHoveredTrendKey] = useState<string | null>(null);
  const [selectedTrendKey, setSelectedTrendKey] = useState<string | null>(null);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [hoveredPayment, setHoveredPayment] = useState<PaymentBreakdownMethod | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const todayDefaults = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      start: toLocalYmd(startOfMonth),
      end: toLocalYmd(now),
    };
  }, []);

  const [customStartDate, setCustomStartDate] = useState<string>(todayDefaults.start);
  const [customEndDate, setCustomEndDate] = useState<string>(todayDefaults.end);

  const periodLabel = useMemo(() => {
    switch (timeframe) {
      case 'today':
        return t.timeframeToday;
      case 'yesterday':
        return t.timeframeYesterday;
      case 'week':
        return t.timeframeWeek;
      case 'month':
        return t.timeframeMonth;
      case 'year':
        return t.timeframeYear;
      case 'custom':
        return `${customStartDate} → ${customEndDate}`;
    }
  }, [timeframe, customStartDate, customEndDate, t]);

  const prevComparisonLabel = useMemo(() => {
    switch (timeframe) {
      case 'today':
        return t.vsYesterdayLabel;
      case 'yesterday':
        return t.vsPrevPeriodLabel;
      case 'week':
        return t.vsLastWeekLabel;
      case 'month':
        return t.vsLastMonthLabel;
      case 'year':
        return t.vsLastYearLabel;
      case 'custom':
        return t.vsPrevPeriodLabel;
    }
  }, [timeframe, t]);

  const periodData = useMemo(() => {
    const window = resolvePeriodWindow(timeframe, customStartDate, customEndDate);
    const currentOrders = filterOrdersInRange(orders, window.startMs, window.endMs);
    const prevOrders = filterOrdersInRange(orders, window.prevStartMs, window.prevEndMs);

    const currentExpenses = filterExpensesInRange(expenses, window.startYmd, window.endYmd);
    const prevExpenses = filterExpensesInRange(expenses, window.prevStartYmd, window.prevEndYmd);

    const currentPurchases = filterPurchasesInRange(purchases, window.startMs, window.endMs);
    const prevPurchases = filterPurchasesInRange(purchases, window.prevStartMs, window.prevEndMs);

    const currentSummary = summarizeFinancials(
      currentOrders,
      currentExpenses,
      currentPurchases
    );
    const prevSummary = summarizeFinancials(
      prevOrders,
      prevExpenses,
      prevPurchases
    );

    const breakdown = computePeriodBreakdown(currentOrders, products);

    const recentOrders = [...currentOrders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return {
      currentOrders,
      currentSummary,
      prevSummary,
      breakdown,
      recentOrders,
      deltas: {
        revenue: computeKpiDelta(currentSummary.totalRevenue, prevSummary.totalRevenue),
        cogs: computeKpiDelta(currentSummary.totalCogs, prevSummary.totalCogs),
        grossProfit: computeKpiDelta(currentSummary.grossProfit, prevSummary.grossProfit),
        expenses: computeKpiDelta(currentSummary.totalExpenses, prevSummary.totalExpenses),
        netProfit: computeKpiDelta(currentSummary.netProfit, prevSummary.netProfit),
        tax: computeKpiDelta(currentSummary.totalTax, prevSummary.totalTax),
        orders: computeKpiDelta(
          currentSummary.completedOrderCount,
          prevSummary.completedOrderCount
        ),
        avgOrderValue: computeKpiDelta(
          currentSummary.avgOrderValue,
          prevSummary.avgOrderValue
        ),
      },
    };
  }, [orders, expenses, purchases, products, timeframe, customStartDate, customEndDate]);

  const salesTrend = useMemo(
    () => buildSalesTrendSeries(orders, salesGranularity, lang),
    [orders, salesGranularity, lang]
  );

  const trendGrowth = useMemo(
    () =>
      computeKpiDelta(
        salesTrend.currentPeriodRevenue,
        salesTrend.previousPeriodRevenue
      ),
    [salesTrend]
  );

  const topProducts = useMemo(
    () => computeTopSellingProducts(orders, products, topProductsPeriod),
    [orders, products, topProductsPeriod]
  );

  const inventoryAlerts = useMemo(
    () => computeInventoryAlerts(products, orders),
    [products, orders]
  );

  const effectiveTrendKey = hoveredTrendKey ?? selectedTrendKey;
  const effectiveHour = hoveredHour ?? selectedHour;

  const activeTrendPoint = useMemo(() => {
    if (!effectiveTrendKey) return null;
    return salesTrend.points.find((pt) => pt.key === effectiveTrendKey) ?? null;
  }, [effectiveTrendKey, salesTrend.points]);

  const activeHourInfo = useMemo(() => {
    if (effectiveHour === null) return null;
    return (
      periodData.breakdown.hourlySeries.find((h) => h.hour === effectiveHour) ?? null
    );
  }, [effectiveHour, periodData.breakdown.hourlySeries]);

  const paymentDonutSegments = useMemo(() => {
    const total = periodData.breakdown.paymentBreakdown.reduce(
      (sum, row) => sum + Math.max(0, row.total),
      0
    );
    const radius = 56;
    const circumference = 2 * Math.PI * radius;
    let cumulativeOffset = 0;

    return periodData.breakdown.paymentBreakdown
      .filter((row) => row.total > 0)
      .map((row) => {
        const fraction = total > 0 ? row.total / total : 0;
        const dashLength = fraction * circumference;
        const dashOffset = -cumulativeOffset;
        cumulativeOffset += dashLength;
        return {
          ...row,
          color: PAYMENT_COLORS[row.method],
          dashArray: `${dashLength} ${circumference - dashLength}`,
          dashOffset,
        };
      });
  }, [periodData.breakdown.paymentBreakdown]);

  const totalPaymentVolume = useMemo(
    () =>
      periodData.breakdown.paymentBreakdown.reduce(
        (sum, r) => sum + Math.max(0, r.total),
        0
      ),
    [periodData.breakdown.paymentBreakdown]
  );

  const handleExportCsv = () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const s = periodData.currentSummary;
    const csvTopProducts = summarizeTopProductsFromOrders(
      periodData.currentOrders,
      products
    );
    const rows: (string | number)[][] = [
      [storeName, t.dashboardTitle, `${t.reportGeneratedLabel}: ${periodLabel}`],
      [],
      [t.totalRevenue, Math.round(s.totalRevenue)],
      [t.totalCogsLabel, Math.round(s.totalCogs)],
      [t.grossProfit, Math.round(s.grossProfit)],
      [t.totalExpensesLabel, Math.round(s.totalExpenses)],
      [t.netProfitAfterExpensesLabel, Math.round(s.netProfit)],
      [t.totalDiscountsLabel, Math.round(s.totalDiscounts)],
      [t.totalTaxCollectedLabel, Math.round(s.totalTax)],
      [t.ordersCompleted, s.completedOrderCount],
      [t.avgOrderValue, Math.round(s.avgOrderValue)],
      [],
      [t.paymentBreakdownTitle],
      [t.methodCol, t.ordersCompleted, t.amountCol, '%'],
      ...periodData.breakdown.paymentBreakdown.map((p) => [
        getPaymentLabel(p.method, t),
        p.count,
        Math.round(p.total),
        `${p.sharePct}%`,
      ]),
      [],
      [`${t.topProductsTitle} (${periodLabel})`],
      [t.rankCol, t.productCol, t.skuLabel, t.sellingUnitLabel, t.qtySoldCol, t.revenueCol, t.profitCol],
      ...csvTopProducts.map((item, idx) => [
        idx + 1,
        lang === 'ur' ? item.nameUr : item.nameEn,
        item.sku,
        getUnitLabel(item.sellingUnit, lang),
        formatQuantity(item.units),
        Math.round(item.revenue),
        Math.round(item.profit),
      ]),
      [],
      [t.recentReceiptsTitle],
      [
        t.receiptCol,
        t.timeCol,
        t.customerCol,
        t.methodCol,
        t.discountLabel,
        t.taxCol,
        t.totalCol,
      ],
      ...periodData.recentOrders.map((o) => [
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

  if (isLoading) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="h-14 bg-white border border-slate-200 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-32 bg-white border border-slate-200 rounded-xl animate-pulse"
            />
          ))}
        </div>
        <div className="h-80 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  const s = periodData.currentSummary;
  const p = periodData.prevSummary;

  const lowAndOutItems = [
    ...inventoryAlerts.outOfStock,
    ...inventoryAlerts.lowStock,
  ];
  const activeAlertItems =
    alertTab === 'low_out'
      ? lowAndOutItems
      : alertTab === 'fast'
      ? inventoryAlerts.fastMoving
      : inventoryAlerts.slowMoving;

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
              onClick={() => setShowResetConfirm(true)}
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

      {/* Inline Error Notice */}
      {error && (
        <div className="no-print bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-red-800">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-900 bg-white border border-red-200 hover:bg-red-100 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.retryBtn}</span>
            </button>
          )}
        </div>
      )}

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
              { id: 'yesterday', label: t.timeframeYesterday },
              { id: 'week', label: t.timeframeWeek },
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
            {t.reportGeneratedLabel}:{' '}
            <span className="font-semibold text-slate-800">{periodLabel}</span> ·{' '}
            {s.completedOrderCount} {t.ordersCompleted.toLowerCase()}
          </div>
        )}
      </div>

      {/* Empty Database State Banner (when no orders exist at all yet) */}
      {orders.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
          <p className="text-base font-bold text-slate-900">{t.emptyDashboardTitle}</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            {t.emptyDashboardDesc}
          </p>
          <button
            type="button"
            onClick={onGoToPos}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
          >
            <span>{t.goToPos}</span>
            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* 6-Column Financial KPI Strip with Previous Period Comparison & Tooltips */}
      <section
        aria-label="Key Financial Metrics"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4"
      >
        <KpiMetricCard
          label={t.totalRevenue}
          value={formatCurrency(s.totalRevenue, lang)}
          tooltip={t.kpiTooltipRevenue}
          delta={periodData.deltas.revenue}
          prevLabel={prevComparisonLabel}
          prevFormattedValue={formatCurrency(p.totalRevenue, lang)}
          newBadgeLabel={t.newPeriodBadge}
          secondaryMeta={`${s.completedOrderCount} ${t.ordersCompleted.toLowerCase()}`}
        />

        <KpiMetricCard
          label={t.totalCogsLabel}
          value={formatCurrency(s.totalCogs, lang)}
          tooltip={t.kpiTooltipCogs}
          delta={periodData.deltas.cogs}
          prevLabel={prevComparisonLabel}
          prevFormattedValue={formatCurrency(p.totalCogs, lang)}
          invertDeltaColors
          newBadgeLabel={t.newPeriodBadge}
          secondaryMeta={`${s.totalUnits} ${t.itemsSoldUnit}`}
        />

        <KpiMetricCard
          label={t.grossProfit}
          value={formatCurrency(s.grossProfit, lang)}
          tooltip={t.kpiTooltipGrossProfit}
          delta={periodData.deltas.grossProfit}
          prevLabel={prevComparisonLabel}
          prevFormattedValue={formatCurrency(p.grossProfit, lang)}
          valueClassName={s.grossProfit >= 0 ? 'text-slate-900' : 'text-red-700'}
          newBadgeLabel={t.newPeriodBadge}
          secondaryMeta={`${t.avgOrderValue}: ${formatCurrency(s.avgOrderValue, lang)}`}
        />

        <KpiMetricCard
          label={t.totalExpensesLabel}
          value={formatCurrency(s.totalExpenses, lang)}
          tooltip={t.kpiTooltipExpenses}
          delta={periodData.deltas.expenses}
          prevLabel={prevComparisonLabel}
          prevFormattedValue={formatCurrency(p.totalExpenses, lang)}
          valueClassName="text-amber-800"
          invertDeltaColors
          newBadgeLabel={t.newPeriodBadge}
          secondaryMeta={`${filteredExpensesCountLabel(expenses, timeframe, customStartDate, customEndDate)} ${t.navExpenses}`}
        />

        <KpiMetricCard
          label={t.netProfitAfterExpensesLabel}
          value={formatCurrency(s.netProfit, lang)}
          tooltip={t.kpiTooltipNetProfit}
          delta={periodData.deltas.netProfit}
          prevLabel={prevComparisonLabel}
          prevFormattedValue={formatCurrency(p.netProfit, lang)}
          valueClassName={s.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}
          newBadgeLabel={t.newPeriodBadge}
          secondaryMeta={`${s.marginPct}% ${t.marginLabel}`}
        />

        <KpiMetricCard
          label={t.totalTaxCollectedLabel}
          value={formatCurrency(s.totalTax, lang)}
          tooltip={t.kpiTooltipTax}
          delta={periodData.deltas.tax}
          prevLabel={prevComparisonLabel}
          prevFormattedValue={formatCurrency(p.totalTax, lang)}
          newBadgeLabel={t.newPeriodBadge}
          secondaryMeta={`${t.totalDiscountsLabel}: ${formatCurrency(s.totalDiscounts, lang)}`}
        />
      </section>

      {/* Sales Overview (Daily / Weekly / Monthly / Yearly) + Hourly Performance */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {t.salesOverviewTitle}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{t.salesOverviewSubtitle}</p>
            </div>

            <div
              role="tablist"
              aria-label={t.salesOverviewTitle}
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto no-print"
            >
              {(
                [
                  { id: 'daily', label: t.granularityDaily },
                  { id: 'weekly', label: t.granularityWeekly },
                  { id: 'monthly', label: t.granularityMonthly },
                  { id: 'yearly', label: t.granularityYearly },
                ] as const
              ).map((g) => {
                const active = salesGranularity === g.id;
                return (
                  <button
                    key={g.id}
                    role="tab"
                    aria-selected={active}
                    type="button"
                    onClick={() => {
                      setSalesGranularity(g.id);
                      setHoveredTrendKey(null);
                      setSelectedTrendKey(null);
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sales Overview Key Figures Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 border-y border-slate-100">
            <div>
              <p className="text-[11px] text-slate-500">{t.totalRevenue}</p>
              <p
                dir="ltr"
                className="font-mono text-sm sm:text-base font-bold text-slate-900 tabular-nums mt-0.5 rtl:text-right"
              >
                {formatCurrency(salesTrend.currentPeriodRevenue, lang)}
              </p>
              <p className="text-[11px] font-mono text-slate-400 tabular-nums mt-0.5">
                {t.vsPrevPeriodLabel}:{' '}
                <span dir="ltr" className="inline-block">
                  {formatCurrency(salesTrend.previousPeriodRevenue, lang)}
                </span>
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500">{t.salesGrowthLabel}</p>
              <p
                dir="ltr"
                className={`font-mono text-sm sm:text-base font-bold tabular-nums mt-0.5 rtl:text-right ${
                  trendGrowth.isNew
                    ? trendGrowth.current < 0
                      ? 'text-red-700'
                      : 'text-emerald-700'
                    : (trendGrowth.pctChange ?? 0) > 0
                    ? 'text-emerald-700'
                    : (trendGrowth.pctChange ?? 0) < 0
                    ? 'text-red-700'
                    : 'text-slate-700'
                }`}
              >
                {trendGrowth.isNew
                  ? t.newPeriodBadge
                  : trendGrowth.pctChange !== null
                  ? `${trendGrowth.pctChange > 0 ? '+' : ''}${trendGrowth.pctChange}%`
                  : '0%'}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500">{t.ordersCompleted}</p>
              <p className="font-mono text-sm sm:text-base font-bold text-slate-900 tabular-nums mt-0.5">
                {salesTrend.currentPeriodOrders}
                <span className="text-[11px] font-normal text-slate-400 ms-1.5">
                  ({salesTrend.previousPeriodOrders})
                </span>
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500">{t.avgOrderValue}</p>
              <p
                dir="ltr"
                className="font-mono text-sm sm:text-base font-bold text-slate-900 tabular-nums mt-0.5 rtl:text-right"
              >
                {formatCurrency(
                  salesTrend.currentPeriodOrders > 0
                    ? salesTrend.currentPeriodRevenue / salesTrend.currentPeriodOrders
                    : 0,
                  lang
                )}
              </p>
            </div>
          </div>

          {/* Interactive Readout Line */}
          <div className="flex items-center justify-between text-xs min-h-[20px] font-mono tabular-nums text-slate-600">
            {activeTrendPoint ? (
              <span>
                <strong className="text-slate-900">{activeTrendPoint.subLabel}</strong> ·{' '}
                {t.revenueCol}: {formatCurrency(activeTrendPoint.revenue, lang)} ·{' '}
                {t.profitCol}: {formatCurrency(activeTrendPoint.grossProfit, lang)} ·{' '}
                {activeTrendPoint.orders} {t.ordersCompleted.toLowerCase()}
              </span>
            ) : (
              <span className="text-slate-400">
                {salesTrend.points[0]?.subLabel} —{' '}
                {salesTrend.points[salesTrend.points.length - 1]?.subLabel}
              </span>
            )}
          </div>

          {/* Sales Trend SVG Bar Chart */}
          <div className="w-full overflow-x-auto">
            <div className="min-w-[460px]" dir="ltr">
              <svg
                viewBox="0 0 640 220"
                className="w-full h-56 overflow-visible"
                role="img"
                aria-label={t.salesOverviewTitle}
              >
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                  const y = 180 - ratio * 150;
                  const val = Math.round(salesTrend.maxRevenue * ratio);
                  return (
                    <g key={ratio}>
                      <line
                        x1="54"
                        x2="628"
                        y1={y}
                        y2={y}
                        stroke="#E2E8F0"
                        strokeWidth="1"
                      />
                      <text
                        x="46"
                        y={y + 4}
                        textAnchor="end"
                        className="fill-slate-400 text-[10px] font-mono tabular-nums"
                      >
                        {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                      </text>
                    </g>
                  );
                })}

                {salesTrend.points.map((pt, idx) => {
                  const count = Math.max(1, salesTrend.points.length);
                  const slotWidth = 564 / count;
                  const barWidth = Math.min(38, slotWidth * 0.6);
                  const x = 60 + idx * slotWidth + (slotWidth - barWidth) / 2;
                  const barHeight =
                    pt.revenue > 0
                      ? Math.max(5, (pt.revenue / salesTrend.maxRevenue) * 150)
                      : 2;
                  const y = 180 - barHeight;
                  const isHovered = effectiveTrendKey === pt.key;
                  const isLast = idx === count - 1;

                  return (
                    <g
                      key={pt.key}
                      onMouseEnter={() => setHoveredTrendKey(pt.key)}
                      onMouseLeave={() => setHoveredTrendKey(null)}
                      onClick={() =>
                        setSelectedTrendKey((curr) => (curr === pt.key ? null : pt.key))
                      }
                      className="cursor-pointer"
                    >
                      <rect
                        x={60 + idx * slotWidth}
                        y={28}
                        width={slotWidth}
                        height={176}
                        fill="transparent"
                      />
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
                            : isLast
                            ? '#0D9488'
                            : '#14B8A6'
                        }
                      />
                      <text
                        x={x + barWidth / 2}
                        y="200"
                        textAnchor="middle"
                        className={`text-[10px] font-mono tabular-nums ${
                          isHovered || isLast
                            ? 'fill-slate-900 font-semibold'
                            : 'fill-slate-500'
                        }`}
                      >
                        {pt.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </section>

        {/* 24-Hour Sales Performance */}
        <section className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
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
                  {activeHourInfo.label} · {formatCurrency(activeHourInfo.revenue, lang)} (
                  {activeHourInfo.orders})
                </span>
              ) : null}
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <div className="min-w-[440px]" dir="ltr">
              <svg
                viewBox="0 0 560 220"
                className="w-full h-56 overflow-visible"
                role="img"
                aria-label={t.hourlyRevenueTitle}
              >
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                  const y = 180 - ratio * 150;
                  const val = Math.round(periodData.breakdown.maxHourlyRevenue * ratio);
                  return (
                    <g key={ratio}>
                      <line
                        x1="48"
                        x2="552"
                        y1={y}
                        y2={y}
                        stroke="#E2E8F0"
                        strokeWidth="1"
                      />
                      <text
                        x="42"
                        y={y + 4}
                        textAnchor="end"
                        className="fill-slate-400 text-[10px] font-mono tabular-nums"
                      >
                        {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                      </text>
                    </g>
                  );
                })}

                {periodData.breakdown.hourlySeries.map((pt, idx) => {
                  const slotWidth = 496 / periodData.breakdown.hourlySeries.length;
                  const barWidth = Math.min(14, slotWidth * 0.65);
                  const x = 54 + idx * slotWidth + (slotWidth - barWidth) / 2;
                  const barHeight =
                    pt.revenue > 0
                      ? Math.max(
                          4,
                          (pt.revenue / periodData.breakdown.maxHourlyRevenue) * 150
                        )
                      : 2;
                  const y = 180 - barHeight;
                  const isHovered = effectiveHour === pt.hour;
                  const showLabel = pt.hour % 3 === 0;

                  return (
                    <g
                      key={pt.hour}
                      onMouseEnter={() => setHoveredHour(pt.hour)}
                      onMouseLeave={() => setHoveredHour(null)}
                      onClick={() =>
                        setSelectedHour((curr) => (curr === pt.hour ? null : pt.hour))
                      }
                      className="cursor-pointer"
                    >
                      <rect
                        x={54 + idx * slotWidth}
                        y={28}
                        width={slotWidth}
                        height={176}
                        fill="transparent"
                      />
                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        rx="3"
                        fill={
                          pt.revenue === 0
                            ? '#E2E8F0'
                            : isHovered
                            ? '#0F766E'
                            : '#14B8A6'
                        }
                      />
                      {showLabel && (
                        <text
                          x={x + barWidth / 2}
                          y="200"
                          textAnchor="middle"
                          className="fill-slate-500 text-[10px] font-mono tabular-nums"
                        >
                          {String(pt.hour).padStart(2, '0')}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </section>
      </div>

      {/* Payment Methods Breakdown (Donut Chart) + Category Performance */}
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

          {totalPaymentVolume <= 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              {t.noPaymentDataMsg}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              {/* SVG Donut Chart */}
              <div className="md:col-span-5 flex flex-col items-center justify-center">
                <div className="relative w-40 h-40">
                  <svg
                    viewBox="0 0 140 140"
                    className="w-full h-full -rotate-90"
                    role="img"
                    aria-label={t.paymentBreakdownTitle}
                  >
                    <circle
                      cx="70"
                      cy="70"
                      r="56"
                      fill="none"
                      stroke="#F1F5F9"
                      strokeWidth="18"
                    />
                    {paymentDonutSegments.map((seg) => {
                      const isActive = hoveredPayment === seg.method;
                      return (
                        <circle
                          key={seg.method}
                          cx="70"
                          cy="70"
                          r="56"
                          fill="none"
                          stroke={seg.color}
                          strokeWidth={isActive ? 21 : 18}
                          strokeDasharray={seg.dashArray}
                          strokeDashoffset={seg.dashOffset}
                          onMouseEnter={() => setHoveredPayment(seg.method)}
                          onMouseLeave={() => setHoveredPayment(null)}
                          className="transition-all duration-150 cursor-pointer"
                        />
                      );
                    })}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-3">
                    <span className="text-[11px] font-medium text-slate-500">
                      {hoveredPayment
                        ? getPaymentLabel(hoveredPayment, t)
                        : t.totalRevenue}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-900 tabular-nums mt-0.5">
                      {hoveredPayment
                        ? formatCurrency(
                            periodData.breakdown.paymentBreakdown.find(
                              (r) => r.method === hoveredPayment
                            )?.total ?? 0,
                            lang
                          )
                        : formatCurrency(totalPaymentVolume, lang)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Method Rows */}
              <div className="md:col-span-7 space-y-3">
                {periodData.breakdown.paymentBreakdown.map((row) => {
                  const color = PAYMENT_COLORS[row.method];
                  const isHovered = hoveredPayment === row.method;
                  return (
                    <div
                      key={row.method}
                      onMouseEnter={() => setHoveredPayment(row.method)}
                      onMouseLeave={() => setHoveredPayment(null)}
                      className={`p-2 rounded-lg transition-colors ${
                        isHovered ? 'bg-slate-50' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs sm:text-sm gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: color }}
                            aria-hidden="true"
                          />
                          <span className="font-semibold text-slate-800 truncate">
                            {getPaymentLabel(row.method, t)}
                          </span>
                          <span className="text-xs font-mono text-slate-500 tabular-nums">
                            ({row.count})
                          </span>
                        </div>
                        <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                          <span className="text-xs text-slate-500">
                            {row.sharePct}%
                          </span>
                          <span className="font-semibold text-slate-900 min-w-[88px] text-end">
                            {formatCurrency(row.total, lang)}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-1.5">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(100, row.sharePct)}%`,
                            backgroundColor: color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
              {periodData.breakdown.categoryRows.map((row) => (
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
                      style={{ width: `${Math.max(0, Math.min(100, row.sharePct))}%` }}
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

          {s.purchasesTotal > 0 && (
            <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>{t.navPurchases} ({s.purchasesCount})</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {formatCurrency(s.purchasesTotal, lang)}
              </span>
            </div>
          )}
        </section>
      </div>

      {/* Top-Selling Products + Inventory Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Top-Selling Products with Period Filter */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {t.topProductsTitle}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{t.topProductsSubtitle}</p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto no-print">
              {(
                [
                  { id: 'today', label: t.timeframeToday },
                  { id: 'yesterday', label: t.timeframeYesterday },
                  { id: 'week', label: t.timeframeWeek },
                  { id: 'month', label: t.timeframeMonth },
                  { id: 'year', label: t.timeframeYear },
                ] as const
              ).map((tf) => {
                const active = topProductsPeriod === tf.id;
                return (
                  <button
                    key={tf.id}
                    type="button"
                    onClick={() => setTopProductsPeriod(tf.id)}
                    className={`px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
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
          </div>

          {topProducts.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              {t.noOrdersInRange}
            </div>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 ps-5 pe-2 text-start font-medium w-10">
                      {t.rankCol}
                    </th>
                    <th className="py-2.5 px-3 text-start font-medium">
                      {t.productCol}
                    </th>
                    <th className="py-2.5 px-3 text-end font-medium">
                      {t.qtySoldCol}
                    </th>
                    <th className="py-2.5 px-3 text-end font-medium">
                      {t.revenueCol}
                    </th>
                    <th className="py-2.5 ps-3 pe-5 text-end font-medium">
                      {t.profitCol}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topProducts.slice(0, 8).map((item, idx) => {
                    const displayName = lang === 'ur' ? item.nameUr : item.nameEn;
                    return (
                      <tr
                        key={item.productId}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="py-2.5 ps-5 pe-2 font-mono text-xs font-bold text-slate-500 tabular-nums">
                          #{idx + 1}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ProductImage
                              src={item.image}
                              alt={displayName}
                              className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 truncate max-w-[180px]">
                                {displayName}
                              </div>
                              <div className="text-[11px] font-mono text-slate-400">
                                {item.sku}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono text-slate-700 tabular-nums whitespace-nowrap">
                          {formatQuantityWithUnit(item.units, item.sellingUnit, lang)}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatCurrency(item.revenue, lang)}
                        </td>
                        <td
                          className={`py-2.5 ps-3 pe-5 text-end font-mono tabular-nums whitespace-nowrap ${
                            item.profit >= 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {formatCurrency(item.profit, lang)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Inventory Alerts & Velocity */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {t.inventoryAlertsTitle}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t.inventoryAlertsSubtitle}
              </p>
            </div>

            <button
              type="button"
              onClick={onGoToInventory}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg whitespace-nowrap shrink-0 self-start sm:self-auto cursor-pointer no-print"
            >
              <Boxes className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{t.manageInventoryBtn}</span>
            </button>
          </div>

          {/* Alert Filter Tabs */}
          <div className="px-5 pt-3 pb-2 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto no-print">
            {(
              [
                {
                  id: 'low_out',
                  label: `${t.alertTabLowOut} (${lowAndOutItems.length})`,
                },
                {
                  id: 'fast',
                  label: `${t.alertTabFastMoving} (${inventoryAlerts.fastMoving.length})`,
                },
                {
                  id: 'slow',
                  label: `${t.alertTabSlowMoving} (${inventoryAlerts.slowMoving.length})`,
                },
              ] as const
            ).map((tab) => {
              const active = alertTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setAlertTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeAlertItems.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              {t.noInventoryAlertsMsg}
            </div>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 ps-5 pe-3 text-start font-medium">
                      {t.productCol}
                    </th>
                    <th className="py-2.5 px-3 text-end font-medium">
                      {t.inStockLabel}
                    </th>
                    <th className="py-2.5 px-3 text-end font-medium">
                      {t.sold30dCol}
                    </th>
                    <th className="py-2.5 px-3 text-end font-medium">
                      {t.daysCoverCol}
                    </th>
                    <th className="py-2.5 ps-3 pe-5 text-end font-medium">
                      {t.suggestedReorderCol}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeAlertItems.slice(0, 8).map((item) => {
                    const pName =
                      lang === 'ur' ? item.product.nameUr : item.product.nameEn;
                    const isOut = item.product.stock <= 0;
                    const minAlert = item.product.minStock ?? 5;
                    const isLow = item.product.stock > 0 && item.product.stock <= minAlert;

                    return (
                      <tr
                        key={item.product.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="py-2.5 ps-5 pe-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-slate-900 truncate max-w-[160px]">
                              {pName}
                            </span>
                            {isOut ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200 whitespace-nowrap shrink-0">
                                {t.outOfStockBadge}
                              </span>
                            ) : isLow ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap shrink-0">
                                {t.lowStockBadge}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {item.product.sku}
                          </div>
                        </td>
                        <td
                          className={`py-2.5 px-3 text-end font-mono font-semibold tabular-nums whitespace-nowrap ${
                            isOut
                              ? 'text-red-700'
                              : isLow
                              ? 'text-amber-700'
                              : 'text-slate-900'
                          }`}
                        >
                          {formatQuantityWithUnit(
                            item.product.stock,
                            item.product.sellingUnit,
                            lang
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono text-slate-700 tabular-nums whitespace-nowrap">
                          {formatQuantityWithUnit(
                            item.unitsSold30d,
                            item.product.sellingUnit,
                            lang
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono text-slate-600 tabular-nums">
                          {item.daysOfCover !== null ? `${item.daysOfCover}d` : '—'}
                        </td>
                        <td className="py-2.5 ps-3 pe-5 text-end font-mono font-semibold tabular-nums whitespace-nowrap">
                          {item.suggestedReorderQty > 0 ? (
                            <span className="text-teal-800">
                              +
                              {formatQuantityWithUnit(
                                item.suggestedReorderQty,
                                item.product.sellingUnit,
                                lang
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
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

      {/* Recent Completed Receipts */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">
            {t.recentReceiptsTitle}
          </h2>
        </div>

        {periodData.recentOrders.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {t.noOrdersInRange}
          </div>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-5 text-start font-medium">{t.receiptCol}</th>
                  <th className="py-2.5 px-4 text-start font-medium">{t.timeCol}</th>
                  <th className="py-2.5 px-4 text-start font-medium">{t.customerCol}</th>
                  <th className="py-2.5 px-4 text-start font-medium">{t.methodCol}</th>
                  <th className="py-2.5 px-4 text-end font-medium">{t.amountCol}</th>
                  <th className="py-2.5 px-5 text-end font-medium no-print">
                    {t.actionCol}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {periodData.recentOrders.slice(0, 8).map((order) => {
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
                        {order.customerName || t.walkInCustomer}
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

      {/* Cashier, Branch & Cash Shift Performance Breakdown */}
      {(periodData.currentOrders.length > 0 || cashShifts.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                {t.cashierLabel} / {t.navBranches}
              </h2>
              <span className="text-xs font-mono text-slate-500">
                {t.statusRefundedLabel}: {s.refundedOrderCount}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 text-start font-medium">{t.cashierLabel}</th>
                    <th className="py-2.5 px-4 text-end font-medium">{t.ordersCompleted}</th>
                    <th className="py-2.5 px-4 text-end font-medium">{t.revenueCol}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.entries(
                    periodData.currentOrders.reduce<
                      Record<string, { count: number; total: number }>
                    >((acc, o) => {
                      if (o.returnStatus === 'cancelled') return acc;
                      const key = o.cashierName || t.cashierDefault;
                      const curr = acc[key] ?? { count: 0, total: 0 };
                      curr.count += 1;
                      curr.total += o.total;
                      acc[key] = curr;
                      return acc;
                    }, {})
                  ).map(([cashier, stats]) => (
                    <tr key={cashier}>
                      <td className="py-2.5 px-4 font-semibold text-slate-900">{cashier}</td>
                      <td className="py-2.5 px-4 text-end font-mono tabular-nums">{stats.count}</td>
                      <td className="py-2.5 px-4 text-end font-mono tabular-nums font-semibold">
                        {formatCurrency(stats.total, lang)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {branches.length > 0 && (
              <div className="border-t border-slate-200 px-4 py-3 space-y-1.5 text-xs">
                {branches.map((branch) => {
                  const branchTotal = periodData.currentOrders
                    .filter(
                      (o) =>
                        o.returnStatus !== 'cancelled' &&
                        (o.branchId === branch.id || (!o.branchId && branch.isMain))
                    )
                    .reduce((sum, o) => sum + o.total, 0);
                  return (
                    <div key={branch.id} className="flex justify-between font-mono">
                      <span className="text-slate-700">{branch.name}</span>
                      <span className="font-semibold text-slate-900">
                        {formatCurrency(branchTotal, lang)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {cashShifts.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-base font-bold text-slate-900">
                  {t.shiftHistoryTitle}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4 text-start font-medium">{t.cashierLabel}</th>
                      <th className="py-2.5 px-4 text-start font-medium">{t.statusCol}</th>
                      <th className="py-2.5 px-4 text-end font-medium">{t.expectedCashLabel}</th>
                      <th className="py-2.5 px-4 text-end font-medium">{t.cashShortageOverLabel}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cashShifts.slice(0, 6).map((sh) => (
                      <tr key={sh.id}>
                        <td className="py-2.5 px-4 font-semibold text-slate-900">
                          {sh.cashierName}
                        </td>
                        <td className="py-2.5 px-4">
                          {sh.status === 'open' ? t.shiftOpenStatus : t.shiftClosedStatus}
                        </td>
                        <td className="py-2.5 px-4 text-end font-mono tabular-nums">
                          {formatCurrency(sh.expectedCash, lang)}
                        </td>
                        <td className="py-2.5 px-4 text-end font-mono tabular-nums">
                          {typeof sh.cashDifference === 'number'
                            ? formatCurrency(sh.cashDifference, lang)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {/* Safe Confirmation Modal for Reset Demo Data */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-demo-confirm-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-5 space-y-4 shadow-xl">
            <h3
              id="reset-demo-confirm-title"
              className="text-base font-bold text-slate-900"
            >
              {t.resetDemoData}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {t.deleteProductConfirmDesc}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                {t.cancelBtn}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowResetConfirm(false);
                  onResetDemo();
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
              >
                {t.resetDemoData}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function filteredExpensesCountLabel(
  expenses: ExpenseRecord[],
  timeframe: DashboardTimeframe,
  customStartDate: string,
  customEndDate: string
): number {
  const window = resolvePeriodWindow(timeframe, customStartDate, customEndDate);
  return filterExpensesInRange(expenses, window.startYmd, window.endYmd).length;
}
