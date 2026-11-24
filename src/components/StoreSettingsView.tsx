import { useEffect, useState } from 'react';
import { CheckCircle2, Save, Smartphone, Store } from 'lucide-react';
import type { TranslationStrings } from '../i18n';
import type { PaymentMethod, StoreSettings } from '../types';

const CONFIGURABLE_PAYMENT_METHODS: PaymentMethod[] = [
  'cash',
  'jazzcash',
  'easypaisa',
  'card',
  'bank_transfer',
  'udhaar',
];

interface StoreSettingsViewProps {
  settings: StoreSettings;
  onSaveSettings: (settings: StoreSettings) => void;
  t: TranslationStrings;
}

export function StoreSettingsView({
  settings,
  onSaveSettings,
  t,
}: StoreSettingsViewProps) {
  const [form, setForm] = useState<StoreSettings>(settings);
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const enabledMethods: PaymentMethod[] =
    form.enabledPaymentMethods && form.enabledPaymentMethods.length > 0
      ? form.enabledPaymentMethods
      : CONFIGURABLE_PAYMENT_METHODS;

  const togglePaymentMethod = (method: PaymentMethod) => {
    const exists = enabledMethods.includes(method);
    const next = exists
      ? enabledMethods.filter((m) => m !== method)
      : [...enabledMethods, method];
    if (next.length === 0) return;
    setForm((f) => ({ ...f, enabledPaymentMethods: next }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned: StoreSettings = {
      storeName: form.storeName.trim() || 'Khaas Retail',
      phone: form.phone.trim(),
      address: form.address.trim(),
      taxNumber: form.taxNumber.trim(),
      receiptFooter: form.receiptFooter.trim() || t.thankYouMsg,
      defaultTaxRate: Math.min(50, Math.max(0, Number(form.defaultTaxRate) || 0)),
      thermalPaperWidth: form.thermalPaperWidth === '58mm' ? '58mm' : '80mm',
      enabledPaymentMethods: enabledMethods,
      bankName: (form.bankName ?? '').trim(),
      bankAccountTitle: (form.bankAccountTitle ?? '').trim(),
      bankAccountNumber: (form.bankAccountNumber ?? '').trim(),
      jazzcashAccountTitle: (form.jazzcashAccountTitle ?? '').trim(),
      jazzcashAccountNumber: (form.jazzcashAccountNumber ?? '').trim(),
      easypaisaAccountTitle: (form.easypaisaAccountTitle ?? '').trim(),
      easypaisaAccountNumber: (form.easypaisaAccountNumber ?? '').trim(),
      autoKickDrawer: Boolean(form.autoKickDrawer),
      showCustomerDisplay: Boolean(form.showCustomerDisplay),
      whatsappAutoReceipts: Boolean(form.whatsappAutoReceipts),
      whatsappTemplateReceipt: (form.whatsappTemplateReceipt ?? '').trim() || undefined,
      whatsappTemplateReminder: (form.whatsappTemplateReminder ?? '').trim() || undefined,
    };
    onSaveSettings(cleaned);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 3500);
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t.storeSettingsTitle}
          </h1>
          <p className="text-sm text-slate-600 mt-1">{t.storeSettingsSubtitle}</p>
        </div>

        {savedToast && (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>{t.storeSettingsSavedMsg}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Settings Form */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
              <Store className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900">
                {t.navSettings}
              </h2>
            </div>

            <div>
              <label
                htmlFor="settings-store-name"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                {t.storeNameInputLabel} *
              </label>
              <input
                id="settings-store-name"
                type="text"
                required
                value={form.storeName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, storeName: e.target.value }))
                }
                className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="settings-store-phone"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  {t.storePhoneInputLabel}
                </label>
                <input
                  id="settings-store-phone"
                  type="text"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              <div>
                <label
                  htmlFor="settings-store-tax"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  {t.storeTaxNumberLabel}
                </label>
                <input
                  id="settings-store-tax"
                  type="text"
                  value={form.taxNumber}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, taxNumber: e.target.value }))
                  }
                  placeholder="STRN / NTN #"
                  className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="settings-store-address"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                {t.storeAddressInputLabel}
              </label>
              <input
                id="settings-store-address"
                type="text"
                value={form.address}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address: e.target.value }))
                }
                className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
              />
            </div>

            <div>
              <label
                htmlFor="settings-receipt-footer"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                {t.receiptFooterLabel}
              </label>
              <textarea
                id="settings-receipt-footer"
                rows={3}
                value={form.receiptFooter}
                onChange={(e) =>
                  setForm((f) => ({ ...f, receiptFooter: e.target.value }))
                }
                className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
              />
            </div>

            {/* Mobile Wallet Accounts (JazzCash & EasyPaisa) */}
            <div className="pt-3 border-t border-slate-200 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                    {t.jazzcashSectionTitle}
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="settings-jazzcash-title"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      {t.walletTitleLabel}
                    </label>
                    <input
                      id="settings-jazzcash-title"
                      type="text"
                      value={form.jazzcashAccountTitle ?? ''}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          jazzcashAccountTitle: e.target.value,
                        }))
                      }
                      placeholder={form.storeName || 'Account Holder Name'}
                      className="w-full h-10 px-3 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="settings-jazzcash-number"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      {t.walletNumberLabel}
                    </label>
                    <input
                      id="settings-jazzcash-number"
                      type="text"
                      value={form.jazzcashAccountNumber ?? ''}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          jazzcashAccountNumber: e.target.value,
                        }))
                      }
                      placeholder="03XX-XXXXXXX"
                      className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-200 rounded-lg text-slate-900 tabular-nums focus:outline-none focus:border-teal-700"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                    {t.easypaisaSectionTitle}
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="settings-easypaisa-title"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      {t.walletTitleLabel}
                    </label>
                    <input
                      id="settings-easypaisa-title"
                      type="text"
                      value={form.easypaisaAccountTitle ?? ''}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          easypaisaAccountTitle: e.target.value,
                        }))
                      }
                      placeholder={form.storeName || 'Account Holder Name'}
                      className="w-full h-10 px-3 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="settings-easypaisa-number"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      {t.walletNumberLabel}
                    </label>
                    <input
                      id="settings-easypaisa-number"
                      type="text"
                      value={form.easypaisaAccountNumber ?? ''}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          easypaisaAccountNumber: e.target.value,
                        }))
                      }
                      placeholder="03XX-XXXXXXX"
                      className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-200 rounded-lg text-slate-900 tabular-nums focus:outline-none focus:border-teal-700"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  {t.paymentBankTransfer}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={form.bankName ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                    placeholder="Bank Name (e.g., Meezan)"
                    className="w-full h-10 px-3 text-sm bg-white border border-slate-200 rounded-lg text-slate-900"
                  />
                  <input
                    type="text"
                    value={form.bankAccountTitle ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, bankAccountTitle: e.target.value }))
                    }
                    placeholder={t.walletTitleLabel}
                    className="w-full h-10 px-3 text-sm bg-white border border-slate-200 rounded-lg text-slate-900"
                  />
                  <input
                    type="text"
                    value={form.bankAccountNumber ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, bankAccountNumber: e.target.value }))
                    }
                    placeholder="IBAN / Account #"
                    className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* POS Defaults, Paper Width, Payment Methods & WhatsApp Templates */}
            <div className="pt-3 border-t border-slate-200 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.taxRateLabel}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step="0.5"
                    value={form.defaultTaxRate ?? 0}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        defaultTaxRate: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.paperSizeLabel}
                  </label>
                  <select
                    value={form.thermalPaperWidth ?? '80mm'}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        thermalPaperWidth: e.target.value as '58mm' | '80mm',
                      }))
                    }
                    className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  >
                    <option value="80mm">{t.paper80mm}</option>
                    <option value="58mm">{t.paper58mm}</option>
                  </select>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-700 mb-2">
                  {t.paymentMethodLabel}
                </p>
                <div className="flex flex-wrap gap-2">
                  {CONFIGURABLE_PAYMENT_METHODS.map((method) => {
                    const active = enabledMethods.includes(method);
                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => togglePaymentMethod(method)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer ${
                          active
                            ? 'bg-teal-700 text-white border-teal-700'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        {method}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(form.autoKickDrawer)}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, autoKickDrawer: e.target.checked }))
                    }
                    className="w-4 h-4 rounded border-slate-300 text-teal-700"
                  />
                  <span>Auto-trigger cash drawer bridge on cash checkout (Electron/USB)</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(form.showCustomerDisplay)}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, showCustomerDisplay: e.target.checked }))
                    }
                    className="w-4 h-4 rounded border-slate-300 text-teal-700"
                  />
                  <span>{t.openCustomerDisplayBtn}</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(form.whatsappAutoReceipts)}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, whatsappAutoReceipts: e.target.checked }))
                    }
                    className="w-4 h-4 rounded border-slate-300 text-teal-700"
                  />
                  <span>{t.sendWhatsappReceiptBtn}</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    WhatsApp Receipt Template
                  </label>
                  <textarea
                    rows={2}
                    value={form.whatsappTemplateReceipt ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, whatsappTemplateReceipt: e.target.value }))
                    }
                    placeholder="Receipt {{receipt}} from {{store}}: Total {{total}}"
                    className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    WhatsApp Reminder Template
                  </label>
                  <textarea
                    rows={2}
                    value={form.whatsappTemplateReminder ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, whatsappTemplateReminder: e.target.value }))
                    }
                    placeholder="Reminder from {{store}}: Balance {{balance}}"
                    className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg min-h-[44px] cursor-pointer"
              >
                <Save className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t.saveStoreSettingsBtn}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Live Thermal Receipt Preview */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              {t.receiptPreviewTitle}
            </h2>
            <span className="font-mono text-xs text-slate-500">
              {form.thermalPaperWidth ?? '80mm'}
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex justify-center">
            <div
              className={`bg-white border border-slate-200 rounded-lg p-5 font-mono text-xs text-slate-900 w-full ${
                form.thermalPaperWidth === '58mm' ? 'max-w-[228px]' : 'max-w-[302px]'
              }`}
            >
              <div className="text-center border-b border-dashed border-slate-300 pb-3 space-y-0.5">
                <p className="text-base font-bold tracking-tight text-slate-900">
                  {form.storeName || 'Khaas Retail'}
                </p>
                {form.address && (
                  <p className="text-[11px] text-slate-600">{form.address}</p>
                )}
                {form.phone && (
                  <p className="text-[11px] text-slate-600">{form.phone}</p>
                )}
                {form.taxNumber && (
                  <p className="text-[11px] text-slate-500">{form.taxNumber}</p>
                )}
              </div>

              <div className="py-3 border-b border-dashed border-slate-300 text-[11px] space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.receiptNoLabel}:</span>
                  <span className="font-semibold">KR-2026-1099</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.cashierLabel}:</span>
                  <span>Admin / Counter 01</span>
                </div>
              </div>

              <div className="py-3 border-b border-dashed border-slate-300 text-[11px] space-y-1">
                <div className="flex justify-between">
                  <span>2x Spiced Cardamom Chai</span>
                  <span className="tabular-nums font-semibold">Rs. 840</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 pt-1">
                  <span>{t.grandTotalLabel}</span>
                  <span className="tabular-nums">Rs. 840</span>
                </div>
              </div>

              <div className="pt-3 text-center">
                <p className="text-[11px] font-medium text-slate-700 whitespace-pre-line">
                  {form.receiptFooter || t.thankYouMsg}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
