import { useState, type FormEvent } from 'react';
import {
  Wallet,
  Lock,
  Unlock,
  ArrowDownCircle,
  ArrowUpCircle,
  Printer,
  ShieldAlert,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { formatCurrency, formatDateTime, type TranslationStrings } from '../i18n';
import type { Branch, CashShift, Employee, Language } from '../types';

interface CashDrawerViewProps {
  shifts: CashShift[];
  activeShift: CashShift | null;
  activeEmployee: Employee | null;
  branches: Branch[];
  selectedBranchId: string;
  canCloseShift: boolean;
  onOpenShift: (openingCash: number, branchId?: string) => void;
  onDrawerMovement: (type: 'cash_in' | 'cash_out', amount: number, note: string) => void;
  onCloseShift: (actualCash: number, note: string) => void;
  lang: Language;
  t: TranslationStrings;
}

export function CashDrawerView({
  shifts,
  activeShift,
  activeEmployee,
  branches,
  selectedBranchId,
  canCloseShift,
  onOpenShift,
  onDrawerMovement,
  onCloseShift,
  lang,
  t,
}: CashDrawerViewProps) {
  const [openingInput, setOpeningInput] = useState('5000');
  const [moveType, setMoveType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [moveAmount, setMoveAmount] = useState('');
  const [moveNote, setMoveNote] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [actualCashInput, setActualCashInput] = useState('');
  const [closingNote, setClosingNote] = useState('');
  const [slipShift, setSlipShift] = useState<CashShift | null>(null);

  const handleOpen = (e: FormEvent) => {
    e.preventDefault();
    const amount = Math.max(0, Number(openingInput) || 0);
    onOpenShift(amount, selectedBranchId);
  };

  const handleMovement = (e: FormEvent) => {
    e.preventDefault();
    const amt = Number(moveAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    onDrawerMovement(moveType, amt, moveNote.trim());
    setMoveAmount('');
    setMoveNote('');
  };

  const handleCloseConfirm = (e: FormEvent) => {
    e.preventDefault();
    if (!canCloseShift) return;
    const actual = Math.max(0, Number(actualCashInput) || 0);
    onCloseShift(actual, closingNote.trim());
    setShowCloseModal(false);
    setActualCashInput('');
    setClosingNote('');
  };

  const closedShifts = shifts.filter((s) => s.status === 'closed');
  const actualNumber = Number(actualCashInput || 0);
  const diffPreview = activeShift ? actualNumber - activeShift.expectedCash : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t.shiftsTitle}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t.shiftsSubtitle}</p>
        </div>
        {activeShift && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSlipShift(activeShift);
                setTimeout(() => window.print(), 100);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg min-h-[40px] cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.printShiftSlipBtn}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActualCashInput(String(Math.round(activeShift.expectedCash)));
                setShowCloseModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg min-h-[40px] cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.closeShiftBtn}</span>
            </button>
          </div>
        )}
      </div>

      {/* Active Shift Card or Open Shift Form */}
      {!activeShift ? (
        <form
          onSubmit={handleOpen}
          className="bg-white border border-slate-200 rounded-xl p-6 max-w-lg space-y-4"
        >
          <div className="flex items-center gap-2.5 text-slate-900">
            <Unlock className="w-5 h-5 text-teal-700" aria-hidden="true" />
            <h2 className="text-base font-bold">{t.openShiftBtn}</h2>
          </div>
          <p className="text-sm text-slate-600">{t.noActiveShiftMsg}</p>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t.openingCashLabel}
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={openingInput}
              onChange={(e) => setOpeningInput(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600"
              required
            />
          </div>
          <div className="text-xs text-slate-500 flex flex-wrap gap-3">
            <span>
              {t.cashierLabel}: <strong className="text-slate-800">{activeEmployee?.name || 'Admin'}</strong>
            </span>
            <span>
              Branch:{' '}
              <strong className="text-slate-800">
                {branches.find((b) => b.id === selectedBranchId)?.name || 'Main Branch'}
              </strong>
            </span>
          </div>
          <button
            type="submit"
            className="w-full py-2.5 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold min-h-[42px] cursor-pointer"
          >
            {t.openShiftBtn}
          </button>
        </form>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* KPI Summary */}
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">{t.shiftOpenStatus}</span>
              <p className="text-sm font-bold text-emerald-700 mt-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                <span>{activeShift.cashierName}</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-1">{formatDateTime(activeShift.startedAt)}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">{t.openingCashLabel}</span>
              <p className="font-mono text-lg font-bold text-slate-900 tabular-nums mt-1">
                {formatCurrency(activeShift.openingCash, lang)}
              </p>
            </div>
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
              <span className="text-xs font-semibold text-teal-800">{t.expectedCashLabel}</span>
              <p className="font-mono text-xl font-extrabold text-teal-900 tabular-nums mt-1">
                {formatCurrency(activeShift.expectedCash, lang)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">Cash Sales</span>
              <p className="font-mono text-base font-bold text-slate-900 tabular-nums mt-1">
                {formatCurrency(activeShift.cashSalesTotal, lang)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">Cash Refunds</span>
              <p className="font-mono text-base font-bold text-rose-700 tabular-nums mt-1">
                -{formatCurrency(activeShift.cashRefundsTotal, lang)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs text-slate-500">Drawer In / Out</span>
              <p className="font-mono text-sm font-bold text-slate-900 tabular-nums mt-1">
                +{formatCurrency(activeShift.cashInTotal, lang)} / -{formatCurrency(activeShift.cashOutTotal + activeShift.expenseTotal, lang)}
              </p>
            </div>
          </div>

          {/* Drawer Movement Form */}
          <form
            onSubmit={handleMovement}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3"
          >
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-teal-700" aria-hidden="true" />
              <span>{t.cashDrawerMovementsTitle}</span>
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMoveType('cash_in')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer ${
                  moveType === 'cash_in'
                    ? 'bg-emerald-700 text-white border-emerald-700'
                    : 'bg-white text-slate-700 border-slate-200'
                }`}
              >
                <ArrowDownCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.cashInBtn}</span>
              </button>
              <button
                type="button"
                onClick={() => setMoveType('cash_out')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer ${
                  moveType === 'cash_out'
                    ? 'bg-rose-700 text-white border-rose-700'
                    : 'bg-white text-slate-700 border-slate-200'
                }`}
              >
                <ArrowUpCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.cashOutBtn}</span>
              </button>
            </div>
            <input
              type="number"
              min="1"
              step="1"
              value={moveAmount}
              onChange={(e) => setMoveAmount(e.target.value)}
              placeholder={t.entryAmountLabel}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono tabular-nums"
              required
            />
            <input
              type="text"
              value={moveNote}
              onChange={(e) => setMoveNote(e.target.value)}
              placeholder={t.entryNoteLabel}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              required
            />
            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer"
            >
              {moveType === 'cash_in' ? t.cashInBtn : t.cashOutBtn}
            </button>
          </form>

          {/* Active Shift Movement History */}
          <div className="lg:col-span-12 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">{t.cashDrawerMovementsTitle}</h3>
              <span className="text-xs text-slate-500 tabular-nums">
                {activeShift.movements.length}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="text-start px-4 py-2.5 font-semibold">{t.entryDateCol}</th>
                    <th className="text-start px-4 py-2.5 font-semibold">{t.entryTypeCol}</th>
                    <th className="text-start px-4 py-2.5 font-semibold">{t.cashierLabel}</th>
                    <th className="text-start px-4 py-2.5 font-semibold">{t.entryNoteCol}</th>
                    <th className="text-end px-4 py-2.5 font-semibold">{t.amountCol}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeShift.movements.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-2.5 text-slate-500">{formatDateTime(m.createdAt)}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800 uppercase">{m.type.replace('_', ' ')}</td>
                      <td className="px-4 py-2.5 text-slate-700">{m.employeeName}</td>
                      <td className="px-4 py-2.5 text-slate-600">{m.note}</td>
                      <td className="px-4 py-2.5 text-end font-mono font-semibold tabular-nums">
                        {formatCurrency(m.amount, lang)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Closed Shift History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-500" aria-hidden="true" />
          <h2 className="text-sm font-bold text-slate-900">{t.shiftHistoryTitle}</h2>
        </div>
        {closedShifts.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 text-center">—</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-start px-4 py-2.5 font-semibold">{t.cashierLabel}</th>
                  <th className="text-start px-4 py-2.5 font-semibold">{t.entryDateCol}</th>
                  <th className="text-end px-4 py-2.5 font-semibold">{t.openingCashLabel}</th>
                  <th className="text-end px-4 py-2.5 font-semibold">{t.expectedCashLabel}</th>
                  <th className="text-end px-4 py-2.5 font-semibold">{t.actualCashCountLabel}</th>
                  <th className="text-end px-4 py-2.5 font-semibold">{t.cashShortageOverLabel}</th>
                  <th className="text-end px-4 py-2.5 font-semibold">{t.actionCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {closedShifts.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{s.cashierName}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {s.closedAt ? formatDateTime(s.closedAt) : formatDateTime(s.startedAt)}
                    </td>
                    <td className="px-4 py-2.5 text-end font-mono tabular-nums">
                      {formatCurrency(s.openingCash, lang)}
                    </td>
                    <td className="px-4 py-2.5 text-end font-mono tabular-nums">
                      {formatCurrency(s.expectedCash, lang)}
                    </td>
                    <td className="px-4 py-2.5 text-end font-mono tabular-nums font-semibold">
                      {formatCurrency(s.actualCash ?? 0, lang)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-end font-mono tabular-nums font-bold ${
                        (s.cashDifference || 0) < 0
                          ? 'text-rose-700'
                          : (s.cashDifference || 0) > 0
                          ? 'text-emerald-700'
                          : 'text-slate-700'
                      }`}
                    >
                      {formatCurrency(s.cashDifference ?? 0, lang)}
                    </td>
                    <td className="px-4 py-2.5 text-end">
                      <button
                        type="button"
                        onClick={() => {
                          setSlipShift(s);
                          setTimeout(() => window.print(), 100);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
                      >
                        <Printer className="w-3 h-3" aria-hidden="true" />
                        <span>{t.printBtn}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Close Shift Modal */}
      {showCloseModal && activeShift && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleCloseConfirm}
            className="bg-white rounded-xl border border-slate-200 w-full max-w-md p-6 space-y-4 shadow-xl"
          >
            <h2 className="text-base font-bold text-slate-900">{t.closeShiftBtn}</h2>
            {!canCloseShift ? (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" aria-hidden="true" />
                <p>{t.shiftCloseAdminRequired}</p>
              </div>
            ) : (
              <>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 flex justify-between text-xs">
                  <span className="text-slate-600">{t.expectedCashLabel}</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {formatCurrency(activeShift.expectedCash, lang)}
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.actualCashCountLabel}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={actualCashInput}
                    onChange={(e) => setActualCashInput(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono tabular-nums"
                    required
                  />
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 flex justify-between text-xs">
                  <span className="text-slate-600">{t.cashShortageOverLabel}</span>
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      diffPreview < 0
                        ? 'text-rose-700'
                        : diffPreview > 0
                        ? 'text-emerald-700'
                        : 'text-slate-800'
                    }`}
                  >
                    {formatCurrency(diffPreview, lang)}
                  </span>
                </div>
                <input
                  type="text"
                  value={closingNote}
                  onChange={(e) => setClosingNote(e.target.value)}
                  placeholder={t.entryNoteLabel}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                {t.cancelBtn}
              </button>
              {canCloseShift && (
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  {t.closeShiftBtn}
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Printable Shift Receipt Slip */}
      {slipShift && (
        <div id="printable-shift-slip" className="hidden print:block p-4 font-mono text-xs">
          <p className="font-bold text-sm">{t.shiftsTitle}</p>
          <p>Cashier: {slipShift.cashierName}</p>
          <p>Started: {formatDateTime(slipShift.startedAt)}</p>
          {slipShift.closedAt && <p>Closed: {formatDateTime(slipShift.closedAt)}</p>}
          <p>Opening Cash: {formatCurrency(slipShift.openingCash, lang)}</p>
          <p>Cash Sales: {formatCurrency(slipShift.cashSalesTotal, lang)}</p>
          <p>Cash Refunds: {formatCurrency(slipShift.cashRefundsTotal, lang)}</p>
          <p>Expected Cash: {formatCurrency(slipShift.expectedCash, lang)}</p>
          {typeof slipShift.actualCash === 'number' && (
            <p>Actual Cash: {formatCurrency(slipShift.actualCash, lang)}</p>
          )}
          {typeof slipShift.cashDifference === 'number' && (
            <p>Difference: {formatCurrency(slipShift.cashDifference, lang)}</p>
          )}
        </div>
      )}
    </div>
  );
}
