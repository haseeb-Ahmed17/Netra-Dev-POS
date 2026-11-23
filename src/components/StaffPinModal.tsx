import { useEffect, useState } from 'react';
import { Lock, LogOut, ShieldCheck, UserCheck, X } from 'lucide-react';
import type { TranslationStrings } from '../i18n';
import type { Employee } from '../types';

interface StaffPinModalProps {
  isOpen: boolean;
  isLocked: boolean;
  employees: Employee[];
  activeEmployee: Employee | null;
  initialTargetEmployeeId?: string | null;
  shopName: string;
  onVerifyPin: (
    pin: string,
    targetEmployeeId?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onLockScreen: () => void;
  onClose: () => void;
  onLogout: () => void;
  t: TranslationStrings;
}

export function StaffPinModal({
  isOpen,
  isLocked,
  employees,
  activeEmployee,
  initialTargetEmployeeId,
  shopName,
  onVerifyPin,
  onLockScreen,
  onClose,
  onLogout,
  t,
}: StaffPinModalProps) {
  const [pinInput, setPinInput] = useState('');
  const [targetEmployeeId, setTargetEmployeeId] = useState<string | null>(
    initialTargetEmployeeId ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (isOpen || isLocked) {
      setTargetEmployeeId(initialTargetEmployeeId ?? null);
      setPinInput('');
      setError(null);
    }
  }, [isOpen, isLocked, initialTargetEmployeeId]);

  if (!isOpen && !isLocked) return null;

  const activeEmployees = employees.filter((e) => e.isActive);
  const targetEmployee = targetEmployeeId
    ? activeEmployees.find((e) => e.id === targetEmployeeId) ?? null
    : null;

  const getRoleLabel = (role: Employee['role']) => {
    switch (role) {
      case 'admin':
        return t.roleAdmin;
      case 'manager':
        return t.roleManager;
      case 'cashier':
        return t.roleCashier;
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifying) return;
    setError(null);
    const cleaned = pinInput.trim();
    if (!/^\d{4}$/.test(cleaned)) {
      setError(t.invalidPinError);
      return;
    }

    setVerifying(true);
    try {
      const res = await onVerifyPin(cleaned, targetEmployee?.id);
      if (!res.ok) {
        setError(res.error || t.invalidPinError);
        return;
      }
      setPinInput('');
      setTargetEmployeeId(null);
      setError(null);
    } finally {
      setVerifying(false);
    }
  };

  const appendDigit = (digit: string) => {
    if (verifying) return;
    setError(null);
    setPinInput((prev) => (prev.length < 4 ? `${prev}${digit}` : prev));
  };

  const handleBackspace = () => {
    if (verifying) return;
    setError(null);
    setPinInput((prev) => prev.slice(0, -1));
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto ${
        isLocked ? 'bg-slate-900/95' : 'bg-slate-900/50'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="staff-pin-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-teal-700 text-white flex items-center justify-center shrink-0">
              {isLocked ? (
                <Lock className="w-4 h-4" aria-hidden="true" />
              ) : (
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <h2
                id="staff-pin-modal-title"
                className="text-sm font-bold text-slate-900 truncate"
              >
                {isLocked ? t.lockScreenTitle : t.switchStaffBtn}
              </h2>
              <p className="text-[11px] text-slate-500 truncate">{shopName}</p>
            </div>
          </div>

          {!isLocked && (
            <button
              type="button"
              onClick={() => {
                setPinInput('');
                setTargetEmployeeId(null);
                setError(null);
                onClose();
              }}
              aria-label={t.closeBtn}
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-200/60 cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-5">
          <p className="text-xs text-slate-600 leading-relaxed">
            {t.lockScreenSubtitle}
          </p>

          {targetEmployee && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-900">
              <div className="flex items-center gap-2 min-w-0">
                <UserCheck className="w-3.5 h-3.5 text-teal-700 shrink-0" aria-hidden="true" />
                <span className="font-semibold truncate">
                  {targetEmployee.name} ({getRoleLabel(targetEmployee.role)})
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTargetEmployeeId(null);
                  setError(null);
                }}
                aria-label={t.closeBtn}
                className="p-0.5 text-teal-700 hover:text-teal-950 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* PIN Entry Form */}
          <form onSubmit={(e) => void handlePinSubmit(e)} className="space-y-3">
            <div>
              <label
                htmlFor="staff-pin-code-input"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                {t.enterPinLabel}
              </label>
              <input
                id="staff-pin-code-input"
                type="password"
                inputMode="numeric"
                maxLength={4}
                autoFocus
                value={pinInput}
                onChange={(e) => {
                  setError(null);
                  setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                }}
                placeholder="••••"
                className="w-full h-12 px-4 text-center text-2xl font-mono tracking-[0.5em] tabular-nums bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
              />
            </div>

            {error && (
              <p role="alert" className="text-xs font-medium text-red-700 text-center">
                {error}
              </p>
            )}

            {/* Quick Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2" dir="ltr">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  disabled={verifying}
                  onClick={() => appendDigit(digit)}
                  className="h-11 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 font-mono text-base font-bold text-slate-900 transition-colors cursor-pointer"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                disabled={verifying}
                onClick={() => {
                  setError(null);
                  setPinInput('');
                }}
                className="h-11 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                {t.clearCart}
              </button>
              <button
                type="button"
                disabled={verifying}
                onClick={() => appendDigit('0')}
                className="h-11 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 font-mono text-base font-bold text-slate-900 transition-colors cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                disabled={verifying}
                onClick={handleBackspace}
                className="h-11 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                ⌫
              </button>
            </div>

            <button
              type="submit"
              disabled={pinInput.length !== 4 || verifying}
              className="w-full h-11 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-400 text-sm font-semibold text-white transition-colors cursor-pointer"
            >
              {verifying ? t.loadingWorkspace : t.unlockRegisterBtn}
            </button>
          </form>

          {/* Select staff member to verify PIN for (never bypasses PIN) */}
          {!isLocked && activeEmployees.length > 0 && (
            <div className="pt-4 border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">
                  {t.quickSwitchStaffLabel}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPinInput('');
                    setTargetEmployeeId(null);
                    setError(null);
                    onLockScreen();
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-md cursor-pointer"
                >
                  <Lock className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>{t.lockScreenBtn}</span>
                </button>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {activeEmployees.map((emp) => {
                  const isCurrent = emp.id === activeEmployee?.id;
                  const isTargeted = emp.id === targetEmployee?.id;
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => {
                        setTargetEmployeeId(emp.id);
                        setPinInput('');
                        setError(null);
                      }}
                      className={`w-full px-3 py-2 rounded-lg border text-start flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isTargeted
                          ? 'bg-teal-50 border-teal-400 text-teal-950 ring-1 ring-teal-400'
                          : isCurrent
                          ? 'bg-teal-50/50 border-teal-200 text-teal-900'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <UserCheck className="w-3.5 h-3.5 shrink-0 text-teal-700" aria-hidden="true" />
                        <span className="text-xs font-semibold truncate">{emp.name}</span>
                      </div>
                      <span className="text-[11px] font-medium text-slate-600 shrink-0">
                        {getRoleLabel(emp.role)}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500">{t.switchRequiresPinNote}</p>
            </div>
          )}

          {isLocked && (
            <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-500">{t.switchRequiresPinNote}</span>
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-red-700 shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t.logoutBtn}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
