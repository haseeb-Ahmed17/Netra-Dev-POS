import {
  Languages,
  Lock,
  LogOut,
  Menu,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import type { TranslationStrings } from '../i18n';
import type { Language, NavTab, SubscriptionRecord } from '../types';
import { getDaysRemaining } from './SaasAdminView';

interface TopBarProps {
  onSelectTab: (tab: NavTab) => void;
  onToggleMobileMenu: () => void;
  mobileMenuOpen: boolean;
  isSuperAdmin: boolean;
  subscription: SubscriptionRecord | null;
  onLockScreen: () => void;
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncingOffline: boolean;
  onManualSync: () => void;
  lang: Language;
  onToggleLanguage: () => void;
  shopName?: string;
  onLogout: () => void;
  t: TranslationStrings;
}

export function TopBar({
  onSelectTab,
  onToggleMobileMenu,
  mobileMenuOpen,
  isSuperAdmin,
  subscription,
  onLockScreen,
  isOnline,
  pendingSyncCount,
  isSyncingOffline,
  onManualSync,
  lang,
  onToggleLanguage,
  shopName,
  onLogout,
  t,
}: TopBarProps) {
  const daysRemaining = subscription
    ? Math.max(0, getDaysRemaining(subscription.expiresAt))
    : null;

  return (
    <header className="no-print sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        {/* Start Zone: Mobile Drawer Toggle + Store Name + Status Badges */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onToggleMobileMenu}
            aria-label={t.openMenuBtn}
            aria-expanded={mobileMenuOpen}
            className="lg:hidden inline-flex items-center justify-center w-10 h-10 -ms-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors shrink-0 cursor-pointer"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('pos')}
            className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 max-w-[150px] sm:max-w-[240px] truncate focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 cursor-pointer"
            title={shopName || t.brandName}
          >
            {shopName || t.brandName}
          </button>

          {/* Subscription / Super Admin Status Badge */}
          {isSuperAdmin ? (
            <button
              type="button"
              onClick={() => onSelectTab('saas_admin')}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-teal-300 shrink-0" aria-hidden="true" />
              <span>{t.superAdminBadge}</span>
            </button>
          ) : subscription ? (
            <span
              className={`hidden sm:inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-semibold tabular-nums whitespace-nowrap border ${
                subscription.isBlocked
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : (daysRemaining ?? 0) <= 5
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
              title={subscription.planName}
            >
              {subscription.isBlocked
                ? t.accountBlockedBadge
                : (daysRemaining ?? 0) <= 0
                ? t.trialExpiredBadge
                : `${daysRemaining} ${t.daysLeftSuffix}`}
            </span>
          ) : null}

          {/* Online / Offline & Pending Sync Status Badges */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap border ${
                isOnline
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-900 border-amber-300'
              }`}
              title={isOnline ? t.onlineStatusLabel : t.offlineStatusLabel}
            >
              {isOnline ? (
                <span
                  className="w-2 h-2 rounded-full bg-emerald-600 shrink-0"
                  aria-hidden="true"
                />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-amber-700 shrink-0" aria-hidden="true" />
              )}
              <span className="hidden md:inline">
                {isOnline ? t.onlineStatusLabel : t.offlineStatusLabel}
              </span>
              <span className="md:hidden">
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </span>

            {pendingSyncCount > 0 && (
              <button
                type="button"
                disabled={!isOnline || isSyncingOffline}
                onClick={onManualSync}
                title={isOnline ? t.syncNowBtn : t.offlineStatusLabel}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-mono font-semibold tabular-nums whitespace-nowrap border transition-colors ${
                  isOnline
                    ? 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100 cursor-pointer'
                    : 'bg-amber-100 text-amber-900 border-amber-300 cursor-default'
                }`}
              >
                <RefreshCw
                  className={`w-3 h-3 shrink-0 ${isSyncingOffline ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>
                  {pendingSyncCount} {t.pendingSyncLabel}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* End Zone: Lock Register, Language Toggle, Logout */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onLockScreen}
            title={t.lockScreenBtn}
            aria-label={t.lockScreenBtn}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[38px] cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden md:inline">{t.lockScreenBtn}</span>
          </button>

          <button
            type="button"
            onClick={onToggleLanguage}
            aria-label={
              lang === 'en' ? 'Switch language to Urdu' : 'Switch language to English'
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[38px] cursor-pointer"
          >
            <Languages className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{lang === 'en' ? 'EN / اردو' : 'اردو / EN'}</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            aria-label={t.logoutBtn}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[38px] cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">{t.logoutBtn}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
