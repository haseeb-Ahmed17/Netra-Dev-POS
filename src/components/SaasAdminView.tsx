import { useMemo, useState } from 'react';
import { CalendarPlus, RefreshCw, Search, ShieldBan, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import type { TranslationStrings } from '../i18n';
import type { Language, SubscriptionPaymentEntry, SubscriptionRecord } from '../types';

interface SaasAdminViewProps {
  subscriptions: SubscriptionRecord[];
  loading: boolean;
  updatingUserId: string | null;
  onRefresh: () => void;
  onAdminAction: (
    sub: SubscriptionRecord,
    action: 'extend_30_days' | 'extend_1_year' | 'toggle_block'
  ) => void;
  onUpdateSubscriptionMeta?: (
    sub: SubscriptionRecord,
    patch: {
      planName?: string;
      maxBranches?: number;
      maxEmployees?: number;
      paymentEntry?: SubscriptionPaymentEntry;
    }
  ) => void;
  lang: Language;
  t: TranslationStrings;
}

export function getDaysRemaining(expiresAt: string): number {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

export function SaasAdminView({
  subscriptions,
  loading,
  updatingUserId,
  onRefresh,
  onAdminAction,
  onUpdateSubscriptionMeta,
  lang,
  t,
}: SaasAdminViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'locked'>('all');
  const [managingSub, setManagingSub] = useState<SubscriptionRecord | null>(null);
  const [planNameInput, setPlanNameInput] = useState('');
  const [maxBranchesInput, setMaxBranchesInput] = useState('3');
  const [maxEmployeesInput, setMaxEmployeesInput] = useState('15');
  const [paymentAmountInput, setPaymentAmountInput] = useState('');
  const [paymentNoteInput, setPaymentNoteInput] = useState('');

  const stats = useMemo(() => {
    let activeCount = 0;
    let lockedCount = 0;
    for (const sub of subscriptions) {
      const expired = new Date(sub.expiresAt).getTime() <= Date.now();
      if (sub.isBlocked || expired) {
        lockedCount += 1;
      } else {
        activeCount += 1;
      }
    }
    return {
      total: subscriptions.length,
      activeCount,
      lockedCount,
    };
  }, [subscriptions]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return subscriptions.filter((sub) => {
      const expired = new Date(sub.expiresAt).getTime() <= Date.now();
      const locked = sub.isBlocked || expired;
      if (statusFilter === 'active' && locked) return false;
      if (statusFilter === 'locked' && !locked) return false;
      if (!q) return true;
      return (
        sub.email.toLowerCase().includes(q) ||
        (sub.shopName ?? '').toLowerCase().includes(q) ||
        sub.planName.toLowerCase().includes(q)
      );
    });
  }, [subscriptions, searchQuery, statusFilter]);

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t.saasAdminTitle}
          </h1>
          <p className="text-sm text-slate-600 mt-1">{t.saasAdminSubtitle}</p>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={onRefresh}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0 min-h-[40px] transition-colors cursor-pointer disabled:opacity-60"
        >
          <RefreshCw
            className={`w-4 h-4 shrink-0 ${loading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>{t.refreshListBtn}</span>
        </button>
      </div>

      {/* 3-Column KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.totalTenantsLabel}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {stats.total}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.activeTenantsLabel}</p>
          <p className="font-mono text-2xl font-bold text-emerald-700 tabular-nums mt-2">
            {stats.activeCount}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.expiredBlockedLabel}</p>
          <p className="font-mono text-2xl font-bold text-red-700 tabular-nums mt-2">
            {stats.lockedCount}
          </p>
        </div>
      </section>

      {/* Filter Toolbar */}
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
            placeholder={t.searchTenantsPlaceholder}
            className="w-full h-10 ps-9 pe-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 focus:bg-white transition-colors"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {(
            [
              { id: 'all', label: t.filterAllPayments },
              { id: 'active', label: t.statusActiveLabel },
              { id: 'locked', label: t.expiredBlockedLabel },
            ] as const
          ).map((opt) => {
            const active = statusFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Shopkeepers Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            {t.noTenantsFound}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-5 text-start font-medium">{t.tenantEmailCol}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.tenantShopCol}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.tenantPlanCol}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.tenantExpiryCol}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.statusCol}</th>
                  <th className="py-3 px-5 text-end font-medium">{t.actionCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((sub) => {
                  const daysLeft = getDaysRemaining(sub.expiresAt);
                  const isExpired = daysLeft <= 0;
                  const isBusy = updatingUserId === sub.userId;
                  const expiryLabel = new Date(sub.expiresAt).toLocaleDateString(
                    lang === 'ur' ? 'en-PK' : 'en-US',
                    { year: 'numeric', month: 'short', day: '2-digit' }
                  );

                  return (
                    <tr key={sub.userId} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-5 font-mono text-xs font-semibold text-slate-900">
                        {sub.email}
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {sub.shopName || '—'}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">
                        <div>{sub.planName}</div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {sub.maxBranches ?? 3}B / {sub.maxEmployees ?? 15}S
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                        <div>{expiryLabel}</div>
                        <div className="text-[11px] text-slate-500">
                          {daysLeft > 0 ? `${daysLeft} ${t.daysLeftSuffix}` : t.statusExpiredLabel}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {sub.isBlocked ? (
                          <span className="text-xs font-semibold text-red-700">
                            {t.statusBlockedLabel}
                          </span>
                        ) : isExpired ? (
                          <span className="text-xs font-semibold text-amber-800">
                            {t.statusExpiredLabel}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-emerald-700">
                            {t.statusActiveLabel}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-5 text-end">
                        <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onAdminAction(sub, 'extend_30_days')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <CalendarPlus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>{t.extend30DaysBtn}</span>
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onAdminAction(sub, 'extend_1_year')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <CalendarPlus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>{t.extend1YearBtn}</span>
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onAdminAction(sub, 'toggle_block')}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50 ${
                              sub.isBlocked
                                ? 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100'
                                : 'text-red-700 bg-red-50 hover:bg-red-100'
                            }`}
                          >
                            {sub.isBlocked ? (
                              <>
                                <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>{t.unblockUserBtn}</span>
                              </>
                            ) : (
                              <>
                                <ShieldBan className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>{t.blockUserBtn}</span>
                              </>
                            )}
                          </button>
                          {onUpdateSubscriptionMeta && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setManagingSub(sub);
                                setPlanNameInput(sub.planName);
                                setMaxBranchesInput(String(sub.maxBranches ?? 3));
                                setMaxEmployeesInput(String(sub.maxEmployees ?? 15));
                                setPaymentAmountInput('');
                                setPaymentNoteInput('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md whitespace-nowrap transition-colors cursor-pointer"
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span>Limits</span>
                            </button>
                          )}
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

      {managingSub && onUpdateSubscriptionMeta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                {managingSub.shopName || managingSub.email}
              </h2>
              <button
                type="button"
                onClick={() => setManagingSub(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const amt = Math.max(0, Number(paymentAmountInput) || 0);
                onUpdateSubscriptionMeta(managingSub, {
                  planName: planNameInput.trim() || managingSub.planName,
                  maxBranches: Math.max(1, Number(maxBranchesInput) || 1),
                  maxEmployees: Math.max(1, Number(maxEmployeesInput) || 1),
                  paymentEntry:
                    amt > 0
                      ? {
                          id: `sub-pay-${Date.now()}`,
                          amount: amt,
                          currency: 'PKR',
                          planName: planNameInput.trim() || managingSub.planName,
                          paidAt: new Date().toISOString(),
                          note: paymentNoteInput.trim() || 'License renewal payment',
                        }
                      : undefined,
                });
                setManagingSub(null);
              }}
              className="p-5 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.tenantPlanCol}
                  </label>
                  <input
                    type="text"
                    value={planNameInput}
                    onChange={(e) => setPlanNameInput(e.target.value)}
                    className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Max Branches
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={maxBranchesInput}
                    onChange={(e) => setMaxBranchesInput(e.target.value)}
                    className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Max Staff
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={maxEmployeesInput}
                    onChange={(e) => setMaxEmployeesInput(e.target.value)}
                    className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Record Payment (Rs., optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={paymentAmountInput}
                    onChange={(e) => setPaymentAmountInput(e.target.value)}
                    placeholder="0"
                    className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Note
                  </label>
                  <input
                    type="text"
                    value={paymentNoteInput}
                    onChange={(e) => setPaymentNoteInput(e.target.value)}
                    placeholder="Bank / JazzCash ref"
                    className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {managingSub.paymentHistory && managingSub.paymentHistory.length > 0 && (
                <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1 text-xs">
                  {managingSub.paymentHistory.map((p) => (
                    <div key={p.id} className="flex justify-between font-mono">
                      <span>{p.paidAt.slice(0, 10)} · {p.planName}</span>
                      <span className="font-semibold">Rs. {p.amount}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setManagingSub(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg cursor-pointer"
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                >
                  {t.saveProductBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
