import { useEffect, useState } from 'react';
import { Download, MessageCircle, Printer, X } from 'lucide-react';
import {
  formatCurrency,
  formatDateTime,
  getPaymentLabel,
  type TranslationStrings,
} from '../i18n';
import { formatQuantityWithUnit } from '../lib/unitUtils';
import type { Language, OrderRecord, StoreSettings } from '../types';

interface ReceiptModalProps {
  order: OrderRecord | null;
  storeSettings: StoreSettings;
  cashierName?: string;
  isReprint?: boolean;
  onSendWhatsApp?: (order: OrderRecord) => Promise<{ manualUrl?: string; statusText?: string }>;
  onClose: () => void;
  lang: Language;
  t: TranslationStrings;
}

export function ReceiptModal({
  order,
  storeSettings,
  cashierName,
  isReprint = false,
  onSendWhatsApp,
  onClose,
  lang,
  t,
}: ReceiptModalProps) {
  const [paperSize, setPaperSize] = useState<'80mm' | '58mm'>(
    storeSettings.thermalPaperWidth || '80mm'
  );
  const [waNotice, setWaNotice] = useState<string | null>(null);
  const [waManualUrl, setWaManualUrl] = useState<string | null>(null);
  const [sendingWa, setSendingWa] = useState(false);

  useEffect(() => {
    setPaperSize(storeSettings.thermalPaperWidth || '80mm');
    setWaNotice(null);
    setWaManualUrl(null);
  }, [order?.id, storeSettings.thermalPaperWidth]);

  if (!order) return null;

  const isUdhaar = order.paymentMethod === 'udhaar';
  const storeName = storeSettings.storeName || t.brandName;
  const storeAddress = storeSettings.address || t.storeAddress;
  const storePhone = storeSettings.phone || t.storePhone;
  const taxNumber = storeSettings.taxNumber || t.taxRegNumber;
  const receiptFooter = storeSettings.receiptFooter || t.thankYouMsg;
  const activeCashier = order.cashierName || cashierName || t.cashierDefault;
  const hasSplits = Array.isArray(order.paymentSplits) && order.paymentSplits.length > 0;

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = async () => {
    if (!onSendWhatsApp || sendingWa) return;
    setSendingWa(true);
    try {
      const res = await onSendWhatsApp(order);
      setWaNotice(res.statusText || null);
      setWaManualUrl(res.manualUrl || null);
    } finally {
      setSendingWa(false);
    }
  };

  const handleDownloadTxt = () => {
    const splitLines = hasSplits
      ? order.paymentSplits!.map(
          (sp) =>
            `  - ${getPaymentLabel(sp.method, t)}: Rs. ${sp.amount}${
              sp.reference ? ` (${sp.reference})` : ''
            }`
        )
      : [];

    const paymentLines = isUdhaar
      ? [
          `${t.paidViaLabel}: ${getPaymentLabel(order.paymentMethod, t)}`,
          `${t.udhaarAddedLabel}: Rs. ${order.total}`,
        ]
      : [
          `${t.paidViaLabel}: ${getPaymentLabel(order.paymentMethod, t)}`,
          ...splitLines,
          ...(order.transactionId ? [`${t.tidReceiptLabel}: ${order.transactionId}`] : []),
          `${t.tenderedLabel}: Rs. ${order.amountTendered}`,
          `${t.changeLabel}: Rs. ${order.changeDue}`,
        ];

    const lines: string[] = [
      '========================================',
      `          ${storeName.toUpperCase()}`,
      ...(isReprint ? [`          [ ${t.reprintBadge} ]`] : []),
      ...(storeAddress ? [`     ${storeAddress}`] : []),
      ...(storePhone ? [`     ${storePhone}`] : []),
      ...(taxNumber ? [`     ${taxNumber}`] : []),
      '========================================',
      `${t.receiptNoLabel}: ${order.receiptNumber}`,
      `${t.dateLabel}: ${formatDateTime(order.createdAt)}`,
      `${t.cashierLabel}: ${activeCashier}`,
      `${t.customerLabel}: ${order.customerName || t.walkInCustomer}`,
      '----------------------------------------',
      ...order.items.map((item) => {
        const name = lang === 'ur' ? item.nameUr : item.nameEn;
        const isRet = Boolean(item.isReturn) || item.quantity < 0;
        const prefix = isRet ? `[${t.posReturnBadge}] ` : '';
        const qtyStr = formatQuantityWithUnit(item.quantity, item.sellingUnit, lang);
        return `${prefix}${name}\n  ${qtyStr} x Rs. ${item.unitPrice} = ${formatCurrency(item.lineTotal, lang)}`;
      }),
      '----------------------------------------',
      `${t.subtotalLabel}: Rs. ${order.subtotal}`,
      ...(order.discountAmount > 0
        ? [`${t.discountLabel}: -Rs. ${order.discountAmount}`]
        : []),
      `${t.taxLabel}: Rs. ${order.taxAmount}`,
      `${t.grandTotalLabel}: Rs. ${order.total}`,
      '----------------------------------------',
      ...paymentLines,
      '========================================',
      `  ${receiptFooter}`,
      '========================================',
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${order.receiptNumber}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const barcodeBars = Array.from({ length: 34 }, (_, i) => {
    const code = order.receiptNumber.charCodeAt(i % order.receiptNumber.length);
    return (code + i) % 3 === 0 ? 3 : (code + i) % 2 === 0 ? 2 : 1;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-modal-heading"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden shadow-xl">
        <div className="no-print flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <h2 id="receipt-modal-heading" className="text-base font-bold text-slate-900">
              {t.receiptModalTitle}
            </h2>
            {isReprint && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                {t.reprintBadge}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
              {(['58mm', '80mm'] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPaperSize(size)}
                  className={`px-2 py-1 text-[11px] font-mono font-semibold rounded-md cursor-pointer ${
                    paperSize === size
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {size === '58mm' ? t.paper58mm : t.paper80mm}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label={t.closeBtn}
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="p-5 bg-slate-50 max-h-[68vh] overflow-y-auto space-y-3">
          {waNotice && (
            <div className="no-print rounded-lg bg-teal-50 border border-teal-200 p-3 text-xs text-teal-900 space-y-1.5">
              <p>{waNotice}</p>
              {waManualUrl && (
                <a
                  href={waManualUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold underline text-teal-800"
                >
                  <span>Open WhatsApp Share Link</span>
                </a>
              )}
            </div>
          )}

          <div
            id="printable-receipt-area"
            data-paper-size={paperSize}
            className={`bg-white border border-slate-200 rounded-lg font-mono text-slate-900 mx-auto transition-all ${
              paperSize === '58mm'
                ? 'p-3.5 text-[10px] max-w-[220px]'
                : 'p-5 text-xs max-w-[302px]'
            }`}
          >
            <div className="text-center border-b border-dashed border-slate-300 pb-3">
              {isReprint && (
                <p className="text-[10px] font-bold tracking-widest text-slate-700 mb-1">
                  *** {t.reprintBadge} ***
                </p>
              )}
              <p className="text-base font-bold tracking-tight text-slate-900">
                {storeName}
              </p>
              {order.branchName && (
                <p className="text-[11px] font-semibold text-slate-600">{order.branchName}</p>
              )}
              {storeAddress && (
                <p className="text-[11px] text-slate-600 mt-0.5">{storeAddress}</p>
              )}
              {storePhone && <p className="text-[11px] text-slate-600">{storePhone}</p>}
              {taxNumber && <p className="text-[11px] text-slate-500">{taxNumber}</p>}
            </div>

            <div className="py-3 border-b border-dashed border-slate-300 space-y-1 text-[11px]">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">{t.receiptNoLabel}:</span>
                <span className="font-semibold">{order.receiptNumber}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">{t.dateLabel}:</span>
                <span className="tabular-nums">{formatDateTime(order.createdAt)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">{t.cashierLabel}:</span>
                <span>{activeCashier}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">{t.customerLabel}:</span>
                <span>{order.customerName || t.walkInCustomer}</span>
              </div>
            </div>

            <table className="w-full my-3 text-[11px]">
              <thead>
                <tr className="border-b border-dashed border-slate-300 text-slate-500">
                  <th className="py-1.5 text-start font-medium">{t.itemCol}</th>
                  <th className="py-1.5 text-end font-medium">{t.qtyCol}</th>
                  <th className="py-1.5 text-end font-medium">{t.rateCol}</th>
                  <th className="py-1.5 text-end font-medium">{t.amountCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dotted divide-slate-200">
                {order.items.map((item, idx) => {
                  const isRet = Boolean(item.isReturn) || item.quantity < 0;
                  return (
                    <tr key={`${item.productId}-${isRet ? 'ret' : 'sale'}-${idx}`}>
                      <td className="py-2 pe-2">
                        <span>{lang === 'ur' ? item.nameUr : item.nameEn}</span>
                        {isRet && (
                          <span className="ms-1 inline-block px-1 py-0.2 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-200">
                            {t.posReturnBadge}
                          </span>
                        )}
                      </td>
                      <td
                        className={`py-2 text-end tabular-nums whitespace-nowrap ${
                          isRet ? 'text-red-700 font-semibold' : ''
                        }`}
                      >
                        {formatQuantityWithUnit(item.quantity, item.sellingUnit, lang)}
                      </td>
                      <td className="py-2 text-end tabular-nums">{item.unitPrice}</td>
                      <td
                        className={`py-2 text-end font-semibold tabular-nums ${
                          isRet ? 'text-red-700' : ''
                        }`}
                      >
                        {item.lineTotal}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="pt-3 border-t border-dashed border-slate-300 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-600">{t.subtotalLabel}</span>
                <span className="tabular-nums">{formatCurrency(order.subtotal, lang)}</span>
              </div>
              {order.discountAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    {t.discountLabel}
                    {order.discountMode === 'fixed' ? '' : ` (${order.discountPercent}%)`}
                  </span>
                  <span className="tabular-nums">
                    -{formatCurrency(order.discountAmount, lang)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600">{t.taxLabel}</span>
                <span className="tabular-nums">{formatCurrency(order.taxAmount, lang)}</span>
              </div>
              <div
                className={`flex justify-between pt-2 mt-1 border-t border-slate-300 text-sm font-bold ${
                  order.total < 0 ? 'text-red-700' : 'text-slate-900'
                }`}
              >
                <span>{order.total < 0 ? t.netRefundDueLabel : t.grandTotalLabel}</span>
                <span className="tabular-nums">{formatCurrency(order.total, lang)}</span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-dashed border-slate-300 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-600">{t.paidViaLabel}</span>
                <span className="font-semibold">
                  {getPaymentLabel(order.paymentMethod, t)}
                </span>
              </div>
              {hasSplits && (
                <div className="space-y-0.5 pt-1 text-[10px] text-slate-600">
                  {order.paymentSplits!.map((sp, i) => (
                    <div key={i} className="flex justify-between">
                      <span>
                        {getPaymentLabel(sp.method, t)}
                        {sp.reference ? ` (${sp.reference})` : ''}
                      </span>
                      <span className="tabular-nums">{formatCurrency(sp.amount, lang)}</span>
                    </div>
                  ))}
                </div>
              )}
              {order.transactionId && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-600">{t.tidReceiptLabel}</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {order.transactionId}
                  </span>
                </div>
              )}
              {isUdhaar ? (
                <div className="flex justify-between text-amber-800 font-semibold">
                  <span>{t.udhaarAddedLabel}</span>
                  <span className="tabular-nums">{formatCurrency(order.total, lang)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-600">{t.tenderedLabel}</span>
                    <span className="tabular-nums">
                      {formatCurrency(order.amountTendered, lang)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">{t.changeLabel}</span>
                    <span className="tabular-nums">
                      {formatCurrency(order.changeDue, lang)}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-dashed border-slate-300 text-center space-y-2">
              <p className="text-[11px] font-medium text-slate-700 whitespace-pre-line">
                {receiptFooter}
              </p>
              <div
                className="flex items-center justify-center gap-[2px] h-8 pt-1"
                aria-hidden="true"
                dir="ltr"
              >
                {barcodeBars.map((w, idx) => (
                  <span
                    key={idx}
                    className="bg-slate-900 h-full inline-block"
                    style={{ width: `${w}px` }}
                  />
                ))}
              </div>
              <p className="text-[10px] text-slate-500 tabular-nums">{order.receiptNumber}</p>
            </div>
          </div>
        </div>

        <div className="no-print px-5 py-4 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleDownloadTxt}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors min-h-[40px] cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{t.downloadTxtBtn}</span>
            </button>
            {onSendWhatsApp && (
              <button
                type="button"
                disabled={sendingWa}
                onClick={handleShareWhatsApp}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg transition-colors min-h-[40px] cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t.sendWhatsappReceiptBtn}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors min-h-[40px] cursor-pointer"
            >
              {t.newOrderBtn}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors min-h-[40px] cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{t.printReceiptBtn}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
