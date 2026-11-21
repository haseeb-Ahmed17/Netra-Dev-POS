import { Lock, LogOut, MessageCircle, RefreshCw } from 'lucide-react';
import type { TranslationStrings } from '../i18n';
import type { Language, SubscriptionRecord } from '../types';

interface SubscriptionLockModalProps {
  subscription: SubscriptionRecord;
  shopName: string;
  checkingStatus: boolean;
  onRefreshStatus: () => void;
  onLogout: () => void;
  lang: Language;
  t: TranslationStrings;
}

export function SubscriptionLockModal({
  subscription,
  shopName,
  checkingStatus,
  onRefreshStatus,
  onLogout,
  lang,
  t,
}: SubscriptionLockModalProps) {
  const formattedExpiry = new Date(subscription.expiresAt).toLocaleDateString(
    lang === 'ur' ? 'en-PK' : 'en-US',
    { year: 'numeric', month: 'short', day: '2-digit' }
  );

  const renewalMessage = [
    `Assalam-o-Alaikum Haseeb Ahmed (Netra-Dev Solutions),`,
    `Please renew my Khaas Retail POS license:`,
    `Store: ${shopName}`,
    `Email: ${subscription.email}`,
    `Plan: ${subscription.planName}`,
    `Status: ${subscription.isBlocked ? 'Account Blocked' : `Expired (${formattedExpiry})`}`,
  ].join('\n');

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(renewalMessage)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscription-lock-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="p-6 sm:p-8 text-center border-b border-slate-100">
          <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6 text-red-700" aria-hidden="true" />
          </div>

          <h2
            id="subscription-lock-title"
            className="text-xl font-bold text-slate-900"
          >
            {t.subLockTitle}
          </h2>

          <p className="text-sm text-slate-700 mt-3 leading-relaxed">
            {t.subLockDesc}
          </p>
        </div>

        <div className="p-6 bg-slate-50/70 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">{t.subLockEmailLabel}</span>
              <span className="font-mono font-semibold text-slate-900 truncate">
                {subscription.email}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">{t.subLockPlanLabel}</span>
              <span className="font-semibold text-slate-900">
                {subscription.planName}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">{t.subLockExpiryLabel}</span>
              <span className="font-mono font-semibold text-red-700 tabular-nums">
                {formattedExpiry}
              </span>
            </div>
          </div>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors min-h-[44px]"
          >
            <MessageCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t.subLockWhatsappBtn}</span>
          </a>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={checkingStatus}
              onClick={onRefreshStatus}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl min-h-[42px] transition-colors cursor-pointer disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 shrink-0 ${checkingStatus ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{t.subLockRefreshBtn}</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl min-h-[42px] transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{t.logoutBtn}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
