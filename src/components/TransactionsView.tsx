import { useMemo, useState } from 'react';
import { Printer, Search } from 'lucide-react';
import {
  formatCurrency,
  formatDateTime,
  getPaymentLabel,
  type TranslationStrings,
} from '../i18n';
import type { Language, OrderRecord, PaymentMethod } from '../types';

interface TransactionsViewProps {
  orders: OrderRecord[];
  onPrintReceipt: (order: OrderRecord) => void;
  lang: Language;
  t: TranslationStrings;
}

export function TransactionsView({
  orders,
  onPrintReceipt,
  lang,
  t,
}: TransactionsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | PaymentMethod>('all');

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...orders]
      .sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .filter((order) => {
        if (paymentFilter !== 'all' && order.paymentMethod !== paymentFilter) {
          return false;
        }
        if (!q) return true;
        return (
          order.receiptNumber.toLowerCase().includes(q) ||
          order.customerName.toLowerCase().includes(q)
        );
      });
  }, [orders, searchQuery, paymentFilter]);

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t.transactionsTitle}
        </h1>
        <p className="text-sm text-slate-600 mt-1">{t.transactionsSubtitle}</p>
      </div>

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
            placeholder={t.searchReceiptsPlaceholder}
            className="w-full h-10 ps-9 pe-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 focus:bg-white transition-colors"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {(['all', 'cash', 'jazzcash', 'easypaisa', 'card', 'udhaar'] as const).map(
            (method) => {
              const active = paymentFilter === method;
              const label =
                method === 'all' ? t.filterAllPayments : getPaymentLabel(method, t);
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentFilter(method)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            {t.noTransactionsMatch}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-5 text-start font-medium">{t.receiptCol}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.timeCol}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.customerCol}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.itemsCol}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.methodCol}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.subtotalCol}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.taxCol}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.totalCol}</th>
                  <th className="py-3 px-5 text-end font-medium">{t.actionCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((order) => {
                  const unitCount = order.items.reduce((s, i) => s + i.quantity, 0);
                  return (
                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-5 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                        {order.receiptNumber}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {formatDateTime(order.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        {order.customerName || t.walkInCustomer}
                      </td>
                      <td className="py-3 px-4 text-end font-mono text-slate-700 tabular-nums">
                        {unitCount}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        {getPaymentLabel(order.paymentMethod, t)}
                      </td>
                      <td className="py-3 px-4 text-end font-mono text-slate-700 tabular-nums whitespace-nowrap">
                        {formatCurrency(order.subtotal, lang)}
                      </td>
                      <td className="py-3 px-4 text-end font-mono text-slate-600 tabular-nums whitespace-nowrap">
                        {formatCurrency(order.taxAmount, lang)}
                      </td>
                      <td className="py-3 px-4 text-end font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatCurrency(order.total, lang)}
                      </td>
                      <td className="py-3 px-5 text-end">
                        <button
                          type="button"
                          onClick={() => onPrintReceipt(order)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md whitespace-nowrap transition-colors cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>{t.printBtn}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
