import { useMemo, useState } from 'react';
import { ArrowUpRight, Printer, RotateCcw } from 'lucide-react';
import {
  formatCurrency,
  formatTimeShort,
  getCategoryLabel,
  getPaymentLabel,
  type TranslationStrings,
} from '../i18n';
import type { CategoryId, Language, OrderRecord } from '../types';

interface ExecutiveDashboardViewProps {
  orders: OrderRecord[];
  latestNewOrderId: string | null;
  onPrintReceipt: (order: OrderRecord) => void;
  onGoToPos: () => void;
  onResetDemo: () => void;
  lang: Language;
  t: TranslationStrings;
}

export function ExecutiveDashboardView({
  orders,
  latestNewOrderId,
  onPrintReceipt,
  onGoToPos,
  onResetDemo,
  lang,
  t,
}: ExecutiveDashboardViewProps) {
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalCogs = 0;
    let totalUnits = 0;

    const categoryTotals: Record<Exclude<CategoryId, 'all'>, { revenue: number; units: number }> = {
      beverages: { revenue: 0, units: 0 },
      bakery: { revenue: 0, units: 0 },
      pantry: { revenue: 0, units: 0 },
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

    for (const order of orders) {
      totalRevenue += order.total;

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

    const orderCount = orders.length;
    const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;
    const grossProfit = Math.max(0, totalRevenue - totalCogs);
    const marginPct = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0;

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

    const recentOrders = [...orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return {
      totalRevenue,
      orderCount,
      totalUnits,
      avgOrderValue,
      grossProfit,
      marginPct,
      categoryRows,
      topProducts,
      hourlySeries,
      maxHourlyRevenue,
      recentOrders,
    };
  }, [orders]);

  const latestOrder = useMemo(
    () => orders.find((o) => o.id === latestNewOrderId) ?? null,
    [orders, latestNewOrderId]
  );

  const activeHourInfo = useMemo(() => {
    if (hoveredHour === null) return null;
    return metrics.hourlySeries.find((h) => h.hour === hoveredHour) ?? null;
  }, [hoveredHour, metrics.hourlySeries]);

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t.dashboardTitle}
          </h1>
          <p className="text-sm text-slate-600 mt-1">{t.dashboardSubtitle}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onResetDemo}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap transition-colors min-h-[40px] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{t.resetDemoData}</span>
          </button>

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

      {/* 4-Column Executive KPI Strip */}
      <section
        aria-label="Key Performance Metrics"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
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
          <p className="text-xs font-medium text-slate-500">{t.ordersCompleted}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {metrics.orderCount}
          </p>
          <p className="text-xs text-slate-500 mt-2 tabular-nums">
            {metrics.totalUnits} {t.itemsSoldUnit}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.avgOrderValue}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {formatCurrency(metrics.avgOrderValue, lang)}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            {t.taxLabel}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.grossProfit}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {formatCurrency(metrics.grossProfit, lang)}
          </p>
          <p className="text-xs text-emerald-700 font-medium mt-2 tabular-nums">
            {metrics.marginPct}% {t.marginLabel}
          </p>
        </div>
      </section>

      {/* Analytics Middle Row: Hourly Chart + Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Hourly Revenue Bar Chart */}
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5">
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
                {/* Horizontal Reference Lines */}
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

                {/* Bars */}
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

        {/* Category Performance */}
        <section className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
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

      {/* Bottom Tables Row: Top Products + Recent Completed Receipts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Top Selling Products */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900">{t.topProductsTitle}</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-5 text-start font-medium">{t.productCol}</th>
                  <th className="py-2.5 px-4 text-end font-medium">{t.unitsCol}</th>
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
        </section>

        {/* Recent Completed Receipts */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900">{t.recentReceiptsTitle}</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-5 text-start font-medium">{t.receiptCol}</th>
                  <th className="py-2.5 px-4 text-start font-medium">{t.timeCol}</th>
                  <th className="py-2.5 px-4 text-start font-medium">{t.methodCol}</th>
                  <th className="py-2.5 px-4 text-end font-medium">{t.amountCol}</th>
                  <th className="py-2.5 px-5 text-end font-medium">{t.actionCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.recentOrders.slice(0, 6).map((order) => {
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
                      <td className="py-3 px-5 text-end">
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
        </section>
      </div>
    </div>
  );
}
