import { useEffect } from 'react';
import {
  BookOpenCheck,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  PackagePlus,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserCheck,
  UserCog,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { TranslationStrings } from '../i18n';
import type { EmployeeRole, NavTab } from '../types';

interface SidebarNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  activeRole: EmployeeRole;
  activeEmployeeName: string;
  isSuperAdmin: boolean;
  onOpenStaffSwitcher: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  shopName?: string;
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

interface NavItemConfig {
  id: NavTab;
  label: string;
  icon: LucideIcon;
}

interface NavGroupConfig {
  id: string;
  title: string;
  items: NavItemConfig[];
}

export function SidebarNav({
  activeTab,
  onSelectTab,
  activeRole,
  activeEmployeeName,
  isSuperAdmin,
  onOpenStaffSwitcher,
  mobileOpen,
  onCloseMobile,
  shopName,
  t,
}: SidebarNavProps) {
  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, onCloseMobile]);

  const allowedSet = new Set(ROLE_ALLOWED_TABS[activeRole]);
  if (isSuperAdmin) {
    allowedSet.add('saas_admin');
  }

  const navGroups: NavGroupConfig[] = [
    {
      id: 'operations',
      title: t.navGroupOperations,
      items: [
        { id: 'pos', label: t.navPos, icon: ShoppingCart },
        { id: 'dashboard', label: t.navDashboard, icon: LayoutDashboard },
        { id: 'transactions', label: t.navTransactions, icon: ReceiptText },
      ],
    },
    {
      id: 'inventory',
      title: t.navGroupInventory,
      items: [
        { id: 'inventory', label: t.navInventory, icon: Boxes },
        { id: 'inventory_report', label: t.navInventoryReport, icon: ClipboardList },
        { id: 'purchases', label: t.navPurchases, icon: PackagePlus },
        { id: 'vendors', label: t.navVendors, icon: Truck },
      ],
    },
    {
      id: 'finance',
      title: t.navGroupFinance,
      items: [
        { id: 'expenses', label: t.navExpenses, icon: Wallet },
        { id: 'customers', label: t.navCustomers, icon: Users },
        { id: 'udhaar', label: t.navUdhaar, icon: BookOpenCheck },
      ],
    },
    {
      id: 'admin',
      title: t.navGroupAdmin,
      items: [
        { id: 'staff', label: t.navStaff, icon: UserCog },
        { id: 'settings', label: t.navSettings, icon: Settings },
        ...(isSuperAdmin
          ? [{ id: 'saas_admin' as NavTab, label: t.navSaasAdmin, icon: ShieldCheck }]
          : []),
      ],
    },
  ];

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowedSet.has(item.id)),
    }))
    .filter((group) => group.items.length > 0);

  const roleLabel =
    activeRole === 'admin'
      ? t.roleAdmin
      : activeRole === 'manager'
      ? t.roleManager
      : t.roleCashier;

  const handleSelect = (tab: NavTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  const renderSidebarBody = (isMobileDrawer: boolean) => (
    <div className="flex flex-col h-full bg-white">
      {isMobileDrawer && (
        <div className="h-14 px-4 flex items-center justify-between gap-2 border-b border-slate-200 shrink-0">
          <span className="text-base font-bold tracking-tight text-slate-900 truncate">
            {shopName || t.brandName}
          </span>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label={t.closeBtn}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <nav
        aria-label="Primary"
        className="flex-1 overflow-y-auto px-3 py-4 space-y-5"
      >
        {visibleGroups.map((group) => (
          <div key={group.id} className="space-y-1">
            <p className="px-3 text-[11px] font-semibold text-slate-400 tracking-wide">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg text-start transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                        isActive
                          ? 'bg-teal-50 text-teal-900 font-semibold border border-teal-200/80'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium border border-transparent'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-teal-700' : 'text-slate-400'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="truncate whitespace-nowrap">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Active Staff Switcher Footer */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/60 shrink-0">
        <button
          type="button"
          onClick={() => {
            onCloseMobile();
            onOpenStaffSwitcher();
          }}
          className="w-full flex items-center justify-between gap-2.5 px-3 py-2.5 bg-white hover:bg-teal-50/60 border border-slate-200 hover:border-teal-200 rounded-lg text-start transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center shrink-0">
              <UserCheck className="w-4 h-4 text-teal-700" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 truncate">
                {activeEmployeeName}
              </p>
              <p className="text-[11px] text-slate-500 truncate">{roleLabel}</p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-teal-700 whitespace-nowrap shrink-0">
            {t.switchStaffBtn}
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Fixed Vertical Sidebar on Desktop (Left in LTR, Right in RTL) */}
      <aside
        aria-label="Workspace Navigation"
        className="no-print hidden lg:flex lg:flex-col lg:fixed lg:top-14 lg:bottom-0 lg:start-0 lg:w-64 lg:z-30 bg-white border-e border-slate-200"
      >
        {renderSidebarBody(false)}
      </aside>

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="no-print fixed inset-0 z-40 bg-slate-900/45 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Collapsible Mobile Drawer (Slides from Left in LTR, Right in RTL) */}
      <aside
        aria-label="Mobile Navigation"
        aria-hidden={!mobileOpen}
        className={`no-print fixed inset-y-0 start-0 z-50 w-72 max-w-[85vw] bg-white border-e border-slate-200 shadow-xl transition-transform duration-200 ease-out lg:hidden ${
          mobileOpen
            ? 'translate-x-0 pointer-events-auto'
            : 'ltr:-translate-x-full rtl:translate-x-full pointer-events-none'
        }`}
      >
        {renderSidebarBody(true)}
      </aside>
    </>
  );
}
