import { useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import type { TranslationStrings } from '../i18n';
import { ALL_ROLE_ACTIONS, type RoleAction } from '../lib/rbac';
import type { Branch, Employee, EmployeeRole } from '../types';

const CUSTOMIZABLE_ACTIONS: RoleAction[] = ALL_ROLE_ACTIONS.filter(
  (a) =>
    ![
      'staff.manage',
      'backup.manage',
      'workspace.reset',
      'settings.write',
      'customers.delete',
      'branches.manage',
    ].includes(a)
);

interface StaffViewProps {
  employees: Employee[];
  activeEmployeeId: string | null;
  branches?: Branch[];
  maxEmployees?: number;
  onSaveEmployee: (payload: {
    id?: string;
    name: string;
    phone: string;
    role: EmployeeRole;
    pin?: string;
    isActive: boolean;
    branchId?: string;
    shiftAssignment?: string;
    customPermissions?: string[];
  }) => Promise<string | null>;
  onDeleteEmployee: (employeeId: string) => Promise<string | null>;
  onRequestSwitchEmployee: (employeeId: string) => void;
  t: TranslationStrings;
}

interface EmployeeFormState {
  name: string;
  phone: string;
  role: EmployeeRole;
  pinCode: string;
  isActive: boolean;
  branchId: string;
  shiftAssignment: string;
  customPermissions: string[];
}

const EMPTY_FORM: EmployeeFormState = {
  name: '',
  phone: '',
  role: 'cashier',
  pinCode: '',
  isActive: true,
  branchId: '',
  shiftAssignment: '',
  customPermissions: [],
};

export function StaffView({
  employees,
  activeEmployeeId,
  branches = [],
  maxEmployees,
  onSaveEmployee,
  onDeleteEmployee,
  onRequestSwitchEmployee,
  t,
}: StaffViewProps) {
  const [modalMode, setModalMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<string | null>(null);

  const activeAdminsCount = employees.filter(
    (e) => e.role === 'admin' && e.isActive
  ).length;
  const atEmployeeLimit =
    typeof maxEmployees === 'number' &&
    maxEmployees > 0 &&
    employees.length >= maxEmployees;

  const getRoleLabel = (role: EmployeeRole) => {
    switch (role) {
      case 'admin':
        return t.roleAdmin;
      case 'manager':
        return t.roleManager;
      case 'cashier':
        return t.roleCashier;
    }
  };

  const openAdd = () => {
    if (atEmployeeLimit) {
      setActionWarning(t.employeeLimitReachedMsg);
      return;
    }
    setEditingId(null);
    setFormError(null);
    setForm({
      ...EMPTY_FORM,
      branchId: branches[0]?.id ?? '',
    });
    setModalMode('add');
  };

  const openEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setFormError(null);
    setForm({
      name: emp.name,
      phone: emp.phone,
      role: emp.role,
      pinCode: '',
      isActive: emp.isActive,
      branchId: emp.branchId ?? '',
      shiftAssignment: emp.shiftAssignment ?? '',
      customPermissions: emp.customPermissions ?? [],
    });
    setModalMode('edit');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    const cleanName = form.name.trim();
    const cleanPin = form.pinCode.trim();
    if (!cleanName) return;

    if (modalMode === 'add' && !/^\d{4}$/.test(cleanPin)) {
      setFormError(t.employeePinError);
      return;
    }

    if (modalMode === 'edit' && cleanPin.length > 0 && !/^\d{4}$/.test(cleanPin)) {
      setFormError(t.employeePinError);
      return;
    }

    if (modalMode === 'edit' && editingId) {
      const existing = employees.find((emp) => emp.id === editingId);
      if (existing) {
        const wasLastActiveAdmin =
          existing.role === 'admin' &&
          existing.isActive &&
          activeAdminsCount <= 1 &&
          (form.role !== 'admin' || !form.isActive);

        if (wasLastActiveAdmin) {
          setFormError(t.lastAdminNotice);
          return;
        }
      }
    }

    setSaving(true);
    try {
      const err = await onSaveEmployee({
        id: modalMode === 'edit' && editingId ? editingId : undefined,
        name: cleanName,
        phone: form.phone.trim(),
        role: form.role,
        pin: cleanPin || undefined,
        isActive: form.isActive,
        branchId: form.branchId || undefined,
        shiftAssignment: form.shiftAssignment.trim() || undefined,
        customPermissions: form.customPermissions,
      });

      if (err) {
        setFormError(err);
        return;
      }

      setModalMode('closed');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (emp: Employee) => {
    setActionWarning(null);
    if (emp.role === 'admin' && emp.isActive && activeAdminsCount <= 1) {
      setActionWarning(t.lastAdminNotice);
      return;
    }
    const err = await onSaveEmployee({
      id: emp.id,
      name: emp.name,
      phone: emp.phone,
      role: emp.role,
      isActive: !emp.isActive,
    });
    if (err) setActionWarning(err);
  };

  const handleDelete = async (emp: Employee) => {
    setActionWarning(null);
    if (emp.role === 'admin' && emp.isActive && activeAdminsCount <= 1) {
      setActionWarning(t.lastAdminNotice);
      setConfirmDeleteId(null);
      return;
    }
    const err = await onDeleteEmployee(emp.id);
    if (err) setActionWarning(err);
    setConfirmDeleteId(null);
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t.staffTitle}
          </h1>
          <p className="text-sm text-slate-600 mt-1">{t.staffSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs whitespace-nowrap shrink-0 min-h-[44px] transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t.addEmployeeBtn}</span>
          </button>
        </div>
      </div>

      {actionWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs font-medium text-amber-900 flex items-center justify-between">
          <span>{actionWarning}</span>
          <button
            type="button"
            onClick={() => setActionWarning(null)}
            className="p-1 text-amber-800 hover:text-amber-950 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Role Permissions Matrix */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
          <h2 className="text-sm font-bold text-slate-900">{t.permissionsGuideTitle}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
            <p className="text-sm font-bold text-teal-800">{t.roleAdmin}</p>
            <p className="text-xs text-slate-600 leading-relaxed">{t.roleAdminDesc}</p>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
            <p className="text-sm font-bold text-slate-900">{t.roleManager}</p>
            <p className="text-xs text-slate-600 leading-relaxed">{t.roleManagerDesc}</p>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
            <p className="text-sm font-bold text-amber-800">{t.roleCashier}</p>
            <p className="text-xs text-slate-600 leading-relaxed">{t.roleCashierDesc}</p>
          </div>
        </div>
      </section>

      {/* Employees Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-5 text-start font-medium">{t.employeeNameLabel}</th>
                <th className="py-3 px-4 text-start font-medium">{t.employeePhoneLabel}</th>
                <th className="py-3 px-4 text-start font-medium">{t.employeeRoleLabel}</th>
                <th className="py-3 px-4 text-start font-medium">{t.employeePinLabel}</th>
                <th className="py-3 px-4 text-start font-medium">{t.statusCol}</th>
                <th className="py-3 px-5 text-end font-medium">{t.actionCol}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((emp) => {
                const isCurrent = emp.id === activeEmployeeId;
                const isConfirming = confirmDeleteId === emp.id;

                return (
                  <tr
                    key={emp.id}
                    className={isCurrent ? 'bg-teal-50/40' : 'hover:bg-slate-50'}
                  >
                    <td className="py-3.5 px-5">
                      <div className="font-semibold text-slate-900">
                        {emp.name}
                        {isCurrent && (
                          <span className="ms-2 text-xs font-semibold text-teal-700">
                            ({t.activeStaffLabel})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {emp.phone || '—'}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`text-xs font-semibold ${
                          emp.role === 'admin'
                            ? 'text-teal-800'
                            : emp.role === 'manager'
                            ? 'text-slate-900'
                            : 'text-amber-800'
                        }`}
                      >
                        {getRoleLabel(emp.role)}
                      </span>
                      {emp.shiftAssignment && (
                        <div className="text-[11px] text-slate-500">
                          {emp.shiftAssignment}
                        </div>
                      )}
                      {emp.customPermissions && emp.customPermissions.length > 0 && (
                        <div className="text-[10px] font-mono text-teal-700">
                          +{emp.customPermissions.length} custom
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-slate-700">
                        <KeyRound className="w-3.5 h-3.5 text-teal-700 shrink-0" aria-hidden="true" />
                        <span className="font-mono font-bold">••••</span>
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 rounded">
                          {t.pinEncryptedBadge}
                        </span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => void handleToggleActive(emp)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                      >
                        {emp.isActive ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>{t.activeStatusLabel}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>{t.inactiveStatusLabel}</span>
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="py-3.5 px-5 text-end whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {emp.isActive && !isCurrent && (
                          <button
                            type="button"
                            onClick={() => onRequestSwitchEmployee(emp.id)}
                            className="px-2.5 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors cursor-pointer"
                          >
                            {t.switchStaffBtn}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEdit(emp)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span>{t.editBtn}</span>
                        </button>

                        {isConfirming ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleDelete(emp)}
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
                            onClick={() => setConfirmDeleteId(emp.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span>{t.deleteBtn}</span>
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
      </section>

      {/* Add / Edit Employee Modal */}
      {modalMode !== 'closed' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="staff-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 id="staff-modal-title" className="text-base font-bold text-slate-900">
                {modalMode === 'add' ? t.addEmployeeTitle : t.editEmployeeTitle}
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

            <form onSubmit={(e) => void handleSave(e)} className="p-5 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-800 text-xs font-medium rounded-lg px-3.5 py-2.5">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.employeeNameLabel} *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Ali Raza"
                  className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.employeePhoneLabel}
                </label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="0300-1234567"
                  className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.employeeRoleLabel} *
                  </label>
                  <select
                    value={form.role}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, role: e.target.value as EmployeeRole }))
                    }
                    className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  >
                    <option value="admin">{t.roleAdmin}</option>
                    <option value="manager">{t.roleManager}</option>
                    <option value="cashier">{t.roleCashier}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.employeePinLabel} {modalMode === 'add' ? '*' : ''}
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    required={modalMode === 'add'}
                    value={form.pinCode}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        pinCode: e.target.value.replace(/\D/g, '').slice(0, 4),
                      }))
                    }
                    placeholder="••••"
                    className="w-full h-10 px-3 text-sm font-mono tracking-widest tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500 -mt-2">
                {modalMode === 'edit' ? t.pinOptionalEditHint : t.employeePinHint}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {branches.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t.navBranches}
                    </label>
                    <select
                      value={form.branchId}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, branchId: e.target.value }))
                      }
                      className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                    >
                      <option value="">All / Default</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={branches.length > 0 ? '' : 'sm:col-span-2'}>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.navShifts}
                  </label>
                  <input
                    type="text"
                    value={form.shiftAssignment}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, shiftAssignment: e.target.value }))
                    }
                    placeholder="Morning (09:00–17:00)"
                    className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
              </div>

              {form.role !== 'admin' && (
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/70 space-y-2">
                  <p className="text-xs font-semibold text-slate-800">
                    {t.permissionsGuideTitle}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                    {CUSTOMIZABLE_ACTIONS.map((act) => {
                      const checked = form.customPermissions.includes(act);
                      return (
                        <label
                          key={act}
                          className="flex items-center gap-1.5 text-[11px] font-mono text-slate-700 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                customPermissions: e.target.checked
                                  ? [...f.customPermissions, act]
                                  : f.customPermissions.filter((c) => c !== act),
                              }))
                            }
                            className="w-3.5 h-3.5 rounded border-slate-300 text-teal-700"
                          />
                          <span className="truncate">{act}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isActive: e.target.checked }))
                  }
                  className="w-4 h-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                />
                <span>{t.employeeActiveLabel}</span>
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
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 rounded-lg min-h-[40px] cursor-pointer"
                >
                  {saving ? t.loadingWorkspace : t.saveEmployeeBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
