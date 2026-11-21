import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { formatCurrency, type TranslationStrings } from '../i18n';
import type { ExpenseCategory, ExpenseRecord, Language } from '../types';

interface ExpensesViewProps {
  expenses: ExpenseRecord[];
  canDelete?: boolean;
  onAddExpense: (payload: Omit<ExpenseRecord, 'id' | 'createdAt'>) => void;
  onUpdateExpense: (updated: ExpenseRecord) => void;
  onDeleteExpense: (expenseId: string) => void;
  lang: Language;
  t: TranslationStrings;
}

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Rent',
  'Electricity',
  'Staff Salary',
  'Supplies',
  'Maintenance',
  'Other',
];

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getExpenseCategoryLabel(
  category: ExpenseCategory,
  t: TranslationStrings
): string {
  switch (category) {
    case 'Rent':
      return t.expCatRent;
    case 'Electricity':
      return t.expCatElectricity;
    case 'Staff Salary':
      return t.expCatSalary;
    case 'Supplies':
      return t.expCatSupplies;
    case 'Maintenance':
      return t.expCatMaintenance;
    case 'Other':
      return t.expCatOther;
  }
}

export function ExpensesView({
  expenses,
  canDelete = true,
  onAddExpense,
  onUpdateExpense,
  onDeleteExpense,
  lang,
  t,
}: ExpensesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExpenseCategory>('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | 'month' | 'year'>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Supplies');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(getTodayDateString);
  const [notes, setNotes] = useState('');

  const summaryStats = useMemo(() => {
    const todayStr = getTodayDateString();
    const monthPrefix = todayStr.slice(0, 7);
    const yearPrefix = todayStr.slice(0, 4);

    let todayTotal = 0;
    let monthTotal = 0;
    let yearTotal = 0;

    for (const exp of expenses) {
      if (exp.expenseDate === todayStr) todayTotal += exp.amount;
      if (exp.expenseDate.startsWith(monthPrefix)) monthTotal += exp.amount;
      if (exp.expenseDate.startsWith(yearPrefix)) yearTotal += exp.amount;
    }

    return {
      todayTotal,
      monthTotal,
      yearTotal,
      count: expenses.length,
    };
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const todayStr = getTodayDateString();
    const monthPrefix = todayStr.slice(0, 7);
    const yearPrefix = todayStr.slice(0, 4);

    return [...expenses]
      .sort((a, b) => {
        if (b.expenseDate !== a.expenseDate) {
          return b.expenseDate.localeCompare(a.expenseDate);
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .filter((exp) => {
        if (categoryFilter !== 'all' && exp.category !== categoryFilter) return false;
        if (periodFilter === 'today' && exp.expenseDate !== todayStr) return false;
        if (periodFilter === 'month' && !exp.expenseDate.startsWith(monthPrefix)) return false;
        if (periodFilter === 'year' && !exp.expenseDate.startsWith(yearPrefix)) return false;
        if (!q) return true;
        return (
          exp.title.toLowerCase().includes(q) ||
          exp.notes.toLowerCase().includes(q) ||
          exp.category.toLowerCase().includes(q)
        );
      });
  }, [expenses, searchQuery, categoryFilter, periodFilter]);

  const openAddModal = () => {
    setEditingExpense(null);
    setTitle('');
    setCategory('Supplies');
    setAmount('');
    setExpenseDate(getTodayDateString());
    setNotes('');
    setShowModal(true);
  };

  const openEditModal = (exp: ExpenseRecord) => {
    setEditingExpense(exp);
    setTitle(exp.title);
    setCategory(exp.category);
    setAmount(String(exp.amount));
    setExpenseDate(exp.expenseDate || getTodayDateString());
    setNotes(exp.notes);
    setShowModal(true);
  };

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const numAmount = Math.max(0, Number(amount) || 0);
    if (!cleanTitle || numAmount <= 0) return;

    if (editingExpense) {
      onUpdateExpense({
        ...editingExpense,
        title: cleanTitle,
        category,
        amount: numAmount,
        expenseDate: expenseDate || getTodayDateString(),
        notes: notes.trim(),
      });
    } else {
      onAddExpense({
        title: cleanTitle,
        category,
        amount: numAmount,
        expenseDate: expenseDate || getTodayDateString(),
        notes: notes.trim(),
      });
    }
    setShowModal(false);
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t.expensesTitle}
          </h1>
          <p className="text-sm text-slate-600 mt-1">{t.expensesSubtitle}</p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap shrink-0 min-h-[40px] transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{t.addExpenseBtn}</span>
        </button>
      </div>

      {/* 4-Column Expense KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.todayExpensesLabel}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {formatCurrency(summaryStats.todayTotal, lang)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.monthExpensesLabel}</p>
          <p className="font-mono text-2xl font-bold text-amber-800 tabular-nums mt-2">
            {formatCurrency(summaryStats.monthTotal, lang)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.yearExpensesLabel}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {formatCurrency(summaryStats.yearTotal, lang)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.totalExpensesLabel}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {summaryStats.count}
          </p>
        </div>
      </section>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search
              className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`${t.expenseTitleLabel}...`}
              className="w-full h-10 ps-9 pe-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 focus:bg-white transition-colors"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as 'all' | ExpenseCategory)
            }
            className="h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700"
          >
            <option value="all">{t.categoryAll}</option>
            {EXPENSE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {getExpenseCategoryLabel(cat, t)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {(
            [
              { id: 'all', label: t.filterAllPayments },
              { id: 'today', label: t.timeframeToday },
              { id: 'month', label: t.timeframeMonth },
              { id: 'year', label: t.timeframeYear },
            ] as const
          ).map((pf) => {
            const active = periodFilter === pf.id;
            return (
              <button
                key={pf.id}
                type="button"
                onClick={() => setPeriodFilter(pf.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {pf.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Expenses Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredExpenses.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            {t.noExpensesFound}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-5 text-start font-medium">{t.expenseDateLabel}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.expenseTitleLabel}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.expenseCategoryLabel}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.expenseNotesLabel}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.amountCol}</th>
                  <th className="py-3 px-5 text-end font-medium">{t.actionCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-5 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {exp.expenseDate}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {exp.title}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">
                      {getExpenseCategoryLabel(exp.category, t)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 max-w-xs truncate">
                      {exp.notes || '—'}
                    </td>
                    <td className="py-3 px-4 text-end font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatCurrency(exp.amount, lang)}
                    </td>
                    <td className="py-3 px-5 text-end">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(exp)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span>{t.editBtn}</span>
                        </button>

                        {canDelete && (
                          confirmDeleteId === exp.id ? (
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteExpense(exp.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md whitespace-nowrap transition-colors cursor-pointer"
                            >
                              {t.confirmDeleteBtn}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(exp.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md whitespace-nowrap transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                              <span>{t.deleteBtn}</span>
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add / Edit Expense Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expense-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2
                id="expense-modal-title"
                className="text-base font-bold text-slate-900"
              >
                {editingExpense ? t.editExpenseTitle : t.addExpenseTitle}
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label={t.closeBtn}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-5 space-y-4">
              <div>
                <label
                  htmlFor="exp-title-input"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  {t.expenseTitleLabel}
                </label>
                <input
                  id="exp-title-input"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Shop Rent / Electricity Bill"
                  className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="exp-cat-select"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {t.expenseCategoryLabel}
                  </label>
                  <select
                    id="exp-cat-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                    className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  >
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {getExpenseCategoryLabel(cat, t)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="exp-date-input"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {t.expenseDateLabel}
                  </label>
                  <input
                    id="exp-date-input"
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="exp-amount-input"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  {t.expenseAmountLabel}
                </label>
                <input
                  id="exp-amount-input"
                  type="number"
                  min={1}
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="1500"
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              <div>
                <label
                  htmlFor="exp-notes-input"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  {t.expenseNotesLabel}
                </label>
                <input
                  id="exp-notes-input"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg min-h-[40px] cursor-pointer"
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg min-h-[40px] cursor-pointer"
                >
                  {t.saveExpenseBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
