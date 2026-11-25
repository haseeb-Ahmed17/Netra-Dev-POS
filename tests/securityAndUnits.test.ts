// Security, RBAC, and Intelligent Product-Specific Unit Management verification tests.
// Run with: npx tsx tests/securityAndUnits.test.ts

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createPosExpressApp } from '../server';
import { createInitialEmployees, INITIAL_PRODUCTS } from '../src/data/initialData';
import {
  DEMO_PIN_HASHES,
  hasConfiguredAdmin,
  hashPinAsync,
  isStoredPinHash,
  isValidPinFormat,
  stripPlaintextPin,
  verifyPinHashAsync,
} from '../src/lib/pinSecurity';
import { canAccessTab, hasRolePermission } from '../src/lib/rbac';
import {
  SELLING_UNITS,
  formatQuantity,
  formatQuantityWithUnit,
  getUnitLabel,
  isValidSellingUnit,
  normalizeSellingUnit,
  parsePositiveQuantity,
  roundCurrency,
  roundQuantity,
} from '../src/lib/unitUtils';

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

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

async function requestJson(
  baseUrl: string,
  method: string,
  urlPath: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

async function runTests(): Promise<void> {
  // -------------------------------------------------------------------------
  // 1. Super Admin Email-Prefix Vulnerability Removed
  // -------------------------------------------------------------------------
  const appSource = readRepoFile('src/App.tsx');
  const repoSource = readRepoFile('src/lib/posRepository.ts');
  const schemaSql = readRepoFile('supabase/schema.sql');
  const migration20261123 = readRepoFile(
    'supabase/migrations/20261123_security_rbac_and_units.sql'
  );

  for (const [label, content] of [
    ['src/App.tsx', appSource],
    ['src/lib/posRepository.ts', repoSource],
  ] as const) {
    assert(
      !content.includes('SUPER_ADMIN_PREFIX'),
      `${label} must not contain SUPER_ADMIN_PREFIX`
    );
    assert(
      !content.includes('isSuperAdminEmail'),
      `${label} must not contain isSuperAdminEmail`
    );
    assert(
      !content.includes('bc260436573'),
      `${label} must not hardcode super admin email prefix`
    );
  }

  assert(
    !schemaSql.includes('bc260436573%'),
    'supabase/schema.sql must not contain LIKE email prefix wildcard'
  );
  const policyCreationBlocks = migration20261123
    .split(/create policy\b/i)
    .slice(1)
    .map((block) => block.split(';')[0].toLowerCase());
  assert(
    policyCreationBlocks.length > 0 &&
      policyCreationBlocks.every(
        (stmt) => !stmt.includes('bc260436573') && !stmt.includes(' like ')
      ),
    '20261123 migration must not create LIKE email prefix policies'
  );
  assert(
    migration20261123.includes('create table if not exists public.super_admins') &&
      migration20261123.includes('create or replace function public.is_super_admin()'),
    '20261123 migration must define explicit public.super_admins table and is_super_admin() RPC'
  );

  const migration20261125Path = path.resolve(
    process.cwd(),
    'supabase/migrations/20261125_founder_super_admin.sql'
  );
  assert(
    fs.existsSync(migration20261125Path),
    'Additive migration 20261125_founder_super_admin.sql must exist'
  );
  const migration20261125 = fs.readFileSync(migration20261125Path, 'utf8');
  assert(
    migration20261125.includes('bc260436573mha@vu.edu.pk') &&
      !migration20261125.toLowerCase().includes(' like '),
    '20261125 migration must use exact founder email without LIKE wildcards'
  );
  assert(
    migration20261125.includes('create table if not exists public.saas_audit_logs') &&
      migration20261125.includes('add column if not exists status text'),
    '20261125 migration must define saas_audit_logs and subscriptions.status'
  );

  // -------------------------------------------------------------------------
  // 2. Staff PIN Cryptographic Hashing & Plaintext Leakage Removal
  // -------------------------------------------------------------------------
  assertEqual(isValidPinFormat('1234'), true, '4 digits should be valid PIN');
  assertEqual(isValidPinFormat('123'), false, '3 digits should be rejected');
  assertEqual(isValidPinFormat('abcd'), false, 'non-numeric PIN should be rejected');

  assert(
    await verifyPinHashAsync('1234', DEMO_PIN_HASHES['1234']),
    'DEMO_PIN_HASHES["1234"] must verify against "1234"'
  );
  assert(
    !(await verifyPinHashAsync('9999', DEMO_PIN_HASHES['1234'])),
    'DEMO_PIN_HASHES["1234"] must reject wrong PIN'
  );

  assertEqual(
    hasConfiguredAdmin(
      [
        {
          role: 'admin',
          isActive: true,
          hasPin: true,
          pinHash: DEMO_PIN_HASHES['1234'],
        },
      ],
      { allowDemoFixturePins: false }
    ),
    false,
    'hasConfiguredAdmin must reject static DEMO_PIN_HASHES fixtures for real tenants'
  );
  assertEqual(
    hasConfiguredAdmin(
      [
        {
          role: 'admin',
          isActive: true,
          hasPin: true,
          pinHash: DEMO_PIN_HASHES['1234'],
        },
      ],
      { allowDemoFixturePins: true }
    ),
    true,
    'hasConfiguredAdmin may accept DEMO_PIN_HASHES only for explicit demo workspace'
  );

  const customHash = await hashPinAsync('4829');
  assert(isStoredPinHash(customHash), 'hashPinAsync must produce a valid PBKDF2 hash');
  assert(!customHash.includes('4829'), 'PIN hash must never contain plaintext PIN');
  assert(await verifyPinHashAsync('4829', customHash), 'custom PIN hash must verify');
  assert(!(await verifyPinHashAsync('4820', customHash)), 'custom PIN hash must reject mismatch');

  const stripped = stripPlaintextPin({
    id: 'emp-1',
    name: 'Cashier',
    pinCode: '1111',
    pin_code: '1111',
    pinHash: customHash,
  });
  assert(!('pinCode' in stripped), 'stripPlaintextPin must remove pinCode');
  assert(!('pin_code' in stripped), 'stripPlaintextPin must remove pin_code');
  assertEqual(stripped.pinHash, customHash, 'stripPlaintextPin must preserve pinHash');

  const initialEmployees = createInitialEmployees();
  assert(initialEmployees.length >= 3, 'createInitialEmployees should seed admin/manager/cashier');
  for (const emp of initialEmployees) {
    assert(isStoredPinHash(emp.pinHash), `Employee ${emp.id} must use hashed pinHash`);
    assert(
      !('pinCode' in (emp as unknown as Record<string, unknown>)),
      `Employee ${emp.id} must not store plaintext pinCode`
    );
  }

  const staffViewSource = readRepoFile('src/components/StaffView.tsx');
  const staffModalSource = readRepoFile('src/components/StaffPinModal.tsx');
  assert(
    !staffViewSource.includes('showPins') && !staffViewSource.includes('Show PINs'),
    'StaffView.tsx must not have Show PINs plaintext reveal toggle'
  );
  assert(
    !staffModalSource.includes('emp.pinCode') && !staffModalSource.includes('employee.pinCode'),
    'StaffPinModal.tsx must not inspect or render plaintext employee PINs'
  );

  // -------------------------------------------------------------------------
  // 3. RBAC Matrix & Database AS RESTRICTIVE Enforcement
  // -------------------------------------------------------------------------
  assertEqual(canAccessTab('admin', 'staff'), true, 'admin must access staff tab');
  assertEqual(canAccessTab('admin', 'saas_admin', true), true, 'super admin must access saas_admin');
  assertEqual(canAccessTab('admin', 'saas_admin', false), false, 'regular admin must not access saas_admin');
  assertEqual(canAccessTab('manager', 'inventory'), true, 'manager must access inventory');
  assertEqual(canAccessTab('manager', 'staff'), false, 'manager must not access staff');
  assertEqual(canAccessTab('cashier', 'pos'), true, 'cashier must access pos');
  assertEqual(canAccessTab('cashier', 'transactions'), true, 'cashier must access transactions');
  assertEqual(canAccessTab('cashier', 'customers'), true, 'cashier must access customers');
  assertEqual(canAccessTab('cashier', 'dashboard'), false, 'cashier must not access dashboard');
  assertEqual(canAccessTab('cashier', 'inventory'), false, 'cashier must not access inventory');
  assertEqual(canAccessTab('cashier', 'settings'), false, 'cashier must not access settings');

  assertEqual(hasRolePermission('cashier', 'pos.checkout'), true, 'cashier can checkout');
  assertEqual(hasRolePermission('cashier', 'orders.return'), true, 'cashier can process returns');
  assertEqual(hasRolePermission('cashier', 'inventory.write'), false, 'cashier cannot modify inventory catalog');
  assertEqual(hasRolePermission('cashier', 'purchases.write'), false, 'cashier cannot record purchases');
  assertEqual(hasRolePermission('cashier', 'expenses.write'), false, 'cashier cannot record expenses');
  assertEqual(hasRolePermission('cashier', 'staff.manage'), false, 'cashier cannot manage staff');
  assertEqual(hasRolePermission('cashier', 'settings.write'), false, 'cashier cannot modify store settings');
  assertEqual(hasRolePermission('cashier', 'customers.delete'), false, 'cashier cannot delete customers');
  assertEqual(hasRolePermission('cashier', 'workspace.reset'), false, 'cashier cannot reset workspace');
  assertEqual(hasRolePermission('manager', 'inventory.write'), true, 'manager can edit inventory');
  assertEqual(hasRolePermission('manager', 'staff.manage'), false, 'manager cannot manage staff');
  assertEqual(hasRolePermission('admin', 'staff.manage'), true, 'admin can manage staff');

  for (const restrictedTable of [
    'public.products',
    'public.vendors',
    'public.purchases',
    'public.purchase_items',
    'public.inventory_adjustments',
    'public.expenses',
    'public.employees',
    'public.store_settings',
    'public.customers',
    'public.orders',
  ]) {
    assert(
      migration20261123.includes(`on ${restrictedTable} as restrictive`),
      `20261123 migration must enforce AS RESTRICTIVE RLS policy on ${restrictedTable}`
    );
  }

  // -------------------------------------------------------------------------
  // 4. Express API Fail-Closed Smoke Verification
  // -------------------------------------------------------------------------
  const app = createPosExpressApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Failed to bind ephemeral Express test port');
    }
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const health = await requestJson(baseUrl, 'GET', '/api/health');
    assertEqual(health.status, 200, '/api/health should respond with 200');
    assertEqual(health.json.ok, true, '/api/health ok flag should be true');

    const unauthAdminMe = await requestJson(baseUrl, 'GET', '/api/admin/me');
    assertEqual(unauthAdminMe.status, 401, 'unauthenticated /api/admin/me must return 401');
    assertEqual(unauthAdminMe.json.isSuperAdmin, false, 'unauthenticated /api/admin/me must return isSuperAdmin=false');

    const unauthAdminSubs = await requestJson(baseUrl, 'GET', '/api/admin/subscriptions');
    assertEqual(unauthAdminSubs.status, 401, 'unauthenticated /api/admin/subscriptions must return 401');

    const unauthAdminAudit = await requestJson(baseUrl, 'GET', '/api/admin/audit-logs');
    assertEqual(unauthAdminAudit.status, 401, 'unauthenticated /api/admin/audit-logs must return 401');

    const unauthAdminUpdate = await requestJson(baseUrl, 'POST', '/api/admin/subscriptions/test-user', {
      status: 'suspended',
    });
    assertEqual(unauthAdminUpdate.status, 401, 'unauthenticated /api/admin/subscriptions/:userId must return 401');

    const unauthStaffPin = await requestJson(baseUrl, 'POST', '/api/staff/verify-pin', { pin: '1234' });
    assertEqual(unauthStaffPin.status, 401, 'unauthenticated /api/staff/verify-pin must return 401');

    const unauthSaveEmp = await requestJson(baseUrl, 'POST', '/api/staff/save-employee', {
      id: 'emp-x',
      name: 'Test',
      role: 'admin',
      pin: '1234',
    });
    assertEqual(unauthSaveEmp.status, 401, 'unauthenticated /api/staff/save-employee must return 401');

    const unauthRbac = await requestJson(baseUrl, 'POST', '/api/rbac/authorize', {
      action: 'inventory.write',
    });
    assertEqual(unauthRbac.status, 401, 'unauthenticated /api/rbac/authorize must return 401');
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }

  // -------------------------------------------------------------------------
  // 5. Intelligent Product-Specific Unit Management & Free Decimal Quantities
  // -------------------------------------------------------------------------
  const expectedUnits = ['kg', 'g', 'litre', 'ml', 'metre', 'cm', 'piece', 'packet', 'box', 'bottle'];
  assertEqual(SELLING_UNITS.length, expectedUnits.length, 'SELLING_UNITS must have 10 units');
  for (const unit of expectedUnits) {
    assert(isValidSellingUnit(unit), `Unit "${unit}" must be supported`);
    assertEqual(normalizeSellingUnit(unit.toUpperCase()), unit, `normalizeSellingUnit must normalize "${unit}"`);
  }

  for (const prod of INITIAL_PRODUCTS) {
    assert(isValidSellingUnit(prod.sellingUnit), `Initial product ${prod.sku} must have valid sellingUnit`);
  }

  // Explicit selection required (no name-based auto-guessing, starts blank on add)
  const inventoryViewSource = readRepoFile('src/components/InventoryView.tsx');
  assert(
    inventoryViewSource.includes("sellingUnit: '',"),
    'InventoryView EMPTY_FORM must start sellingUnit empty so shopkeeper selects unit explicitly'
  );
  assert(
    inventoryViewSource.includes('id="prod-selling-unit"') &&
      inventoryViewSource.includes('required') &&
      inventoryViewSource.includes('t.sellingUnitRequiredError'),
    'InventoryView must render a required sellingUnit select dropdown with validation error'
  );
  assert(
    !/guessUnit|inferUnit|autoSelectUnit/i.test(inventoryViewSource),
    'InventoryView must not auto-guess sellingUnit from product names'
  );

  // Free-entry custom numeric/decimal quantity input on POS billing (never preset-only buttons)
  const posBillingSource = readRepoFile('src/components/PosBillingView.tsx');
  assert(
    posBillingSource.includes('type="number"') &&
      posBillingSource.includes('step="any"') &&
      posBillingSource.includes('onSetQuantity'),
    'PosBillingView must provide a free-entry numeric/decimal input (step="any") wired to onSetQuantity'
  );

  // Decimal quantity arithmetic checks (0.25, 0.35, 1.5, 3.75)
  assertEqual(parsePositiveQuantity('0.25'), 0.25, 'parsePositiveQuantity("0.25")');
  assertEqual(parsePositiveQuantity('0.35'), 0.35, 'parsePositiveQuantity("0.35")');
  assertEqual(parsePositiveQuantity('1.50'), 1.5, 'parsePositiveQuantity("1.50")');
  assertEqual(parsePositiveQuantity('3.75'), 3.75, 'parsePositiveQuantity("3.75")');
  assertEqual(parsePositiveQuantity('0'), null, 'parsePositiveQuantity("0") must reject non-positive');
  assertEqual(parsePositiveQuantity('-1.5'), null, 'parsePositiveQuantity("-1.5") must reject negative');

  // Sale totals, stock deduction, purchase restock, partial return math
  const sugarPricePerKg = 180;
  const sugarQtySold = roundQuantity(0.35);
  const saleLineTotal = roundCurrency(sugarPricePerKg * sugarQtySold);
  assertEqual(saleLineTotal, 63, '0.35 kg at Rs. 180/kg must equal Rs. 63');

  const openingStock = 10;
  const afterSaleStock = roundQuantity(openingStock - sugarQtySold);
  assertEqual(afterSaleStock, 9.65, '10 kg - 0.35 kg must equal 9.65 kg');

  const returnedQty = roundQuantity(0.25);
  const afterPartialReturnStock = roundQuantity(afterSaleStock + returnedQty);
  assertEqual(afterPartialReturnStock, 9.9, '9.65 kg + 0.25 kg partial return must equal 9.9 kg');

  const purchaseRestock = roundQuantity(3.75);
  const afterRestock = roundQuantity(afterPartialReturnStock + purchaseRestock);
  assertEqual(afterRestock, 13.65, '9.9 kg + 3.75 kg restock must equal 13.65 kg');

  const oilQty = roundQuantity(1.5);
  assertEqual(formatQuantity(oilQty), '1.5', 'formatQuantity(1.5) should format cleanly');
  assertEqual(formatQuantityWithUnit(1.5, 'litre', 'en'), '1.5 litre', 'EN litre formatting');
  assertEqual(getUnitLabel('kg', 'ur'), 'کلو', 'Urdu kg label');

  console.log('ALL_SECURITY_RBAC_AND_UNIT_TESTS_PASSED');
}

void runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
