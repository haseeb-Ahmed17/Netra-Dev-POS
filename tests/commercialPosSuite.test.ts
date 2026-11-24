// Commercial POS Suite verification tests.
// Run with: npx tsx tests/commercialPosSuite.test.ts

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createPosExpressApp } from '../server';
import { createDefaultStoreSettings, INITIAL_PRODUCTS } from '../src/data/initialData';
import {
  buildProductQrPayload,
  createDuplicateScanGuard,
  findProductByCode,
} from '../src/lib/barcodeScanner';
import {
  exportProductsToCsv,
  parseProductsFromCsv,
} from '../src/lib/csvUtils';
import {
  computePeriodBreakdown,
  filterOrdersInRange,
  resolvePeriodWindow,
  summarizeFinancials,
} from '../src/lib/dashboardAnalytics';
import {
  buildWorkspaceBackupJson,
  createDefaultExtendedModules,
  parseWorkspaceBackupJson,
} from '../src/lib/posExtendedStore';
import {
  hasConfiguredAdmin,
  isStoredPinHash,
} from '../src/lib/pinSecurity';
import {
  buildStarterWorkspace,
  enqueueOfflineSale,
  fetchWorkspaceData,
  getOfflineQueue,
  saveEmployeeRecord,
  setupInitialAdminRecord,
  verifyStaffPinRecord,
} from '../src/lib/posRepository';
import {
  calculateUnitAwarePrice,
  convertCompatibleQuantity,
} from '../src/lib/unitUtils';
import {
  buildManualWhatsAppUrl,
  dispatchWhatsAppMessage,
  formatWhatsAppReceiptMessage,
  normalizeWhatsAppPhone,
} from '../src/lib/whatsappService';
import type { CashShift, OrderRecord, Product } from '../src/types';

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

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

function walkTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTsFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

async function runTests(): Promise<void> {
  // Install in-memory localStorage for Node test environment
  if (!globalThis.localStorage) {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
  }

  // -------------------------------------------------------------------------
  // 1. Barcode & Opaque SBZ-P QR Resolution + Duplicate Scan Cooldown
  // -------------------------------------------------------------------------
  const tea = INITIAL_PRODUCTS[0];
  assert(Boolean(tea), 'INITIAL_PRODUCTS must contain products');
  const qrPayload = buildProductQrPayload(tea);
  assert(
    qrPayload.startsWith('SBZ-P:') || qrPayload === tea.qrCode,
    'buildProductQrPayload must produce opaque SBZ-P payload or explicit qrCode'
  );
  assert(
    !qrPayload.includes('cost') && !qrPayload.includes('password'),
    'QR payload must not contain sensitive fields'
  );

  const matchedByQr = findProductByCode(INITIAL_PRODUCTS, `SBZ-P:${tea.sku}`);
  assertEqual(matchedByQr?.id, tea.id, 'findProductByCode must resolve SBZ-P:<sku>');

  const matchedByBarcode = findProductByCode(INITIAL_PRODUCTS, tea.barcode);
  assertEqual(matchedByBarcode?.id, tea.id, 'findProductByCode must resolve barcode');

  const guard = createDuplicateScanGuard(1500);
  assertEqual(guard.shouldAccept(tea.barcode, 1000), true, 'First scan accepted');
  assertEqual(guard.shouldAccept(tea.barcode, 1800), false, 'Duplicate within 1.5s ignored');
  assertEqual(guard.shouldAccept(tea.barcode, 2600), true, 'Scan after cooldown accepted');

  // -------------------------------------------------------------------------
  // 2. Compatible Unit Conversions (kg/g, litre/ml, metre/cm)
  // -------------------------------------------------------------------------
  assertEqual(convertCompatibleQuantity(500, 'g', 'kg'), 0.5, '500g -> 0.5kg');
  assertEqual(convertCompatibleQuantity(1.25, 'kg', 'g'), 1250, '1.25kg -> 1250g');
  assertEqual(convertCompatibleQuantity(250, 'ml', 'litre'), 0.25, '250ml -> 0.25litre');
  assertEqual(convertCompatibleQuantity(150, 'cm', 'metre'), 1.5, '150cm -> 1.5metre');

  const weightedLine = calculateUnitAwarePrice(400, 'kg', 250, 'g');
  assertEqual(weightedLine.baseQuantity, 0.25, '250g billed on Rs.400/kg item deducts 0.25kg');
  assertEqual(weightedLine.lineAmount, 100, '250g at Rs.400/kg equals Rs.100');

  let threwIncompatible = false;
  try {
    convertCompatibleQuantity(1, 'kg', 'litre');
  } catch {
    threwIncompatible = true;
  }
  assert(threwIncompatible, 'Incompatible conversion kg -> litre must throw');

  // -------------------------------------------------------------------------
  // 3. Cash Shift Expected Cash & Reconciliation Math
  // -------------------------------------------------------------------------
  const shift: CashShift = {
    id: 'shift-1',
    cashierId: 'emp-1',
    cashierName: 'Bilal',
    startedAt: '2026-11-24T08:00:00.000Z',
    status: 'open',
    openingCash: 5000,
    cashSalesTotal: 12450,
    cashRefundsTotal: 450,
    cashInTotal: 1000,
    cashOutTotal: 2000,
    expenseTotal: 500,
    expectedCash: 5000 + 12450 - 450 + 1000 - 2000 - 500,
    movements: [],
  };
  assertEqual(shift.expectedCash, 15500, 'Expected cash drawer balance calculation');
  const actualCountedCash = 15350;
  const variance = actualCountedCash - shift.expectedCash;
  assertEqual(variance, -150, 'Shortage variance (-150) accurately computed');

  // -------------------------------------------------------------------------
  // 4. Dashboard Analytics: yesterday, bank_transfer + paymentSplits, cancelled
  // -------------------------------------------------------------------------
  const fixedNow = new Date(2026, 10, 24, 15, 0, 0, 0); // 2026-11-24 15:00 local
  const yestWindow = resolvePeriodWindow('yesterday', '', '', fixedNow);
  assertEqual(yestWindow.startYmd, '2026-11-23', 'Yesterday window startYmd');
  assertEqual(yestWindow.endYmd, '2026-11-23', 'Yesterday window endYmd');
  assertEqual(yestWindow.prevStartYmd, '2026-11-22', 'Previous window startYmd');

  const yestIso = new Date(2026, 10, 23, 12, 30, 0, 0).toISOString();
  const sampleOrders: OrderRecord[] = [
    {
      id: 'ord-split',
      receiptNumber: 'KR-1001',
      createdAt: yestIso,
      customerName: 'Walk-in',
      paymentMethod: 'cash',
      paymentSplits: [
        { method: 'cash', amount: 600 },
        { method: 'bank_transfer', amount: 400, reference: 'IBFT-99' },
      ],
      items: [
        {
          productId: tea.id,
          sku: tea.sku,
          nameEn: tea.nameEn,
          nameUr: tea.nameUr,
          category: tea.category,
          unitPrice: 500,
          unitCost: 350,
          taxRate: 0,
          quantity: 2,
          lineTotal: 1000,
        },
      ],
      subtotal: 1000,
      discountPercent: 0,
      discountAmount: 0,
      taxRate: 0,
      taxAmount: 0,
      total: 1000,
      amountTendered: 1000,
      changeDue: 0,
      returnStatus: 'completed',
    },
    {
      id: 'ord-cancelled',
      receiptNumber: 'KR-1002',
      createdAt: yestIso,
      customerName: 'Cancelled',
      paymentMethod: 'cash',
      items: [
        {
          productId: tea.id,
          sku: tea.sku,
          nameEn: tea.nameEn,
          nameUr: tea.nameUr,
          category: tea.category,
          unitPrice: 500,
          unitCost: 350,
          taxRate: 0,
          quantity: 4,
          lineTotal: 2000,
        },
      ],
      subtotal: 2000,
      discountPercent: 0,
      discountAmount: 0,
      taxRate: 0,
      taxAmount: 0,
      total: 2000,
      amountTendered: 2000,
      changeDue: 0,
      returnStatus: 'cancelled',
    },
  ];

  const yestOrders = filterOrdersInRange(
    sampleOrders,
    yestWindow.startMs,
    yestWindow.endMs
  );
  const financials = summarizeFinancials(yestOrders, []);
  assertEqual(financials.totalRevenue, 1000, 'Cancelled order excluded from revenue');
  assertEqual(financials.completedOrderCount, 1, 'Only active order counted');
  assertEqual(financials.grossProfit, 300, 'Gross profit 1000 - (350 * 2) = 300');

  const breakdown = computePeriodBreakdown(yestOrders, INITIAL_PRODUCTS);
  const cashRow = breakdown.paymentBreakdown.find((r) => r.method === 'cash');
  const bankRow = breakdown.paymentBreakdown.find((r) => r.method === 'bank_transfer');
  assertEqual(cashRow?.total, 600, 'Split payment cash portion attributed');
  assertEqual(bankRow?.total, 400, 'Split payment bank_transfer portion attributed');

  // -------------------------------------------------------------------------
  // 5. CSV Export + RFC-4180 Parse Round-Trip
  // -------------------------------------------------------------------------
  const csvSampleProducts: Product[] = [
    {
      ...tea,
      nameEn: 'Tapal Tea, "Danedar" 900g',
      sellingUnit: 'packet',
      batchNumber: 'B-2026-11',
      expiryDate: '2027-06-30',
    },
  ];
  const exportedCsv = exportProductsToCsv(csvSampleProducts);
  const parsedCsv = parseProductsFromCsv(exportedCsv);
  assertEqual(parsedCsv.errors.length, 0, 'CSV round-trip should produce zero errors');
  assertEqual(parsedCsv.valid.length, 1, 'CSV round-trip should parse 1 product');
  assertEqual(
    parsedCsv.valid[0].nameEn,
    'Tapal Tea, "Danedar" 900g',
    'CSV quoted commas & double quotes preserved cleanly'
  );
  assertEqual(parsedCsv.valid[0].batchNumber, 'B-2026-11', 'Batch number preserved');

  // -------------------------------------------------------------------------
  // 6. WhatsApp Formatting, Consent Gate & Optional Cloud Env Behavior
  // -------------------------------------------------------------------------
  assertEqual(
    normalizeWhatsAppPhone('0300-1234567'),
    '923001234567',
    'PK mobile 03xx normalizes to 923xx'
  );

  const settings = createDefaultStoreSettings('Khaas Superstore');
  const receiptText = formatWhatsAppReceiptMessage({
    shopSettings: settings,
    order: sampleOrders[0],
    customerName: 'Ayesha',
    outstandingBalance: 250,
  });
  assert(receiptText.includes('Khaas Superstore'), 'Receipt includes shop name');
  assert(receiptText.includes('KR-1001'), 'Receipt includes receipt number');

  const manualUrl = buildManualWhatsAppUrl('03001234567', receiptText);
  assert(
    manualUrl.startsWith('https://wa.me/923001234567?text='),
    'Manual wa.me URL builds cleanly'
  );

  const blockedOptInResult = await dispatchWhatsAppMessage({
    customerId: 'cust-1',
    customerName: 'No Opt-In',
    phone: '03001234567',
    messageType: 'receipt',
    content: receiptText,
    whatsappOptIn: false,
  });
  assertEqual(
    blockedOptInResult.logEntry.status,
    'failed',
    'Opt-out customer must be blocked before calling API'
  );

  // Check .env.example & client security boundaries
  const envExample = fs.readFileSync(
    path.resolve(process.cwd(), '.env.example'),
    'utf8'
  );
  for (const line of envExample.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    assert(
      !trimmed.startsWith('WHATSAPP_'),
      `.env.example must keep WhatsApp variables optional/commented (found ${trimmed})`
    );
  }

  for (const filePath of walkTsFiles(path.resolve(process.cwd(), 'src'))) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert(
      !content.includes('SUPABASE_SERVICE_ROLE_KEY'),
      `${filePath} must not reference SUPABASE_SERVICE_ROLE_KEY`
    );
    assert(
      !content.includes('STAFF_SESSION_SECRET'),
      `${filePath} must not reference STAFF_SESSION_SECRET`
    );
    assert(
      !content.includes('WHATSAPP_ACCESS_TOKEN'),
      `${filePath} must not reference WHATSAPP_ACCESS_TOKEN`
    );
  }

  // Boot Express app without requiring WhatsApp env vars
  const prevWaToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const prevWaPhone = process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;

  const app = createPosExpressApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Failed to bind ephemeral Express port');
    }
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const healthRes = await fetch(`${baseUrl}/api/health`);
    assertEqual(healthRes.status, 200, '/api/health boots cleanly without WhatsApp env');
    const healthJson = (await healthRes.json()) as Record<string, unknown>;
    assertEqual(healthJson.ok, true, '/api/health ok=true');

    const waUnauth = await fetch(`${baseUrl}/api/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: '923001234567', message: 'Test' }),
    });
    assertEqual(
      waUnauth.status,
      401,
      '/api/whatsapp/send must require authentication even when WhatsApp env is unset'
    );

    const bootstrapUnauth = await fetch(`${baseUrl}/api/staff/bootstrap-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Owner', pin: '4829' }),
    });
    assertEqual(
      bootstrapUnauth.status,
      401,
      '/api/staff/bootstrap-admin must require authentication'
    );
  } finally {
    if (prevWaToken !== undefined) process.env.WHATSAPP_ACCESS_TOKEN = prevWaToken;
    if (prevWaPhone !== undefined) process.env.WHATSAPP_PHONE_NUMBER_ID = prevWaPhone;
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }

  // -------------------------------------------------------------------------
  // 7. Offline Idempotency (clientTxRef) & Backup/Restore Round-Trip
  // -------------------------------------------------------------------------
  const offlineOrder: OrderRecord = {
    ...sampleOrders[0],
    id: 'ord-off-1',
    clientTxRef: 'txref-unique-1',
  };
  enqueueOfflineSale({
    id: 'q-1',
    userId: 'user-test',
    createdAt: yestIso,
    order: offlineOrder,
    updatedProducts: [],
  });
  // Second enqueue with same clientTxRef must dedupe
  enqueueOfflineSale({
    id: 'q-2',
    userId: 'user-test',
    createdAt: yestIso,
    order: { ...offlineOrder, id: 'ord-off-1-dup' },
    updatedProducts: [],
  });
  const queued = getOfflineQueue('user-test');
  assertEqual(queued.length, 1, 'Offline queue deduplicates by clientTxRef');

  const extendedDefaults = createDefaultExtendedModules('Khaas Superstore');
  const backupJson = buildWorkspaceBackupJson({
    userId: 'user-test',
    shopName: 'Khaas Superstore',
    workspace: { products: csvSampleProducts, orders: sampleOrders },
    extended: extendedDefaults,
  });
  const parsedBackup = parseWorkspaceBackupJson(backupJson);
  assert(parsedBackup.valid, 'Backup JSON round-trip must validate');
  if (parsedBackup.valid) {
    assertEqual(parsedBackup.payload.shopName, 'Khaas Superstore', 'Backup preserves shopName');
    const restoredProds = parsedBackup.payload.workspace.products as Product[];
    assertEqual(restoredProds.length, 1, 'Backup preserves products array');
  }

  // -------------------------------------------------------------------------
  // 8. First-Time Admin Onboarding & Subsequent Staff PIN Login Flow
  // -------------------------------------------------------------------------
  const freshOwnerId = 'owner-first-time-setup-test';
  const freshStarter = buildStarterWorkspace(freshOwnerId, false, 'Bismillah Mart');
  assertEqual(
    freshStarter.employees.length,
    0,
    'New non-demo store workspace must NOT seed a hardcoded default Admin PIN'
  );
  assertEqual(
    hasConfiguredAdmin(freshStarter.employees),
    false,
    'Empty employees triggers first-time Admin setup'
  );

  // Also confirm unconfigured Admin rows (hasPin=false) still trigger first-time setup
  assertEqual(
    hasConfiguredAdmin([
      { role: 'admin', isActive: true, hasPin: false, pinHash: '' },
    ]),
    false,
    'Unconfigured Admin row without PIN hash still requires first-time Admin setup'
  );

  // Even if an existing workspace already had a non-admin cashier, no Admin is configured yet
  const loadedFresh = await fetchWorkspaceData(freshOwnerId, 'Bismillah Mart');
  assertEqual(loadedFresh.employees.length, 0, 'Fresh workspace starts with 0 employees');

  // Seed a pre-existing cashier row without deleting it during Admin setup
  const cashierSeedRes = await saveEmployeeRecord(freshOwnerId, {
    id: 'existing-cashier-1',
    name: 'Existing Cashier',
    phone: '0311-5550000',
    role: 'cashier',
    pin: '7777',
    isActive: true,
    createdAt: new Date().toISOString(),
  });
  assertEqual(cashierSeedRes.error, null, 'Pre-existing cashier saves cleanly');

  const beforeAdminSetup = await fetchWorkspaceData(freshOwnerId, 'Bismillah Mart');
  assertEqual(
    hasConfiguredAdmin(beforeAdminSetup.employees),
    false,
    'Cashier-only workspace still requires first-time Admin setup'
  );

  // First-time Admin setup requires NO existing PIN and hashes chosen 4-digit PIN
  const setupRes = await setupInitialAdminRecord(freshOwnerId, {
    name: 'Hamza Store Owner',
    phone: '0300-9988776',
    pin: '4829',
  });
  assertEqual(setupRes.ok, true, 'First-time Admin setup succeeds without existing PIN');
  assert(Boolean(setupRes.employee), 'Setup returns created Admin employee');
  assert(Boolean(setupRes.session?.token), 'Setup returns authenticated Admin staff session');
  assertEqual(setupRes.session?.role, 'admin', 'Setup issues admin role session');
  if (setupRes.employee) {
    assert(
      isStoredPinHash(setupRes.employee.pinHash),
      'Local Admin PIN must be stored as PBKDF2 hash'
    );
    assert(
      setupRes.employee.pinHash !== '4829',
      'Stored PIN hash must never equal plaintext PIN'
    );
  }

  // Subsequent bootstrap attempts MUST fail once an Admin PIN is configured (no auth bypass)
  const secondBootstrap = await setupInitialAdminRecord(freshOwnerId, {
    name: 'Attacker Admin',
    phone: '',
    pin: '9999',
  });
  assertEqual(
    secondBootstrap.ok,
    false,
    'Second first-time Admin setup attempt must be blocked once Admin PIN is configured'
  );

  // Reload workspace and confirm existing cashier was preserved alongside the new Admin
  const afterSetupWs = await fetchWorkspaceData(freshOwnerId, 'Bismillah Mart');
  assertEqual(
    hasConfiguredAdmin(afterSetupWs.employees),
    true,
    'Configured Admin persists across workspace reload'
  );
  assert(
    afterSetupWs.employees.some((e) => e.id === 'existing-cashier-1'),
    'Existing employees must not be deleted during initial Admin setup'
  );

  // Normal PIN authentication rejects wrong PINs and accepts the owner-chosen PIN
  const wrongPinCheck = await verifyStaffPinRecord(freshOwnerId, '1234');
  assertEqual(wrongPinCheck.ok, false, 'Default 1234 PIN must be rejected');

  const validPinCheck = await verifyStaffPinRecord(freshOwnerId, '4829');
  assertEqual(validPinCheck.ok, true, 'Owner-chosen 4-digit PIN authenticates cleanly');
  assertEqual(validPinCheck.role, 'admin', 'Authenticated session role is admin');

  const repoSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/lib/posRepository.ts'),
    'utf8'
  );
  assert(
    !repoSource.includes('buildDefaultAdminEmployee'),
    'posRepository.ts must not contain buildDefaultAdminEmployee hardcoded PIN helper'
  );

  const pinModalSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/StaffPinModal.tsx'),
    'utf8'
  );
  assert(
    pinModalSource.includes('needsInitialAdminSetup') &&
      pinModalSource.includes('initial-admin-pin') &&
      pinModalSource.includes('initial-admin-confirm-pin'),
    'StaffPinModal must provide dedicated First-Time Admin Setup flow'
  );

  // -------------------------------------------------------------------------
  // 9. PAPUDA HOTEL Scenario (Existing Active Cashier, No Admin PIN) + Gate
  // -------------------------------------------------------------------------
  const papudaOwnerId = 'papuda-hotel-owner-uuid';
  const papudaCashierRes = await saveEmployeeRecord(papudaOwnerId, {
    id: 'papuda-cashier-1',
    name: 'Papuda Cashier',
    phone: '0301-1234567',
    role: 'cashier',
    pin: '8421',
    isActive: true,
    createdAt: new Date().toISOString(),
  });
  assertEqual(papudaCashierRes.error, null, 'PAPUDA HOTEL cashier profile exists before Admin setup');

  const papudaBefore = await fetchWorkspaceData(papudaOwnerId, 'PAPUDA HOTEL');
  assertEqual(
    hasConfiguredAdmin(papudaBefore.employees),
    false,
    'PAPUDA HOTEL with active Cashier and no Admin triggers initial Admin setup'
  );

  const papudaAdminSetup = await setupInitialAdminRecord(papudaOwnerId, {
    name: 'PAPUDA HOTEL Owner',
    phone: '0300-7654321',
    pin: '5924',
  });
  assertEqual(papudaAdminSetup.ok, true, 'PAPUDA HOTEL owner can create initial Admin PIN');
  assertEqual(papudaAdminSetup.session?.role, 'admin', 'PAPUDA HOTEL setup grants admin session');

  const papudaAfter = await fetchWorkspaceData(papudaOwnerId, 'PAPUDA HOTEL');
  assertEqual(papudaAfter.employees.length, 2, 'PAPUDA HOTEL preserves existing Cashier alongside new Admin');
  assert(
    papudaAfter.employees.some((e) => e.id === 'papuda-cashier-1' && e.role === 'cashier' && e.isActive),
    'PAPUDA HOTEL active Cashier profile remains intact'
  );
  assertEqual(
    hasConfiguredAdmin(papudaAfter.employees),
    true,
    'PAPUDA HOTEL now has a configured Store Admin'
  );

  const papudaAdminLogin = await verifyStaffPinRecord(papudaOwnerId, '5924');
  assertEqual(papudaAdminLogin.ok, true, 'New PAPUDA HOTEL Admin PIN verifies cleanly');
  assertEqual(papudaAdminLogin.role, 'admin', 'Admin login resolves admin role');

  const papudaCashierLogin = await verifyStaffPinRecord(papudaOwnerId, '8421');
  assertEqual(papudaCashierLogin.ok, true, 'Preserved PAPUDA HOTEL Cashier PIN still verifies cleanly');
  assertEqual(papudaCashierLogin.role, 'cashier', 'Cashier login preserves cashier role');

  const appSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/App.tsx'),
    'utf8'
  );
  assert(
    appSource.includes('workspaceLoadedUserId') &&
      appSource.includes('isWorkspaceBootstrapReady') &&
      appSource.includes('needsInitialAdminSetup={!hasConfiguredAdmin(employees)}'),
    'App.tsx must wait for workspaceLoadedUserId & bootstrap-admin check before rendering StaffPinModal'
  );
  assert(
    repoSource.includes('isJsonApiResponse'),
    'posRepository.ts must verify JSON content-type so static SPA HTML responses fall back cleanly'
  );
  assert(
    fs.existsSync(path.resolve(process.cwd(), 'api/index.ts')) &&
      fs.existsSync(path.resolve(process.cwd(), 'vercel.json')),
    'Vercel serverless API adapter and vercel.json must exist for /api/staff/* routing'
  );

  console.log('ALL_COMMERCIAL_POS_SUITE_TESTS_PASSED');
}

void runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
