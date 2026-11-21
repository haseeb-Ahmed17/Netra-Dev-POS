import { Printer, X } from 'lucide-react';
import { formatCurrency, type TranslationStrings } from '../i18n';
import type { Language, Product } from '../types';

interface BarcodeStickerModalProps {
  product: Pick<Product, 'nameEn' | 'nameUr' | 'barcode' | 'sku' | 'price'> | null;
  shopName: string;
  onClose: () => void;
  lang: Language;
  t: TranslationStrings;
}

export function BarcodeStickerModal({
  product,
  shopName,
  onClose,
  lang,
  t,
}: BarcodeStickerModalProps) {
  if (!product) return null;

  const barcodeValue = (product.barcode || product.sku || '000000000000').trim();
  const displayName = lang === 'ur' ? product.nameUr : product.nameEn;

  // Deterministic lightweight SVG barcode pattern from digits/characters
  const bars: { x: number; width: number }[] = [];
  let cursorX = 6;
  // Left guard bars
  bars.push({ x: cursorX, width: 2 }, { x: cursorX + 4, width: 2 });
  cursorX += 9;

  const chars = barcodeValue.split('');
  chars.forEach((ch, idx) => {
    const code = ch.charCodeAt(0);
    const b1 = ((code + idx) % 3) + 1;
    const g1 = ((code * 2 + idx) % 2) + 1;
    const b2 = ((code + idx * 3) % 3) + 1;
    const g2 = ((code + 1) % 2) + 1;

    bars.push({ x: cursorX, width: b1 });
    cursorX += b1 + g1;
    bars.push({ x: cursorX, width: b2 });
    cursorX += b2 + g2;
  });

  // Right guard bars
  bars.push({ x: cursorX + 1, width: 2 }, { x: cursorX + 5, width: 2 });
  const svgWidth = cursorX + 13;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="barcode-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-sm overflow-hidden shadow-xl">
        {/* Modal Header */}
        <div className="no-print flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 id="barcode-modal-title" className="text-base font-bold text-slate-900">
            {t.barcodeModalTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.closeBtn}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Printable Sticker Preview */}
        <div className="p-6 bg-slate-50 flex justify-center">
          <div
            id="printable-barcode-area"
            className="bg-white border border-slate-300 rounded-lg p-4 w-full max-w-[240px] text-center space-y-1.5"
          >
            <p className="text-[11px] font-semibold tracking-wide text-slate-600 truncate">
              {shopName || t.brandName}
            </p>
            <p className="text-sm font-bold text-slate-900 leading-tight line-clamp-2">
              {displayName}
            </p>

            <div className="pt-1 pb-0.5 flex justify-center" dir="ltr">
              <svg
                viewBox={`0 0 ${svgWidth} 44`}
                className="w-full max-w-[196px] h-12"
                role="img"
                aria-label={`Barcode ${barcodeValue}`}
              >
                <rect x="0" y="0" width={svgWidth} height="44" fill="#FFFFFF" />
                {bars.map((bar, i) => (
                  <rect
                    key={i}
                    x={bar.x}
                    y="2"
                    width={bar.width}
                    height="40"
                    fill="#0F172A"
                  />
                ))}
              </svg>
            </div>

            <p className="font-mono text-xs font-semibold tracking-widest text-slate-800 tabular-nums">
              {barcodeValue}
            </p>

            <p className="font-mono text-base font-bold text-slate-900 tabular-nums pt-0.5 border-t border-dashed border-slate-200">
              {formatCurrency(product.price, lang)}
            </p>
          </div>
        </div>

        {/* Action Footer */}
        <div className="no-print px-5 py-4 border-t border-slate-200 bg-white flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg min-h-[40px] cursor-pointer"
          >
            {t.closeBtn}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg min-h-[40px] cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{t.printStickerBtn}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
