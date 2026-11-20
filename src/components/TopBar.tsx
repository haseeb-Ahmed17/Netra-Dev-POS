import { Languages } from 'lucide-react';
import type { TranslationStrings } from '../i18n';
import type { Language, NavTab } from '../types';

interface TopBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  lang: Language;
  onToggleLanguage: () => void;
  t: TranslationStrings;
}

export function TopBar({
  activeTab,
  onSelectTab,
  lang,
  onToggleLanguage,
  t,
}: TopBarProps) {
  const navItems: { id: NavTab; label: string }[] = [
    { id: 'pos', label: t.navPos },
    { id: 'dashboard', label: t.navDashboard },
    { id: 'transactions', label: t.navTransactions },
    { id: 'inventory', label: t.navInventory },
    { id: 'udhaar', label: t.navUdhaar },
  ];

  return (
    <header className="no-print sticky top-0 z-30 bg-white border-b border-slate-200">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('pos')}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 cursor-pointer"
        >
          {t.brandName}
        </button>

        {/* Zone 2: 5 Clean Single-Line Text Navigation Links */}
        <nav
          aria-label="Primary"
          className="flex items-center gap-5 sm:gap-6 overflow-x-auto no-scrollbar"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
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

        {/* Zone 3: English / Urdu Language Toggle */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={onToggleLanguage}
            aria-label={lang === 'en' ? 'Switch language to Urdu' : 'Switch language to English'}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 min-h-[40px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 cursor-pointer"
          >
            <Languages className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{lang === 'en' ? 'EN / اردو' : 'اردو / EN'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
