import { useMemo, useState } from 'react';
import {
  Banknote,
  FileText,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Printer,
  Search,
  Trash2,
  User,
  X,
} from 'lucide-react';
import {
  formatCurrency,
  formatDateTime,
  getPaymentLabel,
  type TranslationStrings,
} from '../i18n';
import type { Customer, Language, OrderRecord, StoreSettings, UdhaarEntry } from '../types';
import { buildUdhaarWhatsAppUrl } from './UdhaarView';

interface CustomersViewProps {
  storeName: string;
  customers: Customer[];
  orders: OrderRecord[];
  entries?: UdhaarEntry[];
  storeSettings?: StoreSettings;
  canDelete: boolean;
  onAddCustomer: (payload: {
    name: string;
    phone: string;
    address: string;
    balance: number;
    creditLimit?: number;
    discountPercent?: number;
    whatsappOptIn?: boolean;
  }) => Customer;
  onUpdateCustomer: (customer: Customer) => void;
  onDeleteCustomer: (customerId: string) => void;
  onRecordPayment: (customerId: string, amount: number) => void;
  onPrintReceipt: (order: OrderRecord) => void;
  onSendWhatsAppMessage?: (
    customer: Customer,
    type: 'reminder' | 'statement'
  ) => Promise<{ manualUrl?: string; statusText?: string }>;
  lang: Language;
  t: TranslationStrings;
}

interface CustomerFormState {
  name: string;
  phone: string;
  address: string;
  balance: string;
  creditLimit: string;
  discountPercent: string;
  whatsappOptIn: boolean;
}

const EMPTY_FORM: CustomerFormState = {
  name: '',
  phone: '',
  address: '',
  balance: '0',
  creditLimit: '',
  discountPercent: '0',
  whatsappOptIn: true,
};

export function CustomersView({
  storeName,
  customers,
  orders,
  entries = [],
  canDelete,
  onAddCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  onRecordPayment,
  onPrintReceipt,
  onSendWhatsAppMessage,
  lang,
  t,
}: CustomersViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'due'>('all');

  const [modalMode, setModalMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerFormState>(EMPTY_FORM);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [waNotice, setWaNotice] = useState<{ statusText?: string; manualUrl?: string } | null>(null);

  const customerOrdersMap = useMemo(() => {
    const map = new Map<string, OrderRecord[]>();
    for (const c of customers) {
      map.set(c.id, []);
    }
    const sorted = [...orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    for (const ord of sorted) {
      if (ord.customerId && map.has(ord.customerId)) {
        map.get(ord.customerId)!.push(ord);
        continue;
      }
      if (ord.customerName) {
        const lower = ord.customerName.trim().toLowerCase();
        const matched = customers.find(
          (c) => c.name.trim().toLowerCase() === lower
        );
        if (matched) {
          map.get(matched.id)!.push(ord);
        }
      }
    }
    return map;
  }, [customers, orders]);

  const stats = useMemo(() => {
    const totalBalance = customers.reduce((sum, c) => sum + c.balance, 0);
    const dueCount = customers.filter((c) => c.balance > 0).length;
    let totalBilled = 0;
    for (const list of customerOrdersMap.values()) {
      for (const ord of list) {
        totalBilled += ord.total;
      }
    }
    return {
      totalCustomers: customers.length,
      dueCount,
      totalBalance,
      totalBilled,
    };
  }, [customers, customerOrdersMap]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return customers.filter((c) => {
      if (filterMode === 'due' && c.balance <= 0) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q)
      );
    });
  }, [customers, searchQuery, filterMode]);

  const drawerCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );

  const drawerOrders = useMemo(
    () => (drawerCustomer ? customerOrdersMap.get(drawerCustomer.id) ?? [] : []),
    [drawerCustomer, customerOrdersMap]
  );

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalMode('add');
  };

  const openEdit = (customer: Customer) => {
    setEditingId(customer.id);
    setForm({
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      balance: String(customer.balance),
      creditLimit:
        customer.creditLimit !== undefined ? String(customer.creditLimit) : '',
      discountPercent: String(customer.discountPercent ?? 0),
      whatsappOptIn: customer.whatsappOptIn ?? true,
    });
    setModalMode('edit');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = form.name.trim();
    if (!cleanName) return;

    const cleanBalance = Math.max(0, Math.round(Number(form.balance) || 0));
    const creditLimit =
      form.creditLimit.trim() !== ''
        ? Math.max(0, Math.round(Number(form.creditLimit) || 0))
        : undefined;
    const discountPercent = Math.min(
      100,
      Math.max(0, Number(form.discountPercent) || 0)
    );

    if (modalMode === 'add') {
      const created = onAddCustomer({
        name: cleanName,
        phone: form.phone.trim(),
        address: form.address.trim(),
        balance: cleanBalance,
        creditLimit,
        discountPercent,
        whatsappOptIn: form.whatsappOptIn,
      });
      setSelectedCustomerId(created.id);
    } else if (modalMode === 'edit' && editingId) {
      const existing = customers.find((c) => c.id === editingId);
      if (existing) {
        onUpdateCustomer({
          ...existing,
          name: cleanName,
          phone: form.phone.trim(),
          address: form.address.trim(),
          balance: cleanBalance,
          creditLimit,
          discountPercent,
          whatsappOptIn: form.whatsappOptIn,
        });
      }
    }
    setModalMode('closed');
  };

  const handleSendWhatsApp = async (
    cust: Customer,
    type: 'reminder' | 'statement'
  ) => {
    if (!onSendWhatsAppMessage) return;
    const result = await onSendWhatsAppMessage(cust, type);
    setWaNotice(result);
  };

  const openPaymentModal = (customer: Customer) => {
    setPaymentCustomer(customer);
    setPaymentAmount(String(customer.balance));
  };

  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentCustomer) return;
    const amt = Math.max(0, Math.round(Number(paymentAmount) || 0));
    if (amt <= 0) return;
    onRecordPayment(paymentCustomer.id, amt);
    setPaymentCustomer(null);
    setPaymentAmount('');
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t.customersTitle}
          </h1>
          <p className="text-sm text-slate-600 mt-1">{t.customersSubtitle}</p>
        </div>

        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs whitespace-nowrap shrink-0 min-h-[44px] transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{t.addCrmCustomerBtn}</span>
        </button>
      </div>

      {waNotice && (
        <div
          role="status"
          className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-900"
        >
          <span>{waNotice.statusText || t.whatsappManualFallbackNotice}</span>
          <div className="flex items-center gap-2">
            {waNotice.manualUrl && (
              <a
                href={waNotice.manualUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.sendWhatsappBtn}</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => setWaNotice(null)}
              className="px-2 py-1 text-emerald-800 hover:underline cursor-pointer"
            >
              {t.dismissLabel}
            </button>
          </div>
        </div>
      )}

      {/* KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.totalCrmCustomersLabel}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {stats.totalCustomers}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.customersWithBalanceLabel}</p>
          <p className="font-mono text-2xl font-bold text-amber-700 tabular-nums mt-2">
            {stats.dueCount}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.totalReceivableLabel}</p>
          <p className="font-mono text-2xl font-bold text-amber-800 tabular-nums mt-2">
            {formatCurrency(stats.totalBalance, lang)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.totalCustomerPurchasesLabel}</p>
          <p className="font-mono text-2xl font-bold text-teal-800 tabular-nums mt-2">
            {formatCurrency(stats.totalBilled, lang)}
          </p>
        </div>
      </section>

      {/* Search + Filter Toolbar */}
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
            placeholder={t.searchCustomersPlaceholder}
            className="w-full h-10 ps-9 pe-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 focus:bg-white transition-colors"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(['all', 'due'] as const).map((mode) => {
            const active = filterMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode === 'all' ? t.filterAllCustomers : t.filterUdhaarCustomers}
              </button>
            );
          })}
        </div>
      </div>

      {/* Customers Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredCustomers.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm text-slate-500">{t.noCustomersFound}</p>
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t.addCrmCustomerBtn}</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-5 text-start font-medium">{t.customerCol}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.phoneNumberLabel}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.customerAddressCol}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.customerBillsCol}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.balanceCol}</th>
                  <th className="py-3 px-5 text-end font-medium">{t.actionCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((cust) => {
                  const pastBills = customerOrdersMap.get(cust.id) ?? [];
                  const totalSpent = pastBills.reduce((s, o) => s + o.total, 0);
                  const isConfirming = confirmDeleteId === cust.id;

                  return (
                    <tr
                      key={cust.id}
                      onClick={() => setSelectedCustomerId(cust.id)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-slate-900 flex flex-wrap items-center gap-1.5">
                          <span>{cust.name}</span>
                          {cust.creditLimit !== undefined &&
                            cust.creditLimit > 0 &&
                            cust.balance > cust.creditLimit && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                                Limit Exceeded
                              </span>
                            )}
                          {(cust.discountPercent ?? 0) > 0 && (
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-teal-50 text-teal-800">
                              -{cust.discountPercent}%
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          {formatDateTime(cust.createdAt)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                        {cust.phone || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 max-w-[240px] truncate">
                        {cust.address || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-end whitespace-nowrap">
                        <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                          {pastBills.length}
                        </span>
                        <span className="text-xs text-slate-400 ms-1.5 font-mono tabular-nums">
                          ({formatCurrency(totalSpent, lang)})
                        </span>
                      </td>
                      <td
                        className={`py-3.5 px-4 text-end font-mono font-bold tabular-nums whitespace-nowrap ${
                          cust.balance > 0 ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        {formatCurrency(cust.balance, lang)}
                      </td>
                      <td
                        className="py-3.5 px-5 text-end whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedCustomerId(cust.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>{t.viewProfileHistoryBtn}</span>
                          </button>

                          {cust.balance > 0 && (
                            <>
                              {onSendWhatsAppMessage ? (
                                <button
                                  type="button"
                                  onClick={() => handleSendWhatsApp(cust, 'reminder')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                                >
                                  <MessageCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                  <span>{t.sendWhatsappBtn}</span>
                                </button>
                              ) : (
                                <a
                                  href={buildUdhaarWhatsAppUrl({
                                    storeName,
                                    customerName: cust.name,
                                    phone: cust.phone,
                                    amount: cust.balance,
                                  })}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors whitespace-nowrap"
                                >
                                  <MessageCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                  <span>{t.sendWhatsappBtn}</span>
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => openPaymentModal(cust)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors cursor-pointer"
                              >
                                <Banknote className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>{t.recordCustomerPaymentBtn}</span>
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => openEdit(cust)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span>{t.editBtn}</span>
                          </button>

                          {canDelete &&
                            (isConfirming ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteCustomer(cust.id);
                                    if (selectedCustomerId === cust.id) {
                                      setSelectedCustomerId(null);
                                    }
                                    setConfirmDeleteId(null);
                                  }}
                                  className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md cursor-pointer"
                                >
                                  {t.confirmDeleteBtn}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                                >
                                  {t.cancelBtn}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(cust.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                                <span>{t.deleteBtn}</span>
                              </button>
                            ))}
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

      {/* Customer Profile & Purchase History Drawer/Modal */}
      {drawerCustomer && (
        <div
          className="fixed inset-0 z-40 flex items-stretch justify-end bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="customer-profile-title"
          onClick={() => setSelectedCustomerId(null)}
        >
          <div
            className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl border-s border-slate-200 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2.5">
                <User className="w-5 h-5 text-teal-700 shrink-0" aria-hidden="true" />
                <h2 id="customer-profile-title" className="text-base font-bold text-slate-900">
                  {t.customerProfileTitle}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomerId(null)}
                aria-label={t.closeBtn}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-6 space-y-6 flex-1">
              {/* Customer Profile Summary Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-xl font-bold text-slate-900">
                    {drawerCustomer.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1.5 font-mono">
                      <Phone className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                      <span>{drawerCustomer.phone || '—'}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                      <span>{drawerCustomer.address || '—'}</span>
                    </span>
                  </div>
                </div>

                <div className="sm:text-end shrink-0 space-y-2">
                  <p className="text-xs font-medium text-slate-500">
                    {t.remainingBalanceLabel}
                  </p>
                  <p
                    className={`font-mono text-2xl font-bold tabular-nums ${
                      drawerCustomer.balance > 0 ? 'text-amber-700' : 'text-emerald-700'
                    }`}
                  >
                    {formatCurrency(drawerCustomer.balance, lang)}
                  </p>
                  {drawerCustomer.creditLimit !== undefined && drawerCustomer.creditLimit > 0 && (
                    <p className="text-[11px] font-mono text-slate-500">
                      {t.creditLimitLabel}: {formatCurrency(drawerCustomer.creditLimit, lang)}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setStatementCustomer(drawerCustomer)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{t.printStatementBtn}</span>
                    </button>
                    {onSendWhatsAppMessage && (
                      <button
                        type="button"
                        onClick={() => handleSendWhatsApp(drawerCustomer, 'statement')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
                      >
                        <MessageCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{t.sendWhatsappBtn}</span>
                      </button>
                    )}
                    {drawerCustomer.balance > 0 && (
                      <button
                        type="button"
                        onClick={() => openPaymentModal(drawerCustomer)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
                      >
                        <Banknote className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{t.recordCustomerPaymentBtn}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Totals Strip */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500">
                    {t.customerTotalBillsLabel}
                  </p>
                  <p className="font-mono text-xl font-bold text-slate-900 tabular-nums mt-1">
                    {drawerOrders.length}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500">
                    {t.totalCustomerPurchasesLabel}
                  </p>
                  <p className="font-mono text-xl font-bold text-teal-800 tabular-nums mt-1">
                    {formatCurrency(
                      drawerOrders.reduce((s, o) => s + o.total, 0),
                      lang
                    )}
                  </p>
                </div>
              </div>

              {/* Purchase History Bills */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900">
                  {t.customerHistoryTitle}
                </h3>

                {drawerOrders.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
                    {t.noCustomerBills}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {drawerOrders.map((ord) => (
                      <div
                        key={ord.id}
                        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
                      >
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-slate-900">
                                {ord.receiptNumber}
                              </span>
                              <span className="text-xs text-slate-500">
                                · {getPaymentLabel(ord.paymentMethod, t)}
                              </span>
                            </div>
                            <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                              {formatDateTime(ord.createdAt)}
                            </p>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                              {formatCurrency(ord.total, lang)}
                            </span>
                            <button
                              type="button"
                              onClick={() => onPrintReceipt(ord)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span>{t.printBtn}</span>
                            </button>
                          </div>
                        </div>

                        <div className="divide-y divide-slate-100 px-4">
                          {ord.items.map((item) => (
                            <div
                              key={`${ord.id}-${item.productId}`}
                              className="py-2 flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="text-slate-800 font-medium">
                                {lang === 'ur' ? item.nameUr : item.nameEn}
                                <span className="text-slate-400 font-mono ms-1.5">
                                  ({item.quantity} × {formatCurrency(item.unitPrice, lang)})
                                </span>
                              </div>
                              <div className="font-mono font-semibold text-slate-900 tabular-nums">
                                {formatCurrency(item.lineTotal, lang)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Customer Modal */}
      {modalMode !== 'closed' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="crm-customer-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 id="crm-customer-modal-title" className="text-base font-bold text-slate-900">
                {modalMode === 'add' ? t.addCrmCustomerTitle : t.editCrmCustomerTitle}
              </h2>
              <button
                type="button"
                onClick={() => setModalMode('closed')}
                aria-label={t.closeBtn}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.customerNameLabel} *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Zainab Tariq"
                  className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.phoneNumberLabel}
                </label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="0300-1234567"
                  className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.customerAddressLabel}
                </label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="e.g., Street 4, Gulberg III, Lahore"
                  className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.customerUdhaarBalanceLabel}
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.balance}
                  onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))}
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.creditLimitLabel}
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="No limit"
                    value={form.creditLimit}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, creditLimit: e.target.value }))
                    }
                    className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.customerDiscountLabel}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={form.discountPercent}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, discountPercent: e.target.value }))
                    }
                    className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.whatsappOptIn}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, whatsappOptIn: e.target.checked }))
                  }
                  className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                />
                <span>{t.whatsappOptInLabel}</span>
              </label>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalMode('closed')}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg min-h-[40px] cursor-pointer"
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg min-h-[40px] cursor-pointer"
                >
                  {t.saveCustomerBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive Customer Payment Modal */}
      {paymentCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pay-customer-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 id="pay-customer-title" className="text-base font-bold text-slate-900">
                {t.payCustomerModalTitle}
              </h2>
              <button
                type="button"
                onClick={() => setPaymentCustomer(null)}
                aria-label={t.closeBtn}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleConfirmPayment} className="p-5 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs space-y-1">
                <div className="font-semibold text-slate-900 text-sm">
                  {paymentCustomer.name}
                </div>
                <div className="text-slate-600">
                  {t.remainingBalanceLabel}:{' '}
                  <strong className="font-mono text-amber-700 tabular-nums">
                    {formatCurrency(paymentCustomer.balance, lang)}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.paymentAmountLabel} *
                </label>
                <input
                  type="number"
                  min={1}
                  max={paymentCustomer.balance}
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentCustomer(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg min-h-[40px] cursor-pointer"
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg min-h-[40px] cursor-pointer"
                >
                  {t.confirmPaymentBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Printable Customer Statement Modal */}
      {statementCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl overflow-hidden shadow-xl">
            <div className="no-print flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                {t.printStatementBtn} — {statementCustomer.name}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.printReportBtn}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatementCustomer(null)}
                  aria-label={t.closeBtn}
                  className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-sm">
              <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{storeName}</h3>
                  <p className="text-xs text-slate-700 font-semibold">{statementCustomer.name}</p>
                  <p className="text-xs font-mono text-slate-500">{statementCustomer.phone}</p>
                </div>
                <div className="text-end">
                  <p className="text-xs text-slate-500">{t.remainingBalanceLabel}</p>
                  <p className="font-mono text-xl font-bold text-amber-700 tabular-nums">
                    {formatCurrency(statementCustomer.balance, lang)}
                  </p>
                </div>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3 text-start">{t.entryDateCol}</th>
                    <th className="py-2 px-3 text-start">{t.receiptCol}</th>
                    <th className="py-2 px-3 text-start">{t.methodCol}</th>
                    <th className="py-2 px-3 text-end">{t.totalCol}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(customerOrdersMap.get(statementCustomer.id) ?? []).map((ord) => (
                    <tr key={ord.id}>
                      <td className="py-2 px-3 font-mono">{formatDateTime(ord.createdAt)}</td>
                      <td className="py-2 px-3 font-mono">{ord.receiptNumber}</td>
                      <td className="py-2 px-3">{getPaymentLabel(ord.paymentMethod, t)}</td>
                      <td className="py-2 px-3 text-end font-mono font-semibold tabular-nums">
                        {formatCurrency(ord.total, lang)}
                      </td>
                    </tr>
                  ))}
                  {entries
                    .filter((e) => e.customerId === statementCustomer.id)
                    .map((e) => (
                      <tr key={e.id}>
                        <td className="py-2 px-3 font-mono">{formatDateTime(e.createdAt)}</td>
                        <td className="py-2 px-3">{e.note}</td>
                        <td className="py-2 px-3">{e.type === 'credit' ? t.typeCredit : t.typePayment}</td>
                        <td className="py-2 px-3 text-end font-mono tabular-nums">
                          {e.type === 'credit' ? '+' : '-'}
                          {formatCurrency(e.amount, lang)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
