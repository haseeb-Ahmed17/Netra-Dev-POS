import {
  Languages,
  Lock,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  WifiOff,
} from 'lucide-react';
import type { TranslationStrings } from '../i18n';
import type { EmployeeRole, Language, NavTab, SubscriptionRecord } from '../types';
import { getDaysRemaining } from './SaasAdminView';

interface TopBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  activeRole: EmployeeRole;
  activeEmployeeName: string;
  isSuperAdmin: boolean;
  subscription: SubscriptionRecord | null;
  onOpenStaffSwitcher: () => void;
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

const ROLE_ALLOWED_TABS: Record<EmployeeRole, NavTab[]> = {
  admin: [
    'pos',
    'dashboard',
    'transactions',
    'inventory',
    'inventory_report',
    'purchases',
    'vendors',
    'expenses',
    'customers',
    'udhaar',
    'staff',
    'settings',
  ],
  manager: [
    'pos',
    'dashboard',
    'transactions',
    'inventory',
    'inventory_report',
    'purchases',
    'vendors',
    'expenses',
    'customers',
    'udhaar',
  ],
  cashier: ['pos', 'transactions', 'customers'],
};

export function TopBar({
  activeTab,
  onSelectTab,
  activeRole,
  activeEmployeeName,
  isSuperAdmin,
  subscription,
  onOpenStaffSwitcher,
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
  const allNavItems: { id: NavTab; label: string }[] = [
    { id: 'pos', label: t.navPos },
    { id: 'dashboard', label: t.navDashboard },
    { id: 'transactions', label: t.navTransactions },
    { id: 'inventory', label: t.navInventory },
    { id: 'inventory_report', label: t.navInventoryReport },
    { id: 'purchases', label: t.navPurchases },
    { id: 'vendors', label: t.navVendors },
    { id: 'expenses', label: t.navExpenses },
    { id: 'customers', label: t.navCustomers },
    { id: 'udhaar', label: t.navUdhaar },
    { id: 'staff', label: t.navStaff },
    { id: 'settings', label: t.navSettings },
    ...(isSuperAdmin ? [{ id: 'saas_admin' as NavTab, label: t.navSaasAdmin }] : []),
  ];

  const allowedSet = new Set(ROLE_ALLOWED_TABS[activeRole]);
  if (isSuperAdmin) {
    allowedSet.add('saas_admin');
  }
  const visibleNavItems = allNavItems.filter((item) => allowedSet.has(item.id));

  const roleLabel =
    activeRole === 'admin'
      ? t.roleAdmin
      : activeRole === 'manager'
      ? t.roleManager
      : t.roleCashier;

  const daysRemaining = subscription
    ? Math.max(0, getDaysRemaining(subscription.expiresAt))
    : null;

  return (
    <header className="no-print sticky top-0 z-30 bg-white border-b border-slate-200">
      {/* Row 1: Store Wordmark & Utility Actions */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => onSelectTab('pos')}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 max-w-[180px] truncate focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 cursor-pointer"
            title={shopName || t.brandName}
          >
            {shopName || t.brandName}
          </button>

          {/* Subtle Subscription Trial / License Days Badge */}
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

          {/* Live Online / Offline Connection Status Badge */}
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
              <span className="hidden lg:inline">
                {isOnline ? t.onlineStatusLabel : t.offlineStatusLabel}
              </span>
              <span className="lg:hidden">
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

        <div className="flex items-center gap-2 shrink-0">
          {/* Quick Staff Switcher */}
          <button
            type="button"
            onClick={onOpenStaffSwitcher}
            title={t.switchStaffBtn}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[38px] cursor-pointer"
          >
            <UserCheck className="w-3.5 h-3.5 text-teal-700 shrink-0" aria-hidden="true" />
            <span className="max-w-[120px] truncate">{activeEmployeeName}</span>
            <span className="text-[11px] font-medium text-teal-700 hidden sm:inline">
              · {roleLabel}
            </span>
          </button>

          {/* Lock Register Button */}
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

          {/* Language Toggle */}
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

          {/* Logout */}
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[38px] cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">{t.logoutBtn}</span>
          </button>
        </div>
      </div>

      {/* Row 2: Role-Filtered Primary Navigation Tabs */}
      <div className="bg-slate-50/70">
        <nav
          aria-label="Primary"
          className="max-w-[1440px] mx-auto px-4 sm:px-6 flex items-center gap-4 lg:gap-6 overflow-x-auto no-scrollbar"
        >
          {visibleNavItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-3 text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                  isActive
                    ? 'text-teal-800 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-teal-700"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
