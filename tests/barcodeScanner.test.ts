// Unit & integration tests for USB/Bluetooth HID Barcode Scanner in POS Billing.
// Run with: npx tsx tests/barcodeScanner.test.ts

import fs from 'node:fs';
import path from 'node:path';
import { INITIAL_PRODUCTS } from '../src/data/initialData';
import {
  createHidScanState,
  findProductByBarcode,
  isScannerSearchInput,
  isTextEntryElement,
  normalizeBarcode,
  processHidKeyEvent,
  type KeyEventTargetLike,
} from '../src/lib/barcodeScanner';
import { TRANSLATIONS } from '../src/i18n';
import type { Product } from '../src/types';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message} (expected=${String(expected)}, actual=${String(actual)})`
    );
  }
}

function feedSequence(
  keys: string[],
  stepMs: number,
  options?: {
    target?: KeyEventTargetLike | null;
    suffix?: 'Enter' | 'Tab';
    startMs?: number;
    disabled?: boolean;
  }
) {
  const state = createHidScanState();
  let t = options?.startMs ?? 1000;
  let lastResult = processHidKeyEvent(
    state,
    { key: keys[0], target: options?.target },
    { now: t, disabled: options?.disabled }
  );

  for (let i = 1; i < keys.length; i++) {
    t += stepMs;
    lastResult = processHidKeyEvent(
      state,
      { key: keys[i], target: options?.target },
      { now: t, disabled: options?.disabled }
    );
    assertEqual(
      lastResult.scannedCode,
      null,
      `intermediate key ${keys[i]} must not trigger scan before suffix`
    );
  }

  if (options?.suffix) {
    t += stepMs;
    lastResult = processHidKeyEvent(
      state,
      {
        key: options.suffix,
        keyCode: options.suffix === 'Enter' ? 13 : 9,
        target: options?.target,
      },
      { now: t, disabled: options?.disabled }
    );
  }
  return lastResult;
}

function runTests(): void {
  // 1. Barcode normalization & lookup on product.barcode
  assertEqual(
    normalizeBarcode(' 8964001101018\r\n '),
    '8964001101018',
    'normalizeBarcode strips CR/LF and whitespace'
  );

  const latte = findProductByBarcode(INITIAL_PRODUCTS, '8964001101018');
  assert(latte && latte.id === 'prod-latte', 'must match Iced Spanish Latte by barcode');

  const honey = findProductByBarcode(INITIAL_PRODUCTS, '8964001303018\n');
  assert(honey && honey.id === 'prod-honey', 'must match Raw Yemeni Sidr Honey by barcode');

  const unknown = findProductByBarcode(INITIAL_PRODUCTS, '9999999999999');
  assertEqual(unknown, undefined, 'unmatched barcode must return undefined');

  // Case-insensitive alphanumeric barcode match; must NOT match SKU if barcode differs
  const customCatalog: Product[] = [
    ...INITIAL_PRODUCTS,
    {
      id: 'prod-alpha',
      sku: 'SKU-ONLY-99',
      barcode: 'AB-4402-Z',
      nameEn: 'Alpha Item',
      nameUr: 'الفا آئٹم',
      category: 'pantry',
      price: 250,
      cost: 120,
      taxRate: 0,
      sellingUnit: 'piece',
      stock: 5,
      image: '',
    },
  ];
  assertEqual(
    findProductByBarcode(customCatalog, 'ab-4402-z')?.id,
    'prod-alpha',
    'must support alphanumeric case-insensitive barcode match'
  );
  assertEqual(
    findProductByBarcode(customCatalog, 'SKU-ONLY-99'),
    undefined,
    'must match using barcode field rather than SKU when barcode differs'
  );

  // 2. USB/Bluetooth HID detection outside inputs (Enter & Tab suffixes)
  const bodyTarget: KeyEventTargetLike = { tagName: 'BODY' };
  const buttonTarget: KeyEventTargetLike = { tagName: 'BUTTON' };

  const usbScanEnter = feedSequence('8964001101018'.split(''), 8, {
    target: bodyTarget,
    suffix: 'Enter',
  });
  assertEqual(usbScanEnter.scannedCode, '8964001101018', 'USB HID + Enter scan must resolve');
  assertEqual(usbScanEnter.preventDefault, true, 'USB HID + Enter must preventDefault');

  const btScanTab = feedSequence('8964001303018'.split(''), 45, {
    target: buttonTarget,
    suffix: 'Tab',
  });
  assertEqual(btScanTab.scannedCode, '8964001303018', 'Bluetooth HID + Tab scan must resolve');
  assertEqual(btScanTab.preventDefault, true, 'Bluetooth HID + Tab on focused button must preventDefault');

  // Shifted uppercase alphanumeric Code-128 scan
  const shiftedKeys = ['Shift', 'A', 'B', '-', '4', '4', '0', '2', '-', 'Shift', 'Z'];
  const shiftedScan = feedSequence(shiftedKeys, 12, {
    target: bodyTarget,
    suffix: 'Enter',
  });
  assertEqual(shiftedScan.scannedCode, 'AB-4402-Z', 'Shift key events must not break alphanumeric scans');

  // Slow stray keypresses outside input (> 120ms) must NOT trigger accidental scan on Enter
  const slowStray = feedSequence('8964'.split(''), 180, {
    target: bodyTarget,
    suffix: 'Enter',
  });
  assertEqual(slowStray.scannedCode, null, 'slow keypresses > 120ms must not form a scan');
  assertEqual(slowStray.preventDefault, false, 'slow keypresses must not swallow Enter');

  // Leading space on focused button must not be captured (accessibility preservation)
  const spaceState = createHidScanState();
  const spaceRes = processHidKeyEvent(
    spaceState,
    { key: ' ', target: buttonTarget },
    { now: 1000 }
  );
  assertEqual(spaceRes.preventDefault, false, 'Spacebar on button must remain untouched');
  assertEqual(spaceState.chars.length, 0, 'Leading space must not enter scan buffer');

  // Ctrl/Meta/Alt shortcuts must pass through
  const ctrlRes = processHidKeyEvent(
    createHidScanState(),
    { key: 'f', ctrlKey: true, target: bodyTarget },
    { now: 1000 }
  );
  assertEqual(ctrlRes.preventDefault, false, 'Ctrl+F shortcut must pass through');

  // 3. Normal form fields MUST remain isolated from scanner interception
  const normalInputs: KeyEventTargetLike[] = [
    { tagName: 'INPUT', type: 'number' }, // cash tendered or cart qty
    { tagName: 'INPUT', type: 'text' }, // customer name / TID
    { tagName: 'SELECT' }, // customer / udhaar select
    { tagName: 'TEXTAREA' },
    { tagName: 'DIV', isContentEditable: true },
  ];
  for (const fieldTarget of normalInputs) {
    assertEqual(isTextEntryElement(fieldTarget), true, `${fieldTarget.tagName} must be detected as text entry`);
    const attemptEnter = feedSequence('8964001101018'.split(''), 5, {
      target: fieldTarget,
      suffix: 'Enter',
    });
    assertEqual(attemptEnter.scannedCode, null, `must never intercept inside ${fieldTarget.tagName}:${fieldTarget.type || ''}`);
    assertEqual(attemptEnter.preventDefault, false, `must not preventDefault inside ${fieldTarget.tagName}`);

    const attemptTab = feedSequence('8964001101018'.split(''), 5, {
      target: fieldTarget,
      suffix: 'Tab',
    });
    assertEqual(attemptTab.scannedCode, null, `must never intercept Tab inside ${fieldTarget.tagName}`);
    assertEqual(attemptTab.preventDefault, false, `must not block Tab navigation inside ${fieldTarget.tagName}`);
  }

  // 4. POS Search bar supports BOTH slow manual typing AND rapid HID burst scan
  const searchInputTarget: KeyEventTargetLike = {
    tagName: 'INPUT',
    type: 'text',
    getAttribute: (name: string) =>
      name === 'data-barcode-search-input' ? 'true' : null,
  };
  assertEqual(isScannerSearchInput(searchInputTarget), true, 'search input marker must be recognized');

  // Slow manual search typing ("latte" at 160ms/char + Tab)
  const manualSearch = feedSequence('latte'.split(''), 160, {
    target: searchInputTarget,
    suffix: 'Tab',
  });
  assertEqual(manualSearch.scannedCode, null, 'manual typing in search box must stay manual search');
  assertEqual(manualSearch.preventDefault, false, 'manual Tab in search box must keep normal focus behavior');
  assertEqual(manualSearch.clearSearchInput, false, 'manual search must not clear search query');

  // Rapid HID scan while search input is focused (10ms/char + Enter / Tab)
  const searchScanEnter = feedSequence('8964001101018'.split(''), 10, {
    target: searchInputTarget,
    suffix: 'Enter',
  });
  assertEqual(searchScanEnter.scannedCode, '8964001101018', 'HID scan inside search input + Enter must trigger scan');
  assertEqual(searchScanEnter.preventDefault, true, 'HID scan inside search input must preventDefault');
  assertEqual(searchScanEnter.clearSearchInput, true, 'HID scan inside search input must clear search query');

  const searchScanTab = feedSequence('8964001101018'.split(''), 12, {
    target: searchInputTarget,
    suffix: 'Tab',
  });
  assertEqual(searchScanTab.scannedCode, '8964001101018', 'HID scan inside search input + Tab must trigger scan');
  assertEqual(searchScanTab.clearSearchInput, true, 'HID Tab scan inside search input must clear search query');

  // 5. Disabled state (modals / lock screen) suppresses scanning
  const disabledScan = feedSequence('8964001101018'.split(''), 8, {
    target: bodyTarget,
    suffix: 'Enter',
    disabled: true,
  });
  assertEqual(disabledScan.scannedCode, null, 'scannerDisabled must suppress barcode capture');
  assertEqual(disabledScan.preventDefault, false, 'scannerDisabled must not preventDefault');

  // 6. Cart repeat-scan increment & i18n verification
  const simulatedCart = new Map<string, number>();
  const scanTwice = ['8964001101018', '8964001101018'];
  for (const code of scanTwice) {
    const prod = findProductByBarcode(INITIAL_PRODUCTS, code)!;
    assert(Boolean(prod), 'product must resolve');
    simulatedCart.set(prod.id, (simulatedCart.get(prod.id) ?? 0) + 1);
  }
  assertEqual(simulatedCart.get('prod-latte'), 2, 'scanning same barcode twice increments cart qty to 2');

  assert(Boolean(TRANSLATIONS.en.barcodeScanNotFound), 'EN error message present');
  assert(Boolean(TRANSLATIONS.ur.barcodeScanNotFound), 'UR error message present');

  // 7. Confirm no camera scanning libraries/APIs were introduced
  const posBillingSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/PosBillingView.tsx'),
    'utf8'
  );
  assert(
    !/getUserMedia|Html5Qrcode|BarcodeDetector|zxing/i.test(posBillingSrc),
    'Camera scanning must not be implemented in PosBillingView'
  );

  console.log('ALL_BARCODE_SCANNER_TESTS_PASSED');
}

runTests();
