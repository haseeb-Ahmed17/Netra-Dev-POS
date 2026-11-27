// External E-Commerce Integrations Verification Tests (Mocked APIs, Zero Live Accounts Required)
// Run with: npx tsx tests/externalIntegrations.test.ts

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import express from 'express';
import { createPosExpressApp } from '../serverApp';
import {
  ExternalIntegrationsMemoryStore,
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  registerExternalIntegrationRoutes,
} from '../serverExternalIntegrations';
import { OmnichannelMemoryStore } from '../serverOmnichannelOrders';
import { createDefaultStoreSettings } from '../src/data/initialData';
import type { EmployeeRole, Product } from '../src/types';

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

async function requestHttp(
  baseUrl: string,
  method: string,
  urlPath: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const rawBody =
    typeof body === 'string'
      ? body
      : body !== undefined
      ? JSON.stringify(body)
      : undefined;
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      ...(rawBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    },
    body: rawBody,
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // non-json response (e.g. HTML OAuth callback)
  }
  return { status: res.status, json, text };
}

function signShopifyOAuthQuery(
  params: Record<string, string>,
  secret: string
): string {
  const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const msg = entries.map(([k, v]) => `${k}=${v}`).join('&');
  return crypto.createHmac('sha256', secret).update(msg, 'utf8').digest('hex');
}

function makeProductsA(): Product[] {
  return [
    {
      id: 'prod-a-sugar',
      sku: 'PAN-SUGAR',
      barcode: '8961001001',
      nameEn: 'Refined Cane Sugar',
      nameUr: 'چینی',
      category: 'pantry',
      price: 160,
      cost: 130,
      taxRate: 0,
      sellingUnit: 'kg',
      stock: 15,
      branchStock: { 'branch-a-main': 15 },
      image: '',
    },
  ];
}

function makeProductsB(): Product[] {
  return [
    {
      id: 'prod-b-tea',
      sku: 'B-TEA-1',
      barcode: '8962002001',
      nameEn: 'Tenant B Tea',
      nameUr: 'چائے',
      category: 'beverages',
      price: 900,
      cost: 700,
      taxRate: 0,
      sellingUnit: 'packet',
      stock: 10,
      branchStock: { 'branch-b-main': 10 },
      image: '',
    },
  ];
}

async function runTests(): Promise<void> {
  // 1. Encryption roundtrip sanity
  const cipher = encryptIntegrationSecret('shpat_super_secret_token_12345', {
    encryptionKey: 'test-master-key-for-integrations',
  });
  assert(cipher.startsWith('v1:'), 'Encrypted secret should use v1 AES-GCM envelope');
  assert(!cipher.includes('shpat_super_secret_token_12345'), 'Ciphertext must not leak plaintext');
  const plain = decryptIntegrationSecret(cipher, {
    encryptionKey: 'test-master-key-for-integrations',
  });
  assertEqual(plain, 'shpat_super_secret_token_12345', 'Decrypted secret must match plaintext');

  // 2. Test disconnected defaults when SHOPIFY_API_KEY/SECRET are unset
  {
    const omniStore = new OmnichannelMemoryStore();
    const intStore = new ExternalIntegrationsMemoryStore();
    omniStore.registerTenant({
      userId: 'tenant-unconf',
      subscriptionStatus: 'active',
      settings: createDefaultStoreSettings('Fresh Start Shop'),
      branches: [
        {
          id: 'b-main',
          name: 'Main',
          code: 'MAIN',
          address: 'Lahore',
          phone: '03001112222',
          isMain: true,
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      ],
      products: makeProductsA(),
      customers: [],
      orders: [],
      adjustments: [],
      auditLogs: [],
    });

    const app = createPosExpressApp({
      omnichannelStoreOverride: omniStore,
      integrationsStoreOverride: intStore,
      externalIntegrationsEnvOverride: {
        appUrl: 'https://ais-dev-test.example.run.app',
        shopifyApiKey: '',
        shopifyApiSecret: '',
        whatsappAccessToken: '',
        whatsappPhoneNumberId: '',
      },
      authenticateOverride: async (req) => {
        const uid = req.header('x-test-user');
        return uid
          ? { id: uid, email: `${uid}@example.com`, emailConfirmed: true, jwt: 'test-jwt' }
          : null;
      },
      tenantAccessOverride: async () => ({ allowed: true, status: 'active' }),
      staffRoleOverride: async (req, user) => ({
        role: (req.header('x-test-role') as EmployeeRole) || 'admin',
        employeeId: `emp-${user.id}`,
      }),
    });

    const srv = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const addr = srv.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Unauthenticated -> 401
      const unauth = await requestHttp(baseUrl, 'GET', '/api/integrations');
      assertEqual(unauth.status, 401, 'Unauthenticated GET /api/integrations must fail with 401');

      // Non-admin cashier -> 403
      const cashierRes = await requestHttp(baseUrl, 'GET', '/api/integrations', undefined, {
        'x-test-user': 'tenant-unconf',
        'x-test-role': 'cashier',
      });
      assertEqual(cashierRes.status, 403, 'Cashier role must be denied access to integrations');

      // Admin sees all providers cleanly in not_connected state
      const adminRes = await requestHttp(baseUrl, 'GET', '/api/integrations', undefined, {
        'x-test-user': 'tenant-unconf',
        'x-test-role': 'admin',
      });
      assertEqual(adminRes.status, 200, 'Admin GET /api/integrations should succeed');
      const list = adminRes.json.integrations as Array<{
        provider: string;
        status: string;
        metadata?: Record<string, unknown>;
      }>;
      assertEqual(list.length, 4, 'Should return 4 integration providers');
      for (const item of list) {
        assertEqual(
          item.status,
          'not_connected',
          `Provider ${item.provider} must default to not_connected without fake connectivity`
        );
      }
      const wa = list.find((i) => i.provider === 'whatsapp_business');
      assert(
        wa?.metadata?.personalWhatsAppUnsupported === true &&
          wa?.metadata?.manualFallbackActive === true,
        'WhatsApp card must document personal WhatsApp unsupported and wa.me fallback active'
      );

      // Shopify OAuth URL request when partner keys are unset -> 503 SHOPIFY_APP_NOT_CONFIGURED
      const shopifyUnconf = await requestHttp(
        baseUrl,
        'GET',
        '/api/integrations/shopify/oauth/url?shop=demo-shop.myshopify.com',
        undefined,
        { 'x-test-user': 'tenant-unconf', 'x-test-role': 'admin' }
      );
      assertEqual(shopifyUnconf.status, 503, 'Shopify OAuth URL without partner keys returns 503');
      assertEqual(
        shopifyUnconf.json.code,
        'SHOPIFY_APP_NOT_CONFIGURED',
        'Should return SHOPIFY_APP_NOT_CONFIGURED error code'
      );
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  }

  // 3. Full mocked Shopify OAuth, GraphQL sync, WooCommerce, Custom Website, Webhooks, Dedup, Cancellation & Tenant Isolation
  {
    const omniStore = new OmnichannelMemoryStore();
    const intStore = new ExternalIntegrationsMemoryStore();
    const shopifySecret = 'shpss_test_partner_secret_xyz';
    const wooSecret = 'cs_test_woo_secret_123456';
    const wooWebhookSecret = 'wc_whsec_test_98765';

    omniStore.registerTenant({
      userId: 'tenant-a',
      subscriptionStatus: 'active',
      settings: {
        ...createDefaultStoreSettings('Alpha Mart'),
        storefrontSlug: 'alpha-mart',
        storefrontEnabled: true,
      },
      branches: [
        {
          id: 'branch-a-main',
          name: 'Main Branch',
          code: 'MAIN',
          address: 'Lahore',
          phone: '03001112222',
          isMain: true,
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      ],
      products: makeProductsA(),
      customers: [],
      orders: [],
      adjustments: [],
      auditLogs: [],
    });

    omniStore.registerTenant({
      userId: 'tenant-b',
      subscriptionStatus: 'active',
      settings: {
        ...createDefaultStoreSettings('Beta Store'),
        storefrontSlug: 'beta-store',
        storefrontEnabled: true,
      },
      branches: [
        {
          id: 'branch-b-main',
          name: 'Main Branch B',
          code: 'MAIN',
          address: 'Karachi',
          phone: '03219998888',
          isMain: true,
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      ],
      products: makeProductsB(),
      customers: [],
      orders: [],
      adjustments: [],
      auditLogs: [],
    });

    const mockFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();

      // Shopify OAuth token exchange
      if (url === 'https://alpha-shop.myshopify.com/admin/oauth/access_token') {
        return new Response(
          JSON.stringify({
            access_token: 'shpat_mocked_access_token_9999',
            scope: 'read_orders,read_products,write_inventory',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Shopify GraphQL Admin API
      if (url.includes('https://alpha-shop.myshopify.com/admin/api/') && url.endsWith('/graphql.json')) {
        const payload = JSON.parse(String(init?.body || '{}')) as { query?: string };
        if (payload.query?.includes('SmartBitzSyncProducts')) {
          return new Response(
            JSON.stringify({
              data: {
                products: {
                  nodes: [
                    {
                      id: 'gid://shopify/Product/1001',
                      title: 'Refined Cane Sugar',
                      variants: {
                        nodes: [
                          {
                            id: 'gid://shopify/ProductVariant/2001',
                            sku: 'PAN-SUGAR',
                            price: '160.00',
                            inventoryQuantity: 15,
                            inventoryItem: { id: 'gid://shopify/InventoryItem/3001' },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (payload.query?.includes('SmartBitzSyncOrders')) {
          return new Response(
            JSON.stringify({
              data: {
                orders: {
                  nodes: [
                    {
                      id: 'gid://shopify/Order/5001',
                      name: '#1001',
                      displayFinancialStatus: 'PAID',
                      cancelledAt: null,
                      shippingAddress: {
                        name: 'Bilal Ahmed',
                        phone: '03001234567',
                        address1: '14-B Model Town',
                        city: 'Lahore',
                      },
                      totalPriceSet: { shopMoney: { amount: '320.00' } },
                      lineItems: {
                        nodes: [
                          {
                            quantity: 2,
                            sku: 'PAN-SUGAR',
                            variant: {
                              id: 'gid://shopify/ProductVariant/2001',
                              product: { id: 'gid://shopify/Product/1001' },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      // WooCommerce REST verification & sync
      if (url.startsWith('https://woo-alpha.example.com/wp-json/wc/v3/orders')) {
        const auth = (init?.headers as Record<string, string> | undefined)?.Authorization || '';
        const expectedAuth =
          'Basic ' + Buffer.from(`ck_test_valid:${wooSecret}`, 'utf8').toString('base64');
        if (auth !== expectedAuth) {
          return new Response(JSON.stringify({ code: 'woocommerce_rest_cannot_view' }), {
            status: 401,
          });
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.startsWith('https://woo-alpha.example.com/wp-json/wc/v3/products')) {
        return new Response(
          JSON.stringify([{ id: 77, sku: 'PAN-SUGAR', name: 'Sugar' }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response('Not Found', { status: 404 });
    };

    const app = createPosExpressApp({
      omnichannelStoreOverride: omniStore,
      integrationsStoreOverride: intStore,
      externalIntegrationsEnvOverride: {
        appUrl: 'https://ais-dev-test.example.run.app',
        shopifyApiKey: 'shp_key_test_123',
        shopifyApiSecret: shopifySecret,
        shopifyScopes: 'read_orders,read_products,write_inventory',
        encryptionKey: 'integration-test-encryption-secret',
      },
      externalFetchOverride: mockFetch,
      authenticateOverride: async (req) => {
        const uid = req.header('x-test-user');
        return uid
          ? { id: uid, email: `${uid}@example.com`, emailConfirmed: true, jwt: 'test-jwt' }
          : null;
      },
      tenantAccessOverride: async () => ({ allowed: true, status: 'active' }),
      staffRoleOverride: async (req, user) => ({
        role: (req.header('x-test-role') as EmployeeRole) || 'admin',
        employeeId: `emp-${user.id}`,
      }),
    });

    const srv = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const addr = srv.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // A. Shopify OAuth flow
      const invalidDomain = await requestHttp(
        baseUrl,
        'GET',
        '/api/integrations/shopify/oauth/url?shop=https://evil.com',
        undefined,
        { 'x-test-user': 'tenant-a', 'x-test-role': 'admin' }
      );
      assertEqual(invalidDomain.status, 400, 'Non-myshopify.com domain must be rejected');

      const oauthUrlRes = await requestHttp(
        baseUrl,
        'GET',
        '/api/integrations/shopify/oauth/url?shop=alpha-shop.myshopify.com',
        undefined,
        { 'x-test-user': 'tenant-a', 'x-test-role': 'admin' }
      );
      assertEqual(oauthUrlRes.status, 200, 'Shopify OAuth URL should succeed when configured');
      const authUrl = new URL(String(oauthUrlRes.json.authUrl));
      assertEqual(
        authUrl.origin,
        'https://alpha-shop.myshopify.com',
        'OAuth URL must point directly to Shopify store origin'
      );
      assertEqual(
        authUrl.searchParams.get('redirect_uri'),
        'https://ais-dev-test.example.run.app/api/integrations/shopify/oauth/callback',
        'OAuth redirect_uri must use APP_URL'
      );
      assertEqual(
        authUrl.searchParams.get('scope'),
        'read_orders,read_products,write_inventory',
        'OAuth must request minimal scopes only'
      );
      const state = authUrl.searchParams.get('state') || '';
      assert(state.length > 20, 'Signed OAuth state must be present');

      // Bad HMAC on callback -> rejected
      const badHmacCb = await requestHttp(
        baseUrl,
        'GET',
        `/api/integrations/shopify/oauth/callback?shop=alpha-shop.myshopify.com&code=auth_123&state=${encodeURIComponent(state)}&hmac=${'0'.repeat(64)}`
      );
      assertEqual(badHmacCb.status, 400, 'Invalid Shopify OAuth HMAC must be rejected');
      assert(badHmacCb.text.includes('SHOPIFY_OAUTH_ERROR'), 'Should post SHOPIFY_OAUTH_ERROR');

      // Valid HMAC on callback -> connected + postMessage
      const cbParams = {
        code: 'auth_code_valid',
        shop: 'alpha-shop.myshopify.com',
        state,
        timestamp: String(Math.floor(Date.now() / 1000)),
      };
      const validHmac = signShopifyOAuthQuery(cbParams, shopifySecret);
      const validCb = await requestHttp(
        baseUrl,
        'GET',
        `/api/integrations/shopify/oauth/callback/?code=${cbParams.code}&shop=${cbParams.shop}&state=${encodeURIComponent(cbParams.state)}&timestamp=${cbParams.timestamp}&hmac=${validHmac}`
      );
      assertEqual(validCb.status, 200, 'Valid Shopify OAuth callback with trailing slash must succeed');
      assert(validCb.text.includes('SHOPIFY_OAUTH_SUCCESS'), 'Callback must emit SHOPIFY_OAUTH_SUCCESS');

      // Replay same state -> rejected
      const replayCb = await requestHttp(
        baseUrl,
        'GET',
        `/api/integrations/shopify/oauth/callback?code=${cbParams.code}&shop=${cbParams.shop}&state=${encodeURIComponent(cbParams.state)}&timestamp=${cbParams.timestamp}&hmac=${validHmac}`
      );
      assertEqual(replayCb.status, 400, 'Replayed Shopify OAuth state must be rejected');

      // Inspect GET /api/integrations -> connected, no raw token leaked
      const afterShopify = await requestHttp(baseUrl, 'GET', '/api/integrations', undefined, {
        'x-test-user': 'tenant-a',
        'x-test-role': 'admin',
      });
      assert(!afterShopify.text.includes('shpat_mocked_access_token_9999'), 'Raw access token must never leak');
      const shopifySummary = (
        afterShopify.json.integrations as Array<Record<string, unknown>>
      ).find((i) => i.provider === 'shopify');
      assertEqual(shopifySummary?.status, 'connected', 'Shopify status must be connected');

      // Sync Shopify GraphQL products & completed orders
      const syncRes = await requestHttp(
        baseUrl,
        'POST',
        '/api/integrations/shopify/sync',
        {},
        { 'x-test-user': 'tenant-a', 'x-test-role': 'admin' }
      );
      assertEqual(syncRes.status, 200, 'Shopify GraphQL sync should succeed');
      assertEqual(syncRes.json.mappedProductsCount, 1, 'Should map 1 SKU from Shopify');
      assertEqual(syncRes.json.importedOrders, 1, 'Should import 1 completed Shopify order');

      const tenantA = omniStore.tenants.get('tenant-a')!;
      assertEqual(tenantA.orders.length, 1, 'Tenant A should have 1 synced Shopify order');
      assertEqual(tenantA.orders[0].channel, 'shopify', 'Order channel must be shopify');
      assertEqual(tenantA.orders[0].status, 'new', 'Imported order starts in new status');
      assertEqual(tenantA.orders[0].stockReserved, false, 'Imported new order must not pre-deduct stock');
      assertEqual(tenantA.products[0].stock, 15, 'POS stock stays intact until staff acceptance');

      // B. Shopify Webhooks: invalid HMAC, cart ignore, valid order + dedup + accept + cancel restock
      const whPayload = JSON.stringify({
        id: 888001,
        name: '#1002',
        financial_status: 'paid',
        total_price: '160.00',
        shipping_address: {
          name: 'Sana Tariq',
          phone: '03007778888',
          address1: '22 Gulberg',
          city: 'Lahore',
        },
        line_items: [{ product_id: 1001, variant_id: 2001, sku: 'PAN-SUGAR', quantity: 2 }],
      });

      const badWh = await requestHttp(baseUrl, 'POST', '/api/integrations/shopify/webhooks', whPayload, {
        'x-shopify-hmac-sha256': 'invalid-hmac',
        'x-shopify-topic': 'orders/create',
        'x-shopify-shop-domain': 'alpha-shop.myshopify.com',
      });
      assertEqual(badWh.status, 401, 'Invalid Shopify webhook HMAC must be rejected');

      // Cart event ignored
      const cartHmac = crypto
        .createHmac('sha256', shopifySecret)
        .update(Buffer.from(whPayload, 'utf8'))
        .digest('base64');
      const cartWh = await requestHttp(baseUrl, 'POST', '/api/integrations/shopify/webhooks', whPayload, {
        'x-shopify-hmac-sha256': cartHmac,
        'x-shopify-topic': 'carts/create',
        'x-shopify-shop-domain': 'alpha-shop.myshopify.com',
      });
      assertEqual(cartWh.status, 202, 'Shopify cart event must return 202 ignored');
      assertEqual(cartWh.json.ignored, true, 'Cart event must be ignored');
      assertEqual(tenantA.orders.length, 1, 'Cart event must not create an order');

      // Valid placed order webhook
      const orderWh = await requestHttp(baseUrl, 'POST', '/api/integrations/shopify/webhooks', whPayload, {
        'x-shopify-hmac-sha256': cartHmac,
        'x-shopify-topic': 'orders/create',
        'x-shopify-shop-domain': 'alpha-shop.myshopify.com',
        'x-shopify-webhook-id': 'wh-shopify-1002',
      });
      assertEqual(orderWh.status, 201, 'Valid Shopify orders/create webhook should import order');
      assertEqual(tenantA.orders.length, 2, 'Tenant A should now have 2 Shopify orders');
      const whOrderId = (orderWh.json.order as { id: string }).id;

      // Duplicate webhook replay -> deduplicated
      const dupWh = await requestHttp(baseUrl, 'POST', '/api/integrations/shopify/webhooks', whPayload, {
        'x-shopify-hmac-sha256': cartHmac,
        'x-shopify-topic': 'orders/create',
        'x-shopify-shop-domain': 'alpha-shop.myshopify.com',
        'x-shopify-webhook-id': 'wh-shopify-1002-retry',
      });
      assertEqual(dupWh.status, 200, 'Duplicate Shopify order must return 200 deduplicated');
      assertEqual(dupWh.json.deduplicated, true, 'Duplicate Shopify order must be deduplicated');
      assertEqual(tenantA.orders.length, 2, 'Duplicate order must not create a second row');

      // Staff accepts Shopify order -> stock deducted from 15 to 13
      const acceptRes = await requestHttp(
        baseUrl,
        'PATCH',
        `/api/omnichannel/orders/${whOrderId}/status`,
        { status: 'accepted' },
        { 'x-test-user': 'tenant-a', 'x-test-role': 'admin' }
      );
      assertEqual(acceptRes.status, 200, 'Staff acceptance of Shopify order must succeed');
      assertEqual(tenantA.products[0].stock, 13, 'Accepting Shopify order must deduct 2 kg stock');

      // Shopify orders/cancelled webhook -> cancels order & restores stock to 15
      const cancelPayload = JSON.stringify({
        id: 888001,
        cancelled_at: new Date().toISOString(),
        cancel_reason: 'customer',
      });
      const cancelHmac = crypto
        .createHmac('sha256', shopifySecret)
        .update(Buffer.from(cancelPayload, 'utf8'))
        .digest('base64');
      const cancelWh = await requestHttp(
        baseUrl,
        'POST',
        '/api/integrations/shopify/webhooks',
        cancelPayload,
        {
          'x-shopify-hmac-sha256': cancelHmac,
          'x-shopify-topic': 'orders/cancelled',
          'x-shopify-shop-domain': 'alpha-shop.myshopify.com',
          'x-shopify-webhook-id': 'wh-shopify-1002-cancel',
        }
      );
      assertEqual(cancelWh.status, 200, 'Shopify cancellation webhook must succeed');
      assertEqual(cancelWh.json.restocked, true, 'Accepted Shopify order cancellation must restore stock');
      assertEqual(tenantA.products[0].stock, 15, 'Stock must be restored back to 15');

      // Disconnect Shopify
      const discShopify = await requestHttp(
        baseUrl,
        'POST',
        '/api/integrations/shopify/disconnect',
        {},
        { 'x-test-user': 'tenant-a', 'x-test-role': 'admin' }
      );
      assertEqual(discShopify.status, 200, 'Disconnect Shopify must succeed');
      assertEqual(
        (discShopify.json.integration as { status: string }).status,
        'disconnected',
        'Status after disconnect must be disconnected'
      );

      // C. WooCommerce Verification & Webhooks
      const badWoo = await requestHttp(
        baseUrl,
        'POST',
        '/api/integrations/woocommerce/connect',
        {
          storeUrl: 'https://woo-alpha.example.com',
          consumerKey: 'ck_wrong',
          consumerSecret: 'cs_wrong',
        },
        { 'x-test-user': 'tenant-a', 'x-test-role': 'admin' }
      );
      assertEqual(badWoo.status, 401, 'Invalid WooCommerce credentials must fail verification');

      const goodWoo = await requestHttp(
        baseUrl,
        'POST',
        '/api/integrations/woocommerce/connect',
        {
          storeUrl: 'https://woo-alpha.example.com',
          consumerKey: 'ck_test_valid',
          consumerSecret: wooSecret,
          webhookSecret: wooWebhookSecret,
        },
        { 'x-test-user': 'tenant-a', 'x-test-role': 'admin' }
      );
      assertEqual(goodWoo.status, 200, 'Valid WooCommerce credentials should verify and connect');
      assert(!goodWoo.text.includes(wooSecret), 'Consumer secret must never be returned in response');

      // WooCommerce draft order ignored, placed order imported
      const wooDraftBody = JSON.stringify({
        id: 901,
        status: 'checkout-draft',
        line_items: [{ sku: 'PAN-SUGAR', quantity: 1 }],
      });
      const wooDraftSig = crypto
        .createHmac('sha256', wooWebhookSecret)
        .update(Buffer.from(wooDraftBody, 'utf8'))
        .digest('base64');
      const wooDraftRes = await requestHttp(
        baseUrl,
        'POST',
        '/api/integrations/woocommerce/webhooks?tenant=tenant-a',
        wooDraftBody,
        {
          'x-wc-webhook-signature': wooDraftSig,
          'x-wc-webhook-topic': 'order.created',
        }
      );
      assertEqual(wooDraftRes.status, 202, 'WooCommerce checkout-draft must be ignored');

      const wooOrderBody = JSON.stringify({
        id: 902,
        number: 'WC-902',
        status: 'processing',
        total: '160.00',
        date_paid: new Date().toISOString(),
        payment_method: 'card',
        billing: {
          first_name: 'Zain',
          last_name: 'Raza',
          phone: '03005556666',
          address_1: 'Johar Town',
          city: 'Lahore',
        },
        line_items: [{ sku: 'PAN-SUGAR', quantity: 1 }],
      });
      const wooOrderSig = crypto
        .createHmac('sha256', wooWebhookSecret)
        .update(Buffer.from(wooOrderBody, 'utf8'))
        .digest('base64');
      const wooOrderRes = await requestHttp(
        baseUrl,
        'POST',
        '/api/integrations/woocommerce/webhooks?tenant=tenant-a',
        wooOrderBody,
        {
          'x-wc-webhook-signature': wooOrderSig,
          'x-wc-webhook-topic': 'order.created',
          'x-wc-webhook-delivery-id': 'wc-deliv-902',
        }
      );
      assertEqual(wooOrderRes.status, 201, 'Valid WooCommerce placed order webhook must import');
      assertEqual(
        (wooOrderRes.json.order as { channel: string }).channel,
        'woocommerce',
        'Channel must be woocommerce'
      );

      // D. Custom Website API key, HMAC signature, checkout-only & Tenant Isolation
      const customGen = await requestHttp(
        baseUrl,
        'POST',
        '/api/integrations/custom/credentials',
        { storeDomain: 'alphamart.pk', displayName: 'Alpha Custom Web' },
        { 'x-test-user': 'tenant-a', 'x-test-role': 'admin' }
      );
      assertEqual(customGen.status, 200, 'Custom website credentials generation must succeed');
      const apiKey = String(customGen.json.apiKey);
      const webhookSecret = String(customGen.json.webhookSecret);
      assert(apiKey.startsWith('sb_live_') && webhookSecret.startsWith('whsec_'), 'Should issue key & secret once');

      // Tenant B must not see Tenant A's integrations or audit logs
      const tenantBInts = await requestHttp(baseUrl, 'GET', '/api/integrations', undefined, {
        'x-test-user': 'tenant-b',
        'x-test-role': 'admin',
      });
      const tenantBCustom = (
        tenantBInts.json.integrations as Array<{ provider: string; status: string }>
      ).find((i) => i.provider === 'custom_website');
      assertEqual(
        tenantBCustom?.status,
        'not_connected',
        'Tenant B must remain isolated and not see Tenant A connections'
      );

      const nowTs = String(Math.floor(Date.now() / 1000));
      const customCartPayload = JSON.stringify({
        event: 'cart.item_added',
        externalOrderId: 'cart-1',
        items: [{ sku: 'PAN-SUGAR', quantity: 1 }],
      });
      const customCartSig =
        'sha256=' +
        crypto
          .createHmac('sha256', webhookSecret)
          .update(`${nowTs}.${customCartPayload}`, 'utf8')
          .digest('hex');

      // Cart event ignored
      const customCartRes = await requestHttp(
        baseUrl,
        'POST',
        '/api/integrations/custom/webhooks/orders',
        customCartPayload,
        {
          'x-smartbitz-key': apiKey,
          'x-smartbitz-timestamp': nowTs,
          'x-smartbitz-signature': customCartSig,
        }
      );
      assertEqual(customCartRes.status, 202, 'Custom cart event must be ignored with 202');

      // Bad signature -> 401
      const badCustomRes = await requestHttp(
        baseUrl,
        'POST',
        '/api/integrations/custom/webhooks/orders',
        customCartPayload,
        {
          'x-smartbitz-key': apiKey,
          'x-smartbitz-timestamp': nowTs,
          'x-smartbitz-signature': 'sha256=' + 'f'.repeat(64),
        }
      );
      assertEqual(badCustomRes.status, 401, 'Tampered custom webhook signature must fail with 401');

      // Cross-tenant product ID blocked!
      const crossTenantPayload = JSON.stringify({
        event: 'order.placed',
        externalOrderId: 'ext-cross-1',
        customer: { name: 'Attacker', phone: '03001119999', deliveryAddress: 'Lahore' },
        items: [{ productId: 'prod-b-tea', quantity: 1 }],
      });
      const crossSig =
        'sha256=' +
        crypto
          .createHmac('sha256', webhookSecret)
          .update(`${nowTs}.${crossTenantPayload}`, 'utf8')
          .digest('hex');
      const crossRes = await requestHttp(
        baseUrl,
        'POST',
        '/api/integrations/custom/webhooks/orders',
        crossTenantPayload,
        {
          'x-smartbitz-key': apiKey,
          'x-smartbitz-timestamp': nowTs,
          'x-smartbitz-signature': crossSig,
        }
      );
      assertEqual(crossRes.status, 400, 'Cross-tenant product ID must be rejected');
      assertEqual(crossRes.json.code, 'UNMAPPED_PRODUCT', 'Cross-tenant product must fail mapping');

      // Valid custom checkout order
      const validCustomPayload = JSON.stringify({
        event: 'checkout.completed',
        externalOrderId: 'ext-cust-501',
        orderNumber: 'WEB-EXT-501',
        customer: {
          name: 'Hira Khan',
          phone: '03214445555',
          deliveryAddress: 'DHA Phase 5, Lahore',
        },
        payment: { method: 'cod', status: 'cod_pending', paidAmount: 0 },
        items: [{ sku: 'PAN-SUGAR', quantity: 3 }],
      });
      const validCustomSig =
        'sha256=' +
        crypto
          .createHmac('sha256', webhookSecret)
          .update(`${nowTs}.${validCustomPayload}`, 'utf8')
          .digest('hex');
      const validCustomRes = await requestHttp(
        baseUrl,
        'POST',
        '/api/integrations/custom/webhooks/orders',
        validCustomPayload,
        {
          'x-smartbitz-key': apiKey,
          'x-smartbitz-timestamp': nowTs,
          'x-smartbitz-signature': validCustomSig,
        }
      );
      assertEqual(validCustomRes.status, 201, 'Valid custom checkout.completed webhook must import');
      const importedCustom = validCustomRes.json.order as {
        channel: string;
        total: number;
        externalOrderNumber: string;
      };
      assertEqual(importedCustom.channel, 'custom_website', 'Channel must be custom_website');
      assertEqual(importedCustom.total, 480, 'Total must use authoritative catalog price (3 * 160 = 480)');
      assertEqual(importedCustom.externalOrderNumber, 'WEB-EXT-501', 'External order # must be stored');
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  }

  // 4. Static Verification of Additive Migration SQL
  {
    const sqlPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261127_external_ecommerce_integrations.sql'
    );
    const sql = fs.readFileSync(sqlPath, 'utf8');
    assert(!/\bdrop\s+table\b/i.test(sql), 'Migration must never DROP TABLE');
    assert(!/\btruncate\b/i.test(sql), 'Migration must never TRUNCATE');
    assert(
      sql.includes('alter table public.external_integrations enable row level security') &&
        sql.includes('alter table public.integration_audit_logs enable row level security') &&
        sql.includes('prevent_integration_audit_logs_mutation()') &&
        sql.includes('grant execute on function public.import_external_omnichannel_order') &&
        sql.includes('grant execute on function public.cancel_external_omnichannel_order_with_restock'),
      'Migration must enforce strict RLS, append-only audit triggers, and server-only RPCs'
    );
    assert(
      !/grant\s+select\s+on\s+table\s+public\.external_integrations\s+to\s+authenticated/i.test(sql),
      'authenticated must only have column-level SELECT excluding encrypted_credentials'
    );

    // Targeted verification of public.import_external_omnichannel_order p_integration_id validation
    const importRpcMatch = sql.match(
      /create or replace function public\.import_external_omnichannel_order[\s\S]*?\$\$;/i
    );
    assert(importRpcMatch, 'Migration must define public.import_external_omnichannel_order');
    const importRpcBody = importRpcMatch![0];

    const guardNullIdx = importRpcBody.indexOf('if p_integration_id is not null then');
    const blankCheckIdx = importRpcBody.indexOf('if v_integration_id is null then');
    const lookupIdx = importRpcBody.indexOf('from public.external_integrations ei');
    const tenantCheckIdx = importRpcBody.indexOf('if v_integration.user_id is distinct from p_user_id then');
    const providerCheckIdx = importRpcBody.indexOf('if v_integration.provider is distinct from v_ext_source then');
    const statusCheckIdx = importRpcBody.indexOf("if v_integration.status is distinct from 'connected' then");

    const subCheckIdx = importRpcBody.indexOf('from public.subscriptions s');
    const dedupCheckIdx = importRpcBody.indexOf('from public.omnichannel_orders');
    const insertOrderIdx = importRpcBody.indexOf('insert into public.omnichannel_orders');
    const insertAuditIdx = importRpcBody.indexOf('insert into public.order_audit_logs');

    assert(guardNullIdx !== -1, 'import_external_omnichannel_order must preserve null p_integration_id path and validate non-null p_integration_id');
    assert(blankCheckIdx > guardNullIdx, 'Blank non-null p_integration_id must be rejected');
    assert(lookupIdx > blankCheckIdx, 'Must look up integration in public.external_integrations');
    assert(tenantCheckIdx > lookupIdx, 'Must verify integration user_id equals p_user_id');
    assert(providerCheckIdx > lookupIdx, 'Must verify integration provider equals p_external_source');
    assert(statusCheckIdx > lookupIdx, 'Must verify integration status is connected');

    const latestValidationIdx = Math.max(tenantCheckIdx, providerCheckIdx, statusCheckIdx);
    assert(
      latestValidationIdx < subCheckIdx &&
        latestValidationIdx < dedupCheckIdx &&
        latestValidationIdx < insertOrderIdx &&
        latestValidationIdx < insertAuditIdx,
      'Integration ID checks must reject before subscription reads, deduplication, order insert, or audit insert'
    );
    assert(
      importRpcBody.includes('v_integration_id,') &&
        !importRpcBody.includes("nullif(btrim(coalesce(p_integration_id, '')), ''),"),
      'Order insert must use validated v_integration_id'
    );
  }

  // 5. Regression Tests: import_external_omnichannel_order Integration ID Tenant Isolation
  {
    interface SimIntegrationRow {
      id: string;
      user_id: string;
      provider: 'shopify' | 'woocommerce' | 'custom_website';
      status: 'not_connected' | 'pending_authorization' | 'connected' | 'error' | 'disconnected';
      store_domain: string;
      display_name: string;
      api_key_masked: string;
      webhook_secret_hash: string | null;
      encrypted_credentials: string | null;
      scopes: string[];
      last_sync_at: string | null;
      last_sync_status: string;
      last_error: string | null;
      metadata: Record<string, unknown>;
      connected_at: string | null;
      disconnected_at: string | null;
      created_at: string;
      updated_at: string;
    }

    const tenantAId = '11111111-1111-4111-8111-111111111111';
    const tenantBId = '22222222-2222-4222-8222-222222222222';
    const nowIso = new Date().toISOString();

    const integrationsTable: SimIntegrationRow[] = [
      {
        id: 'int-a-shopify-connected',
        user_id: tenantAId,
        provider: 'shopify',
        status: 'connected',
        store_domain: 'alpha-rpc.myshopify.com',
        display_name: 'Alpha Shopify',
        api_key_masked: 'shpat_****',
        webhook_secret_hash: null,
        encrypted_credentials: encryptIntegrationSecret(
          JSON.stringify({ accessToken: 'shpat_rpc_test' }),
          { encryptionKey: 'rpc-test-enc-key' }
        ),
        scopes: ['read_orders'],
        last_sync_at: null,
        last_sync_status: 'never',
        last_error: null,
        metadata: {},
        connected_at: nowIso,
        disconnected_at: null,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: 'int-a-woo-connected',
        user_id: tenantAId,
        provider: 'woocommerce',
        status: 'connected',
        store_domain: 'woo-a.example.com',
        display_name: 'Alpha Woo',
        api_key_masked: 'ck_****',
        webhook_secret_hash: null,
        encrypted_credentials: null,
        scopes: [],
        last_sync_at: null,
        last_sync_status: 'never',
        last_error: null,
        metadata: {},
        connected_at: nowIso,
        disconnected_at: null,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: 'int-a-shopify-disconnected',
        user_id: tenantAId,
        provider: 'shopify',
        status: 'disconnected',
        store_domain: 'old-alpha.myshopify.com',
        display_name: 'Old Alpha Shopify',
        api_key_masked: 'shpat_****',
        webhook_secret_hash: null,
        encrypted_credentials: null,
        scopes: [],
        last_sync_at: null,
        last_sync_status: 'never',
        last_error: null,
        metadata: {},
        connected_at: nowIso,
        disconnected_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: 'int-b-shopify-connected',
        user_id: tenantBId,
        provider: 'shopify',
        status: 'connected',
        store_domain: 'beta-rpc.myshopify.com',
        display_name: 'Beta Shopify',
        api_key_masked: 'shpat_****',
        webhook_secret_hash: null,
        encrypted_credentials: null,
        scopes: [],
        last_sync_at: null,
        last_sync_status: 'never',
        last_error: null,
        metadata: {},
        connected_at: nowIso,
        disconnected_at: null,
        created_at: nowIso,
        updated_at: nowIso,
      },
    ];

    const productsTable = [
      {
        id: 'prod-a-sugar',
        user_id: tenantAId,
        sku: 'PAN-SUGAR',
        barcode: '8961001001',
        name_en: 'Refined Cane Sugar',
        name_ur: 'چینی',
        category: 'pantry',
        price: 160,
        cost: 130,
        tax_rate: 0,
        selling_unit: 'kg',
        stock: 15,
        branch_stock: { 'branch-a-main': 15 },
        image: '',
      },
    ];

    const branchesTable = [
      {
        id: 'branch-a-main',
        user_id: tenantAId,
        name: 'Main Branch',
        code: 'MAIN',
        address: 'Lahore',
        phone: '03001112222',
        is_main: true,
        is_active: true,
        created_at: nowIso,
      },
    ];

    const omnichannelOrdersTable: Array<Record<string, unknown>> = [];
    const orderAuditLogsTable: Array<Record<string, unknown>> = [];
    const webhookEventsTable: Array<Record<string, unknown>> = [];
    const mappingsTable: Array<Record<string, unknown>> = [];

    // Mirrors public.import_external_omnichannel_order SQL contract
    function simulateImportExternalOrderRpc(params: Record<string, unknown>): {
      data: Record<string, unknown> | null;
      error: { message: string; code?: string } | null;
    } {
      const pUserId = params.p_user_id as string | null;
      const pChannel = String(params.p_channel ?? '').trim().toLowerCase();
      const pExternalSource = String(params.p_external_source ?? '').trim().toLowerCase();
      const pExternalOrderId = String(params.p_external_order_id ?? '').trim();
      const rawIntegrationId = params.p_integration_id;

      if (!pUserId) {
        return { data: null, error: { code: '22004', message: 'Tenant user_id is required.' } };
      }
      if (
        !['shopify', 'woocommerce', 'custom_website'].includes(pChannel) ||
        !['shopify', 'woocommerce', 'custom_website'].includes(pExternalSource) ||
        !pExternalOrderId
      ) {
        return {
          data: {
            ok: false,
            code: 'INVALID_EXTERNAL_SOURCE',
            error: 'Valid external source and external order ID are required.',
          },
          error: null,
        };
      }

      let validatedIntegrationId: string | null = null;
      if (rawIntegrationId !== null && rawIntegrationId !== undefined) {
        const trimmed = String(rawIntegrationId).trim();
        if (!trimmed) {
          return {
            data: {
              ok: false,
              code: 'INVALID_INTEGRATION',
              error: 'Integration ID cannot be blank when provided.',
            },
            error: null,
          };
        }

        const integrationRow = integrationsTable.find((row) => row.id === trimmed);
        if (!integrationRow) {
          return {
            data: {
              ok: false,
              code: 'INVALID_INTEGRATION',
              error: 'External integration record does not exist.',
            },
            error: null,
          };
        }
        if (integrationRow.user_id !== pUserId) {
          return {
            data: {
              ok: false,
              code: 'INTEGRATION_TENANT_MISMATCH',
              error: 'Integration does not belong to the target tenant.',
            },
            error: null,
          };
        }
        if (integrationRow.provider !== pExternalSource) {
          return {
            data: {
              ok: false,
              code: 'INTEGRATION_PROVIDER_MISMATCH',
              error: 'Integration provider does not match the external order source.',
            },
            error: null,
          };
        }
        if (integrationRow.status !== 'connected') {
          return {
            data: {
              ok: false,
              code: 'INTEGRATION_NOT_CONNECTED',
              error: 'External integration must be in connected status.',
            },
            error: null,
          };
        }
        validatedIntegrationId = integrationRow.id;
      }

      const existingOrder = omnichannelOrdersTable.find(
        (o) =>
          o.user_id === pUserId &&
          o.external_source === pExternalSource &&
          o.external_order_id === pExternalOrderId
      );
      if (existingOrder) {
        return {
          data: { ok: true, deduplicated: true, order: existingOrder },
          error: null,
        };
      }

      const itemsInput = Array.isArray(params.p_items)
        ? (params.p_items as Array<{ productId: string; quantity: number }>)
        : [];
      if (itemsInput.length === 0) {
        return {
          data: {
            ok: false,
            code: 'EMPTY_ITEMS',
            error: 'External order must include at least one valid line item.',
          },
          error: null,
        };
      }

      let subtotal = 0;
      const resolvedItems: Array<Record<string, unknown>> = [];
      for (const line of itemsInput) {
        const prod = productsTable.find(
          (p) => p.id === String(line.productId || '').trim() && p.user_id === pUserId
        );
        if (!prod) {
          return {
            data: {
              ok: false,
              code: 'PRODUCT_NOT_FOUND',
              error: `Mapped product (${line.productId}) does not belong to this shop.`,
            },
            error: null,
          };
        }
        const qty = Number(line.quantity || 0);
        if (!Number.isFinite(qty) || qty <= 0) {
          return {
            data: { ok: false, code: 'INVALID_QUANTITY', error: 'Invalid item quantity.' },
            error: null,
          };
        }
        const lineTotal = Math.round(prod.price * qty * 100) / 100;
        subtotal += lineTotal;
        resolvedItems.push({
          productId: prod.id,
          sku: prod.sku,
          nameEn: prod.name_en,
          nameUr: prod.name_ur,
          category: prod.category,
          sellingUnit: prod.selling_unit,
          quantity: qty,
          unitPrice: prod.price,
          taxRate: prod.tax_rate,
          lineTotal,
        });
      }

      const orderId = `omni-${crypto.randomUUID()}`;
      const orderNumber = String(params.p_order_number || `EXT-${omnichannelOrdersTable.length + 1}`);
      const createdOrder: Record<string, unknown> = {
        id: orderId,
        user_id: pUserId,
        branch_id: 'branch-a-main',
        branch_name: 'Main Branch',
        order_number: orderNumber,
        channel: pChannel,
        status: 'new',
        customer_name: params.p_customer_name || 'External Store Customer',
        customer_phone: params.p_customer_phone || 'N/A',
        delivery_address: params.p_delivery_address || 'External Delivery',
        notes: params.p_notes || '',
        items: resolvedItems,
        subtotal,
        discount_amount: 0,
        tax_amount: 0,
        total: subtotal,
        payment_method: params.p_payment_method || 'online',
        payment_status: params.p_payment_status || 'paid',
        paid_amount: Number(params.p_paid_amount || 0),
        idempotency_key: params.p_idempotency_key ?? null,
        external_source: pExternalSource,
        external_order_id: pExternalOrderId,
        external_order_number: params.p_external_order_number ?? null,
        integration_id: validatedIntegrationId,
        stock_reserved: false,
        status_history: [],
        notification_log: [],
        created_by: pExternalSource,
        updated_by: pExternalSource,
        created_at: nowIso,
        updated_at: nowIso,
      };
      omnichannelOrdersTable.push(createdOrder);
      orderAuditLogsTable.push({
        id: `oaud-${crypto.randomUUID()}`,
        user_id: pUserId,
        order_id: orderId,
        action: `${pExternalSource}_order_imported`,
        new_status: 'new',
        created_at: nowIso,
      });

      return {
        data: { ok: true, deduplicated: false, order: createdOrder },
        error: null,
      };
    }

    // 5a. Cross-tenant integration ID rejected before any order or audit mutation
    const crossTenantRpc = simulateImportExternalOrderRpc({
      p_user_id: tenantAId,
      p_channel: 'shopify',
      p_external_source: 'shopify',
      p_external_order_id: 'ext-cross-tenant-int',
      p_integration_id: 'int-b-shopify-connected',
      p_items: [{ productId: 'prod-a-sugar', quantity: 1 }],
    });
    assertEqual(crossTenantRpc.data?.ok, false, 'Cross-tenant integration ID must fail');
    assertEqual(
      crossTenantRpc.data?.code,
      'INTEGRATION_TENANT_MISMATCH',
      'Cross-tenant integration ID must return INTEGRATION_TENANT_MISMATCH'
    );
    assertEqual(omnichannelOrdersTable.length, 0, 'Cross-tenant failure must not insert orders');
    assertEqual(orderAuditLogsTable.length, 0, 'Cross-tenant failure must not insert audit logs');

    // 5b. Mismatched provider rejected before any order or audit mutation
    const mismatchProviderRpc = simulateImportExternalOrderRpc({
      p_user_id: tenantAId,
      p_channel: 'shopify',
      p_external_source: 'shopify',
      p_external_order_id: 'ext-provider-mismatch',
      p_integration_id: 'int-a-woo-connected',
      p_items: [{ productId: 'prod-a-sugar', quantity: 1 }],
    });
    assertEqual(mismatchProviderRpc.data?.ok, false, 'Mismatched provider integration ID must fail');
    assertEqual(
      mismatchProviderRpc.data?.code,
      'INTEGRATION_PROVIDER_MISMATCH',
      'Mismatched provider must return INTEGRATION_PROVIDER_MISMATCH'
    );
    assertEqual(omnichannelOrdersTable.length, 0, 'Provider mismatch must not insert orders');
    assertEqual(orderAuditLogsTable.length, 0, 'Provider mismatch must not insert audit logs');

    // 5c. Disconnected integration rejected before any order or audit mutation
    const disconnectedRpc = simulateImportExternalOrderRpc({
      p_user_id: tenantAId,
      p_channel: 'shopify',
      p_external_source: 'shopify',
      p_external_order_id: 'ext-disconnected-int',
      p_integration_id: 'int-a-shopify-disconnected',
      p_items: [{ productId: 'prod-a-sugar', quantity: 1 }],
    });
    assertEqual(disconnectedRpc.data?.ok, false, 'Disconnected integration ID must fail');
    assertEqual(
      disconnectedRpc.data?.code,
      'INTEGRATION_NOT_CONNECTED',
      'Disconnected integration must return INTEGRATION_NOT_CONNECTED'
    );
    assertEqual(omnichannelOrdersTable.length, 0, 'Disconnected integration must not insert orders');
    assertEqual(orderAuditLogsTable.length, 0, 'Disconnected integration must not insert audit logs');

    // 5d. Non-existent and blank non-null integration IDs rejected without mutations
    const missingIntRpc = simulateImportExternalOrderRpc({
      p_user_id: tenantAId,
      p_channel: 'shopify',
      p_external_source: 'shopify',
      p_external_order_id: 'ext-missing-int',
      p_integration_id: 'int-nonexistent',
      p_items: [{ productId: 'prod-a-sugar', quantity: 1 }],
    });
    assertEqual(missingIntRpc.data?.ok, false, 'Non-existent integration ID must fail');
    assertEqual(missingIntRpc.data?.code, 'INVALID_INTEGRATION', 'Missing integration must return INVALID_INTEGRATION');

    const blankIntRpc = simulateImportExternalOrderRpc({
      p_user_id: tenantAId,
      p_channel: 'shopify',
      p_external_source: 'shopify',
      p_external_order_id: 'ext-blank-int',
      p_integration_id: '   ',
      p_items: [{ productId: 'prod-a-sugar', quantity: 1 }],
    });
    assertEqual(blankIntRpc.data?.ok, false, 'Blank non-null integration ID must fail');
    assertEqual(blankIntRpc.data?.code, 'INVALID_INTEGRATION', 'Blank integration ID must return INVALID_INTEGRATION');
    assertEqual(omnichannelOrdersTable.length, 0, 'Invalid integration IDs must leave orders empty');
    assertEqual(orderAuditLogsTable.length, 0, 'Invalid integration IDs must leave audit logs empty');

    // 5e. Explicitly null p_integration_id preserves existing supported null workflow
    const nullIntRpc = simulateImportExternalOrderRpc({
      p_user_id: tenantAId,
      p_channel: 'custom_website',
      p_external_source: 'custom_website',
      p_external_order_id: 'ext-explicit-null-int',
      p_integration_id: null,
      p_items: [{ productId: 'prod-a-sugar', quantity: 1 }],
    });
    assertEqual(nullIntRpc.data?.ok, true, 'Intentionally null p_integration_id workflow must remain supported');
    assertEqual(
      (nullIntRpc.data?.order as Record<string, unknown>)?.integration_id,
      null,
      'Explicit null workflow must store null integration_id'
    );
    assertEqual(omnichannelOrdersTable.length, 1, 'Null workflow should create 1 order');
    assertEqual(orderAuditLogsTable.length, 1, 'Null workflow should create 1 audit log');

    // 5f. Valid connected integration ID succeeds end-to-end via server webhook -> Supabase RPC mock
    const rpcInvocations: Array<{ fn: string; params: Record<string, unknown> }> = [];
    const mockSupabase = {
      from(table: string) {
        const filters: Array<[string, unknown]> = [];
        let pendingInsert: Record<string, unknown> | null = null;
        const builder = {
          select() {
            return builder;
          },
          eq(col: string, val: unknown) {
            filters.push([col, val]);
            return builder;
          },
          insert(row: Record<string, unknown>) {
            pendingInsert = row;
            if (table === 'integration_webhook_events') {
              webhookEventsTable.push(row);
            }
            return { error: null };
          },
          async maybeSingle() {
            if (table === 'external_integrations') {
              const found = integrationsTable.find((r) =>
                filters.every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v)
              );
              return { data: found ?? null, error: null };
            }
            return { data: null, error: null };
          },
          then(
            resolve: (val: { data: unknown; error: null }) => unknown,
            reject?: (err: unknown) => unknown
          ) {
            let data: unknown = [];
            if (table === 'products') {
              data = productsTable.filter((r) =>
                filters.every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v)
              );
            } else if (table === 'branches') {
              data = branchesTable.filter((r) =>
                filters.every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v)
              );
            } else if (table === 'external_product_mappings') {
              data = mappingsTable.filter((r) =>
                filters.every(([c, v]) => r[c] === v)
              );
            } else if (pendingInsert) {
              data = [pendingInsert];
            }
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          },
        };
        return builder;
      },
      async rpc(fn: string, params: Record<string, unknown>) {
        rpcInvocations.push({ fn, params });
        if (fn === 'import_external_omnichannel_order') {
          return simulateImportExternalOrderRpc(params);
        }
        return { data: null, error: { message: `Unexpected RPC ${fn}` } };
      },
    } as unknown as SupabaseClient;

    const rpcShopifySecret = 'shpss_rpc_test_secret_123';
    const rpcApp = express();
    rpcApp.use(
      express.json({
        verify: (req, _res, buf) => {
          (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
        },
      })
    );
    registerExternalIntegrationRoutes(rpcApp, {
      adminSupabase: mockSupabase,
      env: {
        appUrl: 'https://ais-dev-test.example.run.app',
        shopifyApiKey: 'shp_key_rpc',
        shopifyApiSecret: rpcShopifySecret,
        encryptionKey: 'rpc-test-enc-key',
      },
      authenticateReq: async () => null,
      checkOpAccess: async () => ({ allowed: true, status: 'active' }),
      resolveStaff: async () => ({ role: 'admin', employeeId: 'emp-a', employeeName: 'Admin' }),
    });

    const rpcSrv = await new Promise<http.Server>((resolve) => {
      const s = rpcApp.listen(0, '127.0.0.1', () => resolve(s));
    });
    const rpcPort = (rpcSrv.address() as { port: number }).port;
    const rpcBaseUrl = `http://127.0.0.1:${rpcPort}`;

    try {
      const validWhPayload = JSON.stringify({
        id: 991001,
        name: '#RPC-1001',
        financial_status: 'paid',
        total_price: '320.00',
        shipping_address: {
          name: 'Ayesha Malik',
          phone: '03001119988',
          address1: 'Gulberg III',
          city: 'Lahore',
        },
        line_items: [{ product_id: 1001, variant_id: 2001, sku: 'PAN-SUGAR', quantity: 2 }],
      });
      const validWhHmac = crypto
        .createHmac('sha256', rpcShopifySecret)
        .update(Buffer.from(validWhPayload, 'utf8'))
        .digest('base64');

      const validWhRes = await requestHttp(
        rpcBaseUrl,
        'POST',
        '/api/integrations/shopify/webhooks',
        validWhPayload,
        {
          'x-shopify-hmac-sha256': validWhHmac,
          'x-shopify-topic': 'orders/create',
          'x-shopify-shop-domain': 'alpha-rpc.myshopify.com',
          'x-shopify-webhook-id': 'wh-rpc-991001',
        }
      );
      assertEqual(validWhRes.status, 201, 'Valid connected Shopify integration webhook must import order via RPC');
      assertEqual(rpcInvocations.length, 1, 'Webhook must invoke import_external_omnichannel_order RPC once');
      assertEqual(
        rpcInvocations[0].params.p_integration_id,
        'int-a-shopify-connected',
        'Webhook must pass connected tenant integration ID to RPC'
      );
      assertEqual(
        (validWhRes.json.order as { integrationId?: string })?.integrationId,
        'int-a-shopify-connected',
        'Imported order must persist verified integration_id'
      );
      assertEqual(omnichannelOrdersTable.length, 2, 'Valid RPC import should persist order');
      assertEqual(orderAuditLogsTable.length, 2, 'Valid RPC import should persist audit log');

      // Re-verify that passing an existing order external_order_id with a cross-tenant integration_id still rejects BEFORE dedup
      const dedupBypassAttempt = simulateImportExternalOrderRpc({
        p_user_id: tenantAId,
        p_channel: 'shopify',
        p_external_source: 'shopify',
        p_external_order_id: '991001',
        p_integration_id: 'int-b-shopify-connected',
        p_items: [{ productId: 'prod-a-sugar', quantity: 2 }],
      });
      assertEqual(dedupBypassAttempt.data?.ok, false, 'Cross-tenant integration ID must reject even if external_order_id already exists');
      assertEqual(
        dedupBypassAttempt.data?.code,
        'INTEGRATION_TENANT_MISMATCH',
        'Must return INTEGRATION_TENANT_MISMATCH before deduplication'
      );
    } finally {
      await new Promise<void>((resolve) => rpcSrv.close(() => resolve()));
    }
  }

  console.log('All External E-Commerce Integrations tests passed!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
