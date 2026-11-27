import type {
  EmployeeRole,
  InventoryAdjustment,
  OmnichannelNotificationEntry,
  OmnichannelOrder,
  OmnichannelOrderItem,
  OmnichannelOrderStatus,
  OmnichannelPaymentMethod,
  OmnichannelPaymentStatus,
  OmnichannelStatusHistoryEntry,
  OrderChannel,
  Product,
} from '../types';
import { generateUuid } from './idUtils';
import { formatQuantity, getUnitLabel, roundCurrency, roundQuantity } from './unitUtils';
import { buildManualWhatsAppUrl } from './whatsappService';

export function getDefaultStepForUnit(unit: Product['sellingUnit']): number {
  switch (unit) {
    case 'kg':
    case 'litre':
    case 'metre':
      return 0.25;
    case 'g':
    case 'ml':
    case 'cm':
      return 10;
    default:
      return 1;
  }
}

export const OMNICHANNEL_STATUS_TRANSITIONS: Record<
  OmnichannelOrderStatus,
  OmnichannelOrderStatus[]
> = {
  new: ['accepted', 'rejected', 'cancelled'],
  accepted: ['preparing', 'ready', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  rejected: [],
  cancelled: [],
};

export function isValidOmnichannelTransition(
  fromStatus: OmnichannelOrderStatus,
  toStatus: OmnichannelOrderStatus
): boolean {
  if (fromStatus === toStatus) return false;
  return OMNICHANNEL_STATUS_TRANSITIONS[fromStatus]?.includes(toStatus) ?? false;
}

export function slugifyStoreName(input: string): string {
  const cleaned = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'my-shop';
}

export function generateOmnichannelOrderNumber(
  channel: OrderChannel,
  now = new Date()
): string {
  const prefix =
    channel === 'website' ? 'WEB' : channel === 'whatsapp' ? 'WA' : 'PHN';
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `${prefix}-${y}${m}${d}-${rand}`;
}

export function resolveProductStockForBranch(
  product: Pick<Product, 'stock' | 'branchStock'>,
  branchId?: string
): number {
  if (
    branchId &&
    product.branchStock &&
    Object.prototype.hasOwnProperty.call(product.branchStock, branchId)
  ) {
    return roundQuantity(Number(product.branchStock[branchId] ?? 0));
  }
  return roundQuantity(Number(product.stock ?? 0));
}

export interface RawOrderItemInput {
  productId: string;
  quantity: number;
}

export function calculateOmnichannelOrderTotals(
  rawItems: RawOrderItemInput[],
  productsById: Map<string, Product>,
  options?: { discountAmount?: number; branchId?: string }
):
  | {
      ok: true;
      items: OmnichannelOrderItem[];
      subtotal: number;
      discountAmount: number;
      taxAmount: number;
      total: number;
    }
  | { ok: false; code: string; error: string } {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, code: 'EMPTY_ITEMS', error: 'Order must include at least one item.' };
  }

  // Merge duplicate productIds cleanly so stock validation is accurate
  const mergedQty = new Map<string, number>();
  for (const row of rawItems) {
    const productId = String(row.productId || '').trim();
    const qty = roundQuantity(Number(row.quantity));
    if (!productId || !Number.isFinite(qty) || qty <= 0) {
      return {
        ok: false,
        code: 'INVALID_QUANTITY',
        error: 'All items must have a valid product and quantity greater than 0.',
      };
    }
    mergedQty.set(productId, roundQuantity((mergedQty.get(productId) ?? 0) + qty));
  }

  const items: OmnichannelOrderItem[] = [];
  let subtotal = 0;
  let taxAmount = 0;

  for (const [productId, quantity] of mergedQty.entries()) {
    const product = productsById.get(productId);
    if (!product) {
      return {
        ok: false,
        code: 'PRODUCT_NOT_FOUND',
        error: `Selected product (${productId}) was not found in this shop catalog.`,
      };
    }

    const available = resolveProductStockForBranch(product, options?.branchId);
    if (available <= 0) {
      return {
        ok: false,
        code: 'OUT_OF_STOCK',
        error: `${product.nameEn} is currently out of stock.`,
      };
    }

    const unitPrice = roundCurrency(Number(product.price || 0));
    const taxRate = Math.max(0, Number(product.taxRate || 0));
    const lineSubtotal = roundCurrency(unitPrice * quantity);
    const lineTax = roundCurrency((lineSubtotal * taxRate) / 100);
    const lineTotal = roundCurrency(lineSubtotal + lineTax);

    subtotal = roundCurrency(subtotal + lineSubtotal);
    taxAmount = roundCurrency(taxAmount + lineTax);

    items.push({
      productId: product.id,
      sku: product.sku,
      nameEn: product.nameEn,
      nameUr: product.nameUr,
      category: product.category,
      sellingUnit: product.sellingUnit,
      quantity,
      unitPrice,
      taxRate,
      lineTotal,
    });
  }

  const requestedDiscount = Math.max(0, roundCurrency(Number(options?.discountAmount ?? 0)));
  const discountAmount = Math.min(requestedDiscount, subtotal);
  const total = Math.max(0, roundCurrency(subtotal - discountAmount + taxAmount));

  return {
    ok: true,
    items,
    subtotal,
    discountAmount,
    taxAmount,
    total,
  };
}

export function applyOmnichannelStockReservation(
  order: OmnichannelOrder,
  products: Product[],
  actorName: string,
  nowIso = new Date().toISOString()
):
  | {
      ok: true;
      updatedProducts: Product[];
      adjustments: InventoryAdjustment[];
    }
  | { ok: false; code: string; error: string } {
  if (order.stockReserved) {
    return {
      ok: false,
      code: 'ALREADY_RESERVED',
      error: 'Stock has already been reserved/deducted for this order.',
    };
  }

  const productMap = new Map(products.map((p) => [p.id, p]));
  const branchId = order.branchId;

  // Pass 1: validate every line item before any mutation
  for (const item of order.items) {
    const qty = roundQuantity(Number(item.quantity));
    if (qty <= 0) {
      return {
        ok: false,
        code: 'INVALID_QUANTITY',
        error: `Order item ${item.nameEn} has an invalid quantity.`,
      };
    }
    const product = productMap.get(item.productId);
    if (!product) {
      return {
        ok: false,
        code: 'PRODUCT_NOT_FOUND',
        error: `Product ${item.nameEn} no longer exists in inventory.`,
      };
    }
    const available = resolveProductStockForBranch(product, branchId);
    if (available + 0.0001 < qty) {
      const unitLabel = getUnitLabel(product.sellingUnit, 'en');
      return {
        ok: false,
        code: 'INSUFFICIENT_STOCK',
        error: `Insufficient stock for ${product.nameEn}: available ${formatQuantity(available)} ${unitLabel}, requested ${formatQuantity(qty)} ${unitLabel}.`,
      };
    }
  }

  // Pass 2: deduct atomically
  const adjustments: InventoryAdjustment[] = [];
  const qtyByProduct = new Map<string, number>();
  for (const item of order.items) {
    qtyByProduct.set(
      item.productId,
      roundQuantity((qtyByProduct.get(item.productId) ?? 0) + Number(item.quantity))
    );
  }

  const updatedProducts = products.map((product) => {
    const qty = qtyByProduct.get(product.id);
    if (!qty) return product;

    const prevGlobal = roundQuantity(Number(product.stock ?? 0));
    const nextGlobal = Math.max(0, roundQuantity(prevGlobal - qty));
    const nextBranchStock = product.branchStock ? { ...product.branchStock } : undefined;
    let prevTracked = prevGlobal;
    let nextTracked = nextGlobal;

    if (
      branchId &&
      nextBranchStock &&
      Object.prototype.hasOwnProperty.call(nextBranchStock, branchId)
    ) {
      prevTracked = roundQuantity(Number(nextBranchStock[branchId] ?? 0));
      nextTracked = Math.max(0, roundQuantity(prevTracked - qty));
      nextBranchStock[branchId] = nextTracked;
    }

    adjustments.push({
      id: generateUuid(),
      productId: product.id,
      productName: product.nameEn,
      sku: product.sku,
      sellingUnit: product.sellingUnit,
      branchId,
      adjustmentType: 'Sale Stock Out',
      quantityChange: -qty,
      previousStock: prevTracked,
      newStock: nextTracked,
      reason: `Omnichannel Order Accepted: ${order.orderNumber}`,
      actorName,
      createdAt: nowIso,
    });

    return {
      ...product,
      stock: nextGlobal,
      branchStock: nextBranchStock,
    };
  });

  return {
    ok: true,
    updatedProducts,
    adjustments,
  };
}

export function applyOmnichannelStockRestoration(
  order: OmnichannelOrder,
  products: Product[],
  actorName: string,
  targetStatus: 'cancelled' | 'rejected',
  nowIso = new Date().toISOString()
): {
  ok: true;
  restored: boolean;
  updatedProducts: Product[];
  adjustments: InventoryAdjustment[];
} {
  // Never restore stock if it was never reserved OR was already restored
  if (!order.stockReserved || order.stockRestoredAt) {
    return {
      ok: true,
      restored: false,
      updatedProducts: products,
      adjustments: [],
    };
  }

  const branchId = order.branchId;
  const qtyByProduct = new Map<string, number>();
  for (const item of order.items) {
    const qty = roundQuantity(Number(item.quantity));
    if (qty > 0) {
      qtyByProduct.set(item.productId, roundQuantity((qtyByProduct.get(item.productId) ?? 0) + qty));
    }
  }

  const adjustments: InventoryAdjustment[] = [];
  const label = targetStatus === 'rejected' ? 'Rejected' : 'Cancelled';

  const updatedProducts = products.map((product) => {
    const qty = qtyByProduct.get(product.id);
    if (!qty) return product;

    const prevGlobal = roundQuantity(Number(product.stock ?? 0));
    const nextGlobal = roundQuantity(prevGlobal + qty);
    const nextBranchStock = product.branchStock ? { ...product.branchStock } : undefined;
    let prevTracked = prevGlobal;
    let nextTracked = nextGlobal;

    if (
      branchId &&
      nextBranchStock &&
      Object.prototype.hasOwnProperty.call(nextBranchStock, branchId)
    ) {
      prevTracked = roundQuantity(Number(nextBranchStock[branchId] ?? 0));
      nextTracked = roundQuantity(prevTracked + qty);
      nextBranchStock[branchId] = nextTracked;
    }

    adjustments.push({
      id: generateUuid(),
      productId: product.id,
      productName: product.nameEn,
      sku: product.sku,
      sellingUnit: product.sellingUnit,
      branchId,
      adjustmentType: 'Sale Return In',
      quantityChange: qty,
      previousStock: prevTracked,
      newStock: nextTracked,
      reason: `Omnichannel Order ${label}: ${order.orderNumber}`,
      actorName,
      createdAt: nowIso,
    });

    return {
      ...product,
      stock: nextGlobal,
      branchStock: nextBranchStock,
    };
  });

  return {
    ok: true,
    restored: true,
    updatedProducts,
    adjustments,
  };
}

export function transitionOmnichannelOrderStatus(params: {
  order: OmnichannelOrder;
  targetStatus: OmnichannelOrderStatus;
  actor: { id: string; name: string; role: EmployeeRole };
  products: Product[];
  reason?: string;
  notificationEntry?: OmnichannelNotificationEntry;
  nowIso?: string;
}):
  | {
      ok: true;
      order: OmnichannelOrder;
      updatedProducts: Product[];
      adjustments: InventoryAdjustment[];
      didReserveStock: boolean;
      didRestoreStock: boolean;
    }
  | { ok: false; code: string; error: string } {
  const { order, targetStatus, actor, products, reason, notificationEntry } = params;
  const nowIso = params.nowIso ?? new Date().toISOString();

  if (!isValidOmnichannelTransition(order.status, targetStatus)) {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      error: `Cannot move order ${order.orderNumber} from "${order.status}" to "${targetStatus}".`,
    };
  }

  let updatedProducts = products;
  let adjustments: InventoryAdjustment[] = [];
  let stockReserved = order.stockReserved;
  let stockReservedAt = order.stockReservedAt;
  let stockRestoredAt = order.stockRestoredAt;
  let didReserveStock = false;
  let didRestoreStock = false;

  if (targetStatus === 'accepted') {
    const reserveRes = applyOmnichannelStockReservation(order, products, actor.name, nowIso);
    if (!reserveRes.ok) {
      return reserveRes;
    }
    updatedProducts = reserveRes.updatedProducts;
    adjustments = reserveRes.adjustments;
    stockReserved = true;
    stockReservedAt = nowIso;
    didReserveStock = true;
  } else if (targetStatus === 'cancelled' || targetStatus === 'rejected') {
    const restoreRes = applyOmnichannelStockRestoration(
      order,
      products,
      actor.name,
      targetStatus,
      nowIso
    );
    updatedProducts = restoreRes.updatedProducts;
    adjustments = restoreRes.adjustments;
    if (restoreRes.restored) {
      stockReserved = false;
      stockRestoredAt = nowIso;
      didRestoreStock = true;
    }
  }

  const historyEntry: OmnichannelStatusHistoryEntry = {
    status: targetStatus,
    changedAt: nowIso,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    note: reason?.trim() || undefined,
  };

  const updatedOrder: OmnichannelOrder = {
    ...order,
    status: targetStatus,
    stockReserved,
    stockReservedAt,
    stockRestoredAt,
    cancellationReason:
      targetStatus === 'cancelled' || targetStatus === 'rejected'
        ? reason?.trim() || order.cancellationReason
        : order.cancellationReason,
    statusHistory: [...(order.statusHistory ?? []), historyEntry],
    notificationLog: notificationEntry
      ? [...(order.notificationLog ?? []), notificationEntry]
      : [...(order.notificationLog ?? [])],
    updatedBy: actor.name,
    updatedAt: nowIso,
  };

  return {
    ok: true,
    order: updatedOrder,
    updatedProducts,
    adjustments,
    didReserveStock,
    didRestoreStock,
  };
}

export function buildOmnichannelNotificationMessage(
  storeName: string,
  order: Pick<OmnichannelOrder, 'orderNumber' | 'customerName' | 'total' | 'paymentMethod'>,
  event: OmnichannelNotificationEntry['event']
): string {
  const totalText = `Rs. ${Math.round(order.total).toLocaleString('en-PK')}`;
  switch (event) {
    case 'new_order':
      return `Assalam-o-Alaikum ${order.customerName}! ${storeName} received your order ${order.orderNumber} (${totalText}). We will confirm shortly.`;
    case 'order_accepted':
      return `Good news ${order.customerName}! Your ${storeName} order ${order.orderNumber} (${totalText}) has been ACCEPTED and is being packed.`;
    case 'order_ready':
      return `${storeName}: Your order ${order.orderNumber} (${totalText}) is READY for dispatch/pickup!`;
    case 'order_delivered':
      return `${storeName}: Your order ${order.orderNumber} (${totalText}) has been DELIVERED. Thank you for shopping with us!`;
  }
}

export function buildManualWhatsAppFallbackUrl(phone: string, text: string): string {
  return buildManualWhatsAppUrl(phone, text);
}

export function normalizeOmnichannelPaymentDefaults(
  method: OmnichannelPaymentMethod,
  requestedStatus?: OmnichannelPaymentStatus,
  onlineGatewayConfigured = false
):
  | { ok: true; paymentMethod: OmnichannelPaymentMethod; paymentStatus: OmnichannelPaymentStatus }
  | { ok: false; error: string } {
  if (method === 'online' && !onlineGatewayConfigured) {
    return {
      ok: false,
      error:
        'Online card payment gateway is not configured on this server. Please choose Cash on Delivery or another configured payment method.',
    };
  }
  if (method === 'cod') {
    return {
      ok: true,
      paymentMethod: 'cod',
      paymentStatus: requestedStatus ?? 'cod_pending',
    };
  }
  return {
    ok: true,
    paymentMethod: method,
    paymentStatus: requestedStatus ?? 'unpaid',
  };
}

export function parseWhatsAppOrderMessageText(
  messageText: string,
  products: Product[]
): { items: RawOrderItemInput[]; unmatchedLines: string[] } {
  const lines = messageText
    .split(/\r?\n|,+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items: RawOrderItemInput[] = [];
  const unmatchedLines: string[] = [];

  for (const line of lines) {
    // Match forms like "2x BEV-101", "1.5 kg Sugar", "Sugar x 2", "2 Sugar"
    let qty = 1;
    let query = line;

    const prefixMatch = line.match(/^(\d+(?:\.\d+)?)\s*(?:x|kg|g|l|ltr|litre|pcs|piece|pack|box|dozen)?\s+(.+)$/i);
    const suffixMatch = line.match(/^(.+?)\s*(?:x|\*)\s*(\d+(?:\.\d+)?)$/i);
    if (prefixMatch) {
      qty = roundQuantity(Number(prefixMatch[1]));
      query = prefixMatch[2].trim();
    } else if (suffixMatch) {
      query = suffixMatch[1].trim();
      qty = roundQuantity(Number(suffixMatch[2]));
    }

    const qLower = query.toLowerCase();
    const matched = products.find(
      (p) =>
        p.sku.toLowerCase() === qLower ||
        p.barcode.toLowerCase() === qLower ||
        p.nameEn.toLowerCase() === qLower ||
        p.nameEn.toLowerCase().includes(qLower)
    );

    if (matched && qty > 0) {
      items.push({ productId: matched.id, quantity: qty });
    } else {
      unmatchedLines.push(line);
    }
  }

  return { items, unmatchedLines };
}

export interface OmnichannelAnalyticsSummary {
  totalOrders: number;
  dailyOrders: number;
  weeklyOrders: number;
  monthlyOrders: number;
  byChannel: Record<OrderChannel, { orders: number; revenue: number; delivered: number; cancelled: number }>;
  statusCounts: Record<OmnichannelOrderStatus, number>;
  acceptedOrProgressedCount: number;
  deliveredCount: number;
  cancelledOrRejectedCount: number;
  acceptanceRate: number;
  cancellationRate: number;
  codCount: number;
  codRevenue: number;
  prepaidCount: number;
  prepaidRevenue: number;
}

export function computeOmnichannelAnalytics(
  orders: OmnichannelOrder[],
  now = new Date()
): OmnichannelAnalyticsSummary {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = dayStart - 6 * 86_400_000;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const byChannel: OmnichannelAnalyticsSummary['byChannel'] = {
    website: { orders: 0, revenue: 0, delivered: 0, cancelled: 0 },
    whatsapp: { orders: 0, revenue: 0, delivered: 0, cancelled: 0 },
    phone: { orders: 0, revenue: 0, delivered: 0, cancelled: 0 },
  };

  const statusCounts: Record<OmnichannelOrderStatus, number> = {
    new: 0,
    accepted: 0,
    preparing: 0,
    ready: 0,
    delivered: 0,
    rejected: 0,
    cancelled: 0,
  };

  let dailyOrders = 0;
  let weeklyOrders = 0;
  let monthlyOrders = 0;
  let codCount = 0;
  let codRevenue = 0;
  let prepaidCount = 0;
  let prepaidRevenue = 0;

  for (const order of orders) {
    const ts = new Date(order.createdAt).getTime();
    if (Number.isFinite(ts)) {
      if (ts >= dayStart) dailyOrders += 1;
      if (ts >= weekStart) weeklyOrders += 1;
      if (ts >= monthStart) monthlyOrders += 1;
    }

    statusCounts[order.status] = (statusCounts[order.status] ?? 0) + 1;
    const ch = byChannel[order.channel];
    ch.orders += 1;

    const isClosedLost = order.status === 'cancelled' || order.status === 'rejected';
    if (!isClosedLost) {
      ch.revenue = roundCurrency(ch.revenue + order.total);
    }
    if (order.status === 'delivered') {
      ch.delivered += 1;
    }
    if (isClosedLost) {
      ch.cancelled += 1;
    }

    if (!isClosedLost) {
      if (order.paymentMethod === 'cod' || order.paymentStatus === 'cod_pending') {
        codCount += 1;
        codRevenue = roundCurrency(codRevenue + order.total);
      } else {
        prepaidCount += 1;
        prepaidRevenue = roundCurrency(prepaidRevenue + order.total);
      }
    }
  }

  const totalOrders = orders.length;
  const acceptedOrProgressedCount =
    statusCounts.accepted +
    statusCounts.preparing +
    statusCounts.ready +
    statusCounts.delivered;
  const deliveredCount = statusCounts.delivered;
  const cancelledOrRejectedCount = statusCounts.cancelled + statusCounts.rejected;

  return {
    totalOrders,
    dailyOrders,
    weeklyOrders,
    monthlyOrders,
    byChannel,
    statusCounts,
    acceptedOrProgressedCount,
    deliveredCount,
    cancelledOrRejectedCount,
    acceptanceRate: totalOrders > 0 ? Math.round((acceptedOrProgressedCount / totalOrders) * 100) : 0,
    cancellationRate: totalOrders > 0 ? Math.round((cancelledOrRejectedCount / totalOrders) * 100) : 0,
    codCount,
    codRevenue,
    prepaidCount,
    prepaidRevenue,
  };
}
