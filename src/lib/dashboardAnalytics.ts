import type {
  CategoryId,
  ExpenseRecord,
  Language,
  OrderRecord,
  Product,
  PurchaseRecord,
  SellingUnit,
} from '../types';
import { normalizeSellingUnit, roundQuantity } from './unitUtils';

export type DashboardTimeframe =
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | 'year'
  | 'custom';
export type SalesGranularity = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type TopProductTimeframe = 'today' | 'yesterday' | 'week' | 'month' | 'year';
export type PaymentBreakdownMethod =
  | 'cash'
  | 'jazzcash'
  | 'easypaisa'
  | 'card'
  | 'bank_transfer'
  | 'udhaar';

export interface PeriodWindow {
  startMs: number;
  endMs: number;
  startYmd: string;
  endYmd: string;
  prevStartMs: number;
  prevEndMs: number;
  prevStartYmd: string;
  prevEndYmd: string;
}

export interface PeriodFinancialSummary {
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  totalDiscounts: number;
  totalTax: number;
  completedOrderCount: number;
  refundedOrderCount: number;
  totalUnits: number;
  avgOrderValue: number;
  marginPct: number;
  purchasesTotal: number;
  purchasesCount: number;
}

export interface KpiDeltaInfo {
  current: number;
  previous: number;
  pctChange: number | null;
  isNew: boolean;
}

export interface SalesSeriesPoint {
  key: string;
  label: string;
  subLabel: string;
  revenue: number;
  grossProfit: number;
  orders: number;
}

export interface PaymentBreakdownRow {
  method: PaymentBreakdownMethod;
  count: number;
  total: number;
  sharePct: number;
}

export interface TopProductRow {
  productId: string;
  sku: string;
  nameEn: string;
  nameUr: string;
  image: string;
  sellingUnit: SellingUnit;
  units: number;
  revenue: number;
  profit: number;
  currentStock: number;
}

export interface InventoryAlertItem {
  product: Product;
  unitsSold30d: number;
  dailyVelocity: number;
  daysOfCover: number | null;
  suggestedReorderQty: number;
}

export function toLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfDayMs(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0
  ).getTime();
}

function endOfDayMs(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999
  ).getTime();
}

export function resolvePeriodWindow(
  timeframe: DashboardTimeframe,
  customStartDate: string,
  customEndDate: string,
  now: Date = new Date()
): PeriodWindow {
  const todayStart = startOfDayMs(now);
  const todayEnd = endOfDayMs(now);
  const todayYmd = toLocalYmd(now);

  if (timeframe === 'today') {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return {
      startMs: todayStart,
      endMs: todayEnd,
      startYmd: todayYmd,
      endYmd: todayYmd,
      prevStartMs: startOfDayMs(yesterday),
      prevEndMs: endOfDayMs(yesterday),
      prevStartYmd: toLocalYmd(yesterday),
      prevEndYmd: toLocalYmd(yesterday),
    };
  }

  if (timeframe === 'yesterday') {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const dayBefore = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
    const yestYmd = toLocalYmd(yesterday);
    const prevYmd = toLocalYmd(dayBefore);
    return {
      startMs: startOfDayMs(yesterday),
      endMs: endOfDayMs(yesterday),
      startYmd: yestYmd,
      endYmd: yestYmd,
      prevStartMs: startOfDayMs(dayBefore),
      prevEndMs: endOfDayMs(dayBefore),
      prevStartYmd: prevYmd,
      prevEndYmd: prevYmd,
    };
  }

  if (timeframe === 'week') {
    const dayOfWeekMon = (now.getDay() + 6) % 7; // Mon=0 .. Sun=6
    const weekStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - dayOfWeekMon
    );
    const prevWeekStart = new Date(
      weekStart.getFullYear(),
      weekStart.getMonth(),
      weekStart.getDate() - 7
    );
    const prevWeekEnd = new Date(
      prevWeekStart.getFullYear(),
      prevWeekStart.getMonth(),
      prevWeekStart.getDate() + dayOfWeekMon
    );

    return {
      startMs: startOfDayMs(weekStart),
      endMs: todayEnd,
      startYmd: toLocalYmd(weekStart),
      endYmd: todayYmd,
      prevStartMs: startOfDayMs(prevWeekStart),
      prevEndMs: endOfDayMs(prevWeekEnd),
      prevStartYmd: toLocalYmd(prevWeekStart),
      prevEndYmd: toLocalYmd(prevWeekEnd),
    };
  }

  if (timeframe === 'month') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    const clampedDay = Math.min(now.getDate(), lastDayPrevMonth);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth() - 1, clampedDay);

    return {
      startMs: startOfDayMs(monthStart),
      endMs: todayEnd,
      startYmd: toLocalYmd(monthStart),
      endYmd: todayYmd,
      prevStartMs: startOfDayMs(prevMonthStart),
      prevEndMs: endOfDayMs(prevMonthEnd),
      prevStartYmd: toLocalYmd(prevMonthStart),
      prevEndYmd: toLocalYmd(prevMonthEnd),
    };
  }

  if (timeframe === 'year') {
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const prevYearStart = new Date(now.getFullYear() - 1, 0, 1);
    const prevYearEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    return {
      startMs: startOfDayMs(yearStart),
      endMs: todayEnd,
      startYmd: toLocalYmd(yearStart),
      endYmd: todayYmd,
      prevStartMs: startOfDayMs(prevYearStart),
      prevEndMs: endOfDayMs(prevYearEnd),
      prevStartYmd: toLocalYmd(prevYearStart),
      prevEndYmd: toLocalYmd(prevYearEnd),
    };
  }

  // Custom date range
  const rawStartObj = customStartDate
    ? new Date(`${customStartDate}T00:00:00`)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const rawEndObj = customEndDate ? new Date(`${customEndDate}T23:59:59.999`) : now;

  const validStart = Number.isNaN(rawStartObj.getTime()) ? now : rawStartObj;
  const validEnd = Number.isNaN(rawEndObj.getTime()) ? now : rawEndObj;

  const orderedStart = validStart.getTime() <= validEnd.getTime() ? validStart : validEnd;
  const orderedEnd = validStart.getTime() <= validEnd.getTime() ? validEnd : validStart;

  const safeStartMs = startOfDayMs(orderedStart);
  const safeEndMs = endOfDayMs(orderedEnd);

  const daySpanMs = Math.max(86_400_000, safeEndMs - safeStartMs + 1);
  const prevEndMs = safeStartMs - 1;
  const prevStartMs = prevEndMs - daySpanMs + 1;

  return {
    startMs: safeStartMs,
    endMs: safeEndMs,
    startYmd: toLocalYmd(new Date(safeStartMs)),
    endYmd: toLocalYmd(new Date(safeEndMs)),
    prevStartMs,
    prevEndMs,
    prevStartYmd: toLocalYmd(new Date(prevStartMs)),
    prevEndYmd: toLocalYmd(new Date(prevEndMs)),
  };
}

export function filterOrdersInRange(
  orders: OrderRecord[],
  startMs: number,
  endMs: number
): OrderRecord[] {
  return orders.filter((order) => {
    const ts = new Date(order.createdAt).getTime();
    return !Number.isNaN(ts) && ts >= startMs && ts <= endMs;
  });
}

export function filterExpensesInRange(
  expenses: ExpenseRecord[],
  startYmd: string,
  endYmd: string
): ExpenseRecord[] {
  return expenses.filter((exp) => {
    if (!exp.expenseDate) return false;
    return exp.expenseDate >= startYmd && exp.expenseDate <= endYmd;
  });
}

export function filterPurchasesInRange(
  purchases: PurchaseRecord[],
  startMs: number,
  endMs: number
): PurchaseRecord[] {
  return purchases.filter((p) => {
    const ts = new Date(p.createdAt).getTime();
    return !Number.isNaN(ts) && ts >= startMs && ts <= endMs;
  });
}

export function summarizeFinancials(
  ordersInPeriod: OrderRecord[],
  expensesInPeriod: ExpenseRecord[],
  purchasesInPeriod: PurchaseRecord[] = []
): PeriodFinancialSummary {
  let totalRevenue = 0;
  let totalCogs = 0;
  let totalDiscounts = 0;
  let totalTax = 0;
  let totalUnits = 0;
  let completedOrderCount = 0;
  let refundedOrderCount = 0;

  for (const order of ordersInPeriod) {
    if (order.returnStatus === 'cancelled') {
      continue;
    }
    if (order.returnStatus === 'refunded') {
      refundedOrderCount += 1;
    } else {
      completedOrderCount += 1;
    }

    totalRevenue += order.total;
    totalDiscounts += order.discountAmount;
    totalTax += order.taxAmount;

    for (const item of order.items) {
      const isPosReturnItem = Boolean(item.isReturn) || item.quantity < 0;
      const activeQty = isPosReturnItem
        ? item.quantity
        : Math.max(0, item.quantity - (item.refundedQty ?? 0));
      const itemCost = item.unitCost * activeQty;
      totalUnits += activeQty;
      totalCogs += itemCost;
    }
  }

  const grossProfit = totalRevenue - totalCogs;
  const totalExpenses = expensesInPeriod.reduce((sum, exp) => sum + exp.amount, 0);
  const netProfit = grossProfit - totalExpenses;
  const avgOrderValue =
    completedOrderCount > 0 ? totalRevenue / completedOrderCount : 0;
  const marginPct =
    totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;
  const purchasesTotal = purchasesInPeriod.reduce(
    (sum, p) => sum + p.totalAmount,
    0
  );

  return {
    totalRevenue,
    totalCogs,
    grossProfit,
    totalExpenses,
    netProfit,
    totalDiscounts,
    totalTax,
    completedOrderCount,
    refundedOrderCount,
    totalUnits: roundQuantity(totalUnits),
    avgOrderValue,
    marginPct,
    purchasesTotal,
    purchasesCount: purchasesInPeriod.length,
  };
}

export function computeKpiDelta(current: number, previous: number): KpiDeltaInfo {
  if (previous === 0) {
    return {
      current,
      previous,
      pctChange: current === 0 ? 0 : null,
      isNew: current !== 0,
    };
  }
  const pct =
    Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
  return {
    current,
    previous,
    pctChange: pct,
    isNew: false,
  };
}

export function computePeriodBreakdown(
  ordersInPeriod: OrderRecord[],
  products: Product[]
): {
  paymentBreakdown: PaymentBreakdownRow[];
  categoryRows: {
    category: Exclude<CategoryId, 'all'>;
    revenue: number;
    units: number;
    sharePct: number;
  }[];
  hourlySeries: { hour: number; label: string; revenue: number; orders: number }[];
  maxHourlyRevenue: number;
} {
  const categoryTotals: Record<
    Exclude<CategoryId, 'all'>,
    { revenue: number; units: number }
  > = {
    beverages: { revenue: 0, units: 0 },
    bakery: { revenue: 0, units: 0 },
    pantry: { revenue: 0, units: 0 },
  };

  const paymentMap: Record<
    PaymentBreakdownMethod,
    { count: number; total: number }
  > = {
    cash: { count: 0, total: 0 },
    jazzcash: { count: 0, total: 0 },
    easypaisa: { count: 0, total: 0 },
    card: { count: 0, total: 0 },
    bank_transfer: { count: 0, total: 0 },
    udhaar: { count: 0, total: 0 },
  };

  const hourlyMap = new Map<number, { revenue: number; orders: number }>();
  for (let h = 0; h <= 23; h++) {
    hourlyMap.set(h, { revenue: 0, orders: 0 });
  }

  const productCategoryMap = new Map(products.map((p) => [p.id, p.category]));

  for (const order of ordersInPeriod) {
    if (order.returnStatus === 'cancelled') {
      continue;
    }
    if (order.returnStatus === 'refunded' && order.total === 0) {
      continue;
    }

    if (Array.isArray(order.paymentSplits) && order.paymentSplits.length > 0) {
      for (const split of order.paymentSplits) {
        const splitKey: PaymentBreakdownMethod =
          split.method === 'mobile' ? 'jazzcash' : split.method;
        if (paymentMap[splitKey]) {
          paymentMap[splitKey].count += 1;
          paymentMap[splitKey].total += split.amount;
        }
      }
    } else {
      const breakdownKey: PaymentBreakdownMethod =
        order.paymentMethod === 'mobile' ? 'jazzcash' : order.paymentMethod;
      if (paymentMap[breakdownKey]) {
        paymentMap[breakdownKey].count += 1;
        paymentMap[breakdownKey].total += order.total;
      }
    }

    const orderHour = new Date(order.createdAt).getHours();
    if (orderHour >= 0 && orderHour <= 23) {
      const hourEntry = hourlyMap.get(orderHour) ?? { revenue: 0, orders: 0 };
      hourEntry.revenue += order.total;
      hourEntry.orders += 1;
      hourlyMap.set(orderHour, hourEntry);
    }

    for (const item of order.items) {
      const isPosReturnItem = Boolean(item.isReturn) || item.quantity < 0;
      const activeQty = isPosReturnItem
        ? item.quantity
        : Math.max(0, item.quantity - (item.refundedQty ?? 0));
      const activeRatio =
        isPosReturnItem || item.quantity <= 0 ? 1 : activeQty / item.quantity;
      const activeLineTotal = item.lineTotal * activeRatio;
      const cat = item.category ?? productCategoryMap.get(item.productId);
      if (cat && categoryTotals[cat]) {
        categoryTotals[cat].revenue += activeLineTotal;
        categoryTotals[cat].units += activeQty;
      }
    }
  }

  const methodOrder: PaymentBreakdownMethod[] = [
    'cash',
    'jazzcash',
    'easypaisa',
    'card',
    'bank_transfer',
    'udhaar',
  ];
  const positivePaymentVolume = methodOrder.reduce(
    (sum, method) => sum + Math.max(0, paymentMap[method].total),
    0
  );

  const paymentBreakdown = methodOrder.map((method) => {
    const row = paymentMap[method];
    const positiveTotal = Math.max(0, row.total);
    const sharePct =
      positivePaymentVolume > 0
        ? Math.round((positiveTotal / positivePaymentVolume) * 1000) / 10
        : 0;
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

  const categoryRows = (['beverages', 'bakery', 'pantry'] as const).map(
    (cat) => {
      const data = categoryTotals[cat];
      const sharePct =
        categoryGrossSum > 0
          ? Math.round((data.revenue / categoryGrossSum) * 100)
          : 0;
      return {
        category: cat,
        revenue: data.revenue,
        units: roundQuantity(data.units),
        sharePct,
      };
    }
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

  return {
    paymentBreakdown,
    categoryRows,
    hourlySeries,
    maxHourlyRevenue,
  };
}

function getOrderGrossProfit(order: OrderRecord): number {
  let cogs = 0;
  for (const item of order.items) {
    const isPosReturnItem = Boolean(item.isReturn) || item.quantity < 0;
    const activeQty = isPosReturnItem
      ? item.quantity
      : Math.max(0, item.quantity - (item.refundedQty ?? 0));
    cogs += item.unitCost * activeQty;
  }
  return order.total - cogs;
}

export function buildSalesTrendSeries(
  orders: OrderRecord[],
  granularity: SalesGranularity,
  lang: Language,
  now: Date = new Date()
): {
  points: SalesSeriesPoint[];
  currentPeriodRevenue: number;
  previousPeriodRevenue: number;
  currentPeriodOrders: number;
  previousPeriodOrders: number;
  maxRevenue: number;
} {
  const locale = lang === 'ur' ? 'en-PK' : 'en-US';
  const points: SalesSeriesPoint[] = [];

  if (granularity === 'daily') {
    // Last 14 days including today
    const buckets = new Map<string, SalesSeriesPoint>();
    for (let offset = 13; offset >= 0; offset--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
      const ymd = toLocalYmd(d);
      const shortDate = d.toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
      });
      buckets.set(ymd, {
        key: ymd,
        label: String(d.getDate()).padStart(2, '0'),
        subLabel: shortDate,
        revenue: 0,
        grossProfit: 0,
        orders: 0,
      });
    }

    for (const order of orders) {
      if (order.returnStatus === 'cancelled') continue;
      const d = new Date(order.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const ymd = toLocalYmd(d);
      const b = buckets.get(ymd);
      if (!b) continue;
      b.revenue += order.total;
      b.grossProfit += getOrderGrossProfit(order);
      if (order.returnStatus !== 'refunded') {
        b.orders += 1;
      }
    }

    points.push(...buckets.values());
  } else if (granularity === 'weekly') {
    // Last 8 weeks (Mon–Sun)
    const dayOfWeekMon = (now.getDay() + 6) % 7;
    const currentWeekMonday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - dayOfWeekMon
    );

    const weekDefs: { startMs: number; endMs: number; key: string; label: string; subLabel: string }[] = [];
    for (let w = 7; w >= 0; w--) {
      const mon = new Date(
        currentWeekMonday.getFullYear(),
        currentWeekMonday.getMonth(),
        currentWeekMonday.getDate() - w * 7
      );
      const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
      const monLbl = mon.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
      const sunLbl = sun.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
      weekDefs.push({
        startMs: startOfDayMs(mon),
        endMs: endOfDayMs(sun),
        key: toLocalYmd(mon),
        label: mon.toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
        subLabel: `${monLbl} – ${sunLbl}`,
      });
    }

    for (const def of weekDefs) {
      let rev = 0;
      let gp = 0;
      let cnt = 0;
      for (const order of orders) {
        if (order.returnStatus === 'cancelled') continue;
        const ts = new Date(order.createdAt).getTime();
        if (!Number.isNaN(ts) && ts >= def.startMs && ts <= def.endMs) {
          rev += order.total;
          gp += getOrderGrossProfit(order);
          if (order.returnStatus !== 'refunded') cnt += 1;
        }
      }
      points.push({
        key: def.key,
        label: def.label,
        subLabel: def.subLabel,
        revenue: rev,
        grossProfit: gp,
        orders: cnt,
      });
    }
  } else if (granularity === 'monthly') {
    // 12 months of the current year
    const year = now.getFullYear();
    const monthBuckets: SalesSeriesPoint[] = [];
    for (let m = 0; m < 12; m++) {
      const d = new Date(year, m, 1);
      const shortMonth = d.toLocaleDateString(locale, { month: 'short' });
      monthBuckets.push({
        key: `${year}-${String(m + 1).padStart(2, '0')}`,
        label: shortMonth,
        subLabel: `${shortMonth} ${year}`,
        revenue: 0,
        grossProfit: 0,
        orders: 0,
      });
    }

    for (const order of orders) {
      if (order.returnStatus === 'cancelled') continue;
      const d = new Date(order.createdAt);
      if (Number.isNaN(d.getTime()) || d.getFullYear() !== year) continue;
      const b = monthBuckets[d.getMonth()];
      b.revenue += order.total;
      b.grossProfit += getOrderGrossProfit(order);
      if (order.returnStatus !== 'refunded') b.orders += 1;
    }

    points.push(...monthBuckets);
  } else {
    // Yearly trend (up to 5 years ending currentYear)
    const currentYear = now.getFullYear();
    let minYear = currentYear - 2;
    for (const order of orders) {
      const d = new Date(order.createdAt);
      if (!Number.isNaN(d.getTime())) {
        minYear = Math.min(minYear, d.getFullYear());
      }
    }
    minYear = Math.max(currentYear - 5, minYear);

    const yearMap = new Map<number, SalesSeriesPoint>();
    for (let y = minYear; y <= currentYear; y++) {
      yearMap.set(y, {
        key: String(y),
        label: String(y),
        subLabel: String(y),
        revenue: 0,
        grossProfit: 0,
        orders: 0,
      });
    }

    for (const order of orders) {
      if (order.returnStatus === 'cancelled') continue;
      const d = new Date(order.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const b = yearMap.get(d.getFullYear());
      if (!b) continue;
      b.revenue += order.total;
      b.grossProfit += getOrderGrossProfit(order);
      if (order.returnStatus !== 'refunded') b.orders += 1;
    }

    points.push(...yearMap.values());
  }

  const lastPoint = points[points.length - 1];
  const currentPoint =
    granularity === 'monthly' ? points[now.getMonth()] : lastPoint;

  let previousPeriodRevenue = 0;
  let previousPeriodOrders = 0;

  if (granularity === 'monthly' && now.getMonth() === 0) {
    const prevYear = now.getFullYear() - 1;
    for (const order of orders) {
      const d = new Date(order.createdAt);
      if (
        !Number.isNaN(d.getTime()) &&
        d.getFullYear() === prevYear &&
        d.getMonth() === 11
      ) {
        previousPeriodRevenue += order.total;
        if (order.returnStatus !== 'refunded') {
          previousPeriodOrders += 1;
        }
      }
    }
  } else {
    const prevPoint =
      granularity === 'monthly'
        ? points[Math.max(0, now.getMonth() - 1)]
        : points[points.length - 2];
    if (prevPoint && prevPoint !== currentPoint) {
      previousPeriodRevenue = prevPoint.revenue;
      previousPeriodOrders = prevPoint.orders;
    }
  }

  const maxRevenue = Math.max(1000, ...points.map((pt) => pt.revenue));

  return {
    points,
    currentPeriodRevenue: currentPoint?.revenue ?? 0,
    previousPeriodRevenue,
    currentPeriodOrders: currentPoint?.orders ?? 0,
    previousPeriodOrders,
    maxRevenue,
  };
}

export function summarizeTopProductsFromOrders(
  ordersInRange: OrderRecord[],
  products: Product[]
): TopProductRow[] {
  const productMap = new Map(products.map((p) => [p.id, p]));
  const stats = new Map<string, TopProductRow>();

  for (const order of ordersInRange) {
    if (order.returnStatus === 'cancelled') continue;
    for (const item of order.items) {
      const isPosReturnItem = Boolean(item.isReturn) || item.quantity < 0;
      const activeQty = isPosReturnItem
        ? item.quantity
        : Math.max(0, item.quantity - (item.refundedQty ?? 0));
      const activeRatio =
        isPosReturnItem || item.quantity <= 0 ? 1 : activeQty / item.quantity;
      const activeLineTotal = item.lineTotal * activeRatio;
      const itemCost = item.unitCost * activeQty;
      const prod = productMap.get(item.productId);

      const existing = stats.get(item.productId) ?? {
        productId: item.productId,
        sku: item.sku,
        nameEn: prod?.nameEn ?? item.nameEn,
        nameUr: prod?.nameUr ?? item.nameUr,
        image: prod?.image ?? '',
        sellingUnit: normalizeSellingUnit(prod?.sellingUnit ?? item.sellingUnit),
        units: 0,
        revenue: 0,
        profit: 0,
        currentStock: roundQuantity(prod?.stock ?? 0),
      };
      existing.units = roundQuantity(existing.units + activeQty);
      existing.revenue += activeLineTotal;
      existing.profit += activeLineTotal - itemCost;
      stats.set(item.productId, existing);
    }
  }

  return Array.from(stats.values())
    .filter((row) => row.units !== 0 || row.revenue !== 0)
    .sort((a, b) => b.revenue - a.revenue);
}

export function computeTopSellingProducts(
  orders: OrderRecord[],
  products: Product[],
  timeframe: TopProductTimeframe,
  now: Date = new Date()
): TopProductRow[] {
  const window = resolvePeriodWindow(timeframe, '', '', now);
  const filtered = filterOrdersInRange(orders, window.startMs, window.endMs);
  return summarizeTopProductsFromOrders(filtered, products);
}

export function computeInventoryAlerts(
  products: Product[],
  orders: OrderRecord[],
  now: Date = new Date()
): {
  lowStock: InventoryAlertItem[];
  outOfStock: InventoryAlertItem[];
  fastMoving: InventoryAlertItem[];
  slowMoving: InventoryAlertItem[];
} {
  const thirtyDaysAgo = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 30
  );
  const startMs = startOfDayMs(thirtyDaysAgo);
  const endMs = endOfDayMs(now);

  const units30dByProduct = new Map<string, number>();
  for (const order of orders) {
    if (order.returnStatus === 'cancelled') continue;
    const ts = new Date(order.createdAt).getTime();
    if (Number.isNaN(ts) || ts < startMs || ts > endMs) continue;
    for (const item of order.items) {
      const isPosReturnItem = Boolean(item.isReturn) || item.quantity < 0;
      const activeQty = isPosReturnItem
        ? item.quantity
        : Math.max(0, item.quantity - (item.refundedQty ?? 0));
      if (activeQty !== 0) {
        units30dByProduct.set(
          item.productId,
          (units30dByProduct.get(item.productId) ?? 0) + activeQty
        );
      }
    }
  }

  const enriched: InventoryAlertItem[] = products.map((product) => {
    const safeStock = Math.max(0, roundQuantity(product.stock));
    const minAlert = product.minStock ?? 5;
    const unitsSold30d = Math.max(0, roundQuantity(units30dByProduct.get(product.id) ?? 0));
    const dailyVelocity = unitsSold30d / 30;
    const daysOfCover =
      dailyVelocity > 0 ? Math.round(safeStock / dailyVelocity) : null;
    const target14Days = Math.ceil(dailyVelocity * 14);
    const desiredStock =
      safeStock <= minAlert ? Math.max(minAlert * 2, target14Days) : target14Days;
    const suggestedReorderQty = Math.max(0, roundQuantity(desiredStock - safeStock));

    return {
      product,
      unitsSold30d,
      dailyVelocity,
      daysOfCover,
      suggestedReorderQty,
    };
  });

  const outOfStock = enriched
    .filter((item) => item.product.stock <= 0)
    .sort((a, b) => b.unitsSold30d - a.unitsSold30d);

  const lowStock = enriched
    .filter((item) => item.product.stock > 0 && item.product.stock <= (item.product.minStock ?? 5))
    .sort((a, b) => a.product.stock - b.product.stock);

  const fastMoving = enriched
    .filter((item) => item.unitsSold30d > 0)
    .sort((a, b) => b.unitsSold30d - a.unitsSold30d)
    .slice(0, 8);

  const inStockSortedAsc = enriched
    .filter((item) => item.product.stock > 0)
    .sort((a, b) => {
      if (a.unitsSold30d !== b.unitsSold30d) {
        return a.unitsSold30d - b.unitsSold30d;
      }
      return b.product.stock - a.product.stock;
    });

  const maxUnitsSold = inStockSortedAsc.reduce(
    (max, item) => Math.max(max, item.unitsSold30d),
    0
  );

  const slowMoving = inStockSortedAsc
    .filter((item, idx) => {
      if (item.unitsSold30d === 0) return true;
      if (inStockSortedAsc.length <= 2) return item.unitsSold30d < maxUnitsSold;
      return (
        idx < Math.ceil(inStockSortedAsc.length / 2) &&
        item.unitsSold30d < maxUnitsSold
      );
    })
    .slice(0, 8);

  return {
    lowStock,
    outOfStock,
    fastMoving,
    slowMoving,
  };
}
