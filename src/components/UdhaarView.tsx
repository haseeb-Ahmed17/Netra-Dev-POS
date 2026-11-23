import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Calendar,
  MessageCircle,
  Phone,
  Printer,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { formatCurrency, formatDateTime, type TranslationStrings } from '../i18n';
import type {
  Language,
  ReminderSchedule,
  UdhaarCustomer,
  UdhaarEntry,
  UdhaarEntryType,
} from '../types';

interface UdhaarViewProps {
  storeName: string;
  customers: UdhaarCustomer[];
  entries: UdhaarEntry[];
  onAddCustomer: (payload: {
    name: string;
    phone: string;
    notes: string;
    openingBalance: number;
    reminderSchedule: ReminderSchedule;
    dueDate?: string;
    creditLimit?: number;
    discountPercent?: number;
    whatsappOptIn?: boolean;
  }) => UdhaarCustomer;
  onUpdateCustomer: (updated: UdhaarCustomer) => void;
  onAddEntry: (payload: {
    customerId: string;
    type: UdhaarEntryType;
    amount: number;
    note: string;
  }) => void;
  onSendWhatsAppReminder?: (
    customer: UdhaarCustomer,
    balance: number
  ) => Promise<{ manualUrl?: string; statusText?: string }>;
  lang: Language;
  t: TranslationStrings;
}

function getTodayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function calculateDueDateFromSchedule(
  schedule: ReminderSchedule,
  existingDate?: string
): string {
  if (schedule === 'none') return '';
  if (schedule === 'custom') return existingDate || getTodayYmd();

  const d = new Date();
  if (schedule === '3_days') d.setDate(d.getDate() + 3);
  else if (schedule === '1_week') d.setDate(d.getDate() + 7);
  else if (schedule === '2_weeks') d.setDate(d.getDate() + 14);
  else if (schedule === '1_month') d.setMonth(d.getMonth() + 1);

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatPakistaniWhatsAppNumber(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return '';
  let clean = digits;
  if (clean.startsWith('0092')) {
    clean = clean.slice(2);
  } else if (clean.startsWith('0') && clean.length >= 10) {
    clean = `92${clean.slice(1)}`;
  } else if (clean.startsWith('3') && clean.length === 10) {
    clean = `92${clean}`;
  }
  return /^[0-9]{7,15}$/.test(clean) ? clean : '';
}

export function buildUdhaarWhatsAppUrl({
  storeName,
  customerName,
  phone,
  amount,
  dueDate,
}: {
  storeName: string;
  customerName: string;
  phone: string;
  amount: number;
  dueDate?: string;
}): string {
  const formattedNumber = formatPakistaniWhatsAppNumber(phone);
  const formattedAmt = `Rs. ${Math.round(Math.max(0, amount)).toLocaleString('en-PK')}`;
  const dueTextEn = dueDate || 'As soon as convenient';
  const dueTextUr = dueDate || 'جلد از جلد';

  const message = [
    `Assalam-o-Alaikum ${customerName},`,
    `Friendly reminder from *${storeName}*:`,
    `Your Udhaar / Khata due amount is *${formattedAmt}* (Due Date: ${dueTextEn}).`,
    ``,
    `محترم ${customerName}،`,
    `*${storeName}* کی جانب سے ادھار کھاتہ کی یاد دہانی:`,
    `آپ کے ذمے واجب الادا رقم *${formattedAmt}* ہے (آخری تاریخ: ${dueTextUr})۔ براہ کرم ادائیگی کی زحمت فرمائیں۔ شکریہ!`,
  ].join('\n');

  const encoded = encodeURIComponent(message);
  return formattedNumber
    ? `https://wa.me/${formattedNumber}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

export function UdhaarView({
  storeName,
  customers,
  entries,
  onAddCustomer,
  onUpdateCustomer,
  onAddEntry,
  onSendWhatsAppReminder,
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
  const [newCreditLimit, setNewCreditLimit] = useState('');
  const [newDiscountPercent, setNewDiscountPercent] = useState('');
  const [newWhatsappOptIn, setNewWhatsappOptIn] = useState(true);
  const [newSchedule, setNewSchedule] = useState<ReminderSchedule>('1_week');
  const [newDueDate, setNewDueDate] = useState<string>(() =>
    calculateDueDateFromSchedule('1_week')
  );

  // Edit Customer Reminder Modal state
  const [editingReminderCustomer, setEditingReminderCustomer] =
    useState<UdhaarCustomer | null>(null);
  const [editPhone, setEditPhone] = useState('');
  const [editCreditLimit, setEditCreditLimit] = useState('');
  const [editDiscountPercent, setEditDiscountPercent] = useState('');
  const [editWhatsappOptIn, setEditWhatsappOptIn] = useState(true);
  const [editSchedule, setEditSchedule] = useState<ReminderSchedule>('none');
  const [editDueDate, setEditDueDate] = useState('');

  // WhatsApp feedback & Printable Statement modal
  const [waNotice, setWaNotice] = useState<{
    text: string;
    manualUrl?: string;
  } | null>(null);
  const [sendingWaId, setSendingWaId] = useState<string | null>(null);
  const [showStatementModal, setShowStatementModal] = useState(false);

  // Quick Entry Form state (credit or payment)
  const [entryFormType, setEntryFormType] = useState<UdhaarEntryType | null>(null);
  const [entryAmount, setEntryAmount] = useState('');
  const [entryNote, setEntryNote] = useState('');
  const [entrySchedule, setEntrySchedule] = useState<ReminderSchedule>('none');
  const [entryDueDate, setEntryDueDate] = useState('');

  const todayYmd = getTodayYmd();

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

  const dueReminders = useMemo(() => {
    return customers
      .map((c) => {
        const balance = Math.max(0, customerSummaries.get(c.id)?.balance ?? 0);
        const dueDate = c.dueDate;
        const isDue = Boolean(dueDate && balance > 0 && dueDate <= todayYmd);
        const isOverdue = Boolean(dueDate && balance > 0 && dueDate < todayYmd);
        return {
          customer: c,
          balance,
          dueDate: dueDate || '',
          isDue,
          isOverdue,
        };
      })
      .filter((r) => r.isDue)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [customers, customerSummaries, todayYmd]);

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

  const handleScheduleChange = (
    schedule: ReminderSchedule,
    setSchedule: (s: ReminderSchedule) => void,
    setDate: (d: string) => void,
    currentDate?: string
  ) => {
    setSchedule(schedule);
    setDate(calculateDueDateFromSchedule(schedule, currentDate));
  };

  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newName.trim();
    if (!cleanName) return;

    const created = onAddCustomer({
      name: cleanName,
      phone: newPhone.trim(),
      notes: newNotes.trim(),
      openingBalance: Math.max(0, Number(newOpeningBalance) || 0),
      reminderSchedule: newSchedule,
      dueDate: newSchedule === 'none' ? undefined : newDueDate || undefined,
      creditLimit: Math.max(0, Number(newCreditLimit) || 0) || undefined,
      discountPercent: Math.min(100, Math.max(0, Number(newDiscountPercent) || 0)) || undefined,
      whatsappOptIn: newWhatsappOptIn,
    });

    setSelectedCustomerId(created.id);
    setNewName('');
    setNewPhone('');
    setNewNotes('');
    setNewOpeningBalance('');
    setNewCreditLimit('');
    setNewDiscountPercent('');
    setNewWhatsappOptIn(true);
    setNewSchedule('1_week');
    setNewDueDate(calculateDueDateFromSchedule('1_week'));
    setShowAddCustomerModal(false);
  };

  const openEditReminder = (customer: UdhaarCustomer) => {
    setEditingReminderCustomer(customer);
    setEditPhone(customer.phone);
    setEditCreditLimit(customer.creditLimit ? String(customer.creditLimit) : '');
    setEditDiscountPercent(
      customer.discountPercent ? String(customer.discountPercent) : ''
    );
    setEditWhatsappOptIn(customer.whatsappOptIn !== false);
    const sched = customer.reminderSchedule ?? (customer.dueDate ? 'custom' : 'none');
    setEditSchedule(sched);
    setEditDueDate(customer.dueDate || '');
  };

  const handleSaveReminderEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReminderCustomer) return;
    onUpdateCustomer({
      ...editingReminderCustomer,
      phone: editPhone.trim(),
      creditLimit: Math.max(0, Number(editCreditLimit) || 0) || undefined,
      discountPercent:
        Math.min(100, Math.max(0, Number(editDiscountPercent) || 0)) || undefined,
      whatsappOptIn: editWhatsappOptIn,
      reminderSchedule: editSchedule,
      dueDate: editSchedule === 'none' ? undefined : editDueDate || undefined,
    });
    setEditingReminderCustomer(null);
  };

  const handleSendReminder = async (customer: UdhaarCustomer, amount: number) => {
    const fallbackUrl = buildUdhaarWhatsAppUrl({
      storeName,
      customerName: customer.name,
      phone: customer.phone,
      amount,
      dueDate: customer.dueDate,
    });
    if (!onSendWhatsAppReminder) {
      setWaNotice({ text: t.whatsappManualFallbackNotice, manualUrl: fallbackUrl });
      return;
    }
    setSendingWaId(customer.id);
    try {
      const result = await onSendWhatsAppReminder(customer, amount);
      setWaNotice({
        text: result.statusText || t.whatsappManualFallbackNotice,
        manualUrl: result.manualUrl,
      });
    } finally {
      setSendingWaId(null);
    }
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

    if (entryFormType === 'credit' && entrySchedule !== 'none') {
      onUpdateCustomer({
        ...activeCustomer,
        reminderSchedule: entrySchedule,
        dueDate: entryDueDate || activeCustomer.dueDate,
      });
    }

    setEntryFormType(null);
    setEntryAmount('');
    setEntryNote('');
    setEntrySchedule('none');
    setEntryDueDate('');
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

      {waNotice && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-950">
          <span>{waNotice.text}</span>
          <div className="flex items-center gap-2 shrink-0">
            {waNotice.manualUrl && (
              <a
                href={waNotice.manualUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
              >
                <MessageCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t.sendWhatsappBtn}</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => setWaNotice(null)}
              className="p-1 text-emerald-800 hover:text-emerald-950 cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

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
          <p className="text-xs font-medium text-slate-500">{t.dueRemindersTitle}</p>
          <p className="font-mono text-2xl font-bold text-red-700 tabular-nums mt-2">
            {dueReminders.length}
          </p>
        </div>
      </section>

      {/* Due Reminders Section (Today & Overdue) */}
      <section className="bg-white border border-amber-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 bg-amber-50/70 border-b border-amber-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-800 shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-bold text-amber-950">{t.dueRemindersTitle}</h2>
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-700 text-white tabular-nums">
              {dueReminders.length}
            </span>
          </div>
          <span className="text-xs font-mono text-amber-900 tabular-nums">
            {todayYmd}
          </span>
        </div>

        {dueReminders.length === 0 ? (
          <div className="px-5 py-4 text-xs text-slate-500">{t.noDueReminders}</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {dueReminders.map(({ customer, balance, dueDate, isOverdue }) => {
              const waUrl = buildUdhaarWhatsAppUrl({
                storeName,
                customerName: customer.name,
                phone: customer.phone,
                amount: balance,
                dueDate,
              });
              return (
                <div
                  key={customer.id}
                  className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-amber-50/40 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setSelectedCustomerId(customer.id)}
                        className="text-sm font-bold text-slate-900 hover:text-teal-800 cursor-pointer"
                      >
                        {customer.name}
                      </button>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                          isOverdue
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}
                      >
                        {isOverdue ? t.overdueLabel : t.dueTodayLabel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {customer.phone || '—'} · {t.dueDateLabel}: {dueDate}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-sm font-bold text-amber-800 tabular-nums">
                      {formatCurrency(balance, lang)}
                    </span>

                    {onSendWhatsAppReminder ? (
                      <button
                        type="button"
                        disabled={sendingWaId === customer.id}
                        onClick={() => void handleSendReminder(customer, balance)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg whitespace-nowrap transition-colors min-h-[36px] cursor-pointer"
                      >
                        <MessageCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{t.sendWhatsappBtn}</span>
                      </button>
                    ) : (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap transition-colors min-h-[36px]"
                      >
                        <MessageCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{t.sendWhatsappBtn}</span>
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
            <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
              {filteredCustomers.map((customer) => {
                const summary = customerSummaries.get(customer.id) ?? {
                  totalCredit: 0,
                  totalPayment: 0,
                  balance: 0,
                };
                const cleanBalance = Math.max(0, summary.balance);
                const isSelected = activeCustomer?.id === customer.id;
                const isDueOrOverdue = Boolean(
                  customer.dueDate && cleanBalance > 0 && customer.dueDate <= todayYmd
                );
                const isOverdue = Boolean(
                  customer.dueDate && cleanBalance > 0 && customer.dueDate < todayYmd
                );
                const waUrl = buildUdhaarWhatsAppUrl({
                  storeName,
                  customerName: customer.name,
                  phone: customer.phone,
                  amount: cleanBalance,
                  dueDate: customer.dueDate,
                });

                return (
                  <div
                    key={customer.id}
                    onClick={() => {
                      setSelectedCustomerId(customer.id);
                      setEntryFormType(null);
                    }}
                    className={`w-full px-4 py-3.5 transition-colors cursor-pointer space-y-2 ${
                      isSelected
                        ? 'bg-teal-50/70'
                        : isDueOrOverdue
                        ? 'bg-amber-50/40 hover:bg-amber-50/70'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p
                            className={`text-sm font-semibold truncate ${
                              isSelected ? 'text-teal-900' : 'text-slate-900'
                            }`}
                          >
                            {customer.name}
                          </p>
                          {(customer.creditLimit ?? 0) > 0 &&
                            cleanBalance > (customer.creditLimit ?? 0) && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                                {t.creditLimitExceededMsg.split(' ')[0]} Limit
                              </span>
                            )}
                          {(customer.discountPercent ?? 0) > 0 && (
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-teal-100 text-teal-800">
                              -{customer.discountPercent}%
                            </span>
                          )}
                          {isDueOrOverdue && (
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                isOverdue
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {isOverdue ? t.overdueLabel : t.dueTodayLabel}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono text-slate-500 mt-0.5 flex items-center gap-1">
                          <Phone className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span>{customer.phone || '—'}</span>
                        </p>
                      </div>

                      <div className="text-end shrink-0">
                        <p
                          className={`font-mono text-sm font-bold tabular-nums ${
                            cleanBalance > 0 ? 'text-amber-700' : 'text-emerald-700'
                          }`}
                        >
                          {formatCurrency(cleanBalance, lang)}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {cleanBalance <= 0 ? t.settledStatus : t.remainingBalanceLabel}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] font-mono text-slate-500">
                        {customer.dueDate
                          ? `${t.dueDateLabel}: ${customer.dueDate}`
                          : t.scheduleNone}
                      </span>

                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md whitespace-nowrap transition-colors"
                      >
                        <MessageCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span>{t.sendWhatsappBtn}</span>
                      </a>
                    </div>
                  </div>
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
              <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {activeCustomer.name}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    <span className="font-mono">{activeCustomer.phone || '—'}</span>
                    {activeCustomer.dueDate ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono text-amber-800 font-medium">
                          {t.dueDateLabel}: {activeCustomer.dueDate}
                        </span>
                      </>
                    ) : null}
                    {activeCustomer.notes ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span>{activeCustomer.notes}</span>
                      </>
                    ) : null}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-start lg:text-end me-2">
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

                  <button
                    type="button"
                    onClick={() => openEditReminder(activeCustomer)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap min-h-[40px] transition-colors cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{t.editReminderBtn}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowStatementModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap min-h-[40px] transition-colors cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{t.printStatementBtn}</span>
                  </button>

                  {onSendWhatsAppReminder ? (
                    <button
                      type="button"
                      disabled={sendingWaId === activeCustomer.id}
                      onClick={() =>
                        void handleSendReminder(
                          activeCustomer,
                          Math.max(0, activeSummary.balance)
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg whitespace-nowrap min-h-[40px] transition-colors cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{t.sendWhatsappBtn}</span>
                    </button>
                  ) : (
                    <a
                      href={buildUdhaarWhatsAppUrl({
                        storeName,
                        customerName: activeCustomer.name,
                        phone: activeCustomer.phone,
                        amount: Math.max(0, activeSummary.balance),
                        dueDate: activeCustomer.dueDate,
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap min-h-[40px] transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{t.sendWhatsappBtn}</span>
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setEntryFormType('credit');
                      setEntryAmount('');
                      setEntryNote('');
                      const fallbackSched = activeCustomer.reminderSchedule ?? '1_week';
                      setEntrySchedule(fallbackSched);
                      setEntryDueDate(
                        activeCustomer.dueDate ||
                          calculateDueDateFromSchedule(fallbackSched)
                      );
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

                  {entryFormType === 'credit' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label
                          htmlFor="entry-reminder-sched"
                          className="block text-xs font-medium text-slate-700 mb-1"
                        >
                          {t.reminderScheduleLabel}
                        </label>
                        <select
                          id="entry-reminder-sched"
                          value={entrySchedule}
                          onChange={(e) =>
                            handleScheduleChange(
                              e.target.value as ReminderSchedule,
                              setEntrySchedule,
                              setEntryDueDate,
                              entryDueDate
                            )
                          }
                          className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700"
                        >
                          <option value="none">{t.scheduleNone}</option>
                          <option value="3_days">{t.schedule3Days}</option>
                          <option value="1_week">{t.schedule1Week}</option>
                          <option value="2_weeks">{t.schedule2Weeks}</option>
                          <option value="1_month">{t.schedule1Month}</option>
                          <option value="custom">{t.scheduleCustom}</option>
                        </select>
                      </div>

                      {entrySchedule !== 'none' && (
                        <div>
                          <label
                            htmlFor="entry-due-date"
                            className="block text-xs font-medium text-slate-700 mb-1"
                          >
                            {t.dueDateLabel}
                          </label>
                          <input
                            id="entry-due-date"
                            type="date"
                            value={entryDueDate}
                            onChange={(e) => {
                              setEntryDueDate(e.target.value);
                              setEntrySchedule('custom');
                            }}
                            className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700"
                          />
                        </div>
                      )}
                    </div>
                  )}
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
                        <th className="py-2.5 px-4 text-end font-medium">
                          {t.balanceCol}
                        </th>
                        <th className="py-2.5 px-5 text-end font-medium">
                          {t.actionCol}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeLedgerRows.map((entry) => {
                        const entryWhatsappUrl = buildUdhaarWhatsAppUrl({
                          storeName,
                          customerName: activeCustomer.name,
                          phone: activeCustomer.phone,
                          amount:
                            entry.type === 'credit'
                              ? entry.amount
                              : Math.max(0, activeSummary.balance),
                          dueDate: activeCustomer.dueDate,
                        });
                        return (
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
                            <td className="py-3 px-4 text-end font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                              {formatCurrency(Math.max(0, entry.runningBalance), lang)}
                            </td>
                            <td className="py-3 px-5 text-end">
                              <a
                                href={entryWhatsappUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md whitespace-nowrap transition-colors"
                              >
                                <MessageCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>{t.sendWhatsappBtn}</span>
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Add Customer Modal (with WhatsApp Phone & Reminder Schedule) */}
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
                  {t.customerWhatsappLabel}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="khata-cust-schedule"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {t.reminderScheduleLabel}
                  </label>
                  <select
                    id="khata-cust-schedule"
                    value={newSchedule}
                    onChange={(e) =>
                      handleScheduleChange(
                        e.target.value as ReminderSchedule,
                        setNewSchedule,
                        setNewDueDate,
                        newDueDate
                      )
                    }
                    className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  >
                    <option value="none">{t.scheduleNone}</option>
                    <option value="3_days">{t.schedule3Days}</option>
                    <option value="1_week">{t.schedule1Week}</option>
                    <option value="2_weeks">{t.schedule2Weeks}</option>
                    <option value="1_month">{t.schedule1Month}</option>
                    <option value="custom">{t.scheduleCustom}</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="khata-cust-due-date"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {t.dueDateLabel}
                  </label>
                  <input
                    id="khata-cust-due-date"
                    type="date"
                    disabled={newSchedule === 'none'}
                    value={newDueDate}
                    onChange={(e) => {
                      setNewDueDate(e.target.value);
                      setNewSchedule('custom');
                    }}
                    className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white disabled:opacity-50"
                  />
                </div>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="khata-cust-credit-limit"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {t.creditLimitLabel}
                  </label>
                  <input
                    id="khata-cust-credit-limit"
                    type="number"
                    min={0}
                    value={newCreditLimit}
                    onChange={(e) => setNewCreditLimit(e.target.value)}
                    placeholder="0"
                    className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="khata-cust-discount"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {t.customerDiscountLabel}
                  </label>
                  <input
                    id="khata-cust-discount"
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    value={newDiscountPercent}
                    onChange={(e) => setNewDiscountPercent(e.target.value)}
                    placeholder="0"
                    className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newWhatsappOptIn}
                  onChange={(e) => setNewWhatsappOptIn(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                />
                <span>{t.whatsappOptInLabel}</span>
              </label>

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

      {/* Edit Customer Reminder Schedule & WhatsApp Modal */}
      {editingReminderCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-reminder-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2
                id="edit-reminder-modal-title"
                className="text-base font-bold text-slate-900"
              >
                {t.editReminderBtn} — {editingReminderCustomer.name}
              </h2>
              <button
                type="button"
                onClick={() => setEditingReminderCustomer(null)}
                aria-label={t.closeBtn}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveReminderEdit} className="p-5 space-y-4">
              <div>
                <label
                  htmlFor="edit-khata-phone"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  {t.customerWhatsappLabel}
                </label>
                <input
                  id="edit-khata-phone"
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="0300-1234567"
                  className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-khata-schedule"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  {t.reminderScheduleLabel}
                </label>
                <select
                  id="edit-khata-schedule"
                  value={editSchedule}
                  onChange={(e) =>
                    handleScheduleChange(
                      e.target.value as ReminderSchedule,
                      setEditSchedule,
                      setEditDueDate,
                      editDueDate
                    )
                  }
                  className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                >
                  <option value="none">{t.scheduleNone}</option>
                  <option value="3_days">{t.schedule3Days}</option>
                  <option value="1_week">{t.schedule1Week}</option>
                  <option value="2_weeks">{t.schedule2Weeks}</option>
                  <option value="1_month">{t.schedule1Month}</option>
                  <option value="custom">{t.scheduleCustom}</option>
                </select>
              </div>

              {editSchedule !== 'none' && (
                <div>
                  <label
                    htmlFor="edit-khata-due-date"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {t.dueDateLabel}
                  </label>
                  <input
                    id="edit-khata-due-date"
                    type="date"
                    required
                    value={editDueDate}
                    onChange={(e) => {
                      setEditDueDate(e.target.value);
                      setEditSchedule('custom');
                    }}
                    className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="edit-khata-credit-limit"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {t.creditLimitLabel}
                  </label>
                  <input
                    id="edit-khata-credit-limit"
                    type="number"
                    min={0}
                    value={editCreditLimit}
                    onChange={(e) => setEditCreditLimit(e.target.value)}
                    placeholder="0"
                    className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-khata-discount"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {t.customerDiscountLabel}
                  </label>
                  <input
                    id="edit-khata-discount"
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    value={editDiscountPercent}
                    onChange={(e) => setEditDiscountPercent(e.target.value)}
                    placeholder="0"
                    className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editWhatsappOptIn}
                  onChange={(e) => setEditWhatsappOptIn(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                />
                <span>{t.whatsappOptInLabel}</span>
              </label>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingReminderCustomer(null)}
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

      {/* Printable Khata Statement Modal */}
      {showStatementModal && activeCustomer && activeSummary && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="khata-statement-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 no-print">
              <h2 id="khata-statement-title" className="text-base font-bold text-slate-900">
                {t.printStatementBtn} — {activeCustomer.name}
              </h2>
              <button
                type="button"
                onClick={() => setShowStatementModal(false)}
                aria-label={t.closeBtn}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between border-b border-slate-200 pb-4">
                <div>
                  <p className="text-lg font-bold text-slate-900">{storeName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t.udhaarTitle}</p>
                </div>
                <div className="text-end text-xs">
                  <p className="font-bold text-slate-900">{activeCustomer.name}</p>
                  <p className="font-mono text-slate-600">{activeCustomer.phone || '—'}</p>
                  {(activeCustomer.creditLimit ?? 0) > 0 && (
                    <p className="font-mono text-slate-500">
                      {t.creditLimitLabel}: {formatCurrency(activeCustomer.creditLimit ?? 0, lang)}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-slate-500">{t.totalCreditGivenLabel}</p>
                  <p className="font-mono font-bold text-slate-900 tabular-nums mt-1">
                    {formatCurrency(activeSummary.totalCredit, lang)}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-slate-500">{t.totalPaymentsReceivedLabel}</p>
                  <p className="font-mono font-bold text-emerald-700 tabular-nums mt-1">
                    {formatCurrency(activeSummary.totalPayment, lang)}
                  </p>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg">
                  <p className="text-amber-800">{t.remainingBalanceLabel}</p>
                  <p className="font-mono font-bold text-amber-900 tabular-nums mt-1">
                    {formatCurrency(Math.max(0, activeSummary.balance), lang)}
                  </p>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 text-start">{t.entryDateCol}</th>
                      <th className="py-2 px-3 text-start">{t.entryTypeCol}</th>
                      <th className="py-2 px-3 text-start">{t.entryNoteCol}</th>
                      <th className="py-2 px-3 text-end">{t.amountCol}</th>
                      <th className="py-2 px-3 text-end">{t.balanceCol}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeLedgerRows.slice(0, 30).map((row) => (
                      <tr key={row.id}>
                        <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                          {formatDateTime(row.createdAt)}
                        </td>
                        <td className="py-2 px-3">
                          {row.type === 'credit' ? t.typeCredit : t.typePayment}
                        </td>
                        <td className="py-2 px-3 text-slate-700">{row.note}</td>
                        <td className="py-2 px-3 text-end font-mono tabular-nums font-semibold">
                          {row.type === 'credit' ? '+' : '-'}
                          {formatCurrency(row.amount, lang)}
                        </td>
                        <td className="py-2 px-3 text-end font-mono tabular-nums">
                          {formatCurrency(Math.max(0, row.runningBalance), lang)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2 pt-2 no-print">
                <button
                  type="button"
                  onClick={() => setShowStatementModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg cursor-pointer"
                >
                  {t.closeBtn}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{t.printStatementBtn}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
