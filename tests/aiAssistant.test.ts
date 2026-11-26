// OpenRouter AI Assistant security, RBAC, tenant isolation, streaming, caching, validation, and quota tests.
// Run with: npx tsx tests/aiAssistant.test.ts

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  AiProviderError,
  DEFAULT_AI_ASSISTANT_MODEL,
  OPENROUTER_CHAT_COMPLETIONS_URL,
  isSafeCacheablePosQuery,
  type OpenRouterMessage,
} from '../serverAiAssistant';
import { createPosExpressApp, type CreatePosExpressAppOptions } from '../serverApp';
import {
  buildPosAssistantSystemPrompt,
  sanitizeTextForAi,
  SMARTBITZ_POS_KNOWLEDGE_MODULES,
} from '../src/lib/posKnowledgeBase';
import type { EmployeeRole } from '../src/types';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} (expected=${String(expected)}, actual=${String(actual)})`);
  }
}

function collectFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

async function withServer(
  options: CreatePosExpressAppOptions | undefined,
  fn: (baseUrl: string) => Promise<void>
): Promise<void> {
  const app = createPosExpressApp(options);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to bind ephemeral port.');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function requestJson(
  baseUrl: string,
  method: string,
  urlPath: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<{ status: number; headers: Headers; json: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, headers: res.headers, json };
}

async function requestSse(
  baseUrl: string,
  urlPath: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<{
  status: number;
  chunks: Array<{ delta: string; model?: string }>;
  done: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
}> {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
      ...(headers || {}),
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  const blocks = raw.split(/\r?\n\r?\n/).filter((b) => b.trim());
  const chunks: Array<{ delta: string; model?: string }> = [];
  let done: Record<string, unknown> | null = null;
  let error: Record<string, unknown> | null = null;

  for (const block of blocks) {
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) continue;
    const payload = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
    if (eventName === 'chunk') {
      chunks.push({
        delta: String(payload.delta ?? ''),
        model: typeof payload.model === 'string' ? payload.model : undefined,
      });
    } else if (eventName === 'done') {
      done = payload;
    } else if (eventName === 'error') {
      error = payload;
    }
  }
  return { status: res.status, chunks, done, error };
}

const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

async function runTests(): Promise<void> {
  // 1. OpenRouter Migration & Client/Server Boundary Checks
  const srcFiles = collectFiles(path.resolve(process.cwd(), 'src'));
  for (const filePath of srcFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert(!content.includes('@google/genai'), `${filePath} must never import @google/genai`);
    assert(!content.includes('GEMINI_API_KEY'), `${filePath} must never reference GEMINI_API_KEY`);
    assert(!content.includes('OPENROUTER_API_KEY'), `${filePath} must never reference OPENROUTER_API_KEY`);
  }

  const serverAiSource = fs.readFileSync(
    path.resolve(process.cwd(), 'serverAiAssistant.ts'),
    'utf8'
  );
  assert(!serverAiSource.includes('@google/genai'), 'serverAiAssistant.ts must not import @google/genai');
  assert(!serverAiSource.includes('GEMINI_API_KEY'), 'serverAiAssistant.ts must not require GEMINI_API_KEY');
  assertEqual(
    OPENROUTER_CHAT_COMPLETIONS_URL,
    'https://openrouter.ai/api/v1/chat/completions',
    'OpenRouter endpoint mismatch'
  );
  assertEqual(
    DEFAULT_AI_ASSISTANT_MODEL,
    'openrouter/free',
    'Default model must be openrouter/free'
  );

  // 2. Knowledge Base, Token Reduction, Redaction & Safe Cache Guards
  const expectedDomains = [
    'pos_billing',
    'barcode_qr_scanner',
    'inventory_products',
    'cash_drawer_shifts',
    'purchases_suppliers',
    'customers_udhaar',
    'returns_refunds',
    'expenses',
    'analytics_reports',
    'staff_permissions',
    'branch_management',
    'online_orders_sync',
  ];
  for (const domainId of expectedDomains) {
    assert(
      SMARTBITZ_POS_KNOWLEDGE_MODULES.some((m) => m.id === domainId),
      `Knowledge base missing required POS domain: ${domainId}`
    );
  }

  const fullPrompt = buildPosAssistantSystemPrompt({
    staffRole: 'admin',
    shopName: 'Khaas Store',
    languageMode: 'en',
  });
  const targetedPrompt = buildPosAssistantSystemPrompt({
    staffRole: 'admin',
    shopName: 'Khaas Store',
    languageMode: 'en',
    prompt: 'How do I receive an Udhaar payment from a customer?',
  });
  assert(
    targetedPrompt.length < fullPrompt.length * 0.8,
    `Targeted prompt should significantly reduce tokens (${targetedPrompt.length} vs ${fullPrompt.length})`
  );
  assert(
    targetedPrompt.includes('no public e-commerce storefront exists'),
    'Compact prompt must preserve online storefront limitation'
  );

  assert(
    isSafeCacheablePosQuery({
      prompt: 'How do I close a cash drawer shift?',
      languageMode: 'en',
      history: [],
      attachment: null,
      stream: false,
    }),
    'Generic how-to query should be eligible for safe cache'
  );
  assert(
    !isSafeCacheablePosQuery({
      prompt: 'Check balance for customer Ahmed Rs. 5000',
      languageMode: 'en',
      history: [],
      attachment: null,
      stream: false,
    }),
    'Customer/currency query must NEVER be cached'
  );
  assert(
    !isSafeCacheablePosQuery({
      prompt: 'Analyze screenshot',
      languageMode: 'en',
      history: [],
      attachment: { mimeType: 'image/png', base64Data: VALID_PNG_BASE64, sizeBytes: 64 },
      stream: false,
    }),
    'Screenshot query must NEVER be cached'
  );

  const dirtyText =
    'Error with token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OCJ9.signatureHere and pin=4821 and api_key=sk-or-v1-dummysecretkeyvalue123456 and cnic 35202-1234567-1 and hash pbkdf2_sha256$10000$salt$hash';
  const redacted = sanitizeTextForAi(dirtyText);
  assert(!redacted.includes('4821'), 'PIN must be redacted');
  assert(!redacted.includes('sk-or-v1-dummysecretkeyvalue123456'), 'API key must be redacted');
  assert(!redacted.includes('35202-1234567-1'), 'CNIC must be redacted');
  assert(!redacted.includes('signatureHere'), 'JWT must be redacted');
  assert(!redacted.includes('pbkdf2_sha256$'), 'PBKDF2 hash must be redacted');

  const cashierPrompt = buildPosAssistantSystemPrompt({
    staffRole: 'cashier',
    shopName: 'Al-Madina Mart',
    languageMode: 'roman_ur',
    prompt: 'Udhaar payment receive kaise karein?',
  });
  assert(cashierPrompt.includes('Roman Urdu'), 'Prompt should enforce Roman Urdu when requested');
  assert(
    cashierPrompt.includes('RESTRICTED MODULES REQUIRING HIGHER ROLE:'),
    'Cashier prompt should enumerate restricted admin/manager modules'
  );

  // 3. Unauthenticated Fail-Closed Behavior
  await withServer(undefined, async (baseUrl) => {
    const health = await requestJson(baseUrl, 'GET', '/api/health');
    assertEqual(health.status, 200, 'Health endpoint should return 200');
    assert(typeof health.json.aiConfigured === 'boolean', 'Health should report aiConfigured boolean');

    const statusUnauth = await requestJson(baseUrl, 'GET', '/api/ai/status');
    assertEqual(statusUnauth.status, 401, 'GET /api/ai/status must reject unauthenticated requests');

    const assistUnauth = await requestJson(baseUrl, 'POST', '/api/ai/assist', {
      prompt: 'How do I make a sale?',
    });
    assertEqual(assistUnauth.status, 401, 'POST /api/ai/assist must reject unauthenticated requests');
  });

  // 4. Tenant Isolation, Suspended Store, Staff Session & RBAC Enforcement
  const mockAuth = async (req: { header: (name: string) => string | undefined }) => {
    const tenant = (req.header('x-test-tenant') || '').trim();
    if (!tenant) return null;
    return {
      id: tenant,
      email: `${tenant}@store.test`,
      emailConfirmed: true,
      jwt: `jwt-${tenant}`,
    };
  };

  await withServer(
    {
      aiEnv: {
        OPENROUTER_API_KEY: 'sk-or-v1-test_server_key_value_12345',
        AI_ASSISTANT_ENABLED: 'true',
      },
      authenticateOverride: mockAuth,
      tenantAccessOverride: async (user) =>
        user.id === 'tenant-suspended'
          ? { allowed: false, status: 'suspended' }
          : { allowed: true, status: 'active' },
      staffRoleOverride: async (req) => {
        const role = (req.header('x-test-role') || '').trim() as EmployeeRole;
        if (!role) return { role: null, employeeId: null };
        return { role, employeeId: `emp-${role}` };
      },
    },
    async (baseUrl) => {
      const suspendedRes = await requestJson(
        baseUrl,
        'POST',
        '/api/ai/assist',
        { prompt: 'Help' },
        { 'x-test-tenant': 'tenant-suspended', 'x-test-role': 'admin' }
      );
      assertEqual(suspendedRes.status, 403, 'Suspended tenant must be blocked from AI Assistant');

      const missingStaffRes = await requestJson(
        baseUrl,
        'POST',
        '/api/ai/assist',
        { prompt: 'Help' },
        { 'x-test-tenant': 'tenant-a' }
      );
      assertEqual(missingStaffRes.status, 401, 'Missing verified staff PIN session must return 401');

      const restrictedPermRes = await requestJson(
        baseUrl,
        'POST',
        '/api/ai/assist',
        { prompt: 'Help' },
        { 'x-test-tenant': 'tenant-a', 'x-test-role': 'guest' }
      );
      assertEqual(
        restrictedPermRes.status,
        403,
        'Unauthorized role without ai.assist permission must return 403'
      );

      const restrictedStatusRes = await requestJson(
        baseUrl,
        'GET',
        '/api/ai/status',
        undefined,
        { 'x-test-tenant': 'tenant-a', 'x-test-role': 'guest' }
      );
      assertEqual(
        restrictedStatusRes.status,
        403,
        'Unauthorized role without ai.assist permission must return 403 on status'
      );
    }
  );

  // 5. Missing OPENROUTER_API_KEY / Disabled Config Returns Clean 503
  await withServer(
    {
      aiEnv: {
        OPENROUTER_API_KEY: '',
        AI_ASSISTANT_ENABLED: 'true',
      },
      authenticateOverride: mockAuth,
      tenantAccessOverride: async () => ({ allowed: true, status: 'active' }),
      staffRoleOverride: async () => ({ role: 'admin', employeeId: 'emp-admin' }),
    },
    async (baseUrl) => {
      const st = await requestJson(baseUrl, 'GET', '/api/ai/status', undefined, {
        'x-test-tenant': 'tenant-a',
      });
      assertEqual(st.status, 200, 'Status should return 200 even when key missing');
      assertEqual(st.json.available, false, 'available must be false when OPENROUTER_API_KEY missing');
      assertEqual(st.json.configured, false, 'configured must be false when OPENROUTER_API_KEY missing');
      assertEqual(st.json.model, 'openrouter/free', 'Model should default to openrouter/free');

      const res = await requestJson(
        baseUrl,
        'POST',
        '/api/ai/assist',
        { prompt: 'How to add product?' },
        { 'x-test-tenant': 'tenant-a' }
      );
      assertEqual(res.status, 503, 'Missing API key should return 503');
      assertEqual(res.json.code, 'AI_NOT_CONFIGURED', 'Missing API key error code mismatch');
    }
  );

  await withServer(
    {
      aiEnv: {
        OPENROUTER_API_KEY: 'sk-or-v1-test_server_key_value_12345',
        AI_ASSISTANT_ENABLED: 'false',
      },
      authenticateOverride: mockAuth,
      tenantAccessOverride: async () => ({ allowed: true, status: 'active' }),
      staffRoleOverride: async () => ({ role: 'admin', employeeId: 'emp-admin' }),
    },
    async (baseUrl) => {
      const res = await requestJson(
        baseUrl,
        'POST',
        '/api/ai/assist',
        { prompt: 'How to add product?' },
        { 'x-test-tenant': 'tenant-a' }
      );
      assertEqual(res.status, 503, 'Disabled AI assistant should return 503');
      assertEqual(res.json.code, 'AI_DISABLED', 'Disabled AI error code mismatch');
    }
  );

  // 6. Multilingual Queries, Streaming SSE, History Trim, Caching, Vision Validation, Quota & Tenant Isolation
  const capturedCalls: Array<{
    model: string;
    messages: OpenRouterMessage[];
    stream: boolean;
  }> = [];

  await withServer(
    {
      aiEnv: {
        OPENROUTER_API_KEY: 'sk-or-v1-test_server_key_value_12345',
        AI_ASSISTANT_ENABLED: 'true',
        AI_ASSISTANT_DAILY_LIMIT_PER_TENANT: '5',
        AI_ASSISTANT_RATE_LIMIT_PER_MINUTE: '10',
        AI_ASSISTANT_MAX_IMAGE_BYTES: String(262144),
      },
      authenticateOverride: mockAuth,
      tenantAccessOverride: async () => ({ allowed: true, status: 'active' }),
      staffRoleOverride: async (req) => ({
        role: ((req.header('x-test-role') || 'admin').trim() as EmployeeRole),
        employeeId: 'emp-1',
      }),
      aiGenerator: async (params) => {
        capturedCalls.push({
          model: params.model,
          messages: params.messages,
          stream: params.stream,
        });
        const sys = String(params.messages[0]?.content ?? '');
        const reply = sys.includes('اردو script')
          ? '1. پوائنٹ آف سیل اسکرین کھولیں۔\n2. آئٹم منتخب کریں۔'
          : '1. Open POS Billing.\n2. Select items and click Complete Sale.';

        if (params.stream && params.onChunk) {
          const mid = Math.ceil(reply.length / 2);
          params.onChunk(reply.slice(0, mid), 'meta-llama/llama-3.3-70b-instruct:free');
          params.onChunk(reply.slice(mid), 'meta-llama/llama-3.3-70b-instruct:free');
        }
        return {
          reply,
          model: 'meta-llama/llama-3.3-70b-instruct:free',
        };
      },
    },
    async (baseUrl) => {
      // 6a. Invalid MIME type rejected (400)
      const badMime = await requestJson(
        baseUrl,
        'POST',
        '/api/ai/assist',
        {
          prompt: 'Check this file',
          attachment: { mimeType: 'application/pdf', base64Data: VALID_PNG_BASE64 },
        },
        { 'x-test-tenant': 'tenant-a' }
      );
      assertEqual(badMime.status, 400, 'PDF upload must be rejected with 400');

      // 6b. Invalid base64 rejected (400)
      const badBase64 = await requestJson(
        baseUrl,
        'POST',
        '/api/ai/assist',
        {
          prompt: 'Check this image',
          attachment: { mimeType: 'image/png', base64Data: 'not-valid-base64!!!' },
        },
        { 'x-test-tenant': 'tenant-a' }
      );
      assertEqual(badBase64.status, 400, 'Corrupted base64 image must be rejected with 400');

      // 6c. Oversized image rejected (413)
      const oversizedPayload = Buffer.alloc(300 * 1024, 1).toString('base64');
      const tooLarge = await requestJson(
        baseUrl,
        'POST',
        '/api/ai/assist',
        {
          prompt: 'Analyze large screenshot',
          attachment: { mimeType: 'image/png', base64Data: oversizedPayload },
        },
        { 'x-test-tenant': 'tenant-a' }
      );
      assertEqual(tooLarge.status, 413, 'Oversized image must be rejected with 413');

      // 6d. Valid Urdu text query + trimmed 6-turn history -> 4 kept + secret redaction (consumes 1/5)
      const urduQuery = await requestJson(
        baseUrl,
        'POST',
        '/api/ai/assist',
        {
          prompt: 'بل کیسے بنائیں؟ میرا pin=9988 ہے',
          languageMode: 'ur',
          history: [
            { role: 'user', text: 'turn-1' },
            { role: 'assistant', text: 'turn-2' },
            { role: 'user', text: 'turn-3' },
            { role: 'assistant', text: 'turn-4' },
            { role: 'user', text: 'turn-5' },
            { role: 'assistant', text: 'turn-6' },
          ],
          shopName: 'Khaas Mart',
          activeBranchName: 'Main Branch',
        },
        { 'x-test-tenant': 'tenant-a', 'x-test-role': 'cashier' }
      );
      assertEqual(urduQuery.status, 200, 'Valid Urdu query should return 200');
      assertEqual(urduQuery.json.ok, true, 'Urdu query ok should be true');
      const call0 = capturedCalls[0];
      assertEqual(call0.model, 'openrouter/free', 'Router model should be openrouter/free');
      const userPartsText = JSON.stringify(call0.messages);
      assert(!userPartsText.includes('9988'), 'Prompt passed to model must redact PIN digits');
      assert(!userPartsText.includes('turn-1'), 'Older history turns beyond last 4 must be trimmed');
      assertEqual(call0.messages.length, 6, '1 system + 4 recent history + 1 current user = 6 messages');

      // 6e. Valid PNG screenshot query (consumes 2/5)
      const imgQuery = await requestJson(
        baseUrl,
        'POST',
        '/api/ai/assist',
        {
          message: 'Explain this checkout error screen',
          language: 'en',
          attachment: { mimeType: 'image/png', base64Data: VALID_PNG_BASE64 },
        },
        { 'x-test-tenant': 'tenant-a', 'x-test-role': 'admin' }
      );
      assertEqual(imgQuery.status, 200, 'Valid PNG screenshot query should return 200');
      const imgUserMsg = capturedCalls[1].messages[1];
      assert(
        Array.isArray(imgUserMsg.content) &&
          imgUserMsg.content.some(
            (part) =>
              part.type === 'image_url' &&
              part.image_url.url.startsWith('data:image/png;base64,')
          ),
        'OpenAI-compatible image_url part must reach generator'
      );

      // 6f. Streaming SSE Roman Urdu query (consumes 3/5) + populates safe cache
      const sseQuery = await requestSse(
        baseUrl,
        '/api/ai/assist',
        {
          prompt: 'Udhaar payment receive karne ka tareeqa bataen',
          languageMode: 'roman_ur',
          stream: true,
        },
        { 'x-test-tenant': 'tenant-a', 'x-test-role': 'admin' }
      );
      assertEqual(sseQuery.status, 200, 'SSE stream should return 200');
      assert(sseQuery.chunks.length === 2, 'Expected 2 streamed chunks');
      assert(Boolean(sseQuery.done?.ok), 'Expected done SSE event');

      // 6g. Repeated safe generic query hits cache without invoking generator again (consumes 4/5)
      const callsBeforeCache = capturedCalls.length;
      const cachedQuery = await requestJson(
        baseUrl,
        'POST',
        '/api/ai/assist',
        {
          prompt: 'Udhaar payment receive karne ka tareeqa bataen',
          languageMode: 'roman_ur',
        },
        { 'x-test-tenant': 'tenant-a', 'x-test-role': 'admin' }
      );
      assertEqual(cachedQuery.status, 200, 'Cached query should return 200');
      assertEqual(cachedQuery.json.cached, true, 'Repeated generic POS query should hit safe cache');
      assertEqual(capturedCalls.length, callsBeforeCache, 'Cache hit must not call OpenRouter again');

      // 6h. 5th query (consumes 5/5) then 6th hits daily limit (429)
      const fifth = await requestJson(
        baseUrl,
        'POST',
        '/api/ai/assist',
        { prompt: 'How do expenses work in SmartBitz POS?' },
        { 'x-test-tenant': 'tenant-a' }
      );
      assertEqual(fifth.status, 200, '5th request should succeed');
      const limitHit = await requestJson(
        baseUrl,
        'POST',
        '/api/ai/assist',
        { prompt: 'One more question' },
        { 'x-test-tenant': 'tenant-a' }
      );
      assertEqual(limitHit.status, 429, 'Exceeding daily tenant limit must return 429');
      assertEqual(limitHit.json.code, 'DAILY_LIMIT_REACHED', 'Expected DAILY_LIMIT_REACHED');
      assert(Boolean(limitHit.headers.get('retry-after')), 'Retry-After header expected');

      // 6i. tenant-b still has full isolated quota!
      const tenantBStatus = await requestJson(baseUrl, 'GET', '/api/ai/status', undefined, {
        'x-test-tenant': 'tenant-b',
      });
      assertEqual(
        tenantBStatus.json.remainingToday,
        5,
        'tenant-b quota must remain completely isolated from tenant-a'
      );
      const tenantBQuery = await requestJson(
        baseUrl,
        'POST',
        '/api/ai/assist',
        { prompt: 'How do expenses work?' },
        { 'x-test-tenant': 'tenant-b' }
      );
      assertEqual(tenantBQuery.status, 200, 'tenant-b request must succeed independently');
    }
  );

  // 7. Unsupported Vision Model Fallback (422 + quota refund) & Timeout (504 + quota refund)
  await withServer(
    {
      aiEnv: {
        OPENROUTER_API_KEY: 'sk-or-v1-test_server_key_value_12345',
        AI_ASSISTANT_ENABLED: 'true',
        AI_ASSISTANT_DAILY_LIMIT_PER_TENANT: '10',
      },
      authenticateOverride: mockAuth,
      tenantAccessOverride: async () => ({ allowed: true, status: 'active' }),
      staffRoleOverride: async () => ({ role: 'admin', employeeId: 'emp-admin' }),
      aiGenerator: async () => {
        throw new AiProviderError('No endpoints found that support image input', {
          httpStatus: 404,
        });
      },
    },
    async (baseUrl) => {
      const visionRejected = await requestJson(
        baseUrl,
        'POST',
        '/api/ai/assist',
        {
          prompt: 'Read this screenshot',
          attachment: { mimeType: 'image/png', base64Data: VALID_PNG_BASE64 },
        },
        { 'x-test-tenant': 'tenant-vision' }
      );
      assertEqual(visionRejected.status, 422, 'Unsupported vision model must return 422');
      assertEqual(visionRejected.json.code, 'VISION_UNSUPPORTED', 'Expected VISION_UNSUPPORTED code');
      assertEqual(
        (visionRejected.json.usage as { remainingToday: number }).remainingToday,
        10,
        'Unsupported vision failure must refund daily quota'
      );
    }
  );

  await withServer(
    {
      aiEnv: {
        OPENROUTER_API_KEY: 'sk-or-v1-test_server_key_value_12345',
        AI_ASSISTANT_ENABLED: 'true',
        AI_ASSISTANT_DAILY_LIMIT_PER_TENANT: '10',
      },
      authenticateOverride: mockAuth,
      tenantAccessOverride: async () => ({ allowed: true, status: 'active' }),
      staffRoleOverride: async () => ({ role: 'admin', employeeId: 'emp-admin' }),
      aiGenerator: async () => {
        throw new AiProviderError('AI request timed out while waiting for the free model.', {
          httpStatus: 504,
          isTimeout: true,
        });
      },
    },
    async (baseUrl) => {
      const timedOut = await requestJson(
        baseUrl,
        'POST',
        '/api/ai/assist',
        { prompt: 'Trigger timeout' },
        { 'x-test-tenant': 'tenant-timeout' }
      );
      assertEqual(timedOut.status, 504, 'Upstream timeout should return 504');
      assertEqual(timedOut.json.code, 'AI_TIMEOUT', 'Expected AI_TIMEOUT');
      assertEqual(
        (timedOut.json.usage as { remainingToday: number }).remainingToday,
        10,
        'Timeout must refund daily quota cleanly'
      );
    }
  );

  // 8. Per-Minute Burst Rate Limit
  await withServer(
    {
      aiEnv: {
        OPENROUTER_API_KEY: 'sk-or-v1-test_server_key_value_12345',
        AI_ASSISTANT_ENABLED: 'true',
        AI_ASSISTANT_DAILY_LIMIT_PER_TENANT: '10',
        AI_ASSISTANT_RATE_LIMIT_PER_MINUTE: '2',
      },
      authenticateOverride: mockAuth,
      tenantAccessOverride: async () => ({ allowed: true, status: 'active' }),
      staffRoleOverride: async () => ({ role: 'admin', employeeId: 'emp-admin' }),
      aiGenerator: async () => ({ reply: 'OK', model: 'openrouter/free' }),
    },
    async (baseUrl) => {
      await requestJson(
        baseUrl,
        'POST',
        '/api/ai/assist',
        { prompt: 'Question alpha' },
        { 'x-test-tenant': 'tenant-burst' }
      );
      await requestJson(
        baseUrl,
        'POST',
        '/api/ai/assist',
        { prompt: 'Question beta' },
        { 'x-test-tenant': 'tenant-burst' }
      );
      const burstLimited = await requestJson(
        baseUrl,
        'POST',
        '/api/ai/assist',
        { prompt: 'Question gamma' },
        { 'x-test-tenant': 'tenant-burst' }
      );
      assertEqual(burstLimited.status, 429, 'Per-minute burst limit should return 429');
      assertEqual(burstLimited.json.code, 'RATE_LIMIT_EXCEEDED', 'Expected RATE_LIMIT_EXCEEDED');
    }
  );

  console.log('All OpenRouter AI Assistant tests passed.');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
