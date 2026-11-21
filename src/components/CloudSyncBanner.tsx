import { useState } from 'react';
import { AlertTriangle, Check, Copy, Database, RefreshCw, X } from 'lucide-react';
import schemaSql from '../../supabase/schema.sql?raw';
import type { TranslationStrings } from '../i18n';

interface CloudSyncBannerProps {
  error: string;
  retrying: boolean;
  onRetry: () => void;
  t: TranslationStrings;
}

export function CloudSyncBanner({
  error,
  retrying,
  onRetry,
  t,
}: CloudSyncBannerProps) {
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(schemaSql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is unavailable
      setCopied(false);
    }
  };

  return (
    <>
      <div className="no-print bg-amber-50 border-b border-amber-200">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <AlertTriangle
              className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0"
              aria-hidden="true"
            />
            <div className="text-xs text-amber-950 min-w-0">
              <span className="font-semibold">{t.cloudSyncBannerTitle}: </span>
              <span className="text-amber-900">{t.cloudSyncBannerFallback}</span>
              <span className="block sm:inline sm:ms-2 font-mono text-[11px] text-amber-800 truncate">
                ({error})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-900 bg-white border border-amber-300 hover:bg-amber-100 rounded-lg whitespace-nowrap transition-colors cursor-pointer"
            >
              <Database className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{t.cloudSyncSqlBtn}</span>
            </button>

            <button
              type="button"
              disabled={retrying}
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-800 hover:bg-amber-900 disabled:bg-amber-400 rounded-lg whitespace-nowrap transition-colors cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 shrink-0 ${retrying ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{t.cloudSyncRetryBtn}</span>
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cloud-sync-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2
                id="cloud-sync-modal-title"
                className="text-base font-bold text-slate-900"
              >
                {t.cloudSyncModalTitle}
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

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                {t.cloudSyncModalDesc}
              </p>

              <div className="relative" dir="ltr">
                <pre className="bg-slate-900 text-slate-100 rounded-lg p-4 text-[11px] font-mono overflow-x-auto max-h-80 leading-relaxed">
                  {schemaSql}
                </pre>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                {t.closeBtn}
              </button>
              <button
                type="button"
                onClick={handleCopySql}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{t.copiedSqlBtn}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{t.copySqlBtn}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
