import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Phone,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { formatCurrency, formatDateTime, type TranslationStrings } from '../i18n';
import type { Language, UdhaarCustomer, UdhaarEntry, UdhaarEntryType } from '../types';

interface UdhaarViewProps {
  customers: UdhaarCustomer[];
  entries: UdhaarEntry[];
  onAddCustomer: (payload: {
    name: string;
    phone: string;
    notes: string;
    openingBalance: number;
  }) => UdhaarCustomer;
  onAddEntry: (payload: {
    customerId: string;
    type: UdhaarEntryType;
    amount: number;
    note: string;
  }) => void;
  lang: Language;
  t: TranslationStrings;
}

export function UdhaarView({
  customers,
  entries,
  onAddCustomer,
  onAddEntry,
  lang,
  t,
}: UdhaarViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    customers[0]?.id ?? null
  );
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);

  // Add Customer Modal state
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newOpeningBalance, setNewOpeningBalance] = useState('');

  // Quick Entry Form state (credit or payment)
  const [entryFormType, setEntryFormType] = useState<UdhaarEntryType | null>(null);
  const [entryAmount, setEntryAmount] = useState('');
  const [entryNote, setEntryNote] = useState('');

  const customerSummaries = useMemo(() => {
    const map = new Map<
      string,
      { totalCredit: number; totalPayment: number; balance: number }
    >();

    for (const c of customers) {
      map.set(c.id, { totalCredit: 0, totalPayment: 0, balance: 0 });
    }

    for (const e of entries) {
      const bucket = map.get(e.customerId);
      if (!bucket) continue;
      if (e.type === 'credit') {
        bucket.totalCredit += e.amount;
        bucket.balance += e.amount;
      } else {
        bucket.totalPayment += e.amount;
        bucket.balance -= e.amount;
      }
    }

    return map;
  }, [customers, entries]);

  const globalStats = useMemo(() => {
    let totalCredit = 0;
    let totalPayment = 0;
    for (const summary of customerSummaries.values()) {
      totalCredit += summary.totalCredit;
      totalPayment += summary.totalPayment;
    }
    return {
      totalCredit,
      totalPayment,
      totalReceivable: Math.max(0, totalCredit - totalPayment),
      customerCount: customers.length,
    };
  }, [customerSummaries, customers.length]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  const activeCustomer = useMemo(() => {
    if (!selectedCustomerId) return customers[0] ?? null;
    return customers.find((c) => c.id === selectedCustomerId) ?? customers[0] ?? null;
  }, [customers, selectedCustomerId]);

  const activeLedgerRows = useMemo(() => {
    if (!activeCustomer) return [];
    const chronological = entries
      .filter((e) => e.customerId === activeCustomer.id)
      .sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

    let running = 0;
    const withRunning = chronological.map((entry) => {
      running += entry.type === 'credit' ? entry.amount : -entry.amount;
      return {
        ...entry,
        runningBalance: running,
      };
    });

    return withRunning.reverse();
  }, [activeCustomer, entries]);

  const activeSummary = activeCustomer
    ? customerSummaries.get(activeCustomer.id) ?? {
        totalCredit: 0,
        totalPayment: 0,
        balance: 0,
      }
    : null;

  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newName.trim();
    if (!cleanName) return;

    const created = onAddCustomer({
      name: cleanName,
      phone: newPhone.trim(),
      notes: newNotes.trim(),
      openingBalance: Math.max(0, Number(newOpeningBalance) || 0),
    });

    setSelectedCustomerId(created.id);
    setNewName('');
    setNewPhone('');
    setNewNotes('');
    setNewOpeningBalance('');
    setShowAddCustomerModal(false);
  };

  const handleSubmitEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCustomer || !entryFormType) return;
    const amountNum = Math.max(0, Number(entryAmount) || 0);
    if (amountNum <= 0) return;

    onAddEntry({
      customerId: activeCustomer.id,
      type: entryFormType,
      amount: amountNum,
      note:
        entryNote.trim() ||
        (entryFormType === 'credit' ? t.typeCredit : t.typePayment),
    });

    setEntryFormType(null);
    setEntryAmount('');
    setEntryNote('');
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t.udhaarTitle}
          </h1>
          <p className="text-sm text-slate-600 mt-1">{t.udhaarSubtitle}</p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddCustomerModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap shrink-0 min-h-[40px] transition-colors cursor-pointer"
        >
          <UserPlus className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{t.addCustomerBtn}</span>
        </button>
      </div>

      {/* 4-Column Summary Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.totalReceivableLabel}</p>
          <p className="font-mono text-2xl font-bold text-amber-700 tabular-nums mt-2">
            {formatCurrency(globalStats.totalReceivable, lang)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.totalCreditGivenLabel}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {formatCurrency(globalStats.totalCredit, lang)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">
            {t.totalPaymentsReceivedLabel}
          </p>
          <p className="font-mono text-2xl font-bold text-emerald-700 tabular-nums mt-2">
            {formatCurrency(globalStats.totalPayment, lang)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.activeCustomersLabel}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {globalStats.customerCount}
          </p>
        </div>
      </section>

      {/* Master-Detail Khata Register */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Customer List */}
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <div className="relative">
              <Search
                className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchCustomersPlaceholder}
                className="w-full h-10 ps-9 pe-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 focus:bg-white"
              />
            </div>
          </div>

          {filteredCustomers.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              {t.noCustomersFound}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
              {filteredCustomers.map((customer) => {
                const summary = customerSummaries.get(customer.id) ?? {
                  totalCredit: 0,
                  totalPayment: 0,
                  balance: 0,
                };
                const isSelected = activeCustomer?.id === customer.id;

                return (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => {
                      setSelectedCustomerId(customer.id);
                      setEntryFormType(null);
                    }}
                    className={`w-full px-4 py-3.5 text-start flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                      isSelected ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-semibold truncate ${
                          isSelected ? 'text-teal-900' : 'text-slate-900'
                        }`}
                      >
                        {customer.name}
                      </p>
                      <p className="text-xs font-mono text-slate-500 mt-0.5 flex items-center gap-1">
                        <Phone className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span>{customer.phone || '—'}</span>
                      </p>
                    </div>

                    <div className="text-end shrink-0">
                      <p
                        className={`font-mono text-sm font-bold tabular-nums ${
                          summary.balance > 0
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {formatCurrency(Math.max(0, summary.balance), lang)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {summary.balance <= 0 ? t.settledStatus : t.remainingBalanceLabel}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Right: Selected Customer Ledger */}
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          {!activeCustomer || !activeSummary ? (
            <div className="p-12 text-center text-sm text-slate-500">
              {t.selectCustomerPrompt}
            </div>
          ) : (
            <div>
              {/* Customer Header & Balance */}
              <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {activeCustomer.name}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    <span className="font-mono">{activeCustomer.phone || '—'}</span>
                    {activeCustomer.notes ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span>{activeCustomer.notes}</span>
                      </>
                    ) : null}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="text-start md:text-end">
                    <p className="text-xs text-slate-500">{t.remainingBalanceLabel}</p>
                    <p
                      className={`font-mono text-xl font-bold tabular-nums ${
                        activeSummary.balance > 0
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {formatCurrency(Math.max(0, activeSummary.balance), lang)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEntryFormType('credit');
                        setEntryAmount('');
                        setEntryNote('');
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg whitespace-nowrap min-h-[40px] transition-colors cursor-pointer"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{t.recordCreditBtn}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEntryFormType('payment');
                        setEntryAmount('');
                        setEntryNote('');
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap min-h-[40px] transition-colors cursor-pointer"
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{t.receivePaymentBtn}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Entry Inline Form */}
              {entryFormType && (
                <form
                  onSubmit={handleSubmitEntry}
                  className="p-5 bg-slate-50 border-b border-slate-200 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">
                      {entryFormType === 'credit'
                        ? t.recordCreditBtn
                        : t.receivePaymentBtn}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEntryFormType(null)}
                      className="text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
                    >
                      {t.cancelBtn}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-3">
                      <label
                        htmlFor="udhaar-entry-amount"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        {t.entryAmountLabel}
                      </label>
                      <input
                        id="udhaar-entry-amount"
                        type="number"
                        min={1}
                        required
                        value={entryAmount}
                        onChange={(e) => setEntryAmount(e.target.value)}
                        placeholder="500"
                        className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700"
                      />
                    </div>

                    <div className="sm:col-span-6">
                      <label
                        htmlFor="udhaar-entry-note"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        {t.entryNoteLabel}
                      </label>
                      <input
                        id="udhaar-entry-note"
                        type="text"
                        value={entryNote}
                        onChange={(e) => setEntryNote(e.target.value)}
                        placeholder={
                          entryFormType === 'credit'
                            ? t.creditNotePlaceholder
                            : t.paymentNotePlaceholder
                        }
                        className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <button
                        type="submit"
                        className={`w-full h-10 px-4 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                          entryFormType === 'credit'
                            ? 'bg-amber-700 hover:bg-amber-800 text-white'
                            : 'bg-teal-700 hover:bg-teal-800 text-white'
                        }`}
                      >
                        {entryFormType === 'credit'
                          ? t.submitCreditBtn
                          : t.submitPaymentBtn}
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Ledger History Table */}
              <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
                <span className="font-semibold text-slate-800">
                  {t.ledgerHistoryTitle}
                </span>
                <span className="font-mono tabular-nums">
                  {t.totalCreditGivenLabel}: {formatCurrency(activeSummary.totalCredit, lang)} ·{' '}
                  {t.totalPaymentsReceivedLabel}:{' '}
                  {formatCurrency(activeSummary.totalPayment, lang)}
                </span>
              </div>

              {activeLedgerRows.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  {t.noLedgerEntries}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-5 text-start font-medium">
                          {t.entryDateCol}
                        </th>
                        <th className="py-2.5 px-4 text-start font-medium">
                          {t.entryTypeCol}
                        </th>
                        <th className="py-2.5 px-4 text-start font-medium">
                          {t.entryNoteCol}
                        </th>
                        <th className="py-2.5 px-4 text-end font-medium">
                          {t.creditCol}
                        </th>
                        <th className="py-2.5 px-4 text-end font-medium">
                          {t.paymentCol}
                        </th>
                        <th className="py-2.5 px-5 text-end font-medium">
                          {t.balanceCol}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeLedgerRows.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-5 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                            {formatDateTime(entry.createdAt)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`text-xs font-semibold ${
                                entry.type === 'credit'
                                  ? 'text-amber-700'
                                  : 'text-emerald-700'
                              }`}
                            >
                              {entry.type === 'credit' ? t.typeCredit : t.typePayment}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            <span>{entry.note}</span>
                            {entry.receiptNumber ? (
                              <span className="ms-2 font-mono text-xs text-slate-400">
                                ({entry.receiptNumber})
                              </span>
                            ) : null}
                          </td>
                          <td className="py-3 px-4 text-end font-mono font-medium text-amber-700 tabular-nums whitespace-nowrap">
                            {entry.type === 'credit'
                              ? formatCurrency(entry.amount, lang)
                              : '—'}
                          </td>
                          <td className="py-3 px-4 text-end font-mono font-medium text-emerald-700 tabular-nums whitespace-nowrap">
                            {entry.type === 'payment'
                              ? formatCurrency(entry.amount, lang)
                              : '—'}
                          </td>
                          <td className="py-3 px-5 text-end font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                            {formatCurrency(Math.max(0, entry.runningBalance), lang)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Add Customer Modal */}
      {showAddCustomerModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-customer-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2
                id="add-customer-modal-title"
                className="text-base font-bold text-slate-900"
              >
                {t.addCustomerBtn}
              </h2>
              <button
                type="button"
                onClick={() => setShowAddCustomerModal(false)}
                aria-label={t.closeBtn}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="p-5 space-y-4">
              <div>
                <label
                  htmlFor="khata-cust-name"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  {t.customerNameLabel}
                </label>
                <input
                  id="khata-cust-name"
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Salman Haider"
                  className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              <div>
                <label
                  htmlFor="khata-cust-phone"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  {t.phoneNumberLabel}
                </label>
                <input
                  id="khata-cust-phone"
                  type="text"
                  required
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="0300-1234567"
                  className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              <div>
                <label
                  htmlFor="khata-cust-notes"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  {t.customerNotesLabel}
                </label>
                <input
                  id="khata-cust-notes"
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              <div>
                <label
                  htmlFor="khata-cust-opening"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  {t.openingBalanceLabel}
                </label>
                <input
                  id="khata-cust-opening"
                  type="number"
                  min={0}
                  value={newOpeningBalance}
                  onChange={(e) => setNewOpeningBalance(e.target.value)}
                  placeholder="0"
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg min-h-[40px] cursor-pointer"
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg min-h-[40px] cursor-pointer"
                >
                  {t.saveCustomerBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
