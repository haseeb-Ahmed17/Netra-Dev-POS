import { useState, type ChangeEvent } from 'react';
import { ShieldCheck, Download, Upload, RefreshCw, Users, MessageCircle } from 'lucide-react';
import { formatDateTime, type TranslationStrings } from '../i18n';
import type {
  AuditCategory,
  AuditLogEntry,
  EmployeeActivityLog,
  OfflineQueuedSale,
  SyncHistoryEntry,
  WhatsAppMessageLog,
} from '../types';

interface AuditBackupViewProps {
  auditLogs: AuditLogEntry[];
  activityLogs: EmployeeActivityLog[];
  syncHistory: SyncHistoryEntry[];
  offlineQueue: OfflineQueuedSale[];
  whatsappLogs: WhatsAppMessageLog[];
  canManageBackup: boolean;
  onDownloadBackup: () => void;
  onRestoreBackupJson: (rawJson: string) => { ok: boolean; error?: string };
  onRetrySyncNow: () => void;
  t: TranslationStrings;
}

export function AuditBackupView({
  auditLogs,
  activityLogs,
  syncHistory,
  offlineQueue,
  whatsappLogs,
  canManageBackup,
  onDownloadBackup,
  onRestoreBackupJson,
  onRetrySyncNow,
  t,
}: AuditBackupViewProps) {
  const [subTab, setSubTab] = useState<'audit' | 'staff_activity' | 'sync' | 'whatsapp'>('audit');
  const [categoryFilter, setCategoryFilter] = useState<'all' | AuditCategory>('all');
  const [search, setSearch] = useState('');
  const [restoreFeedback, setRestoreFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pendingRestoreJson, setPendingRestoreJson] = useState<string | null>(null);

  const filteredAudits = auditLogs.filter((entry) => {
    if (categoryFilter !== 'all' && entry.category !== categoryFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        entry.action.toLowerCase().includes(q) ||
        entry.actorName.toLowerCase().includes(q) ||
        entry.details.toLowerCase().includes(q) ||
        (entry.targetName || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setPendingRestoreJson(text);
    e.target.value = '';
  };

  const confirmRestore = () => {
    if (!pendingRestoreJson) return;
    const res = onRestoreBackupJson(pendingRestoreJson);
    setPendingRestoreJson(null);
    setRestoreFeedback({
      ok: res.ok,
      message: res.ok
        ? 'Workspace backup restored cleanly.'
        : res.error || 'Backup validation failed.',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t.auditLogsTitle}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t.auditLogsSubtitle}</p>
        </div>

        {canManageBackup && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onDownloadBackup}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg min-h-[40px] cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.downloadBackupBtn}</span>
            </button>

            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg min-h-[40px] cursor-pointer">
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.restoreBackupBtn}</span>
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>
        )}
      </div>

      {restoreFeedback && (
        <div
          className={`rounded-lg px-4 py-3 text-xs font-medium border ${
            restoreFeedback.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {restoreFeedback.message}
        </div>
      )}

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSubTab('audit')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
            subTab === 'audit'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Audit Trail ({auditLogs.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('staff_activity')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
            subTab === 'staff_activity'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Users className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t.employeeActivityTitle} ({activityLogs.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('sync')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
            subTab === 'sync'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t.syncHistoryTitle} ({syncHistory.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('whatsapp')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
            subTab === 'whatsapp'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t.whatsappLogsTitle} ({whatsappLogs.length})</span>
        </button>
      </div>

      {subTab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actor, action, target..."
              className="px-3 py-2 border border-slate-200 rounded-lg text-xs w-full sm:w-64"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'all' | AuditCategory)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-xs"
            >
              <option value="all">All Categories</option>
              <option value="price_change">Price Changes</option>
              <option value="stock_adjustment">Stock Adjustments</option>
              <option value="refund">Refunds / Returns</option>
              <option value="sale_cancel">Order Cancellations</option>
              <option value="drawer_movement">Cash Drawer</option>
              <option value="shift">Shifts</option>
              <option value="permission_change">Permissions</option>
              <option value="transfer">Branch Transfers</option>
              <option value="backup">Backups</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-start px-4 py-2.5 font-semibold">{t.entryDateCol}</th>
                  <th className="text-start px-4 py-2.5 font-semibold">Category</th>
                  <th className="text-start px-4 py-2.5 font-semibold">Actor</th>
                  <th className="text-start px-4 py-2.5 font-semibold">Action</th>
                  <th className="text-start px-4 py-2.5 font-semibold">{t.entryNoteCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAudits.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      —
                    </td>
                  </tr>
                ) : (
                  filteredAudits.slice(0, 200).map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] uppercase text-slate-700">
                        {entry.category}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-900">
                        {entry.actorName} ({entry.actorRole})
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{entry.action}</td>
                      <td className="px-4 py-2.5 text-slate-600">{entry.details}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'staff_activity' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-start px-4 py-2.5 font-semibold">{t.entryDateCol}</th>
                  <th className="text-start px-4 py-2.5 font-semibold">Staff Member</th>
                  <th className="text-start px-4 py-2.5 font-semibold">Role</th>
                  <th className="text-start px-4 py-2.5 font-semibold">Event</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activityLogs.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2.5 text-slate-500">{formatDateTime(a.createdAt)}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{a.employeeName}</td>
                    <td className="px-4 py-2.5 uppercase font-mono text-slate-700">{a.role}</td>
                    <td className="px-4 py-2.5 uppercase font-semibold text-teal-700">{a.eventType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'sync' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
            <div className="text-xs text-slate-700">
              Pending Offline Queue: <strong className="font-mono text-slate-900">{offlineQueue.length}</strong>
            </div>
            <button
              type="button"
              onClick={onRetrySyncNow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.syncNowBtn}</span>
            </button>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="text-start px-4 py-2.5 font-semibold">{t.entryDateCol}</th>
                    <th className="text-start px-4 py-2.5 font-semibold">Event</th>
                    <th className="text-start px-4 py-2.5 font-semibold">{t.statusCol}</th>
                    <th className="text-start px-4 py-2.5 font-semibold">{t.entryNoteCol}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {syncHistory.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2.5 text-slate-500">{formatDateTime(s.createdAt)}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-900">{s.summary}</td>
                      <td className="px-4 py-2.5 uppercase font-mono">{s.status}</td>
                      <td className="px-4 py-2.5 text-slate-600">{s.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'whatsapp' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-start px-4 py-2.5 font-semibold">{t.entryDateCol}</th>
                  <th className="text-start px-4 py-2.5 font-semibold">{t.customerCol}</th>
                  <th className="text-start px-4 py-2.5 font-semibold">{t.phoneNumberLabel}</th>
                  <th className="text-start px-4 py-2.5 font-semibold">Type</th>
                  <th className="text-start px-4 py-2.5 font-semibold">{t.statusCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {whatsappLogs.map((w) => (
                  <tr key={w.id}>
                    <td className="px-4 py-2.5 text-slate-500">{formatDateTime(w.createdAt)}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{w.customerName}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-700">{w.phone}</td>
                    <td className="px-4 py-2.5 uppercase">{w.messageType}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono">{w.status}</span>
                      {w.errorMessage && <p className="text-[11px] text-slate-500">{w.errorMessage}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Restore Confirmation Dialog */}
      {pendingRestoreJson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-slate-900">{t.restoreBackupBtn}</h2>
            <p className="text-xs text-slate-600">
              Restoring from JSON will replace your current local POS catalog, customers, vendors, orders, shifts, and settings with the contents of the selected backup file. Continue?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingRestoreJson(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                {t.cancelBtn}
              </button>
              <button
                type="button"
                onClick={confirmRestore}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
              >
                {t.restoreBackupBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
