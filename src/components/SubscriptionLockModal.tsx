import { Lock, LogOut, MessageCircle, PauseCircle, RefreshCw, ShieldCheck } from 'lucide-react';
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

  const isSuspended = subscription.status === 'suspended';
  const isBlocked =
    subscription.status === 'blocked' ||
    (subscription.isBlocked && !isSuspended);

  const title = isSuspended ? t.subLockSuspendedTitle : t.subLockTitle;
  const description = isSuspended
    ? t.subLockSuspendedDesc
    : isBlocked
    ? t.subLockBlockedDesc
    : t.subLockDesc;

  const statusText = isSuspended
    ? 'Suspended'
    : isBlocked
    ? 'Account Blocked'
    : `Expired (${formattedExpiry})`;

  const renewalMessage = [
    `Assalam-o-Alaikum Haseeb Ahmed (Netra-Dev Solutions),`,
    `Please review my SmartBitz POS license:`,
    `Store: ${shopName}`,
    `Email: ${subscription.email}`,
    `Plan: ${subscription.planName}`,
    `Status: ${statusText}`,
    subscription.suspendedReason ? `Reason: ${subscription.suspendedReason}` : null,
  ]
    .filter(Boolean)
    .join('\n');

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
          <div
            className={`w-12 h-12 rounded-full border flex items-center justify-center mx-auto mb-4 ${
              isSuspended
                ? 'bg-amber-50 border-amber-200'
                : 'bg-red-50 border-red-200'
            }`}
          >
            {isSuspended ? (
              <PauseCircle className="w-6 h-6 text-amber-700" aria-hidden="true" />
            ) : (
              <Lock className="w-6 h-6 text-red-700" aria-hidden="true" />
            )}
          </div>

          <h2
            id="subscription-lock-title"
            className="text-xl font-bold text-slate-900"
          >
            {title}
          </h2>

          <p className="text-sm text-slate-700 mt-3 leading-relaxed">
            {description}
          </p>

          <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-900">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>{t.subLockDataSafeNote}</span>
          </div>
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
            {subscription.suspendedReason && (
              <div className="pt-2 border-t border-slate-100 flex items-start justify-between gap-3">
                <span className="text-slate-500 shrink-0">{t.subLockReasonLabel}</span>
                <span className="font-medium text-slate-800 text-end">
                  {subscription.suspendedReason}
                </span>
              </div>
            )}
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
