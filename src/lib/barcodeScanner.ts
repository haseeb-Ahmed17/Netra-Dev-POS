import type { Product } from '../types';

export interface HidScannerConfig {
  /** Max gap (ms) between scanner keystrokes when no text input is focused */
  maxInterKeyMs: number;
  /** Max average gap (ms) to classify input inside search box as an HID scan burst */
  searchBurstMaxAvgMs: number;
  /** Max single gap (ms) allowed inside an HID scan burst inside search box */
  searchBurstMaxGapMs: number;
  /** Minimum characters required before treating buffer + suffix as a barcode scan */
  minLength: number;
  /** Hard cap to avoid unbounded buffer growth */
  maxLength: number;
}

export const DEFAULT_HID_SCANNER_CONFIG: HidScannerConfig = {
  maxInterKeyMs: 120,
  searchBurstMaxAvgMs: 75,
  searchBurstMaxGapMs: 110,
  minLength: 3,
  maxLength: 64,
};

export interface HidScanState {
  chars: string[];
  timestamps: number[];
  lastKeyTime: number;
}

export function createHidScanState(): HidScanState {
  return {
    chars: [],
    timestamps: [],
    lastKeyTime: 0,
  };
}

export function resetHidScanState(state: HidScanState): void {
  state.chars = [];
  state.timestamps = [];
  state.lastKeyTime = 0;
}

export interface KeyEventTargetLike {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
}

export interface HidKeyEventLike {
  key: string;
  keyCode?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  timeStamp?: number;
  target?: KeyEventTargetLike | null;
}

export interface HidKeyProcessResult {
  scannedCode: string | null;
  preventDefault: boolean;
  clearSearchInput: boolean;
}

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'submit',
  'reset',
  'checkbox',
  'radio',
  'file',
  'image',
  'range',
  'color',
  'hidden',
]);

const PASSTHROUGH_MODIFIER_KEYS = new Set([
  'Shift',
  'CapsLock',
  'NumLock',
  'ScrollLock',
]);

export function normalizeBarcode(raw: string): string {
  return raw.replace(/[\r\n\t]+/g, '').trim();
}

/**
 * Generates an opaque, non-sensitive product QR token so printed QR labels
 * never expose customer PII, pricing secrets, or database credentials.
 */
export function buildProductQrPayload(
  product: Pick<Product, 'id' | 'sku' | 'barcode' | 'qrCode'>
): string {
  if (product.qrCode && product.qrCode.trim()) {
    return product.qrCode.trim();
  }
  const token = (product.barcode || product.sku || product.id).trim();
  return `SBZ-P:${token}`;
}

export function findProductByBarcode(
  products: Product[],
  rawCode: string
): Product | undefined {
  const normalized = normalizeBarcode(rawCode);
  if (!normalized) return undefined;

  const exactMatch = products.find((p) => p.barcode.trim() === normalized);
  if (exactMatch) return exactMatch;

  const lower = normalized.toLowerCase();
  return products.find(
    (p) => p.barcode.trim().length > 0 && p.barcode.trim().toLowerCase() === lower
  );
}

/**
 * Resolves either a barcode or QR payload (including `SBZ-P:<token>` or JSON-free QR value)
 * to a product without matching customer or business sensitive metadata.
 */
export function findProductByCode(
  products: Product[],
  rawCode: string
): Product | undefined {
  const normalized = normalizeBarcode(rawCode);
  if (!normalized) return undefined;

  // 1. Direct barcode match
  const barcodeMatch = findProductByBarcode(products, normalized);
  if (barcodeMatch) return barcodeMatch;

  // 2. Direct qrCode field match
  const lower = normalized.toLowerCase();
  const qrMatch = products.find(
    (p) =>
      typeof p.qrCode === 'string' &&
      p.qrCode.trim().length > 0 &&
      p.qrCode.trim().toLowerCase() === lower
  );
  if (qrMatch) return qrMatch;

  // 3. Opaque SBZ-P:<token> format match (matches barcode, qrCode, id, or sku token)
  if (normalized.toUpperCase().startsWith('SBZ-P:')) {
    const token = normalized.slice(6).trim();
    if (!token) return undefined;
    const tokenLower = token.toLowerCase();
    return (
      findProductByBarcode(products, token) ||
      products.find(
        (p) =>
          (p.qrCode && p.qrCode.trim().toLowerCase() === tokenLower) ||
          p.id.trim().toLowerCase() === tokenLower ||
          p.sku.trim().toLowerCase() === tokenLower
      )
    );
  }

  return undefined;
}

export function createDuplicateScanGuard(cooldownMs = 1500) {
  let lastCode = '';
  let lastAcceptedAt = 0;

  return {
    shouldAccept(rawCode: string, now = Date.now()): boolean {
      const normalized = normalizeBarcode(rawCode);
      if (!normalized) return false;
      if (normalized === lastCode && now - lastAcceptedAt < cooldownMs) {
        return false;
      }
      lastCode = normalized;
      lastAcceptedAt = now;
      return true;
    },
    reset(): void {
      lastCode = '';
      lastAcceptedAt = 0;
    },
  };
}

export function isTextEntryElement(
  target: KeyEventTargetLike | null | undefined
): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const contentEditableAttr = target.getAttribute?.('contenteditable');
  if (contentEditableAttr === '' || contentEditableAttr === 'true') {
    return true;
  }

  const tag = (target.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  if (tag === 'INPUT') {
    const inputType = (target.type || 'text').toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(inputType);
  }
  return false;
}

export function isScannerSearchInput(
  target: KeyEventTargetLike | null | undefined
): boolean {
  return target?.getAttribute?.('data-barcode-search-input') === 'true';
}

export function isSuffixKey(key: string, keyCode?: number): boolean {
  return key === 'Enter' || key === 'Tab' || keyCode === 13 || keyCode === 9;
}

function isRapidBurst(
  timestamps: number[],
  now: number,
  config: HidScannerConfig
): boolean {
  if (timestamps.length < config.minLength) return false;
  if (now - timestamps[timestamps.length - 1] > config.searchBurstMaxGapMs) {
    return false;
  }
  let maxGap = 0;
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1];
    if (gap > maxGap) maxGap = gap;
  }
  const totalSpan = timestamps[timestamps.length - 1] - timestamps[0];
  const avgGap = totalSpan / Math.max(1, timestamps.length - 1);
  return avgGap <= config.searchBurstMaxAvgMs && maxGap <= config.searchBurstMaxGapMs;
}

export function processHidKeyEvent(
  state: HidScanState,
  event: HidKeyEventLike,
  options?: {
    disabled?: boolean;
    now?: number;
    config?: HidScannerConfig;
  }
): HidKeyProcessResult {
  const noAction: HidKeyProcessResult = {
    scannedCode: null,
    preventDefault: false,
    clearSearchInput: false,
  };

  if (options?.disabled) {
    resetHidScanState(state);
    return noAction;
  }

  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.isComposing ||
    event.key === 'Dead' ||
    event.key === 'Process'
  ) {
    return noAction;
  }

  // Allow Shift/CapsLock between scanner chars (e.g. uppercase alphanumeric Code-128)
  if (PASSTHROUGH_MODIFIER_KEYS.has(event.key)) {
    return noAction;
  }

  const config = options?.config ?? DEFAULT_HID_SCANNER_CONFIG;
  const now =
    typeof options?.now === 'number'
      ? options.now
      : typeof event.timeStamp === 'number' && event.timeStamp > 0
      ? event.timeStamp
      : Date.now();

  const inSearchInput = isScannerSearchInput(event.target);
  const inOtherFormField = !inSearchInput && isTextEntryElement(event.target);

  // Never intercept or alter input inside normal form fields (tendered cash, customer fields, cart qty, selects)
  if (inOtherFormField) {
    resetHidScanState(state);
    return noAction;
  }

  if (
    event.key === 'Backspace' ||
    event.key === 'Delete' ||
    event.key === 'Escape'
  ) {
    resetHidScanState(state);
    return noAction;
  }

  if (isSuffixKey(event.key, event.keyCode)) {
    if (state.chars.length >= config.minLength) {
      const code = normalizeBarcode(state.chars.join(''));
      if (inSearchInput) {
        const rapid = isRapidBurst(state.timestamps, now, config);
        resetHidScanState(state);
        if (rapid && code.length >= config.minLength) {
          return {
            scannedCode: code,
            preventDefault: true,
            clearSearchInput: true,
          };
        }
        return noAction;
      }

      const fresh = now - state.lastKeyTime <= config.maxInterKeyMs;
      resetHidScanState(state);
      if (fresh && code.length >= config.minLength) {
        return {
          scannedCode: code,
          preventDefault: true,
          clearSearchInput: false,
        };
      }
      return noAction;
    }

    resetHidScanState(state);
    return noAction;
  }

  if (event.key.length === 1) {
    // Do not start a background barcode buffer with Space (preserves page scroll & focused button activation)
    if (state.chars.length === 0 && event.key === ' ') {
      return noAction;
    }

    const gapLimit = inSearchInput
      ? config.searchBurstMaxGapMs
      : config.maxInterKeyMs;
    const gap = state.lastKeyTime > 0 ? now - state.lastKeyTime : 0;

    if (state.chars.length > 0 && gap > gapLimit) {
      state.chars = [event.key];
      state.timestamps = [now];
      state.lastKeyTime = now;
      return noAction;
    }

    if (state.chars.length < config.maxLength) {
      state.chars.push(event.key);
      state.timestamps.push(now);
      state.lastKeyTime = now;
    }
    return noAction;
  }

  // Non-character navigation/system key clears pending scan buffer
  resetHidScanState(state);
  return noAction;
}
