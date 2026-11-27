import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  MessageCircle,
  PackageCheck,
  PhoneCall,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShoppingBag,
  Trash2,
  Truck,
  X,
  XCircle,
} from 'lucide-react';
import { formatCurrency, formatDateTime, type TranslationStrings } from '../i18n';
import {
  buildManualWhatsAppFallbackUrl,
  buildOmnichannelNotificationMessage,
  getDefaultStepForUnit,
  resolveProductStockForBranch,
  slugifyStoreName,
} from '../lib/omnichannelOrders';
import { hasRolePermission } from '../lib/rbac';
import {
  formatQuantity,
  formatQuantityWithUnit,
  getUnitLabel,
  roundCurrency,
  roundQuantity,
} from '../lib/unitUtils';
import type {
  Branch,
  Customer,
  EmployeeRole,
  OmnichannelOrder,
  OmnichannelOrderStatus,
  OmnichannelPaymentMethod,
  OmnichannelPaymentStatus,
  OrderChannel,
  Product,
  StoreSettings,
} from '../types';

interface OrderManagementViewProps {
  orders: OmnichannelOrder[];
  products: Product[];
  customers: Customer[];
  branches: Branch[];
  activeBranchId: string;
  activeRole: EmployeeRole;
  customPermissions?: string[] | null;
  storeSettings: StoreSettings;
  whatsappConfigured: boolean;
  onRefreshOrders: () => Promise<void>;
  onCreateOrder: (payload: {
    channel: OrderChannel;
    customerId?: string;
    customerName: string;
    customerPhone: string;
    deliveryAddress: string;
    notes?: string;
    branchId?: string;
    discountAmount?: number;
    paymentMethod: OmnichannelPaymentMethod;
    paymentStatus?: OmnichannelPaymentStatus;
    paidAmount?: number;
    items: Array<{ productId: string; quantity: number }>;
  }) => Promise<{ ok: true; order: OmnichannelOrder } | { ok: false; error: string }>;
  onTransitionStatus: (
    orderId: string,
    targetStatus: OmnichannelOrderStatus,
    reason?: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onUpdatePayment: (
    orderId: string,
    payload: {
      paymentMethod?: OmnichannelPaymentMethod;
      paymentStatus?: OmnichannelPaymentStatus;
      paidAmount?: number;
    }
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onSaveStorefrontSettings: (payload: {
    storefrontSlug: string;
    storefrontEnabled: boolean;
    storefrontDescription: string;
    codEnabled: boolean;
    whatsappPhoneNumberId?: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  t: TranslationStrings;
}

const CHANNEL_BADGE: Record<OrderChannel, string> = {
  website: 'bg-sky-50 text-sky-800 border-sky-200',
  whatsapp: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  phone: 'bg-amber-50 text-amber-800 border-amber-200',
};

const STATUS_BADGE: Record<OmnichannelOrderStatus, string> = {
  new: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  accepted: 'bg-teal-50 text-teal-800 border-teal-200',
  preparing: 'bg-amber-50 text-amber-800 border-amber-200',
  ready: 'bg-sky-50 text-sky-800 border-sky-200',
  delivered: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-700 border-slate-300',
};

export function OrderManagementView({
  orders,
  products,
  customers,
  branches,
  activeBranchId,
  activeRole,
  customPermissions,
  storeSettings,
  whatsappConfigured,
  onRefreshOrders,
  onCreateOrder,
  onTransitionStatus,
  onUpdatePayment,
  onSaveStorefrontSettings,
  t,
}: OrderManagementViewProps) {
  const canCreate = hasRolePermission(activeRole, 'omnichannel.create', customPermissions);
  const canManageStatus = hasRolePermission(activeRole, 'omnichannel.manage_status', customPermissions);
  const canCancel = hasRolePermission(activeRole, 'orders.cancel', customPermissions);
  const canManagePayment = hasRolePermission(activeRole, 'omnichannel.payment', customPermissions);
  const canManageStorefront = hasRolePermission(activeRole, 'storefront.manage', customPermissions);

  const [statusTab, setStatusTab] = useState<'all' | OmnichannelOrderStatus | 'closed'>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | OrderChannel>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | OmnichannelPaymentStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [paymentEditMethod, setPaymentEditMethod] = useState<OmnichannelPaymentMethod>('cod');
  const [paymentEditStatus, setPaymentEditStatus] = useState<OmnichannelPaymentStatus>('cod_pending');
  const [paymentEditAmount, setPaymentEditAmount] = useState('0');

  // Create Phone / Manual WhatsApp Order modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newChannel, setNewChannel] = useState<'phone' | 'whatsapp'>('phone');
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newDeliveryAddress, setNewDeliveryAddress] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newBranchId, setNewBranchId] = useState(activeBranchId || branches[0]?.id || '');
  const [newDiscount, setNewDiscount] = useState('0');
  const [newPayMethod, setNewPayMethod] = useState<OmnichannelPaymentMethod>('cod');
  const [newPaidAmount, setNewPaidAmount] = useState('0');
  const [productPickQuery, setProductPickQuery] = useState('');
  const [draftItems, setDraftItems] = useState<Array<{ productId: string; quantity: number }>>([]);
  const [creating, setCreating] = useState(false);

  // Storefront settings modal
  const [storefrontModalOpen, setStorefrontModalOpen] = useState(false);
  const [sfSlug, setSfSlug] = useState(
    storeSettings.storefrontSlug || slugifyStoreName(storeSettings.storeName)
  );
  const [sfEnabled, setSfEnabled] = useState(Boolean(storeSettings.storefrontEnabled));
  const [sfDesc, setSfDesc] = useState(storeSettings.storefrontDescription || '');
  const [sfCodEnabled, setSfCodEnabled] = useState(storeSettings.codEnabled !== false);
  const [sfWaPhoneId, setSfWaPhoneId] = useState(storeSettings.whatsappPhoneNumberId || '');
  const [savingSf, setSavingSf] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusTab === 'closed') {
        if (o.status !== 'rejected' && o.status !== 'cancelled') return false;
      } else if (statusTab !== 'all' && o.status !== statusTab) {
        return false;
      }
      if (channelFilter !== 'all' && o.channel !== channelFilter) return false;
      if (branchFilter !== 'all' && o.branchId !== branchFilter) return false;
      if (paymentFilter !== 'all' && o.paymentStatus !== paymentFilter) return false;
      if (dateFrom && o.createdAt.slice(0, 10) < dateFrom) return false;
      if (dateTo && o.createdAt.slice(0, 10) > dateTo) return false;
      if (q) {
        const hay = `${o.orderNumber} ${o.customerName} ${o.customerPhone} ${o.deliveryAddress}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, statusTab, channelFilter, branchFilter, paymentFilter, dateFrom, dateTo, searchQuery]);

  const counts = useMemo(() => {
    return {
      all: orders.length,
      new: orders.filter((o) => o.status === 'new').length,
      active: orders.filter((o) =>
        ['accepted', 'preparing', 'ready'].includes(o.status)
      ).length,
      delivered: orders.filter((o) => o.status === 'delivered').length,
      website: orders.filter((o) => o.channel === 'website').length,
      whatsapp: orders.filter((o) => o.channel === 'whatsapp').length,
      phone: orders.filter((o) => o.channel === 'phone').length,
    };
  }, [orders]);

  const openOrderDetail = (order: OmnichannelOrder) => {
    setSelectedOrderId(order.id);
    setCancelReason('');
    setPaymentEditMethod(order.paymentMethod);
    setPaymentEditStatus(order.paymentStatus);
    setPaymentEditAmount(String(order.paidAmount));
    setActionError('');
  };

  const handleStatusChange = async (
    orderId: string,
    targetStatus: OmnichannelOrderStatus,
    reason?: string
  ) => {
    setActionError('');
    setActionSuccess('');
    const res = await onTransitionStatus(orderId, targetStatus, reason);
    if (res.ok === false) {
      setActionError(res.error);
      return;
    }
    setActionSuccess(`Order updated to ${targetStatus.toUpperCase()}.`);
    setCancelReason('');
  };

  const handlePaymentSave = async () => {
    if (!selectedOrder) return;
    setActionError('');
    setActionSuccess('');
    const res = await onUpdatePayment(selectedOrder.id, {
      paymentMethod: paymentEditMethod,
      paymentStatus: paymentEditStatus,
      paidAmount: Number(paymentEditAmount) || 0,
    });
    if (res.ok === false) {
      setActionError(res.error);
      return;
    }
    setActionSuccess('Payment details updated.');
  };

  const draftEstimatedTotal = useMemo(() => {
    const prodMap = new Map(products.map((p) => [p.id, p]));
    let sub = 0;
    let tax = 0;
    for (const item of draftItems) {
      const p = prodMap.get(item.productId);
      if (!p) continue;
      const lineSub = roundCurrency(p.price * item.quantity);
      sub = roundCurrency(sub + lineSub);
      tax = roundCurrency(tax + (lineSub * (p.taxRate || 0)) / 100);
    }
    const disc = Math.min(sub, Math.max(0, roundCurrency(Number(newDiscount) || 0)));
    return roundCurrency(sub - disc + tax);
  }, [draftItems, products, newDiscount]);

  const matchingCatalogProducts = useMemo(() => {
    const q = productPickQuery.trim().toLowerCase();
    return products
      .filter((p) => {
        if (!q) return true;
        return (
          p.nameEn.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q)
        );
      })
      .slice(0, 12);
  }, [products, productPickQuery]);

  const addDraftProduct = (product: Product) => {
    const step = getDefaultStepForUnit(product.sellingUnit);
    setDraftItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: roundQuantity(i.quantity + step) }
            : i
        );
      }
      return [...prev, { productId: product.id, quantity: step }];
    });
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draftItems.length === 0 || creating) return;
    setActionError('');
    setCreating(true);
    const res = await onCreateOrder({
      channel: newChannel,
      customerId: newCustomerId || undefined,
      customerName: newCustomerName.trim(),
      customerPhone: newCustomerPhone.trim(),
      deliveryAddress: newDeliveryAddress.trim() || 'Counter Pickup',
      notes: newNotes.trim() || undefined,
      branchId: newBranchId || undefined,
      discountAmount: Number(newDiscount) || 0,
      paymentMethod: newPayMethod,
      paidAmount: Number(newPaidAmount) || 0,
      items: draftItems,
    });
    setCreating(false);
    if (res.ok === false) {
      setActionError(res.error);
      return;
    }
    setCreateModalOpen(false);
    setDraftItems([]);
    setNewCustomerId('');
    setNewCustomerName('');
    setNewCustomerPhone('');
    setNewDeliveryAddress('');
    setNewNotes('');
    setNewDiscount('0');
    setNewPaidAmount('0');
    setActionSuccess(`Created order ${res.order.orderNumber} (Pending acceptance).`);
  };

  const shareableStorefrontUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?store=${encodeURIComponent(
          storeSettings.storefrontSlug || slugifyStoreName(storeSettings.storeName)
        )}`
      : `/?store=${encodeURIComponent(
          storeSettings.storefrontSlug || slugifyStoreName(storeSettings.storeName)
        )}`;

  const handleSaveStorefront = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSf(true);
    setActionError('');
    const res = await onSaveStorefrontSettings({
      storefrontSlug: slugifyStoreName(sfSlug),
      storefrontEnabled: sfEnabled,
      storefrontDescription: sfDesc.trim(),
      codEnabled: sfCodEnabled,
      whatsappPhoneNumberId: sfWaPhoneId.trim() || undefined,
    });
    setSavingSf(false);
    if (res.ok === false) {
      setActionError(res.error);
      return;
    }
    setStorefrontModalOpen(false);
    setActionSuccess('Storefront settings saved.');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t.omnichannelTitle}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t.omnichannelSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              setRefreshing(true);
              await onRefreshOrders();
              setRefreshing(false);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              setSfSlug(storeSettings.storefrontSlug || slugifyStoreName(storeSettings.storeName));
              setSfEnabled(Boolean(storeSettings.storefrontEnabled));
              setSfDesc(storeSettings.storefrontDescription || '');
              setSfCodEnabled(storeSettings.codEnabled !== false);
              setSfWaPhoneId(storeSettings.whatsappPhoneNumberId || '');
              setStorefrontModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800"
          >
            <Settings2 className="w-3.5 h-3.5 text-teal-700" />
            {t.omnichannelStorefrontBtn}
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-xs"
            >
              <Plus className="w-4 h-4" />
              {t.omnichannelNewOrderBtn}
            </button>
          )}
        </div>
      </div>

      {/* Feedback alerts */}
      {actionError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError('')} className="p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {actionSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button type="button" onClick={() => setActionSuccess('')} className="p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Summary KPIs & Storefront Quick Status */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <p className="text-xs font-medium text-slate-500">New Incoming</p>
          <p className="text-2xl font-bold text-indigo-700 mt-1 tabular-nums">{counts.new}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <p className="text-xs font-medium text-slate-500">In Progress</p>
          <p className="text-2xl font-bold text-teal-700 mt-1 tabular-nums">{counts.active}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <p className="text-xs font-medium text-slate-500">Delivered</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums">{counts.delivered}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <p className="text-xs font-medium text-slate-500">By Channel</p>
          <div className="flex items-center gap-2 mt-1.5 text-xs font-semibold tabular-nums">
            <span className="text-sky-700">Web {counts.website}</span>
            <span className="text-slate-300">·</span>
            <span className="text-emerald-700">WA {counts.whatsapp}</span>
            <span className="text-slate-300">·</span>
            <span className="text-amber-700">Ph {counts.phone}</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 col-span-2 lg:col-span-1">
          <p className="text-xs font-medium text-slate-500">Public Storefront</p>
          <div className="flex items-center justify-between gap-2 mt-1.5">
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-md border ${
                storeSettings.storefrontEnabled
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {storeSettings.storefrontEnabled ? 'LIVE' : 'OFFLINE'}
            </span>
            <a
              href={shareableStorefrontUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"
            >
              Open <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Status Tabs & Multi-Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['all', t.omnichannelStatusAll],
              ['new', t.omnichannelStatusNew],
              ['accepted', t.omnichannelStatusAccepted],
              ['preparing', t.omnichannelStatusPreparing],
              ['ready', t.omnichannelStatusReady],
              ['delivered', t.omnichannelStatusDelivered],
              ['closed', `${t.omnichannelStatusRejected} / ${t.omnichannelStatusCancelled}`],
            ] as const
          ).map(([tabId, label]) => (
            <button
              key={tabId}
              type="button"
              onClick={() => setStatusTab(tabId)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                statusTab === tabId
                  ? 'bg-teal-700 text-white border-teal-700'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Order #, customer name, phone..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg"
            />
          </div>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as 'all' | OrderChannel)}
            aria-label="Filter channel"
            className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
          >
            <option value="all">{t.omnichannelChannelAll}</option>
            <option value="website">{t.omnichannelChannelWebsite}</option>
            <option value="whatsapp">{t.omnichannelChannelWhatsApp}</option>
            <option value="phone">{t.omnichannelChannelPhone}</option>
          </select>
          <select
            value={paymentFilter}
            onChange={(e) =>
              setPaymentFilter(e.target.value as 'all' | OmnichannelPaymentStatus)
            }
            aria-label="Filter payment status"
            className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
          >
            <option value="all">All Payment Statuses</option>
            <option value="cod_pending">{t.omnichannelPayStatusCodPending}</option>
            <option value="unpaid">{t.omnichannelPayStatusUnpaid}</option>
            <option value="partially_paid">{t.omnichannelPayStatusPartial}</option>
            <option value="paid">{t.omnichannelPayStatusPaid}</option>
            <option value="refunded">{t.omnichannelPayStatusRefunded}</option>
          </select>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            aria-label="Filter branch"
            className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
          >
            <option value="all">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="Date from"
              className="w-1/2 px-2 py-2 text-xs border border-slate-200 rounded-lg"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="Date to"
              className="w-1/2 px-2 py-2 text-xs border border-slate-200 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">{t.omnichannelNoOrders}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="py-3 px-4">Order & Channel</th>
                  <th className="py-3 px-4">Customer & Delivery</th>
                  <th className="py-3 px-4">Items</th>
                  <th className="py-3 px-4">Total & Payment</th>
                  <th className="py-3 px-4">Status & Stock</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-4 align-top">
                      <button
                        type="button"
                        onClick={() => openOrderDetail(order)}
                        className="font-bold text-teal-800 hover:underline font-mono"
                      >
                        {order.orderNumber}
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold capitalize ${CHANNEL_BADGE[order.channel]}`}
                        >
                          {order.channel === 'website' && <Globe className="w-3 h-3" />}
                          {order.channel === 'whatsapp' && <MessageCircle className="w-3 h-3" />}
                          {order.channel === 'phone' && <PhoneCall className="w-3 h-3" />}
                          {order.channel}
                        </span>
                        {order.branchName && (
                          <span className="text-[11px] text-slate-500">{order.branchName}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {formatDateTime(order.createdAt)}
                      </p>
                    </td>

                    <td className="py-3.5 px-4 align-top max-w-xs">
                      <p className="font-semibold text-slate-900">{order.customerName}</p>
                      <p className="text-slate-600">{order.customerPhone}</p>
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                        {order.deliveryAddress}
                      </p>
                    </td>

                    <td className="py-3.5 px-4 align-top">
                      <p className="font-semibold text-slate-800">{order.items.length} line(s)</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {order.items
                          .slice(0, 2)
                          .map((i) => `${i.nameEn} (${formatQuantityWithUnit(i.quantity, i.sellingUnit, 'en')})`)
                          .join(', ')}
                        {order.items.length > 2 ? ` +${order.items.length - 2} more` : ''}
                      </p>
                    </td>

                    <td className="py-3.5 px-4 align-top">
                      <p className="text-sm font-bold text-slate-900 tabular-nums">
                        {formatCurrency(order.total)}
                      </p>
                      <p className="text-[11px] text-slate-500 uppercase mt-0.5">
                        {order.paymentMethod.replace('_', ' ')} ·{' '}
                        <span className="font-semibold text-slate-700">
                          {order.paymentStatus.replace('_', ' ')}
                        </span>
                      </p>
                    </td>

                    <td className="py-3.5 px-4 align-top">
                      <span
                        className={`inline-block px-2 py-0.5 rounded border text-[11px] font-bold uppercase ${STATUS_BADGE[order.status]}`}
                      >
                        {order.status}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {order.stockReserved
                          ? 'Stock Reserved'
                          : order.stockRestoredAt
                          ? 'Stock Restored'
                          : 'Stock Pending'}
                      </p>
                    </td>

                    <td className="py-3.5 px-4 align-top text-right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {order.status === 'new' && canManageStatus && (
                          <button
                            type="button"
                            onClick={() => void handleStatusChange(order.id, 'accepted')}
                            className="px-2.5 py-1 rounded-md bg-teal-700 hover:bg-teal-800 text-white font-semibold"
                          >
                            Accept
                          </button>
                        )}
                        {order.status === 'accepted' && canManageStatus && (
                          <button
                            type="button"
                            onClick={() => void handleStatusChange(order.id, 'preparing')}
                            className="px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                          >
                            Prepare
                          </button>
                        )}
                        {(order.status === 'accepted' || order.status === 'preparing') &&
                          canManageStatus && (
                            <button
                              type="button"
                              onClick={() => void handleStatusChange(order.id, 'ready')}
                              className="px-2.5 py-1 rounded-md bg-sky-700 hover:bg-sky-800 text-white font-semibold"
                            >
                              Ready
                            </button>
                          )}
                        {order.status === 'ready' && canManageStatus && (
                          <button
                            type="button"
                            onClick={() => void handleStatusChange(order.id, 'delivered')}
                            className="px-2.5 py-1 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
                          >
                            Deliver
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openOrderDetail(order)}
                          className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold"
                        >
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 font-mono">
                    {selectedOrder.orderNumber}
                  </h2>
                  <span
                    className={`px-2 py-0.5 rounded border text-[11px] font-bold uppercase ${STATUS_BADGE[selectedOrder.status]}`}
                  >
                    {selectedOrder.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Channel: {selectedOrder.channel.toUpperCase()} · Created{' '}
                  {formatDateTime(selectedOrder.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderId(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Close detail"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              {/* Customer & Stock Reservation Banner */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-3.5 space-y-1">
                  <p className="text-[11px] font-bold uppercase text-slate-400">Customer & Delivery</p>
                  <p className="text-sm font-bold text-slate-900">{selectedOrder.customerName}</p>
                  <p className="text-slate-700">{selectedOrder.customerPhone}</p>
                  <p className="text-slate-600">{selectedOrder.deliveryAddress}</p>
                  {selectedOrder.notes && (
                    <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                      Note: {selectedOrder.notes}
                    </p>
                  )}
                </div>

                <div className="border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <p className="text-[11px] font-bold uppercase text-slate-400">Inventory & Lifecycle</p>
                  <div className="flex items-center gap-2">
                    {selectedOrder.stockReserved ? (
                      <PackageCheck className="w-4 h-4 text-teal-700" />
                    ) : (
                      <Clock className="w-4 h-4 text-slate-500" />
                    )}
                    <span className="font-semibold text-slate-800">
                      {selectedOrder.stockReserved
                        ? `Stock Deducted (${formatDateTime(selectedOrder.stockReservedAt || selectedOrder.updatedAt)})`
                        : selectedOrder.stockRestoredAt
                        ? `Stock Restored (${formatDateTime(selectedOrder.stockRestoredAt)})`
                        : 'Stock NOT deducted yet (deducts on Accept)'}
                    </span>
                  </div>
                  {selectedOrder.branchName && (
                    <p className="text-slate-600">Branch: {selectedOrder.branchName}</p>
                  )}
                  {selectedOrder.cancellationReason && (
                    <p className="text-rose-700">Reason: {selectedOrder.cancellationReason}</p>
                  )}
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500 uppercase">
                    <tr>
                      <th className="py-2 px-3">Item</th>
                      <th className="py-2 px-3">Qty</th>
                      <th className="py-2 px-3">Rate</th>
                      <th className="py-2 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedOrder.items.map((item, idx) => (
                      <tr key={`${item.productId}-${idx}`}>
                        <td className="py-2 px-3 font-medium text-slate-900">
                          {item.nameEn} <span className="text-slate-400">({item.sku})</span>
                        </td>
                        <td className="py-2 px-3 tabular-nums">
                          {formatQuantityWithUnit(item.quantity, item.sellingUnit, 'en')}
                        </td>
                        <td className="py-2 px-3 tabular-nums">{formatCurrency(item.unitPrice)}</td>
                        <td className="py-2 px-3 text-right font-semibold tabular-nums">
                          {formatCurrency(item.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex flex-wrap justify-end gap-6 text-xs">
                  <span>Subtotal: <strong className="tabular-nums">{formatCurrency(selectedOrder.subtotal)}</strong></span>
                  {selectedOrder.discountAmount > 0 && (
                    <span>Discount: <strong className="tabular-nums">-{formatCurrency(selectedOrder.discountAmount)}</strong></span>
                  )}
                  {selectedOrder.taxAmount > 0 && (
                    <span>Tax: <strong className="tabular-nums">{formatCurrency(selectedOrder.taxAmount)}</strong></span>
                  )}
                  <span className="text-sm text-teal-800">
                    Total: <strong className="tabular-nums">{formatCurrency(selectedOrder.total)}</strong>
                  </span>
                </div>
              </div>

              {/* Workflow Actions & Cancel/Reject */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <p className="text-[11px] font-bold uppercase text-slate-400">Order Workflow</p>
                <div className="flex flex-wrap gap-2">
                  {selectedOrder.status === 'new' && canManageStatus && (
                    <button
                      type="button"
                      onClick={() => void handleStatusChange(selectedOrder.id, 'accepted')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Accept & Reserve Stock
                    </button>
                  )}
                  {selectedOrder.status === 'accepted' && canManageStatus && (
                    <button
                      type="button"
                      onClick={() => void handleStatusChange(selectedOrder.id, 'preparing')}
                      className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                    >
                      Move to Preparing
                    </button>
                  )}
                  {(selectedOrder.status === 'accepted' || selectedOrder.status === 'preparing') &&
                    canManageStatus && (
                      <button
                        type="button"
                        onClick={() => void handleStatusChange(selectedOrder.id, 'ready')}
                        className="px-3.5 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white font-semibold"
                      >
                        Mark Ready
                      </button>
                    )}
                  {selectedOrder.status === 'ready' && canManageStatus && (
                    <button
                      type="button"
                      onClick={() => void handleStatusChange(selectedOrder.id, 'delivered')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
                    >
                      <Truck className="w-4 h-4" /> Mark Delivered
                    </button>
                  )}

                  {!['delivered', 'rejected', 'cancelled'].includes(selectedOrder.status) &&
                    canCancel && (
                      <div className="flex items-center gap-2 ml-auto">
                        <input
                          type="text"
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Reason (optional)"
                          className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                        />
                        {selectedOrder.status === 'new' && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleStatusChange(selectedOrder.id, 'rejected', cancelReason)
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            void handleStatusChange(selectedOrder.id, 'cancelled', cancelReason)
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 font-semibold"
                        >
                          Cancel Order
                        </button>
                      </div>
                    )}
                </div>
              </div>

              {/* Payment Update */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <p className="text-[11px] font-bold uppercase text-slate-400">Payment Tracking</p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Method
                    </label>
                    <select
                      value={paymentEditMethod}
                      disabled={!canManagePayment}
                      onChange={(e) =>
                        setPaymentEditMethod(e.target.value as OmnichannelPaymentMethod)
                      }
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="cod">Cash on Delivery</option>
                      <option value="cash">Cash</option>
                      <option value="jazzcash">JazzCash</option>
                      <option value="easypaisa">EasyPaisa</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="card">POS Card</option>
                      <option value="udhaar">Udhaar</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Payment Status
                    </label>
                    <select
                      value={paymentEditStatus}
                      disabled={!canManagePayment}
                      onChange={(e) =>
                        setPaymentEditStatus(e.target.value as OmnichannelPaymentStatus)
                      }
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="cod_pending">COD Pending</option>
                      <option value="unpaid">Unpaid</option>
                      <option value="partially_paid">Partially Paid</option>
                      <option value="paid">Paid</option>
                      <option value="refunded">Refunded</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Paid Amount (Rs.)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={selectedOrder.total}
                      disabled={!canManagePayment}
                      value={paymentEditAmount}
                      onChange={(e) => setPaymentEditAmount(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg tabular-nums"
                    />
                  </div>
                  {canManagePayment && (
                    <button
                      type="button"
                      onClick={() => void handlePaymentSave()}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold"
                    >
                      Save Payment
                    </button>
                  )}
                </div>
              </div>

              {/* WhatsApp Notification & Status Timeline */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase text-slate-400">
                      Customer Notifications
                    </p>
                    <a
                      href={buildManualWhatsAppFallbackUrl(
                        selectedOrder.customerPhone,
                        buildOmnichannelNotificationMessage(
                          storeSettings.storeName,
                          selectedOrder,
                          selectedOrder.status === 'delivered'
                            ? 'order_delivered'
                            : selectedOrder.status === 'ready'
                            ? 'order_ready'
                            : selectedOrder.status === 'accepted'
                            ? 'order_accepted'
                            : 'new_order'
                        )
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Send via WhatsApp
                    </a>
                  </div>
                  {selectedOrder.notificationLog.length === 0 ? (
                    <p className="text-slate-500">No notifications logged yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {selectedOrder.notificationLog.map((n) => (
                        <div key={n.id} className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                          <div className="flex items-center justify-between font-semibold">
                            <span>{n.event.replace('_', ' ')}</span>
                            <span
                              className={
                                n.status === 'sent' ? 'text-emerald-700' : 'text-amber-700'
                              }
                            >
                              {n.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5">{n.messagePreview}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <p className="text-[11px] font-bold uppercase text-slate-400">Status History</p>
                  <div className="space-y-2">
                    {selectedOrder.statusHistory.map((h, i) => (
                      <div key={i} className="border-l-2 border-teal-600 pl-2.5">
                        <p className="font-semibold text-slate-900 uppercase text-[11px]">
                          {h.status} · <span className="text-slate-600 font-normal">{h.actorName} ({h.actorRole})</span>
                        </p>
                        <p className="text-[11px] text-slate-400">{formatDateTime(h.changedAt)}</p>
                        {h.note && <p className="text-[11px] text-slate-600">{h.note}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Phone / Manual WhatsApp Order Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">{t.omnichannelNewOrderBtn}</h2>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewChannel('phone')}
                  className={`py-2 px-3 rounded-lg border font-semibold flex items-center justify-center gap-1.5 ${
                    newChannel === 'phone'
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  <PhoneCall className="w-4 h-4" /> Phone Order
                </button>
                <button
                  type="button"
                  onClick={() => setNewChannel('whatsapp')}
                  className={`py-2 px-3 rounded-lg border font-semibold flex items-center justify-center gap-1.5 ${
                    newChannel === 'whatsapp'
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  <MessageCircle className="w-4 h-4" /> WhatsApp (Manual)
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Existing Customer (Optional)
                  </label>
                  <select
                    value={newCustomerId}
                    onChange={(e) => {
                      const cid = e.target.value;
                      setNewCustomerId(cid);
                      const found = customers.find((c) => c.id === cid);
                      if (found) {
                        setNewCustomerName(found.name);
                        setNewCustomerPhone(found.phone);
                        setNewDeliveryAddress(found.address || '');
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">-- New / Walk-in Customer --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Branch</label>
                  <select
                    value={newBranchId}
                    onChange={(e) => setNewBranchId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Customer Name *</label>
                  <input
                    type="text"
                    required
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Delivery Address</label>
                <input
                  type="text"
                  value={newDeliveryAddress}
                  onChange={(e) => setNewDeliveryAddress(e.target.value)}
                  placeholder="Address or Counter Pickup"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              {/* Add Products */}
              <div className="border border-slate-200 rounded-xl p-3 space-y-2.5">
                <input
                  type="text"
                  value={productPickQuery}
                  onChange={(e) => setProductPickQuery(e.target.value)}
                  placeholder="Search product by name, SKU or barcode to add..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
                <div className="max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {matchingCatalogProducts.map((p) => {
                    const avail = resolveProductStockForBranch(p, newBranchId || undefined);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={avail <= 0}
                        onClick={() => addDraftProduct(p)}
                        className="text-left px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-teal-50 disabled:opacity-50 flex items-center justify-between gap-2"
                      >
                        <span className="truncate font-medium text-slate-800">{p.nameEn}</span>
                        <span className="text-[11px] text-teal-800 font-semibold shrink-0 tabular-nums">
                          {formatCurrency(p.price)} ({formatQuantity(avail)} {getUnitLabel(p.sellingUnit, 'en')})
                        </span>
                      </button>
                    );
                  })}
                </div>

                {draftItems.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    {draftItems.map((item) => {
                      const p = products.find((x) => x.id === item.productId);
                      if (!p) return null;
                      const step = getDefaultStepForUnit(p.sellingUnit);
                      return (
                        <div
                          key={item.productId}
                          className="flex items-center justify-between gap-2 bg-slate-50 px-2.5 py-1.5 rounded-lg"
                        >
                          <span className="font-semibold text-slate-800 truncate">{p.nameEn}</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step={step}
                              min={step}
                              value={item.quantity}
                              onChange={(e) => {
                                const q = roundQuantity(Number(e.target.value) || 0);
                                setDraftItems((prev) =>
                                  prev
                                    .map((x) =>
                                      x.productId === item.productId ? { ...x, quantity: q } : x
                                    )
                                    .filter((x) => x.quantity > 0)
                                );
                              }}
                              className="w-20 px-2 py-1 border border-slate-300 rounded text-right tabular-nums"
                            />
                            <span className="text-slate-500">{getUnitLabel(p.sellingUnit, 'en')}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setDraftItems((prev) =>
                                  prev.filter((x) => x.productId !== item.productId)
                                )
                              }
                              className="text-rose-600 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={newPayMethod}
                    onChange={(e) => setNewPayMethod(e.target.value as OmnichannelPaymentMethod)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="cod">Cash on Delivery</option>
                    <option value="cash">Cash</option>
                    <option value="jazzcash">JazzCash</option>
                    <option value="easypaisa">EasyPaisa</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="udhaar">Udhaar</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Discount (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    value={newDiscount}
                    onChange={(e) => setNewDiscount(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Paid Upfront (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    value={newPaidAmount}
                    onChange={(e) => setNewPaidAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                <span className="text-sm font-bold text-slate-900 tabular-nums">
                  Order Total: {formatCurrency(draftEstimatedTotal)}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="px-4 py-2 rounded-lg border border-slate-200 font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating || draftItems.length === 0}
                    className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-semibold"
                  >
                    {creating ? 'Creating...' : 'Create Order'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Storefront & WhatsApp Settings Modal */}
      {storefrontModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                Public Online Storefront & Channels
              </h2>
              <button
                type="button"
                onClick={() => setStorefrontModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStorefront} className="p-6 space-y-4 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
                <p className="font-semibold text-slate-700">Customer Storefront Link</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareableStorefrontUrl}
                    className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-[11px]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(shareableStorefrontUrl);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 1800);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 font-semibold"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedLink ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2.5 font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={sfEnabled}
                  disabled={!canManageStorefront}
                  onChange={(e) => setSfEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-teal-700"
                />
                Enable Public Online Storefront
              </label>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Storefront Slug</label>
                <input
                  type="text"
                  required
                  disabled={!canManageStorefront}
                  value={sfSlug}
                  onChange={(e) => setSfSlug(e.target.value)}
                  placeholder="my-shop-name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Public Store Description
                </label>
                <textarea
                  rows={2}
                  disabled={!canManageStorefront}
                  value={sfDesc}
                  onChange={(e) => setSfDesc(e.target.value)}
                  placeholder="Delivery hours, areas covered..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <label className="flex items-center gap-2.5 font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={sfCodEnabled}
                  disabled={!canManageStorefront}
                  onChange={(e) => setSfCodEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-teal-700"
                />
                Accept Cash on Delivery (COD)
              </label>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Meta WhatsApp Phone Number ID (Optional Webhook Routing)
                </label>
                <input
                  type="text"
                  disabled={!canManageStorefront}
                  value={sfWaPhoneId}
                  onChange={(e) => setSfWaPhoneId(e.target.value)}
                  placeholder="Leave blank if using manual WhatsApp orders"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900 space-y-1">
                <p className="font-bold">Channel Integration Status:</p>
                <p>
                  • WhatsApp Cloud API:{' '}
                  {whatsappConfigured
                    ? 'Configured on server'
                    : 'Not configured (manual WhatsApp orders & wa.me fallback active)'}
                </p>
                <p>• Automated Online Card Gateway: Not configured (COD / Bank / Wallet supported)</p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStorefrontModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 font-semibold text-slate-700"
                >
                  Close
                </button>
                {canManageStorefront && (
                  <button
                    type="submit"
                    disabled={savingSf}
                    className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold"
                  >
                    {savingSf ? 'Saving...' : 'Save Storefront'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
