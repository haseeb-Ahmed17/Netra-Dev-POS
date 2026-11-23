import { useEffect, useState } from 'react';
import { Monitor, CheckCircle2, ShoppingBag, X } from 'lucide-react';
import { subscribeCustomerDisplay, type CustomerDisplayPayload } from '../lib/hardwareBridge';
import { formatCurrency, TRANSLATIONS } from '../i18n';
import type { Language } from '../types';

interface CustomerDisplayViewProps {
  fallbackLang?: Language;
  fallbackStoreName?: string;
  onClose?: () => void;
}

export function CustomerDisplayView({
  fallbackLang = 'en',
  fallbackStoreName = 'Khaas Retail',
  onClose,
}: CustomerDisplayViewProps) {
  const [payload, setPayload] = useState<CustomerDisplayPayload | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeCustomerDisplay((next) => {
      setPayload(next);
    });
    return unsubscribe;
  }, []);

  const lang = payload?.lang || fallbackLang;
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ur';
  const storeName = payload?.storeName || fallbackStoreName;

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-6 md:p-10"
    >
      <header className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-700 flex items-center justify-center">
            <Monitor className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{storeName}</h1>
            <p className="text-xs text-slate-400">{t.customerDisplayTitle}</p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            <span>{t.closeBtn}</span>
          </button>
        )}
      </header>

      <main className="flex-1 py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 min-h-[340px]">
          {!payload || payload.items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-16 text-center text-slate-400">
              {payload?.status === 'completed' ? (
                <>
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3" aria-hidden="true" />
                  <p className="text-xl font-bold text-white">{t.thankYouMsg}</p>
                  {payload.lastReceiptNumber && (
                    <p className="text-sm font-mono text-teal-300 mt-1">
                      {t.receiptNoLabel}: {payload.lastReceiptNumber}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <ShoppingBag className="w-12 h-12 text-slate-600 mb-3" aria-hidden="true" />
                  <p className="text-lg font-semibold text-slate-200">{t.thankYouMsg}</p>
                  <p className="text-sm text-slate-400 mt-1">{t.emptyCartDesc}</p>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {payload.items.map((item, idx) => (
                <div key={idx} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-white truncate">{item.name}</p>
                    <p className="text-xs font-mono text-slate-400 mt-0.5">{item.qtyLabel}</p>
                  </div>
                  <p className="font-mono text-lg font-bold text-teal-300 tabular-nums shrink-0">
                    {formatCurrency(item.lineTotal, lang)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex justify-between text-sm text-slate-300">
            <span>{t.subtotalLabel}</span>
            <span className="font-mono font-semibold tabular-nums">
              {formatCurrency(payload?.subtotal || 0, lang)}
            </span>
          </div>
          {(payload?.discountAmount || 0) > 0 && (
            <div className="flex justify-between text-sm text-emerald-400">
              <span>{t.discountLabel}</span>
              <span className="font-mono font-semibold tabular-nums">
                -{formatCurrency(payload?.discountAmount || 0, lang)}
              </span>
            </div>
          )}
          <div className="flex justify-between text-sm text-slate-300">
            <span>{t.taxLabel}</span>
            <span className="font-mono font-semibold tabular-nums">
              {formatCurrency(payload?.taxAmount || 0, lang)}
            </span>
          </div>
          <div className="border-t border-slate-800 pt-4 flex items-baseline justify-between">
            <span className="text-base font-bold text-slate-200">{t.grandTotalLabel}</span>
            <span className="font-mono text-4xl font-extrabold text-teal-400 tabular-nums">
              {formatCurrency(payload?.grandTotal || 0, lang)}
            </span>
          </div>
        </aside>
      </main>

      <footer className="border-t border-slate-800 pt-4 text-xs text-slate-500 flex justify-between">
        <span>{storeName}</span>
        <span className="font-mono">
          {payload?.updatedAt ? new Date(payload.updatedAt).toLocaleTimeString() : ''}
        </span>
      </footer>
    </div>
  );
}
