// Unit & persistence regression tests for vendor/purchase UUID alignment,
// foreign-key integrity, live-schema row mapping, and demo reset persistence.
// Run with: npx tsx tests/schemaAndVendorPersistence.test.ts

import {
  deterministicDemoUuid,
  generateUuid,
  isValidUuid,
} from '../src/lib/idUtils';
import {
  buildStarterWorkspace,
  fetchWorkspaceData,
  insertPurchaseRecord,
  mapAdjustmentFromRow,
  mapPurchaseFromRow,
  mapPurchaseItemFromRow,
  resetUserDemoWorkspace,
  upsertExpenseRecord,
  upsertVendorRecord,
} from '../src/lib/posRepository';
import type { Product, PurchaseRecord, Vendor } from '../src/types';

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

function installMemoryStorage(): void {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
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
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true,
  });
}

async function runTests(): Promise<void> {
  installMemoryStorage();

  // 1. UUID generation & deterministic per-user demo UUID tests
  const u1 = generateUuid();
  const u2 = generateUuid();
  assert(isValidUuid(u1), 'generateUuid must produce a valid UUID');
  assert(isValidUuid(u2), 'second generateUuid must produce a valid UUID');
  assert(u1 !== u2, 'generateUuid calls must be unique');

  const userA = '545272ea-f356-4263-83ca-542f236830b8';
  const userB = '89ab12cd-1111-4222-8333-0123456789ab';

  const detA1 = deterministicDemoUuid(userA, 'vend-1');
  const detA1Again = deterministicDemoUuid(userA, 'vend-1');
  const detA2 = deterministicDemoUuid(userA, 'vend-2');
  const detB1 = deterministicDemoUuid(userB, 'vend-1');

  assert(isValidUuid(detA1), 'deterministicDemoUuid must produce valid UUID');
  assertEqual(
    detA1,
    detA1Again,
    'deterministicDemoUuid must be deterministic for same user and key'
  );
  assert(detA1 !== detA2, 'different keys must yield distinct UUIDs');
  assert(detA1 !== detB1, 'different users must yield distinct demo UUIDs');

  // 2. Demo workspace FK & UUID consistency
  const demoWs = buildStarterWorkspace(userA, true, 'Audit Store');
  assert(demoWs.vendors.length >= 3, 'demo workspace must include vendors');
  assert(demoWs.purchases.length >= 2, 'demo workspace must include purchases');
  assert(demoWs.expenses.length >= 3, 'demo workspace must include expenses');
  assert(demoWs.customers.length >= 3, 'demo workspace must include customers');

  const vendorIds = new Set(demoWs.vendors.map((v) => v.id));
  const productIds = new Set(demoWs.products.map((p) => p.id));
  const customerIds = new Set(demoWs.customers.map((c) => c.id));

  for (const v of demoWs.vendors) {
    assert(isValidUuid(v.id), `demo vendor id ${v.id} must be valid UUID`);
  }
  for (const exp of demoWs.expenses) {
    assert(isValidUuid(exp.id), `demo expense id ${exp.id} must be valid UUID`);
  }
  for (const cust of demoWs.customers) {
    assert(isValidUuid(cust.id), `demo customer id ${cust.id} must be valid UUID`);
  }
  for (const adj of demoWs.inventoryAdjustments) {
    assert(isValidUuid(adj.id), `demo adjustment id ${adj.id} must be valid UUID`);
    assert(
      productIds.has(adj.productId),
      `adjustment productId ${adj.productId} must match a demo product`
    );
  }
  for (const pur of demoWs.purchases) {
    assert(isValidUuid(pur.id), `demo purchase id ${pur.id} must be valid UUID`);
    assert(
      vendorIds.has(pur.vendorId),
      `purchase vendorId ${pur.vendorId} must match an existing vendor`
    );
    for (const pi of pur.items) {
      assert(isValidUuid(pi.id), `demo purchase_item id ${pi.id} must be valid UUID`);
      assertEqual(
        pi.purchaseId,
        pur.id,
        'purchase_item.purchaseId must match parent purchase.id'
      );
      assert(
        productIds.has(pi.productId),
        `purchase_item.productId ${pi.productId} must match an existing product`
      );
    }
  }
  for (const ord of demoWs.orders) {
    if (ord.customerId) {
      assert(
        customerIds.has(ord.customerId),
        `order.customerId ${ord.customerId} must match an existing customer`
      );
    }
  }

  // 3. Live-schema vs extended-schema row mappers
  const prodMap = new Map<string, Product>(
    demoWs.products.map((p) => [p.id, p])
  );
  const vendMap = new Map<string, Vendor>(
    demoWs.vendors.map((v) => [v.id, v])
  );
  const sampleProduct = demoWs.products[0];
  const sampleVendor = demoWs.vendors[0];

  // Live core purchase_items row uses `cost_price` and omits `product_name`, `sku`, `line_total`
  const mappedLivePi = mapPurchaseItemFromRow(
    {
      id: generateUuid(),
      purchase_id: 'pur-live-1',
      product_id: sampleProduct.id,
      quantity: 4,
      cost_price: 250,
    },
    prodMap
  );
  assertEqual(
    mappedLivePi.productName,
    sampleProduct.nameEn,
    'live purchase_item should resolve productName from products lookup'
  );
  assertEqual(
    mappedLivePi.sku,
    sampleProduct.sku,
    'live purchase_item should resolve sku from products lookup'
  );
  assertEqual(
    mappedLivePi.unitCost,
    250,
    'live purchase_item should read cost_price into unitCost'
  );
  assertEqual(
    mappedLivePi.lineTotal,
    1000,
    'live purchase_item should compute lineTotal when missing'
  );

  // Live core purchases row uses `notes` and omits `vendor_name` & `balance_due`
  const purMap = new Map([[mappedLivePi.purchaseId, [mappedLivePi]]]);
  const mappedLivePur = mapPurchaseFromRow(
    {
      id: mappedLivePi.purchaseId,
      vendor_id: sampleVendor.id,
      invoice_number: 'PO-LIVE-10',
      total_amount: 1000,
      paid_amount: 400,
      notes: 'Live core note',
      created_at: '2026-11-22T08:00:00.000Z',
    },
    purMap,
    vendMap
  );
  assertEqual(
    mappedLivePur.vendorName,
    `${sampleVendor.name} (${sampleVendor.company})`,
    'live purchase should resolve vendorName from vendors lookup'
  );
  assertEqual(
    mappedLivePur.balanceDue,
    600,
    'live purchase should compute balanceDue when missing'
  );
  assertEqual(
    mappedLivePur.note,
    'Live core note',
    'live purchase should read notes fallback into note'
  );

  // Backward compatibility: legacy non-UUID string IDs still map cleanly
  const legacyAdj = mapAdjustmentFromRow(
    {
      id: 'legacy-adj-1',
      product_id: sampleProduct.id,
      adjustment_type: 'Damaged',
      quantity_change: -2,
      reason: 'Damaged carton',
      created_at: '2026-11-22T08:00:00.000Z',
    },
    prodMap
  );
  assertEqual(legacyAdj.id, 'legacy-adj-1', 'legacy string ID must remain intact');
  assertEqual(
    legacyAdj.productName,
    sampleProduct.nameEn,
    'adjustment mapper should resolve productName from products lookup'
  );

  // 4. Local workspace vendor creation -> purchase creation -> expense -> reload + demo reset
  const newVendor: Vendor = {
    id: generateUuid(),
    name: 'Bilal Wholesale',
    company: 'Bilal Foods',
    phone: '0300-1112233',
    address: 'Akbari Mandi',
    balance: 1000,
    createdAt: new Date().toISOString(),
  };
  await upsertVendorRecord(userA, newVendor);

  const newPurchase: PurchaseRecord = {
    id: generateUuid(),
    vendorId: newVendor.id,
    vendorName: `${newVendor.name} (${newVendor.company})`,
    invoiceNumber: 'PO-TEST-900',
    totalAmount: 2000,
    paidAmount: 500,
    balanceDue: 1500,
    note: 'Unit test stock delivery',
    items: [
      {
        id: generateUuid(),
        purchaseId: '',
        productId: sampleProduct.id,
        productName: sampleProduct.nameEn,
        sku: sampleProduct.sku,
        quantity: 5,
        unitCost: 400,
        lineTotal: 2000,
      },
    ],
    createdAt: new Date().toISOString(),
  };
  newPurchase.items[0].purchaseId = newPurchase.id;

  const updatedProducts = demoWs.products.map((p) =>
    p.id === sampleProduct.id ? { ...p, stock: p.stock + 5, cost: 400 } : p
  );
  const updatedVendor: Vendor = {
    ...newVendor,
    balance: newVendor.balance + newPurchase.balanceDue,
  };
  await insertPurchaseRecord(userA, newPurchase, updatedProducts, updatedVendor);

  await upsertExpenseRecord(userA, {
    id: generateUuid(),
    title: 'Delivery Van Fuel',
    category: 'Supplies',
    amount: 1200,
    notes: 'Test expense',
    expenseDate: '2026-11-22',
    createdAt: new Date().toISOString(),
  });

  const reloadedAfterCreate = await fetchWorkspaceData(userA, 'Audit Store');
  assert(
    reloadedAfterCreate.vendors.some(
      (v) => v.id === newVendor.id && v.balance === 2500
    ),
    'vendor and updated balance must persist across workspace reload'
  );
  assert(
    reloadedAfterCreate.purchases.some(
      (p) =>
        p.id === newPurchase.id &&
        p.vendorId === newVendor.id &&
        p.items.length === 1
    ),
    'purchase and purchase items must persist and link to vendor across reload'
  );
  assert(
    reloadedAfterCreate.expenses.some((e) => e.title === 'Delivery Van Fuel'),
    'expense must persist across reload'
  );

  // Reset Demo Data should restore full valid-UUID demo workspace
  const resetResult = await resetUserDemoWorkspace(userA, 'Audit Store');
  assertEqual(
    resetResult.cloudSyncError ?? null,
    null,
    'resetUserDemoWorkspace must complete with no cloudSyncError in local mode'
  );
  const reloadedAfterReset = await fetchWorkspaceData(userA, 'Audit Store');
  assertEqual(
    reloadedAfterReset.vendors.length,
    demoWs.vendors.length,
    'demo vendors must persist after reset + reload'
  );
  assertEqual(
    reloadedAfterReset.purchases.length,
    demoWs.purchases.length,
    'demo purchases must persist after reset + reload'
  );
  assertEqual(
    reloadedAfterReset.expenses.length,
    demoWs.expenses.length,
    'demo expenses must persist after reset + reload'
  );

  console.log('ALL_SCHEMA_AND_VENDOR_PERSISTENCE_TESTS_PASSED');
}

void runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
