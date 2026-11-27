// Omnichannel Order Management & Public Storefront Verification Tests
// Run with: npx tsx tests/omnichannelOrders.test.ts

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPosExpressApp } from '../serverApp';
import { OmnichannelMemoryStore, registerOmnichannelRoutes } from '../serverOmnichannelOrders';
import { isValidUuid } from '../src/lib/idUtils';
import {
  applyOmnichannelStockReservation,
  applyOmnichannelStockRestoration,
  computeOmnichannelAnalytics,
  transitionOmnichannelOrderStatus,
} from '../src/lib/omnichannelOrders';
import { createDefaultStoreSettings } from '../src/data/initialData';
import type { EmployeeRole, OmnichannelOrder, Product } from '../src/types';
import express from 'express';

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

async function requestJson(
  baseUrl: string,
  method: string,
  urlPath: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const rawBody = body !== undefined ? JSON.stringify(body) : undefined;
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    body: rawBody,
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // non-json response (e.g. webhook challenge)
  }
  return { status: res.status, json, text };
}

function makeProductsStoreA(): Product[] {
  return [
    {
      id: 'prod-sugar',
      sku: 'PAN-SUGAR',
      barcode: '8961001001',
      nameEn: 'Refined Cane Sugar',
      nameUr: 'چینی',
      category: 'pantry',
      price: 160,
      cost: 132,
      taxRate: 0,
      sellingUnit: 'kg',
      stock: 10,
      branchStock: { 'branch-a-main': 5, 'branch-a-2': 5 },
      image: '',
    },
    {
      id: 'prod-milk',
      sku: 'BEV-MILK',
      barcode: '8961001002',
      nameEn: 'Fresh Dairy Milk',
      nameUr: 'تازہ دودھ',
      category: 'beverages',
      price: 220,
      cost: 185,
      taxRate: 5,
      sellingUnit: 'litre',
      stock: 4,
      branchStock: { 'branch-a-main': 4 },
      image: '',
    },
    {
      id: 'prod-zero',
      sku: 'PAN-OUT',
      barcode: '8961001003',
      nameEn: 'Out Of Stock Spice',
      nameUr: 'مصالحہ',
      category: 'pantry',
      price: 100,
      cost: 70,
      taxRate: 0,
      sellingUnit: 'piece',
      stock: 0,
      branchStock: { 'branch-a-main': 0 },
      image: '',
    },
  ];
}

function makeProductsStoreB(): Product[] {
  return [
    {
      id: 'prod-b-tea',
      sku: 'B-TEA-1',
      barcode: '8962002001',
      nameEn: 'Store B Premium Tea',
      nameUr: 'چائے',
      category: 'beverages',
      price: 950,
      cost: 700,
      taxRate: 0,
      sellingUnit: 'packet',
      stock: 20,
      branchStock: { 'branch-b-main': 20 },
      image: '',
    },
  ];
}

async function runTests(): Promise<void> {
  const store = new OmnichannelMemoryStore();

  store.registerTenant({
    userId: 'tenant-a',
    subscriptionStatus: 'active',
    settings: {
      ...createDefaultStoreSettings('Alpha Mart'),
      storefrontSlug: 'alpha-mart',
      storefrontEnabled: true,
      storefrontDescription: 'Fresh groceries delivered across Lahore',
      codEnabled: true,
      whatsappPhoneNumberId: 'wa-phone-id-alpha',
    },
    branches: [
      {
        id: 'branch-a-main',
        name: 'Main Branch',
        code: 'MAIN',
        address: 'Gulberg III, Lahore',
        phone: '03001112222',
        isMain: true,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ],
    products: makeProductsStoreA(),
    customers: [],
    orders: [],
    adjustments: [],
    auditLogs: [],
  });

  store.registerTenant({
    userId: 'tenant-b',
    subscriptionStatus: 'active',
    settings: {
      ...createDefaultStoreSettings('Beta Bakers'),
      storefrontSlug: 'beta-bakers',
      storefrontEnabled: true,
      codEnabled: true,
      whatsappPhoneNumberId: 'wa-phone-id-beta',
    },
    branches: [
      {
        id: 'branch-b-main',
        name: 'Beta Main',
        code: 'BETA',
        address: 'Clifton, Karachi',
        phone: '03219998888',
        isMain: true,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ],
    products: makeProductsStoreB(),
    customers: [],
    orders: [],
    adjustments: [],
    auditLogs: [],
  });

  const waVerifyToken = 'verify_secret_123';
  const waAppSecret = 'meta_app_secret_xyz';
  const sentNotifications: Array<{ phone: string; text: string }> = [];

  const app = createPosExpressApp({
    omnichannelStoreOverride: store,
    whatsappEnvOverride: {
      verifyToken: waVerifyToken,
      appSecret: waAppSecret,
      accessToken: '',
      phoneNumberId: '',
    },
    whatsappSendOverride: async (p) => {
      sentNotifications.push(p);
      return { delivered: false, error: 'Manual fallback test' };
    },
    authenticateOverride: async (req) => {
      const userId = req.header('x-test-user');
      if (!userId) return null;
      return {
        id: userId,
        email: `${userId}@example.com`,
        jwt: 'test-jwt',
        appMetaRole: null,
        emailConfirmed: true,
      };
    },
    tenantAccessOverride: async (user) => {
      const t = store.tenants.get(user.id);
      if (!t) return { allowed: false, status: 'blocked' };
      if (t.subscriptionStatus === 'suspended' || t.subscriptionStatus === 'blocked') {
        return { allowed: false, status: t.subscriptionStatus };
      }
      return { allowed: true, status: 'active' };
    },
    staffRoleOverride: async (req) => {
      const role = (req.header('x-test-role') || 'admin') as EmployeeRole;
      return { role, employeeId: `emp-${role}` };
    },
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // -----------------------------------------------------------------------
    // 1. Public Storefront Data Exposure & Tenant Isolation
    // -----------------------------------------------------------------------
    const sfRes = await requestJson(baseUrl, 'GET', '/api/storefront/alpha-mart');
    assertEqual(sfRes.status, 200, 'Public storefront should load');
    const sfData = sfRes.json.storefront as Record<string, unknown>;
    const sfProducts = sfData.products as Array<Record<string, unknown>>;
    assertEqual(sfProducts.length, 2, 'Out-of-stock item must be excluded from public storefront');
    assert(
      !('cost' in sfProducts[0]),
      'Public storefront MUST NOT expose cost price'
    );
    assert(
      !('userId' in sfData) && !('orders' in sfData) && !('customers' in sfData),
      'Public storefront MUST NOT expose tenant ID, orders, or customers'
    );
    assert(
      sfProducts.every((p) => p.id !== 'prod-b-tea'),
      'Storefront A must never expose Store B products'
    );

    // -----------------------------------------------------------------------
    // 2. Website Order Creation: Authoritative Pricing, Idempotency & No Early Deduction
    // -----------------------------------------------------------------------
    const webOrderReq = {
      customerName: 'Ayesha Tariq',
      customerPhone: '03001234567',
      deliveryAddress: 'House 12, Block C, Gulberg',
      paymentMethod: 'cod',
      idempotencyKey: 'web-idem-001',
      // Client maliciously tries to pass low price & status 'delivered', server MUST ignore
      unitPrice: 1,
      status: 'delivered',
      items: [
        { productId: 'prod-sugar', quantity: 0.35 },
        { productId: 'prod-milk', quantity: 1.5 },
      ],
    };

    const webRes = await requestJson(
      baseUrl,
      'POST',
      '/api/storefront/alpha-mart/orders',
      webOrderReq
    );
    assertEqual(webRes.status, 201, 'Website order should be created');
    const createdWeb = webRes.json.order as Record<string, unknown>;
    assertEqual(createdWeb.status, 'new', 'Website order must always start in new status');
    // 0.35 * 160 = 56; 1.5 * 220 = 330 (+ 5% tax = 16.5) -> total = 402.5
    assertEqual(createdWeb.total, 402.5, 'Server must compute authoritative catalog total');

    const tenantA = store.tenants.get('tenant-a')!;
    const sugarAfterWebCreate = tenantA.products.find((p) => p.id === 'prod-sugar')!;
    assertEqual(
      sugarAfterWebCreate.branchStock?.['branch-a-main'],
      5,
      'Creating a new order MUST NOT deduct stock yet'
    );

    // Duplicate idempotencyKey submission returns existing order without creating a second one
    const dupWebRes = await requestJson(
      baseUrl,
      'POST',
      '/api/storefront/alpha-mart/orders',
      webOrderReq
    );
    assertEqual(dupWebRes.status, 200, 'Duplicate idempotency submission must deduplicate cleanly');
    assertEqual(dupWebRes.json.deduplicated, true, 'Should mark deduplicated=true');
    assertEqual(tenantA.orders.length, 1, 'Should still have only 1 order');

    // Fake online card gateway claim must be blocked when gateway unconfigured
    const fakeOnlineRes = await requestJson(baseUrl, 'POST', '/api/storefront/alpha-mart/orders', {
      ...webOrderReq,
      idempotencyKey: 'web-idem-online-fail',
      paymentMethod: 'online',
    });
    assertEqual(fakeOnlineRes.status, 400, 'Unconfigured online payment gateway must be rejected');

    // -----------------------------------------------------------------------
    // 3. Stock Reservation ONLY on Accept + Fractional Math + Zero Double Deduction
    // -----------------------------------------------------------------------
    const webOrderId = String(createdWeb.id);

    // Invalid jump: new -> ready must fail
    const badJump = await requestJson(
      baseUrl,
      'PATCH',
      `/api/omnichannel/orders/${webOrderId}/status`,
      { status: 'ready' },
      { 'x-test-user': 'tenant-a', 'x-test-role': 'manager' }
    );
    assertEqual(badJump.status, 400, 'Invalid status jump new -> ready must be rejected');

    // Accept order -> deducts stock ONCE
    const acceptRes = await requestJson(
      baseUrl,
      'PATCH',
      `/api/omnichannel/orders/${webOrderId}/status`,
      { status: 'accepted' },
      { 'x-test-user': 'tenant-a', 'x-test-role': 'manager' }
    );
    assertEqual(acceptRes.status, 200, 'Accepting new order should succeed');
    assertEqual(acceptRes.json.didReserveStock, true, 'Stock reservation flag should be true');
    assertEqual(
      tenantA.products.find((p) => p.id === 'prod-sugar')!.branchStock?.['branch-a-main'],
      4.65,
      'Fractional branch stock 5 - 0.35 = 4.65 must be exact'
    );
    assertEqual(
      tenantA.products.find((p) => p.id === 'prod-milk')!.branchStock?.['branch-a-main'],
      2.5,
      'Fractional milk stock 4 - 1.5 = 2.5 must be exact'
    );

    // Move accepted -> preparing -> ready -> delivered: must NEVER deduct again
    for (const nextStatus of ['preparing', 'ready', 'delivered'] as const) {
      const stepRes = await requestJson(
        baseUrl,
        'PATCH',
        `/api/omnichannel/orders/${webOrderId}/status`,
        { status: nextStatus },
        { 'x-test-user': 'tenant-a', 'x-test-role': 'cashier' }
      );
      assertEqual(stepRes.status, 200, `Transition to ${nextStatus} should succeed`);
      assertEqual(stepRes.json.didReserveStock, false, `${nextStatus} must not re-deduct stock`);
    }
    assertEqual(
      tenantA.products.find((p) => p.id === 'prod-sugar')!.branchStock?.['branch-a-main'],
      4.65,
      'Stock must stay 4.65 after full delivery progression'
    );

    // Verify status history recorded actors & timestamps
    const deliveredOrder = tenantA.orders.find((o) => o.id === webOrderId)!;
    assertEqual(deliveredOrder.statusHistory.length, 5, 'Should have 5 status history entries');
    assert(
      deliveredOrder.statusHistory.some((h) => h.status === 'accepted' && h.actorRole === 'manager'),
      'History should record accepting manager role'
    );
    assert(
      deliveredOrder.notificationLog.some((n) => n.event === 'order_accepted') &&
        deliveredOrder.notificationLog.some((n) => n.event === 'order_ready') &&
        deliveredOrder.notificationLog.some((n) => n.event === 'order_delivered'),
      'Notifications must be logged for accepted, ready, and delivered'
    );

    // -----------------------------------------------------------------------
    // 4. Insufficient Stock Blocks Acceptance + Cancellation Restores Stock ONCE
    // -----------------------------------------------------------------------
    const phoneRes = await requestJson(
      baseUrl,
      'POST',
      '/api/omnichannel/orders',
      {
        channel: 'phone',
        customerName: 'Bilal Raza',
        customerPhone: '03334445556',
        deliveryAddress: 'Model Town, Lahore',
        branchId: 'branch-a-main',
        paymentMethod: 'cod',
        items: [{ productId: 'prod-milk', quantity: 2 }],
      },
      { 'x-test-user': 'tenant-a', 'x-test-role': 'cashier' }
    );
    assertEqual(phoneRes.status, 201, 'Phone order creation should succeed');
    const phoneOrder = phoneRes.json.order as OmnichannelOrder;
    assertEqual(tenantA.customers.length, 1, 'Phone order should auto-create new customer inline');

    // Another big order exceeding remaining milk stock (2.5 available, request 3)
    const bigPhoneRes = await requestJson(
      baseUrl,
      'POST',
      '/api/omnichannel/orders',
      {
        channel: 'phone',
        customerId: tenantA.customers[0].id,
        branchId: 'branch-a-main',
        paymentMethod: 'cash',
        items: [{ productId: 'prod-milk', quantity: 3 }],
      },
      { 'x-test-user': 'tenant-a', 'x-test-role': 'cashier' }
    );
    assertEqual(bigPhoneRes.status, 201, 'Creating new order above stock stays pending');
    const bigOrderId = (bigPhoneRes.json.order as OmnichannelOrder).id;

    const failAcceptBig = await requestJson(
      baseUrl,
      'PATCH',
      `/api/omnichannel/orders/${bigOrderId}/status`,
      { status: 'accepted' },
      { 'x-test-user': 'tenant-a', 'x-test-role': 'manager' }
    );
    assertEqual(
      failAcceptBig.status,
      409,
      'Insufficient stock MUST block transitioning order to accepted'
    );

    // Cashier cannot reject/cancel orders (requires orders.cancel -> manager/admin)
    const cashierCancel = await requestJson(
      baseUrl,
      'PATCH',
      `/api/omnichannel/orders/${bigOrderId}/status`,
      { status: 'rejected', reason: 'Out of stock' },
      { 'x-test-user': 'tenant-a', 'x-test-role': 'cashier' }
    );
    assertEqual(cashierCancel.status, 403, 'Cashier must not be allowed to reject/cancel orders');

    // Rejecting unaccepted 'new' order must NOT restore phantom stock
    const rejectNew = await requestJson(
      baseUrl,
      'PATCH',
      `/api/omnichannel/orders/${bigOrderId}/status`,
      { status: 'rejected', reason: 'Insufficient stock' },
      { 'x-test-user': 'tenant-a', 'x-test-role': 'manager' }
    );
    assertEqual(rejectNew.status, 200, 'Manager rejecting new order should succeed');
    assertEqual(rejectNew.json.didRestoreStock, false, 'Unaccepted order must NOT add stock back');
    assertEqual(
      tenantA.products.find((p) => p.id === 'prod-milk')!.branchStock?.['branch-a-main'],
      2.5,
      'Milk stock remains 2.5 after rejecting unaccepted order'
    );

    // Accept phoneOrder (2L milk: 2.5 -> 0.5), then cancel -> restores back to 2.5 ONCE
    const accPhone = await requestJson(
      baseUrl,
      'PATCH',
      `/api/omnichannel/orders/${phoneOrder.id}/status`,
      { status: 'accepted' },
      { 'x-test-user': 'tenant-a', 'x-test-role': 'manager' }
    );
    assertEqual(accPhone.status, 200, 'Accepting phone order should succeed');
    assertEqual(
      tenantA.products.find((p) => p.id === 'prod-milk')!.branchStock?.['branch-a-main'],
      0.5,
      'Milk stock should now be 0.5'
    );

    const cancelAcc = await requestJson(
      baseUrl,
      'PATCH',
      `/api/omnichannel/orders/${phoneOrder.id}/status`,
      { status: 'cancelled', reason: 'Customer cancelled on phone' },
      { 'x-test-user': 'tenant-a', 'x-test-role': 'admin' }
    );
    assertEqual(cancelAcc.status, 200, 'Cancelling accepted order should succeed');
    assertEqual(cancelAcc.json.didRestoreStock, true, 'Should restore reserved stock');
    assertEqual(
      tenantA.products.find((p) => p.id === 'prod-milk')!.branchStock?.['branch-a-main'],
      2.5,
      'Milk stock should be restored back to 2.5'
    );

    // Unit-level double restoration guard test
    const cancelledObj = tenantA.orders.find((o) => o.id === phoneOrder.id)!;
    const secondRestoreAttempt = transitionOmnichannelOrderStatus({
      order: cancelledObj,
      targetStatus: 'cancelled',
      actor: { id: 'emp-admin', name: 'Admin', role: 'admin' },
      products: tenantA.products,
    });
    assertEqual(
      secondRestoreAttempt.ok,
      false,
      'Cancelled order cannot be cancelled/restored a second time'
    );

    // -----------------------------------------------------------------------
    // 5. WhatsApp Cloud API Webhook Verification, Signature & Idempotency
    // -----------------------------------------------------------------------
    const badHub = await requestJson(
      baseUrl,
      'GET',
      `/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=999`
    );
    assertEqual(badHub.status, 403, 'Invalid hub verify token must return 403');

    const goodHub = await requestJson(
      baseUrl,
      'GET',
      `/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${waVerifyToken}&hub.challenge=CHALLENGE_OK`
    );
    assertEqual(goodHub.status, 200, 'Valid hub verify token must return 200');
    assertEqual(goodHub.text, 'CHALLENGE_OK', 'Hub challenge must echo exact token');

    const waPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'wa-phone-id-alpha' },
                contacts: [{ wa_id: '923009876543', profile: { name: 'Zainab WA' } }],
                messages: [
                  {
                    id: 'wamid.test.001',
                    from: '923009876543',
                    type: 'text',
                    text: { body: '2x PAN-SUGAR' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const waRaw = JSON.stringify(waPayload);
    const validSig =
      'sha256=' + crypto.createHmac('sha256', waAppSecret).update(waRaw).digest('hex');

    const invalidSigRes = await requestJson(
      baseUrl,
      'POST',
      '/api/webhooks/whatsapp',
      waPayload,
      { 'x-hub-signature-256': 'sha256=deadbeef' }
    );
    assertEqual(invalidSigRes.status, 401, 'Invalid HMAC signature must return 401');

    const validWaRes = await requestJson(
      baseUrl,
      'POST',
      '/api/webhooks/whatsapp',
      waPayload,
      { 'x-hub-signature-256': validSig }
    );
    assertEqual(validWaRes.status, 200, 'Valid WhatsApp webhook must succeed');
    assertEqual(
      (validWaRes.json.createdOrders as string[]).length,
      1,
      'Should create 1 WhatsApp order'
    );

    // Replay same webhook event -> must deduplicate without creating second order
    const replayWaRes = await requestJson(
      baseUrl,
      'POST',
      '/api/webhooks/whatsapp',
      waPayload,
      { 'x-hub-signature-256': validSig }
    );
    assertEqual(replayWaRes.status, 200, 'Replayed webhook returns 200');
    assertEqual(
      (replayWaRes.json.createdOrders as string[]).length,
      0,
      'Replayed webhook must NOT create duplicate order'
    );
    assertEqual(
      (replayWaRes.json.deduplicatedMessages as string[])[0],
      'wamid.test.001',
      'Replayed message ID must be reported as deduplicated'
    );

    // -----------------------------------------------------------------------
    // 6. Multi-Tenant Cross-Shop Isolation & Suspended Tenant Enforcement
    // -----------------------------------------------------------------------
    const tenantBOrders = await requestJson(
      baseUrl,
      'GET',
      '/api/omnichannel/orders',
      undefined,
      { 'x-test-user': 'tenant-b', 'x-test-role': 'admin' }
    );
    assertEqual(tenantBOrders.status, 200, 'Tenant B list orders succeeds');
    assertEqual(
      (tenantBOrders.json.orders as unknown[]).length,
      0,
      'Tenant B must never see Tenant A orders'
    );

    const crossTenantMutate = await requestJson(
      baseUrl,
      'PATCH',
      `/api/omnichannel/orders/${webOrderId}/payment`,
      { paymentStatus: 'paid', paidAmount: 402.5 },
      { 'x-test-user': 'tenant-b', 'x-test-role': 'admin' }
    );
    assertEqual(
      crossTenantMutate.status,
      404,
      'Tenant B must not be able to modify Tenant A orders'
    );

    // Payment update by Tenant A Manager
    const payRes = await requestJson(
      baseUrl,
      'PATCH',
      `/api/omnichannel/orders/${webOrderId}/payment`,
      { paymentMethod: 'cod', paymentStatus: 'paid', paidAmount: 402.5 },
      { 'x-test-user': 'tenant-a', 'x-test-role': 'manager' }
    );
    assertEqual(payRes.status, 200, 'Manager should update payment status');
    assertEqual((payRes.json.order as OmnichannelOrder).paymentStatus, 'paid', 'Payment updated to paid');

    // Suspended tenant blocked on storefront and staff APIs
    store.tenants.get('tenant-a')!.subscriptionStatus = 'suspended';
    const suspendedSf = await requestJson(baseUrl, 'GET', '/api/storefront/alpha-mart');
    assertEqual(suspendedSf.status, 403, 'Suspended tenant storefront must be blocked');
    const suspendedApi = await requestJson(
      baseUrl,
      'GET',
      '/api/omnichannel/orders',
      undefined,
      { 'x-test-user': 'tenant-a', 'x-test-role': 'admin' }
    );
    assertEqual(suspendedApi.status, 403, 'Suspended tenant staff API must be blocked');

    // -----------------------------------------------------------------------
    // 7. Omnichannel Analytics Calculation
    // -----------------------------------------------------------------------
    const analytics = computeOmnichannelAnalytics(tenantA.orders);
    assertEqual(analytics.byChannel.website.orders, 1, 'Analytics website count');
    assertEqual(analytics.byChannel.whatsapp.orders, 1, 'Analytics whatsapp count');
    assertEqual(analytics.byChannel.phone.orders, 2, 'Analytics phone count');
    assertEqual(analytics.deliveredCount, 1, 'Analytics delivered count');
    assertEqual(analytics.cancelledOrRejectedCount, 2, 'Analytics cancelled/rejected count');
    assert(sentNotifications.length >= 4, 'WhatsApp notifications should have been triggered');

    // Inline customer & omnichannel inventory adjustment IDs must be valid RFC-4122 UUIDs
    assert(
      isValidUuid(tenantA.customers[0]?.id),
      'Inline created customer ID must be a valid UUID for public.customers(id uuid)'
    );
    assert(
      tenantA.adjustments.length >= 3 && tenantA.adjustments.every((a) => isValidUuid(a.id)),
      'Omnichannel inventory adjustment IDs must be valid UUIDs for public.inventory_adjustments(id uuid)'
    );

    // Duplicate accept on already-reserved order must fail without second deduction
    const dupReserve = applyOmnichannelStockReservation(
      tenantA.orders.find((o) => o.id === webOrderId)!,
      tenantA.products,
      'Admin'
    );
    assertEqual(dupReserve.ok, false, 'Already-reserved order must block duplicate stock deduction');

    const dupRestore = applyOmnichannelStockRestoration(
      cancelledObj,
      tenantA.products,
      'Admin',
      'cancelled'
    );
    assertEqual(dupRestore.restored, false, 'Already-restored order must not restore stock again');

    // Cross-tenant status mutation blocked
    const crossTenantStatus = await requestJson(
      baseUrl,
      'PATCH',
      `/api/omnichannel/orders/${webOrderId}/status`,
      { status: 'accepted' },
      { 'x-test-user': 'tenant-b', 'x-test-role': 'admin' }
    );
    assertEqual(
      crossTenantStatus.status,
      404,
      'Tenant B must not be able to accept or mutate Tenant A orders'
    );

    // -----------------------------------------------------------------------
    // 8. Migration SQL Security, RBAC, Append-Only Audit & Schema Type Checks
    // -----------------------------------------------------------------------
    const migrationSql = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/20261126_omnichannel_orders.sql'),
      'utf8'
    );
    const migrationLower = migrationSql.toLowerCase();

    assert(
      migrationLower.includes('begin;') && migrationLower.includes('commit;'),
      'Migration must be wrapped in an explicit transaction'
    );
    assert(
      !migrationLower.includes('drop table') && !migrationLower.includes('truncate '),
      'Migration must remain additive without destructive table drops or truncates'
    );

    // RPC Caller / Tenant / RBAC verification (create, accept, transition, cancel/restock)
    assert(
      migrationLower.includes('v_caller_uid uuid := auth.uid()') &&
        migrationLower.includes("current_setting('role', true)") &&
        migrationLower.includes("'service_role'") &&
        migrationLower.includes('v_caller_uid <> p_user_id') &&
        migrationLower.includes("public.is_staff_role_in(array['admin', 'manager', 'cashier'])") &&
        migrationLower.includes("public.is_staff_role_in(array['admin', 'manager'])"),
      'SECURITY DEFINER RPCs must verify auth.uid(), enforce tenant match p_user_id unless service_role, and enforce RBAC'
    );
    assert(
      migrationLower.includes(
        'revoke all on function public.create_omnichannel_order(\n  uuid, text, text, text, text, text, text, text, numeric, text, text, numeric,\n  text, text, text, jsonb, text, text, text, jsonb, boolean, boolean, text, text, text\n) from public, anon;'
      ) &&
        migrationLower.includes(
          'grant execute on function public.create_omnichannel_order(\n  uuid, text, text, text, text, text, text, text, numeric, text, text, numeric,\n  text, text, text, jsonb, text, text, text, jsonb, boolean, boolean, text, text, text\n) to authenticated, service_role;'
        ) &&
        migrationLower.includes(
          'revoke all on function public.accept_omnichannel_order_with_stock(\n  uuid, text, text, text, text, jsonb, jsonb\n) from public, anon;'
        ) &&
        migrationLower.includes(
          'grant execute on function public.accept_omnichannel_order_with_stock(\n  uuid, text, text, text, text, jsonb, jsonb\n) to authenticated, service_role;'
        ) &&
        migrationLower.includes(
          'revoke all on function public.transition_omnichannel_order_status(\n  uuid, text, text, text, text, text, text, jsonb\n) from public, anon;'
        ) &&
        migrationLower.includes(
          'grant execute on function public.transition_omnichannel_order_status(\n  uuid, text, text, text, text, text, text, jsonb\n) to authenticated, service_role;'
        ) &&
        migrationLower.includes(
          'revoke all on function public.cancel_or_reject_omnichannel_order_with_restock(\n  uuid, text, text, text, text, text, text, jsonb\n) from public, anon;'
        ) &&
        migrationLower.includes(
          'grant execute on function public.cancel_or_reject_omnichannel_order_with_restock(\n  uuid, text, text, text, text, text, text, jsonb\n) to authenticated, service_role;'
        ),
      'All omnichannel RPCs must revoke execution from PUBLIC and anon and grant only to authenticated, service_role'
    );

    // Append-only order_audit_logs verification (SELECT-only for authenticated, no DELETE even for service_role, retention-safe FKs)
    assert(
      migrationLower.includes('revoke all on table public.order_audit_logs from anon, public, authenticated, service_role;') &&
        migrationLower.includes('grant select on table public.order_audit_logs to authenticated;') &&
        migrationLower.includes('grant select, insert on table public.order_audit_logs to service_role;') &&
        !migrationLower.includes('grant insert on table public.order_audit_logs to authenticated') &&
        !migrationLower.includes('grant select, insert on table public.order_audit_logs to authenticated') &&
        !migrationLower.includes('grant update on table public.order_audit_logs') &&
        !migrationLower.includes('grant delete on table public.order_audit_logs') &&
        !migrationLower.includes('grant all privileges on table public.order_audit_logs to service_role'),
      'order_audit_logs must grant SELECT-only to authenticated and SELECT+INSERT-only to service_role'
    );
    assert(
      !migrationLower.includes('create policy order_audit_logs_tenant_all') &&
        !migrationLower.includes('create policy order_audit_logs_tenant_insert') &&
        !migrationLower.includes('create policy order_audit_logs_rbac_insert') &&
        migrationLower.includes('create policy order_audit_logs_tenant_select') &&
        migrationLower.includes('create policy order_audit_logs_rbac_select') &&
        migrationLower.includes('before update or delete on public.order_audit_logs') &&
        migrationLower.includes('order_audit_logs is strictly append-only; % operations are prohibited for all roles.') &&
        migrationLower.includes('guard_order_audit_logs_insert') &&
        migrationLower.includes('before insert on public.order_audit_logs'),
      'order_audit_logs must forbid client INSERTs, unconditionally block UPDATE/DELETE for all roles, and guard INSERT tenant alignment'
    );

    // Schema & FK alignment verification against schema.sql & 20261124_commercial_pos_suite.sql
    assert(
      migrationLower.includes('customer_id uuid') &&
        !migrationLower.includes('customer_id text references public.customers(id)') &&
        migrationLower.includes('omnichannel_orders_branch_id_fkey') &&
        migrationLower.includes('omnichannel_orders_customer_id_fkey'),
      'omnichannel_orders must enforce type-compatible branch_id and customer_id foreign keys'
    );
    assert(
      migrationLower.includes("where table_schema = 'public' and table_name = 'products' and column_name = 'id'") &&
        migrationLower.includes("where table_schema = 'public' and table_name = 'inventory_adjustments' and column_name = 'product_id'") &&
        migrationLower.includes("where table_schema = 'public' and table_name = 'inventory_adjustments' and column_name = 'branch_id'") &&
        migrationLower.includes("where table_schema = 'public' and table_name = 'branches' and column_name = 'id'") &&
        migrationLower.includes("where table_schema = 'public' and table_name = 'customers' and column_name = 'id'") &&
        migrationLower.includes("where table_schema = 'public' and table_name = 'inventory_adjustments' and column_name = 'id'") &&
        migrationLower.includes("to_regprocedure('public.is_staff_role_in(text[])') is null") &&
        migrationLower.includes("and table_name = 'omnichannel_orders'") &&
        migrationLower.includes("and table_name = 'order_audit_logs'") &&
        migrationLower.includes('where id::text = v_line.product_id and user_id = p_user_id'),
      'Migration must preflight-verify all prerequisite functions/tables/ID column types and use safe id::text product matching in RPCs'
    );
    assert(
      migrationLower.includes('add column if not exists updated_at timestamptz') &&
        migrationLower.includes('add column if not exists branch_id text') &&
        migrationLower.includes('add column if not exists actor_name text') &&
        migrationLower.includes("'sale stock out'") &&
        migrationLower.includes("'sale return in'") &&
        !migrationLower.includes("'adj-omni-' ||") &&
        migrationLower.includes('gen_random_uuid(),\n      p_user_id'),
      'Migration must align products.updated_at, inventory_adjustments columns/types (uuid id, branch_id, actor_name, adjustment_type check)'
    );

    // Strict tenant isolation without weakening
    assert(
      !migrationLower.includes('or public.is_super_admin()'),
      'Operational omnichannel tables must maintain strict auth.uid() = user_id tenant isolation'
    );

    // 1. Audit log & tenant retention preservation (ON DELETE RESTRICT on order_id and user_id)
    assert(
      migrationLower.includes('order_id text not null references public.omnichannel_orders(id) on delete restrict') &&
        migrationLower.includes('user_id uuid not null references auth.users(id) on delete restrict') &&
        !migrationLower.includes('order_id text not null references public.omnichannel_orders(id) on delete cascade') &&
        !migrationLower.includes('order_audit_logs (\n  id text primary key,\n  user_id uuid not null references auth.users(id) on delete cascade') &&
        migrationLower.includes('order_audit_logs_order_id_fkey') &&
        migrationLower.includes('order_audit_logs_user_id_fkey') &&
        migrationLower.includes('omnichannel_orders_user_id_fkey') &&
        migrationLower.includes('on delete restrict'),
      'order_audit_logs(order_id, user_id) and omnichannel_orders(user_id) must enforce ON DELETE RESTRICT to prevent audit erasure'
    );

    // 2 & 4. Direct authenticated INSERT & UPDATE anti-bypass protections (no direct INSERT, no status/payment/history updates)
    const authUpdateGrantMatch = migrationLower.match(/grant update \(([\s\S]*?)\) on table public\.omnichannel_orders to authenticated;/);
    assert(Boolean(authUpdateGrantMatch), 'omnichannel_orders must use column-scoped UPDATE grant for authenticated');
    const grantedUpdateCols = authUpdateGrantMatch?.[1] || '';
    assert(
      !grantedUpdateCols.includes('status') &&
        !grantedUpdateCols.includes('status_history') &&
        !grantedUpdateCols.includes('notification_log') &&
        !grantedUpdateCols.includes('cancellation_reason') &&
        !grantedUpdateCols.includes('payment_method') &&
        !grantedUpdateCols.includes('payment_status') &&
        !grantedUpdateCols.includes('paid_amount') &&
        !grantedUpdateCols.includes('stock_reserved') &&
        !grantedUpdateCols.includes('items') &&
        !grantedUpdateCols.includes('total'),
      'Authenticated column UPDATE grant on omnichannel_orders must exclude status, payment, cancellation_reason, status_history, notification_log, stock_reserved, items, and total'
    );
    assert(
      !migrationLower.includes('grant select, insert, update, delete on table public.omnichannel_orders to authenticated;') &&
        !migrationLower.includes('grant select, insert, delete on table public.omnichannel_orders to authenticated;') &&
        migrationLower.includes('grant select, delete on table public.omnichannel_orders to authenticated;') &&
        migrationLower.includes('create policy omnichannel_orders_rbac_insert\n  on public.omnichannel_orders\n  as restrictive\n  for insert\n  to authenticated\n  with check (false);') &&
        migrationLower.includes('guard_omnichannel_orders_update') &&
        migrationLower.includes('new.items is distinct from old.items') &&
        migrationLower.includes('new.total is distinct from old.total') &&
        migrationLower.includes('new.payment_method is distinct from old.payment_method') &&
        migrationLower.includes('new.payment_status is distinct from old.payment_status') &&
        migrationLower.includes('new.paid_amount is distinct from old.paid_amount') &&
        migrationLower.includes('new.stock_reserved is distinct from old.stock_reserved') &&
        migrationLower.includes('new.stock_reserved_at is distinct from old.stock_reserved_at') &&
        migrationLower.includes('new.stock_restored_at is distinct from old.stock_restored_at') &&
        migrationLower.includes('new.status_history is distinct from old.status_history') &&
        migrationLower.includes('new.notification_log is distinct from old.notification_log') &&
        migrationLower.includes('new.cancellation_reason is distinct from old.cancellation_reason') &&
        migrationLower.includes('if new.status is distinct from old.status then'),
      'Direct authenticated INSERT and protected/status UPDATE on omnichannel_orders must be blocked'
    );

    // 3. Protected order creation (INSERT restricted to trusted RPC/server context with status='new' and zero stock flags)
    assert(
      migrationLower.includes('guard_omnichannel_orders_insert') &&
        migrationLower.includes('direct client insertion into omnichannel_orders is prohibited') &&
        migrationLower.includes("new.status <> 'new'") &&
        migrationLower.includes('coalesce(new.stock_reserved, false) <> false') &&
        migrationLower.includes('new.stock_reserved_at is not null') &&
        migrationLower.includes('new.stock_restored_at is not null') &&
        migrationLower.includes('create or replace function public.create_omnichannel_order(') &&
        migrationLower.includes('create or replace function public.transition_omnichannel_order_status('),
      'Order creation must route through create_omnichannel_order RPC and status changes through transition/stock RPCs with audit logging'
    );

    // 4b. Preserve existing inventory constraints without blindly dropping all CHECK constraints
    assert(
      !migrationLower.includes("pg_get_constraintdef(c.oid) ilike '%adjustment_type%'") &&
        migrationLower.includes('c.conkey = array[v_adj_attnum]') &&
        migrationLower.includes('aborting migration:'),
      'inventory_adjustments migration must inspect single-column adjustment_type constraints and abort cleanly on incompatible constraints or values'
    );

    // 5. Verified actor ID, name, and role in SECURITY DEFINER RPCs (never trust client p_actor_id/p_actor_name/p_actor_role)
    assert(
      !migrationLower.includes('lower(btrim(coalesce(p_actor_role') &&
        !migrationLower.includes("coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'staff')") &&
        !migrationLower.includes("coalesce(nullif(btrim(coalesce(p_actor_id, '')), ''), 'staff')") &&
        migrationLower.includes('from public.staff_sessions s') &&
        migrationLower.includes('join public.employees e') &&
        migrationLower.includes('v_effective_actor_id := nullif(btrim(coalesce(v_session.employee_id') &&
        migrationLower.includes('v_effective_actor_name := nullif(btrim(coalesce(v_session.employee_name') &&
        migrationLower.includes('v_sanitized_history_entry'),
      'SECURITY DEFINER stock RPCs must resolve verified actor ID, name, and role from staff_sessions/employees or auth.users without trusting client parameters'
    );

    // 6. Branch & global stock consistency on accept (no overselling, no negative/silently clamped stock),
    //    fail-safe reserved-stock restoration on cancel/reject (never silently skip missing/invalid products),
    //    NULL branch_id rejection when branch_stock map exists, and non-finite numeric stock rejection
    const createFnSlice = migrationLower.slice(
      migrationLower.indexOf('create or replace function public.create_omnichannel_order('),
      migrationLower.indexOf('create or replace function public.accept_omnichannel_order_with_stock(')
    );
    const acceptFnSlice = migrationLower.slice(
      migrationLower.indexOf('create or replace function public.accept_omnichannel_order_with_stock('),
      migrationLower.indexOf('create or replace function public.transition_omnichannel_order_status(')
    );
    const cancelFnSlice = migrationLower.slice(
      migrationLower.indexOf('create or replace function public.cancel_or_reject_omnichannel_order_with_restock(')
    );
    assert(
      !migrationLower.includes('v_available + 0.0001 < v_qty') &&
        !acceptFnSlice.includes('v_new_global := greatest(0::numeric') &&
        !acceptFnSlice.includes('v_new_branch_qty := greatest(0::numeric') &&
        acceptFnSlice.includes('v_available := least(v_branch_available, v_global_stock)') &&
        acceptFnSlice.includes('v_global_stock - v_other_branch_total') &&
        acceptFnSlice.includes('if v_new_global < 0 then') &&
        acceptFnSlice.includes('if v_new_branch_qty < 0 then') &&
        acceptFnSlice.includes('for update;'),
      'Order acceptance RPC must lock product rows, validate both branch and global stock without tolerance, and forbid negative or silently clamped deductions'
    );
    assert(
      !cancelFnSlice.includes("where nullif(btrim(coalesce(elem->>'productid', '')), '') is not null") &&
        !cancelFnSlice.includes('if v_qty <= 0 then\n        continue;') &&
        cancelFnSlice.includes('first pass: lock and verify every referenced product exists') &&
        cancelFnSlice.includes("'code', 'product_not_found'") &&
        cancelFnSlice.includes("'code', 'invalid_order_item'") &&
        cancelFnSlice.includes("'code', 'invalid_stock_state'") &&
        cancelFnSlice.includes('disappeared during reserved stock restoration'),
      'Cancel/reject restoration RPC must lock and validate every item and product when stock_reserved is true and abort safely without partial restock or marking restored if any product is missing or invalid'
    );
    for (const [fnLabel, fnBody] of [
      ['create_omnichannel_order', createFnSlice],
      ['accept_omnichannel_order_with_stock', acceptFnSlice],
      ['cancel_or_reject_omnichannel_order_with_restock', cancelFnSlice],
    ] as const) {
      assert(
        fnBody.includes('if v_branch_key is null and v_has_branch_map then') &&
          fnBody.includes("'code', 'branch_required'") &&
          fnBody.includes("from jsonb_each(v_prod.branch_stock)") &&
          fnBody.includes("jsonb_typeof(kv.value) not in ('number', 'string')") &&
          fnBody.includes("^(nan|[+-]?inf(inity)?)$") &&
          fnBody.includes("(v_prod.stock::numeric)::text ~* '^(nan|[+-]?inf(inity)?)$'") &&
          fnBody.includes("((kv.value #>> '{}')::numeric)::text ~* '^(nan|[+-]?inf(inity)?)$'"),
        `${fnLabel} must reject NULL branch_id with non-empty branch_stock and reject non-finite (NaN/Infinity/-Infinity) or malformed numeric values in stock and branch_stock`
      );
    }
    assert(
      createFnSlice.includes("btrim(p_discount_amount::text) ~* '^(nan|[+-]?inf(inity)?)$'") &&
        createFnSlice.includes("btrim(p_paid_amount::text) ~* '^(nan|[+-]?inf(inity)?)$'") &&
        cancelFnSlice.includes('v_has_branch_map := false;\n      v_other_branch_total := 0;\n      v_has_negative_branch := false;'),
      'create_omnichannel_order must reject non-finite discount/paid amounts and cancel/reject loop must reset v_has_branch_map per product'
    );
    for (const [fnLabel, fnBody] of [
      ['create_omnichannel_order', createFnSlice],
      ['accept_omnichannel_order_with_stock', acceptFnSlice],
      ['cancel_or_reject_omnichannel_order_with_restock', cancelFnSlice],
    ] as const) {
      assert(
        fnBody.includes('if round(v_other_branch_total, 3) > v_global_stock then') &&
          fnBody.includes("'code', 'invalid_stock_state'") &&
          fnBody.includes('v_global_stock - v_other_branch_total'),
        `${fnLabel} must reject branch_stock allocations whose combined total exceeds global products.stock while preserving unallocated-stock semantics`
      );
    }
    assert(
      acceptFnSlice.includes('if round(v_other_branch_total, 3) > v_new_global then') &&
        cancelFnSlice.includes('if round(v_other_branch_total, 3) > v_new_global then'),
      'accept and cancel/reject mutation passes must verify post-mutation branch_stock sum never exceeds global products.stock'
    );

    // Runtime checks: spoofed status / stockReserved / actorId / actorName / actorRole / statusHistory / notificationLog are ignored
    store.tenants.get('tenant-a')!.subscriptionStatus = 'active';
    const spoofCreateRes = await requestJson(
      baseUrl,
      'POST',
      '/api/omnichannel/orders',
      {
        channel: 'phone',
        customerName: 'Spoof Check',
        customerPhone: '03005556677',
        branchId: 'branch-a-main',
        paymentMethod: 'cod',
        status: 'delivered',
        stockReserved: true,
        stockReservedAt: new Date().toISOString(),
        actorId: 'fake-admin-id',
        actorName: 'Fake Boss',
        actorRole: 'admin',
        statusHistory: [{ status: 'delivered', actorId: 'fake-admin-id', actorName: 'Fake Boss', actorRole: 'admin', changedAt: new Date().toISOString() }],
        notificationLog: [{ id: 'fake-notif', event: 'order_delivered', channel: 'whatsapp', status: 'sent', recipientPhone: '0300', messagePreview: 'spoof', createdAt: new Date().toISOString() }],
        items: [{ productId: 'prod-sugar', quantity: 1 }],
      },
      { 'x-test-user': 'tenant-a', 'x-test-role': 'cashier' }
    );
    assertEqual(spoofCreateRes.status, 201, 'Phone order creation succeeds while stripping spoofed state/history/actor');
    const createdPhoneSpoof = spoofCreateRes.json.order as OmnichannelOrder;
    assertEqual(createdPhoneSpoof.status, 'new', 'Created order must start in new status');
    assertEqual(createdPhoneSpoof.stockReserved, false, 'Created order must have stockReserved=false');
    assertEqual(createdPhoneSpoof.statusHistory.length, 1, 'Spoofed statusHistory array must not be accepted');
    assertEqual(createdPhoneSpoof.statusHistory[0]?.actorId, 'emp-cashier', 'Order history must record verified staff ID rather than spoofed actorId');
    assert(createdPhoneSpoof.statusHistory[0]?.actorName !== 'Fake Boss', 'Order history must not record spoofed actorName');
    assertEqual(createdPhoneSpoof.statusHistory[0]?.actorRole, 'cashier', 'Order history must record verified staff role rather than spoofed actorRole');
    assert(
      !createdPhoneSpoof.notificationLog.some((n) => n.id === 'fake-notif'),
      'Spoofed notificationLog entry must not be persisted'
    );

    // Runtime check: spoofed actor fields on status transition + spoofed history on payment update are ignored
    const spoofAcceptRes = await requestJson(
      baseUrl,
      'PATCH',
      `/api/omnichannel/orders/${createdPhoneSpoof.id}/status`,
      {
        status: 'accepted',
        actorId: 'spoof-other-emp',
        actorName: 'Spoofed Actor',
        actorRole: 'admin',
        statusHistory: [],
        notificationLog: [],
      },
      { 'x-test-user': 'tenant-a', 'x-test-role': 'manager' }
    );
    assertEqual(spoofAcceptRes.status, 200, 'Manager accept succeeds while ignoring spoofed actor/history fields');
    const acceptedSpoofOrder = spoofAcceptRes.json.order as OmnichannelOrder;
    const latestHistory = acceptedSpoofOrder.statusHistory[acceptedSpoofOrder.statusHistory.length - 1];
    assertEqual(latestHistory?.actorId, 'emp-manager', 'Status transition must record verified staff ID');
    assert(latestHistory?.actorName !== 'Spoofed Actor', 'Status transition must ignore spoofed actorName');
    assertEqual(latestHistory?.actorRole, 'manager', 'Status transition must record verified staff role');

    // Runtime check: product ID type mismatch / invalid product ID fails cleanly without stock corruption
    const badProductIdRes = await requestJson(
      baseUrl,
      'POST',
      '/api/omnichannel/orders',
      {
        channel: 'phone',
        customerName: 'Bad Product ID Test',
        customerPhone: '03005559999',
        branchId: 'branch-a-main',
        paymentMethod: 'cod',
        items: [{ productId: '00000000-0000-4000-8000-000000000000', quantity: 1 }],
      },
      { 'x-test-user': 'tenant-a', 'x-test-role': 'cashier' }
    );
    assertEqual(badProductIdRes.status, 400, 'Unknown/mismatched product ID format must fail validation cleanly');


    // Runtime checks: invalid channel, invalid branchId, negative discountAmount, invalid paymentStatus must fail closed with 400
    const badChannelRes = await requestJson(
      baseUrl,
      'POST',
      '/api/omnichannel/orders',
      {
        channel: 'website',
        customerName: 'Bad Channel',
        customerPhone: '03005559999',
        branchId: 'branch-a-main',
        items: [{ productId: 'prod-sugar', quantity: 1 }],
      },
      { 'x-test-user': 'tenant-a', 'x-test-role': 'cashier' }
    );
    assertEqual(badChannelRes.status, 400, 'Staff endpoint must reject unrecognized/public channel');

    const badBranchRes = await requestJson(
      baseUrl,
      'POST',
      '/api/omnichannel/orders',
      {
        channel: 'phone',
        customerName: 'Bad Branch',
        customerPhone: '03005559999',
        branchId: 'non-existent-branch',
        items: [{ productId: 'prod-sugar', quantity: 1 }],
      },
      { 'x-test-user': 'tenant-a', 'x-test-role': 'cashier' }
    );
    assertEqual(badBranchRes.status, 400, 'Non-existent or cross-tenant branchId must be rejected with 400');

    const negDiscountRes = await requestJson(
      baseUrl,
      'POST',
      '/api/omnichannel/orders',
      {
        channel: 'phone',
        customerName: 'Neg Discount',
        customerPhone: '03005559999',
        branchId: 'branch-a-main',
        discountAmount: -25,
        items: [{ productId: 'prod-sugar', quantity: 1 }],
      },
      { 'x-test-user': 'tenant-a', 'x-test-role': 'cashier' }
    );
    assertEqual(negDiscountRes.status, 400, 'Negative discountAmount must be rejected with 400');

    const invalidInitPayRes = await requestJson(
      baseUrl,
      'POST',
      '/api/omnichannel/orders',
      {
        channel: 'phone',
        customerName: 'Bad Pay Status',
        customerPhone: '03005559999',
        branchId: 'branch-a-main',
        paymentStatus: 'refunded',
        items: [{ productId: 'prod-sugar', quantity: 1 }],
      },
      { 'x-test-user': 'tenant-a', 'x-test-role': 'cashier' }
    );
    assertEqual(invalidInitPayRes.status, 400, 'Initial refunded paymentStatus on order create must be rejected with 400');


    // -----------------------------------------------------------------------
    // 9. Supabase RPC Integration Guard & Fail-Closed 403 Test
    // -----------------------------------------------------------------------
    const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = [];
    const tenantUuidA = '11111111-1111-4111-8111-111111111111';
    const orderUuidA = 'omni-rpc-test-1';
    let mockOrderStatus = 'new';
    let mockStockReserved = false;
    const mockOrderRow = {
      id: orderUuidA,
      user_id: tenantUuidA,
      branch_id: 'branch-a-main',
      branch_name: 'Main Branch',
      order_number: 'WEB-20261126-9999',
      channel: 'website',
      status: 'new',
      customer_id: null,
      customer_name: 'Test Buyer',
      customer_phone: '03001112233',
      delivery_address: 'Lahore',
      notes: '',
      items: [{ productId: 'prod-sugar', sku: 'PAN-SUGAR', nameEn: 'Sugar', nameUr: 'چینی', category: 'pantry', sellingUnit: 'kg', quantity: 1, unitPrice: 160, taxRate: 0, lineTotal: 160 }],
      subtotal: 160,
      discount_amount: 0,
      tax_amount: 0,
      total: 160,
      payment_method: 'cod',
      payment_status: 'cod_pending',
      paid_amount: 0,
      stock_reserved: false,
      status_history: [],
      notification_log: [],
      created_by: 'customer',
      updated_by: 'customer',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let simulateExcessBranchStock = false;
    const simulatedStockProduct = {
      stock: 10,
      branch_stock: { 'branch-a-main': 5 } as Record<string, number>,
    };

    const mockSupabase = {
      from(table: string) {
        const eqFilters: Record<string, string> = {};
        const query = {
          select() {
            return query;
          },
          eq(field: string, val: string) {
            eqFilters[field] = val;
            return query;
          },
          ilike() {
            return query;
          },
          order() {
            return Promise.resolve({
              data:
                table === 'products'
                  ? [
                      {
                        id: 'prod-sugar',
                        sku: 'PAN-SUGAR',
                        barcode: '8961001001',
                        name_en: 'Refined Cane Sugar',
                        name_ur: 'چینی',
                        category: 'pantry',
                        price: 160,
                        cost: 132,
                        tax_rate: 0,
                        selling_unit: 'kg',
                        stock: 10,
                        branch_stock: { 'branch-a-main': 5 },
                        image: '',
                      },
                    ]
                  : table === 'branches'
                  ? [{ id: 'branch-a-main', name: 'Main Branch', code: 'MAIN', is_main: true, is_active: true }]
                  : table === 'customers'
                  ? []
                  : [],
              error: null,
            });
          },
          insert() {
            return Promise.resolve({ data: null, error: null });
          },
          then(resolve: (val: { data: unknown[]; error: null }) => void) {
            if (table === 'branches') {
              resolve({ data: [{ id: 'branch-a-main', name: 'Main Branch', is_main: true, is_active: true }], error: null });
            } else if (table === 'products') {
              resolve({
                data: [
                  {
                    id: 'prod-sugar',
                    sku: 'PAN-SUGAR',
                    barcode: '8961001001',
                    name_en: 'Refined Cane Sugar',
                    name_ur: 'چینی',
                    category: 'pantry',
                    price: 160,
                    cost: 132,
                    tax_rate: 0,
                    selling_unit: 'kg',
                    stock: 10,
                    branch_stock: { 'branch-a-main': 5 },
                    image: '',
                  },
                ],
                error: null,
              });
            } else {
              resolve({ data: [], error: null });
            }
          },
          async maybeSingle() {
            if (table === 'omnichannel_orders') {
              if ('idempotency_key' in eqFilters) return { data: null, error: null };
              if (eqFilters.id === 'omni-rpc-42501') {
                return { data: { ...mockOrderRow, id: 'omni-rpc-42501', status: 'new', stock_reserved: false }, error: null };
              }
              return { data: { ...mockOrderRow, status: mockOrderStatus, stock_reserved: mockStockReserved }, error: null };
            }
            if (table === 'store_settings') {
              return {
                data: {
                  user_id: tenantUuidA,
                  store_name: 'Alpha Mart',
                  storefront_slug: 'alpha-mart',
                  storefront_enabled: true,
                  storefront_description: '',
                  cod_enabled: true,
                  default_tax_rate: 0,
                },
                error: null,
              };
            }
            if (table === 'subscriptions') return { data: { is_blocked: false, status: 'active' }, error: null };
            return { data: null, error: null };
          },
        };
        return query;
      },
      async rpc(fn: string, params: Record<string, unknown>) {
        rpcCalls.push({ fn, params });
        if (params.p_order_id === 'omni-rpc-42501') {
          return { data: null, error: { code: '42501', message: 'Unauthorized tenant access.' } };
        }
        if (
          simulateExcessBranchStock &&
          (fn === 'create_omnichannel_order' ||
            fn === 'accept_omnichannel_order_with_stock' ||
            fn === 'cancel_or_reject_omnichannel_order_with_restock')
        ) {
          const branchSum = Object.values(simulatedStockProduct.branch_stock).reduce((acc, v) => acc + v, 0);
          if (branchSum > simulatedStockProduct.stock) {
            return {
              data: {
                ok: false,
                code: 'INVALID_STOCK_STATE',
                error: `Inconsistent branch stock allocations: branch total (${branchSum}) exceeds global stock (${simulatedStockProduct.stock}).`,
              },
              error: null,
            };
          }
        }
        if (fn === 'create_omnichannel_order') {
          mockOrderStatus = 'new';
          mockStockReserved = false;
          return {
            data: {
              ok: true,
              deduplicated: false,
              order: {
                ...mockOrderRow,
                channel: params.p_channel || 'website',
                status: 'new',
                stock_reserved: false,
              },
            },
            error: null,
          };
        }
        if (fn === 'accept_omnichannel_order_with_stock') {
          mockOrderStatus = 'accepted';
          mockStockReserved = true;
        } else if (fn === 'transition_omnichannel_order_status') {
          mockOrderStatus = String(params.p_target_status || mockOrderStatus);
        } else if (fn === 'cancel_or_reject_omnichannel_order_with_restock') {
          mockOrderStatus = String(params.p_target_status || 'cancelled');
          mockStockReserved = false;
        }
        return {
          data: {
            ok: true,
            restocked: fn === 'cancel_or_reject_omnichannel_order_with_restock',
            order: {
              ...mockOrderRow,
              status: mockOrderStatus,
              stock_reserved: mockStockReserved,
            },
          },
          error: null,
        };
      },
    } as unknown as SupabaseClient;

    let rpcNotificationsSent = 0;
    const rpcApp = express();
    rpcApp.use(express.json());
    registerOmnichannelRoutes(rpcApp, {
      adminSupabase: mockSupabase,
      authenticateReq: async (req) => {
        const uid = req.header('x-test-user');
        return uid ? { id: uid, email: `${uid}@example.com` } : null;
      },
      checkOpAccess: async () => ({ allowed: true, status: 'active' }),
      resolveStaff: async (req) => ({
        role: (req.header('x-test-role') || 'manager') as EmployeeRole,
        employeeId: 'emp-rpc',
        employeeName: 'RPC Manager',
      }),
      whatsappEnv: {},
      whatsappSendOverride: async () => {
        rpcNotificationsSent += 1;
        return { delivered: false, error: 'manual' };
      },
    });

    const rpcServer = http.createServer(rpcApp);
    await new Promise<void>((resolve) => rpcServer.listen(0, '127.0.0.1', () => resolve()));
    try {
      const rpcAddr = rpcServer.address() as { port: number };
      const rpcBase = `http://127.0.0.1:${rpcAddr.port}`;

      // Public storefront create must invoke create_omnichannel_order RPC
      const rpcWebCreate = await requestJson(rpcBase, 'POST', '/api/storefront/alpha-mart/orders', {
        customerName: 'RPC Web Buyer',
        customerPhone: '03001112233',
        deliveryAddress: 'Gulberg, Lahore',
        paymentMethod: 'cod',
        items: [{ productId: 'prod-sugar', quantity: 1 }],
      });
      assertEqual(rpcWebCreate.status, 201, 'Supabase RPC storefront create should succeed');
      assertEqual(rpcCalls[0]?.fn, 'create_omnichannel_order', 'Storefront create should invoke create_omnichannel_order RPC');

      // Staff phone order create must invoke create_omnichannel_order RPC
      const rpcPhoneCreate = await requestJson(
        rpcBase,
        'POST',
        '/api/omnichannel/orders',
        {
          channel: 'phone',
          customerName: 'RPC Phone Buyer',
          customerPhone: '03001112244',
          branchId: 'branch-a-main',
          items: [{ productId: 'prod-sugar', quantity: 1 }],
        },
        { 'x-test-user': tenantUuidA, 'x-test-role': 'cashier' }
      );
      assertEqual(rpcPhoneCreate.status, 201, 'Supabase RPC staff create should succeed');
      assertEqual(rpcCalls[1]?.fn, 'create_omnichannel_order', 'Staff order create should invoke create_omnichannel_order RPC');

      // Invalid transition (new -> ready) must reject BEFORE sending WhatsApp notifications
      const notifCountBeforeInvalid = rpcNotificationsSent;
      const rpcInvalidJump = await requestJson(
        rpcBase,
        'PATCH',
        `/api/omnichannel/orders/${orderUuidA}/status`,
        { status: 'ready' },
        { 'x-test-user': tenantUuidA, 'x-test-role': 'manager' }
      );
      assertEqual(rpcInvalidJump.status, 400, 'Invalid transition new -> ready must return 400');
      assertEqual(rpcNotificationsSent, notifCountBeforeInvalid, 'Invalid transition must not dispatch WhatsApp notification');

      const rpcAcc = await requestJson(
        rpcBase,
        'PATCH',
        `/api/omnichannel/orders/${orderUuidA}/status`,
        { status: 'accepted' },
        { 'x-test-user': tenantUuidA, 'x-test-role': 'manager' }
      );
      assertEqual(rpcAcc.status, 200, 'Supabase RPC accept should succeed');
      assertEqual(rpcCalls[2]?.fn, 'accept_omnichannel_order_with_stock', 'Should invoke accept RPC');
      assertEqual(rpcCalls[2]?.params.p_user_id, tenantUuidA, 'RPC must pass verified caller user_id');

      // Preparing, ready, and delivered must invoke transition_omnichannel_order_status RPC
      for (const nextSt of ['preparing', 'ready', 'delivered'] as const) {
        const rpcTrans = await requestJson(
          rpcBase,
          'PATCH',
          `/api/omnichannel/orders/${orderUuidA}/status`,
          { status: nextSt },
          { 'x-test-user': tenantUuidA, 'x-test-role': 'cashier' }
        );
        assertEqual(rpcTrans.status, 200, `Supabase RPC transition to ${nextSt} should succeed`);
      }
      assertEqual(rpcCalls[3]?.fn, 'transition_omnichannel_order_status', 'preparing must invoke transition_omnichannel_order_status RPC');
      assertEqual(rpcCalls[4]?.fn, 'transition_omnichannel_order_status', 'ready must invoke transition_omnichannel_order_status RPC');
      assertEqual(rpcCalls[5]?.fn, 'transition_omnichannel_order_status', 'delivered must invoke transition_omnichannel_order_status RPC');

      const rpcCashierCancel = await requestJson(
        rpcBase,
        'PATCH',
        `/api/omnichannel/orders/${orderUuidA}/status`,
        { status: 'cancelled' },
        { 'x-test-user': tenantUuidA, 'x-test-role': 'cashier' }
      );
      assertEqual(rpcCashierCancel.status, 403, 'Cashier cannot invoke cancel/restock RPC');

      // Reset mockOrderStatus to accepted so cancel transition is valid
      mockOrderStatus = 'accepted';
      mockStockReserved = true;
      const rpcMgrCancel = await requestJson(
        rpcBase,
        'PATCH',
        `/api/omnichannel/orders/${orderUuidA}/status`,
        { status: 'cancelled', reason: 'Test restock' },
        { 'x-test-user': tenantUuidA, 'x-test-role': 'manager' }
      );
      assertEqual(rpcMgrCancel.status, 200, 'Manager cancel RPC should succeed');
      assertEqual(
        rpcCalls[6]?.fn,
        'cancel_or_reject_omnichannel_order_with_restock',
        'Should invoke cancel/restock RPC'
      );
      assertEqual(rpcMgrCancel.json.didRestoreStock, true, 'Cancel RPC should report restocked=true');

      const rpcDenied42501 = await requestJson(
        rpcBase,
        'PATCH',
        '/api/omnichannel/orders/omni-rpc-42501/status',
        { status: 'accepted' },
        { 'x-test-user': tenantUuidA, 'x-test-role': 'manager' }
      );
      assertEqual(
        rpcDenied42501.status,
        403,
        'PostgreSQL 42501 authorization error from stock RPC must fail closed with 403'
      );

      // Runtime regression test: combined branch_stock allocations exceeding global stock must fail closed on create, accept, and cancel
      simulateExcessBranchStock = true;
      simulatedStockProduct.stock = 5;
      simulatedStockProduct.branch_stock = { 'branch-a-main': 4, 'branch-b-secondary': 3 };

      const excessCreate = await requestJson(
        rpcBase,
        'POST',
        '/api/omnichannel/orders',
        {
          channel: 'phone',
          customerName: 'Excess Alloc Buyer',
          customerPhone: '03001119999',
          branchId: 'branch-a-main',
          items: [{ productId: 'prod-sugar', quantity: 1 }],
        },
        { 'x-test-user': tenantUuidA, 'x-test-role': 'cashier' }
      );
      assertEqual(excessCreate.status, 400, 'Order create must fail when combined branch_stock exceeds global stock');
      assertEqual(excessCreate.json.code, 'INVALID_STOCK_STATE', 'Order create must surface INVALID_STOCK_STATE');

      mockOrderStatus = 'new';
      mockStockReserved = false;
      const excessAccept = await requestJson(
        rpcBase,
        'PATCH',
        `/api/omnichannel/orders/${orderUuidA}/status`,
        { status: 'accepted' },
        { 'x-test-user': tenantUuidA, 'x-test-role': 'manager' }
      );
      assertEqual(excessAccept.status, 400, 'Order accept must fail when combined branch_stock exceeds global stock');
      assertEqual(excessAccept.json.code, 'INVALID_STOCK_STATE', 'Order accept must surface INVALID_STOCK_STATE');
      assertEqual(mockOrderStatus, 'new', 'Order status must remain new after rejected accept');
      assertEqual(mockStockReserved, false, 'Stock reserved flag must remain false after rejected accept');

      mockOrderStatus = 'accepted';
      mockStockReserved = true;
      const excessCancel = await requestJson(
        rpcBase,
        'PATCH',
        `/api/omnichannel/orders/${orderUuidA}/status`,
        { status: 'cancelled', reason: 'Excess branch stock test' },
        { 'x-test-user': tenantUuidA, 'x-test-role': 'manager' }
      );
      assertEqual(excessCancel.status, 400, 'Order cancel/restock must fail when combined branch_stock exceeds global stock');
      assertEqual(excessCancel.json.code, 'INVALID_STOCK_STATE', 'Order cancel/restock must surface INVALID_STOCK_STATE');
      assertEqual(mockOrderStatus, 'accepted', 'Order status must remain accepted after rejected restock');
      assertEqual(mockStockReserved, true, 'Stock reserved flag must remain true after rejected restock');
      simulateExcessBranchStock = false;
    } finally {
      await new Promise<void>((resolve) => rpcServer.close(() => resolve()));
    }

    console.log('PASS: All omnichannel order management, storefront, webhook, stock safety, migration SQL, and RBAC tests passed.');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

runTests().catch((err) => {
  console.error('Omnichannel test suite failed:', err);
  process.exit(1);
});
