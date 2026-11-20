import { useState } from 'react';
import { Languages, Lock, Mail, Store } from 'lucide-react';
import type { TranslationStrings } from '../i18n';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import type { Language } from '../types';

interface AuthViewProps {
  lang: Language;
  onToggleLanguage: () => void;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string, shopName: string) => Promise<void>;
  t: TranslationStrings;
}

export function AuthView({
  lang,
  onToggleLanguage,
  onSignIn,
  onSignUp,
  t,
}: AuthViewProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [shopName, setShopName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 6) {
      setErrorMsg(t.passwordMinLengthError);
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await onSignIn(email, password);
      } else {
        await onSignUp(email, password, shopName);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onSignIn('demo@khaasretail.pk', 'password123');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Demo login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Minimal Top Bar with Brand & Language Toggle */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            {t.brandName}
          </span>

          <button
            type="button"
            onClick={onToggleLanguage}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[40px] cursor-pointer"
          >
            <Languages className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{lang === 'en' ? 'EN / اردو' : 'اردو / EN'}</span>
          </button>
        </div>
      </header>

      {/* Centered Auth Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {t.authTitle}
            </h1>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              {t.authSubtitle}
            </p>
          </div>

          {/* Segmented Mode Switch */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setErrorMsg(null);
              }}
              className={`py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                mode === 'signin'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.signInTab}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMsg(null);
              }}
              className={`py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                mode === 'signup'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.signUpTab}
            </button>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="px-4 py-3 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg"
            >
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label
                  htmlFor="auth-shop-name"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  {t.shopNameLabel}
                </label>
                <div className="relative">
                  <Store
                    className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-shop-name"
                    type="text"
                    required
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder={lang === 'ur' ? 'مثلاً خاص جنرل اسٹور' : 'e.g., Khaas General Store'}
                    className="w-full h-10 ps-9 pe-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                {t.emailLabel}
              </label>
              <div className="relative">
                <Mail
                  className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="shopkeeper@example.com"
                  className="w-full h-10 ps-9 pe-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                {t.passwordLabel}
              </label>
              <div className="relative">
                <Lock
                  className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-10 ps-9 pe-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 px-4 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 rounded-lg transition-colors cursor-pointer"
            >
              {submitting
                ? t.signingInLabel
                : mode === 'signin'
                ? t.signInBtn
                : t.createAccountBtn}
            </button>
          </form>

          {!isSupabaseConfigured && (
            <div className="pt-4 border-t border-slate-200">
              <button
                type="button"
                disabled={submitting}
                onClick={handleDemoLogin}
                className="w-full h-10 px-4 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                {t.demoSignInBtn}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
