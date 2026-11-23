import { useMemo, useState } from 'react';
import {
  Banknote,
  Building2,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Printer,
  Search,
  X,
} from 'lucide-react';
import { formatCurrency, formatDateTime, type TranslationStrings } from '../i18n';
import type { Language, PurchaseRecord, SupplierPayment, Vendor } from '../types';

interface VendorsViewProps {
  vendors: Vendor[];
  purchases: PurchaseRecord[];
  supplierPayments?: SupplierPayment[];
  storeName?: string;
  onAddVendor: (payload: {
    name: string;
    company: string;
    phone: string;
    address: string;
    balance: number;
  }) => Vendor;
  onUpdateVendor: (vendor: Vendor) => void;
  onRecordVendorPayment: (
    vendorId: string,
    amount: number,
    paymentMethod?: SupplierPayment['paymentMethod'],
    note?: string,
    purchaseId?: string
  ) => void;
  lang: Language;
  t: TranslationStrings;
}

type VendorFormState = {
  name: string;
  company: string;
  phone: string;
  address: string;
  balance: string;
};

const EMPTY_VENDOR_FORM: VendorFormState = {
  name: '',
  company: '',
  phone: '',
  address: '',
  balance: '0',
};

export function VendorsView({
  vendors,
  purchases,
  supplierPayments = [],
  storeName,
  onAddVendor,
  onUpdateVendor,
  onRecordVendorPayment,
  lang,
  t,
}: VendorsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'payable'>('all');
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(
    vendors[0]?.id ?? null
  );

  // Add / Edit Modal state
  const [modalMode, setModalMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [form, setForm] = useState<VendorFormState>(EMPTY_VENDOR_FORM);

  // Payment Modal state
  const [payingVendor, setPayingVendor] = useState<Vendor | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<SupplierPayment['paymentMethod']>('cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [selectedPurchaseId, setSelectedPurchaseId] = useState('');
  const [showStatementModal, setShowStatementModal] = useState(false);

  const stats = useMemo(() => {
    const totalPayable = vendors.reduce((sum, v) => sum + Math.max(0, v.balance), 0);
    const vendorsWithDue = vendors.filter((v) => v.balance > 0).length;
    const totalPurchased = purchases.reduce((sum, p) => sum + p.totalAmount, 0);
    return {
      totalVendors: vendors.length,
      totalPayable,
      vendorsWithDue,
      totalPurchased,
    };
  }, [vendors, purchases]);

  const filteredVendors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return vendors.filter((v) => {
      if (balanceFilter === 'payable' && v.balance <= 0) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.company.toLowerCase().includes(q) ||
        v.phone.toLowerCase().includes(q) ||
        v.address.toLowerCase().includes(q)
      );
    });
  }, [vendors, searchQuery, balanceFilter]);

  const activeVendor = useMemo(() => {
    if (selectedVendorId) {
      const match = vendors.find((v) => v.id === selectedVendorId);
      if (match) return match;
    }
    return vendors[0] ?? null;
  }, [vendors, selectedVendorId]);

  const activeVendorPurchases = useMemo(() => {
    if (!activeVendor) return [];
    return purchases
      .filter((p) => p.vendorId === activeVendor.id)
      .sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }, [activeVendor, purchases]);

  const activeVendorPayments = useMemo(() => {
    if (!activeVendor) return [];
    return supplierPayments
      .filter((p) => p.vendorId === activeVendor.id)
      .sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }, [activeVendor, supplierPayments]);

  const openAddModal = () => {
    setEditingVendorId(null);
    setForm(EMPTY_VENDOR_FORM);
    setModalMode('add');
  };

  const openEditModal = (vendor: Vendor) => {
    setEditingVendorId(vendor.id);
    setForm({
      name: vendor.name,
      company: vendor.company,
      phone: vendor.phone,
      address: vendor.address,
      balance: String(vendor.balance),
    });
    setModalMode('edit');
  };

  const closeModal = () => {
    setModalMode('closed');
    setEditingVendorId(null);
  };

  const handleSaveVendor = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = form.name.trim();
    if (!cleanName) return;

    const balanceNum = Math.max(0, Number(form.balance) || 0);

    if (modalMode === 'add') {
      const created = onAddVendor({
        name: cleanName,
        company: form.company.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        balance: balanceNum,
      });
      setSelectedVendorId(created.id);
    } else if (modalMode === 'edit' && editingVendorId) {
      const existing = vendors.find((v) => v.id === editingVendorId);
      if (existing) {
        onUpdateVendor({
          ...existing,
          name: cleanName,
          company: form.company.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          balance: balanceNum,
        });
      }
    }

    closeModal();
  };

  const openPayModal = (vendor: Vendor) => {
    setPayingVendor(vendor);
    setPaymentAmount(vendor.balance > 0 ? String(vendor.balance) : '');
    setPaymentMethod('cash');
    setPaymentNote('');
    setSelectedPurchaseId('');
  };

  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingVendor) return;
    const amt = Math.max(0, Number(paymentAmount) || 0);
    if (amt <= 0) return;

    onRecordVendorPayment(
      payingVendor.id,
      amt,
      paymentMethod,
      paymentNote.trim(),
      selectedPurchaseId || undefined
    );
    setPayingVendor(null);
    setPaymentAmount('');
    setPaymentNote('');
    setSelectedPurchaseId('');
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t.vendorsTitle}
          </h1>
          <p className="text-sm text-slate-600 mt-1">{t.vendorsSubtitle}</p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap shrink-0 min-h-[44px] transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{t.addVendorBtn}</span>
        </button>
      </div>

      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.totalVendorsLabel}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {stats.totalVendors}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.totalPayableLabel}</p>
          <p className="font-mono text-2xl font-bold text-amber-700 tabular-nums mt-2">
            {formatCurrency(stats.totalPayable, lang)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.vendorsWithDueLabel}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {stats.vendorsWithDue}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.totalPurchasedLabel}</p>
          <p className="font-mono text-2xl font-bold text-emerald-700 tabular-nums mt-2">
            {formatCurrency(stats.totalPurchased, lang)}
          </p>
        </div>
      </section>

      {/* Filter Bar */}
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
            placeholder={t.searchVendorsPlaceholder}
            className="w-full h-10 ps-9 pe-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2">
          {(
            [
              { id: 'all', label: t.filterAllVendors },
              { id: 'payable', label: t.filterPayableVendors },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setBalanceFilter(f.id)}
              className={`px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors min-h-[38px] cursor-pointer ${
                balanceFilter === f.id
                  ? 'bg-slate-900 text-white font-semibold'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Grid: Vendors Directory + Selected Vendor Purchase History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Vendors Table */}
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 text-start font-medium">{t.vendorCol}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.vendorPhoneLabel}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.payableBalanceCol}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.actionCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVendors.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 px-4 text-center text-sm text-slate-500">
                      {t.noVendorsFound}
                    </td>
                  </tr>
                ) : (
                  filteredVendors.map((vendor) => {
                    const isSelected = activeVendor?.id === vendor.id;
                    const hasDue = vendor.balance > 0;
                    return (
                      <tr
                        key={vendor.id}
                        onClick={() => setSelectedVendorId(vendor.id)}
                        className={`transition-colors cursor-pointer ${
                          isSelected ? 'bg-teal-50/50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{vendor.name}</div>
                          {vendor.company && (
                            <div className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                              <Building2 className="w-3 h-3 shrink-0 text-slate-400" aria-hidden="true" />
                              <span>{vendor.company}</span>
                            </div>
                          )}
                          {vendor.address && (
                            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                              <span>{vendor.address}</span>
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-xs font-mono text-slate-700 whitespace-nowrap">
                          {vendor.phone ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Phone className="w-3 h-3 text-slate-400" aria-hidden="true" />
                              {vendor.phone}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-end font-mono font-bold tabular-nums whitespace-nowrap">
                          {hasDue ? (
                            <span className="text-amber-700">
                              {formatCurrency(vendor.balance, lang)}
                            </span>
                          ) : (
                            <span className="text-emerald-700 text-xs font-semibold">
                              {t.settledStatus}
                            </span>
                          )}
                        </td>

                        <td
                          className="py-3.5 px-4 text-end"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openPayModal(vendor)}
                              disabled={vendor.balance <= 0}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-400 rounded-md whitespace-nowrap transition-colors cursor-pointer disabled:cursor-not-allowed"
                            >
                              <Banknote className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span>{t.payVendorBtn}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditModal(vendor)}
                              aria-label={`${t.editBtn} ${vendor.name}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>{t.editBtn}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Selected Vendor Purchase History Panel */}
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {t.vendorPurchasesTitle}
              </h2>
              {activeVendor && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeVendor.name}
                  {activeVendor.company ? ` · ${activeVendor.company}` : ''}
                </p>
              )}
            </div>
            {activeVendor && (
              <button
                type="button"
                onClick={() => setShowStatementModal(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer shrink-0"
              >
                <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.supplierStatementBtn}</span>
              </button>
            )}
          </div>

          {!activeVendor || activeVendorPurchases.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              {t.noVendorPurchases}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
              {activeVendorPurchases.map((pur) => (
                <div key={pur.id} className="p-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-900">
                      {pur.invoiceNumber}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                      {formatCurrency(pur.totalAmount, lang)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>{formatDateTime(pur.createdAt)}</span>
                    <span
                      className={`font-mono tabular-nums font-medium ${
                        pur.balanceDue > 0 ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {pur.balanceDue > 0
                        ? `${t.balanceDueCol}: ${formatCurrency(pur.balanceDue, lang)}`
                        : t.settledStatus}
                    </span>
                  </div>
                  {pur.note && (
                    <p className="text-[11px] text-slate-600">{pur.note}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeVendor && activeVendorPayments.length > 0 && (
            <div className="border-t border-slate-200">
              <div className="px-4 py-2.5 bg-slate-50 text-xs font-bold text-slate-800">
                {t.supplierPaymentBtn} ({activeVendorPayments.length})
              </div>
              <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {activeVendorPayments.map((sp) => (
                  <div key={sp.id} className="px-4 py-2.5 text-xs flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-800 capitalize">
                        {sp.paymentMethod.replace('_', ' ')}
                        {sp.note ? ` · ${sp.note}` : ''}
                      </p>
                      <p className="font-mono text-[11px] text-slate-400">
                        {formatDateTime(sp.createdAt)}
                      </p>
                    </div>
                    <span className="font-mono font-bold text-emerald-700 tabular-nums">
                      {formatCurrency(sp.amount, lang)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Add / Edit Vendor Modal */}
      {modalMode !== 'closed' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vendor-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2
                id="vendor-modal-title"
                className="text-base font-bold text-slate-900"
              >
                {modalMode === 'add' ? t.addVendorTitle : t.editVendorTitle}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                aria-label={t.closeBtn}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveVendor} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.vendorNameLabel} *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder={lang === 'ur' ? 'حاجی عبدالرشید' : 'e.g., Haji Abdul Rashid'}
                    className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.vendorCompanyLabel}
                  </label>
                  <input
                    type="text"
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    placeholder={lang === 'ur' ? 'النور ڈسٹری بیوٹرز' : 'e.g., Al-Noor Traders'}
                    className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.vendorPhoneLabel}
                  </label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="0300-1234567"
                    className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {modalMode === 'add'
                      ? t.vendorOpeningBalanceLabel
                      : t.payableBalanceCol}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.balance}
                    onChange={(e) => setForm({ ...form, balance: e.target.value })}
                    className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.vendorAddressLabel}
                </label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder={lang === 'ur' ? 'اکبری منڈی، لاہور' : 'e.g., Akbari Mandi, Lahore'}
                  className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg min-h-[40px] cursor-pointer"
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg min-h-[40px] cursor-pointer"
                >
                  {t.saveVendorBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Vendor Payment Modal */}
      {payingVendor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pay-vendor-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2
                id="pay-vendor-modal-title"
                className="text-base font-bold text-slate-900"
              >
                {t.payVendorModalTitle}
              </h2>
              <button
                type="button"
                onClick={() => setPayingVendor(null)}
                aria-label={t.closeBtn}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleConfirmPayment} className="p-5 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {payingVendor.name}
                  </p>
                  {payingVendor.company && (
                    <p className="text-xs text-slate-500">{payingVendor.company}</p>
                  )}
                </div>
                <div className="text-end">
                  <p className="text-[11px] text-slate-500">{t.payableBalanceCol}</p>
                  <p className="font-mono text-sm font-bold text-amber-700 tabular-nums">
                    {formatCurrency(payingVendor.balance, lang)}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-700">
                    {t.paymentAmountLabel} *
                  </label>
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(String(payingVendor.balance))}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-800 cursor-pointer"
                  >
                    {t.payFullBtn}
                  </button>
                </div>
                <input
                  type="number"
                  min="1"
                  max={payingVendor.balance}
                  step="1"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.paymentMethodLabel}
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(e.target.value as SupplierPayment['paymentMethod'])
                    }
                    className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  >
                    <option value="cash">{t.paymentCash}</option>
                    <option value="bank_transfer">{t.paymentBankTransfer}</option>
                    <option value="jazzcash">{t.paymentJazzCash}</option>
                    <option value="easypaisa">{t.paymentEasyPaisa}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.invoiceNoLabel}
                  </label>
                  <select
                    value={selectedPurchaseId}
                    onChange={(e) => setSelectedPurchaseId(e.target.value)}
                    className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  >
                    <option value="">General Account</option>
                    {purchases
                      .filter((p) => p.vendorId === payingVendor.id && p.balanceDue > 0)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.invoiceNumber} ({formatCurrency(p.balanceDue, lang)})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.entryNoteLabel}
                </label>
                <input
                  type="text"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder="Optional payment reference..."
                  className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPayingVendor(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg min-h-[40px] cursor-pointer"
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg min-h-[40px] cursor-pointer"
                >
                  {t.confirmPaymentBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Supplier Statement Modal */}
      {showStatementModal && activeVendor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl overflow-hidden shadow-xl">
            <div className="no-print flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                {t.supplierStatementBtn} — {activeVendor.name}
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
                  onClick={() => setShowStatementModal(false)}
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
                  <h3 className="text-lg font-bold text-slate-900">
                    {storeName || t.brandName}
                  </h3>
                  <p className="text-xs text-slate-600">
                    {activeVendor.name} {activeVendor.company ? `(${activeVendor.company})` : ''}
                  </p>
                  <p className="text-xs font-mono text-slate-500">{activeVendor.phone}</p>
                </div>
                <div className="text-end">
                  <p className="text-xs text-slate-500">{t.payableBalanceCol}</p>
                  <p className="font-mono text-xl font-bold text-amber-700 tabular-nums">
                    {formatCurrency(activeVendor.balance, lang)}
                  </p>
                </div>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3 text-start">{t.entryDateCol}</th>
                    <th className="py-2 px-3 text-start">{t.invoiceNoLabel}</th>
                    <th className="py-2 px-3 text-end">{t.totalCol}</th>
                    <th className="py-2 px-3 text-end">{t.paidCol}</th>
                    <th className="py-2 px-3 text-end">{t.balanceDueCol}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeVendorPurchases.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 px-3 font-mono">{formatDateTime(p.createdAt)}</td>
                      <td className="py-2 px-3 font-mono">{p.invoiceNumber}</td>
                      <td className="py-2 px-3 text-end font-mono tabular-nums">
                        {formatCurrency(p.totalAmount, lang)}
                      </td>
                      <td className="py-2 px-3 text-end font-mono tabular-nums text-emerald-700">
                        {formatCurrency(p.paidAmount, lang)}
                      </td>
                      <td className="py-2 px-3 text-end font-mono tabular-nums text-amber-700">
                        {formatCurrency(p.balanceDue, lang)}
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
