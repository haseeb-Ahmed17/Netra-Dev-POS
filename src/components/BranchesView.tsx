import { useState, type FormEvent } from 'react';
import { Building2, ArrowLeftRight, Plus, Check, XCircle } from 'lucide-react';
import { formatCurrency, formatDateTime, type TranslationStrings } from '../i18n';
import type { Branch, Language, OrderRecord, Product, StockTransfer } from '../types';

interface BranchesViewProps {
  branches: Branch[];
  activeBranchId: string;
  maxBranchesAllowed: number;
  products: Product[];
  orders: OrderRecord[];
  transfers: StockTransfer[];
  canManageBranches: boolean;
  canApproveTransfers: boolean;
  onSelectBranch: (branchId: string) => void;
  onSaveBranch: (branch: Omit<Branch, 'id' | 'createdAt'> & { id?: string }) => void;
  onCreateTransfer: (payload: {
    fromBranchId: string;
    toBranchId: string;
    productId: string;
    quantity: number;
    note: string;
  }) => void;
  onUpdateTransferStatus: (transferId: string, status: 'completed' | 'rejected') => void;
  lang: Language;
  t: TranslationStrings;
}

export function BranchesView({
  branches,
  activeBranchId,
  maxBranchesAllowed,
  products,
  orders,
  transfers,
  canManageBranches,
  canApproveTransfers,
  onSelectBranch,
  onSaveBranch,
  onCreateTransfer,
  onUpdateTransferStatus,
  lang,
  t,
}: BranchesViewProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

  const [fromBranchId, setFromBranchId] = useState(branches[0]?.id || 'branch-main');
  const [toBranchId, setToBranchId] = useState(branches[1]?.id || branches[0]?.id || 'branch-main');
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [transferQty, setTransferQty] = useState('1');
  const [transferNote, setTransferNote] = useState('');

  const branchLimitReached = branches.length >= maxBranchesAllowed;

  const handleAddBranch = (e: FormEvent) => {
    e.preventDefault();
    if (!canManageBranches || branchLimitReached || !name.trim()) return;
    onSaveBranch({
      name: name.trim(),
      code: code.trim().toUpperCase() || `BR-${branches.length + 1}`,
      address: address.trim(),
      phone: phone.trim(),
      isMain: branches.length === 0,
      isActive: true,
    });
    setName('');
    setCode('');
    setAddress('');
    setPhone('');
  };

  const handleTransferSubmit = (e: FormEvent) => {
    e.preventDefault();
    const qty = Number(transferQty);
    if (!productId || !Number.isFinite(qty) || qty <= 0 || fromBranchId === toBranchId) return;
    onCreateTransfer({
      fromBranchId,
      toBranchId,
      productId,
      quantity: qty,
      note: transferNote.trim(),
    });
    setTransferQty('1');
    setTransferNote('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t.branchesTitle}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{t.branchesSubtitle}</p>
      </div>

      {/* Branch Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {branches.map((branch) => {
          const branchOrders = orders.filter(
            (o) => (o.branchId || 'branch-main') === branch.id && o.returnStatus !== 'cancelled'
          );
          const branchRev = branchOrders.reduce((s, o) => s + o.total, 0);
          const isSelected = activeBranchId === branch.id;

          return (
            <div
              key={branch.id}
              className={`rounded-xl border p-4 bg-white space-y-2 ${
                isSelected ? 'border-teal-600 ring-1 ring-teal-600' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-teal-700" aria-hidden="true" />
                    <h2 className="text-sm font-bold text-slate-900">{branch.name}</h2>
                  </div>
                  <p className="text-xs font-mono text-slate-500 mt-0.5">{branch.code}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectBranch(branch.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                    isSelected
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {isSelected ? t.statusActiveLabel : 'Switch'}
                </button>
              </div>
              {branch.address && <p className="text-xs text-slate-600">{branch.address}</p>}
              <div className="pt-2 border-t border-slate-100 flex justify-between text-xs">
                <span className="text-slate-500">
                  {branchOrders.length} {t.ordersCompleted}
                </span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {formatCurrency(branchRev, lang)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Add Branch Form */}
        {canManageBranches && (
          <form
            onSubmit={handleAddBranch}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-teal-700" aria-hidden="true" />
                <span>{t.addBranchBtn}</span>
              </h2>
              <span className="text-xs font-mono text-slate-500">
                {branches.length}/{maxBranchesAllowed}
              </span>
            </div>
            {branchLimitReached && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                {t.branchLimitReachedMsg}
              </p>
            )}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Branch Name (e.g., DHA Phase 6)"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Code (DHA-02)"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
              />
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t.phoneNumberLabel}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t.customerAddressLabel}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
            <button
              type="submit"
              disabled={branchLimitReached}
              className="w-full py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              {t.addBranchBtn}
            </button>
          </form>
        )}

        {/* Stock Transfer Form */}
        <form
          onSubmit={handleTransferSubmit}
          className={`${canManageBranches ? 'lg:col-span-7' : 'lg:col-span-12'} bg-white border border-slate-200 rounded-xl p-5 space-y-3`}
        >
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-teal-700" aria-hidden="true" />
            <span>{t.stockTransferBtn}</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">From Branch</label>
              <select
                value={fromBranchId}
                onChange={(e) => setFromBranchId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">To Branch</label>
              <select
                value={toBranchId}
                onChange={(e) => setToBranchId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.productCol}</label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {lang === 'ur' ? p.nameUr : p.nameEn} ({p.stock} {p.sellingUnit})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.qtyCol}</label>
              <input
                type="number"
                min="0.001"
                step="any"
                value={transferQty}
                onChange={(e) => setTransferQty(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono tabular-nums"
                required
              />
            </div>
          </div>

          <input
            type="text"
            value={transferNote}
            onChange={(e) => setTransferNote(e.target.value)}
            placeholder={t.entryNoteLabel}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />

          <button
            type="submit"
            disabled={branches.length < 2 || fromBranchId === toBranchId}
            className="px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
          >
            {t.stockTransferBtn}
          </button>
          {branches.length < 2 && (
            <p className="text-xs text-slate-500">Add a second branch to request inter-branch stock transfers.</p>
          )}
        </form>
      </div>

      {/* Transfers History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Stock Transfer History</h2>
          <span className="text-xs text-slate-500 tabular-nums">{transfers.length}</span>
        </div>
        {transfers.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 text-center">—</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-start px-4 py-2.5 font-semibold">{t.entryDateCol}</th>
                  <th className="text-start px-4 py-2.5 font-semibold">Route</th>
                  <th className="text-start px-4 py-2.5 font-semibold">{t.itemsCol}</th>
                  <th className="text-start px-4 py-2.5 font-semibold">{t.statusCol}</th>
                  <th className="text-end px-4 py-2.5 font-semibold">{t.actionCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfers.map((tr) => (
                  <tr key={tr.id}>
                    <td className="px-4 py-2.5 text-slate-500">{formatDateTime(tr.createdAt)}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-900">
                      {tr.fromBranchName} → {tr.toBranchName}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {tr.items.map((it) => `${it.nameEn} (${it.quantity} ${it.sellingUnit})`).join(', ')}
                    </td>
                    <td className="px-4 py-2.5 uppercase font-semibold">{tr.status}</td>
                    <td className="px-4 py-2.5 text-end space-x-1">
                      {tr.status === 'pending' && canApproveTransfers && (
                        <>
                          <button
                            type="button"
                            onClick={() => onUpdateTransferStatus(tr.id, 'completed')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-semibold cursor-pointer"
                          >
                            <Check className="w-3 h-3" aria-hidden="true" />
                            <span>Approve</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateTransferStatus(tr.id, 'rejected')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-700 hover:bg-rose-800 text-white font-semibold cursor-pointer"
                          >
                            <XCircle className="w-3 h-3" aria-hidden="true" />
                            <span>Reject</span>
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
