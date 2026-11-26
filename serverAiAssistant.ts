import {
  buildPosAssistantSystemPrompt,
  sanitizeTextForAi,
} from './src/lib/posKnowledgeBase';
import type {
  AiAssistantAllowedMimeType,
  AiAssistantHistoryTurn,
  AiAssistantLanguageMode,
  AiAssistantStatusResponse,
  EmployeeRole,
} from './src/types';

export const OPENROUTER_CHAT_COMPLETIONS_URL =
  'https://openrouter.ai/api/v1/chat/completions';
export const DEFAULT_AI_ASSISTANT_MODEL = 'openrouter/free';
export const DEFAULT_OPENROUTER_TIMEOUT_MS = 25_000;

const ALLOWED_IMAGE_MIME_TYPES = new Set<AiAssistantAllowedMimeType>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export interface AiAssistantConfig {
  enabled: boolean;
  configured: boolean;
  apiKey: string;
  model: string;
  dailyLimitPerTenant: number;
  rateLimitPerMinute: number;
  maxImageBytes: number;
  timeoutMs: number;
  appUrl: string;
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}

export function resolveAiAssistantConfig(
  env: Record<string, string | undefined> = process.env
): AiAssistantConfig {
  const rawEnabled = (env.AI_ASSISTANT_ENABLED ?? 'true').trim().toLowerCase();
  const enabled = !['false', '0', 'no', 'off', 'disabled'].includes(rawEnabled);

  const rawKey = (env.OPENROUTER_API_KEY || '').trim();
  const configured =
    rawKey.length > 10 &&
    !rawKey.includes('MY_OPENROUTER_API_KEY') &&
    !rawKey.includes('YOUR_');

  const requestedModel = (env.OPENROUTER_MODEL || '').trim();
  // Always default to openrouter/free; never introduce paid fallbacks automatically.
  const model = requestedModel || DEFAULT_AI_ASSISTANT_MODEL;

  const rawAppUrl = (env.APP_URL || '').trim();
  const appUrl = /^https?:\/\//i.test(rawAppUrl)
    ? rawAppUrl
    : 'https://smartbitz-pos.local';

  return {
    enabled,
    configured,
    apiKey: configured ? rawKey : '',
    model,
    dailyLimitPerTenant: parsePositiveInt(
      env.AI_ASSISTANT_DAILY_LIMIT_PER_TENANT,
      50,
      1,
      5000
    ),
    rateLimitPerMinute: parsePositiveInt(
      env.AI_ASSISTANT_RATE_LIMIT_PER_MINUTE,
      10,
      1,
      120
    ),
    maxImageBytes: parsePositiveInt(
      env.AI_ASSISTANT_MAX_IMAGE_BYTES,
      4 * 1024 * 1024,
      262144,
      8 * 1024 * 1024
    ),
    timeoutMs: parsePositiveInt(
      env.OPENROUTER_TIMEOUT_MS,
      DEFAULT_OPENROUTER_TIMEOUT_MS,
      5000,
      60000
    ),
    appUrl,
  };
}

interface TenantUsageRecord {
  dayKey: string;
  countToday: number;
  minuteTimestamps: number[];
}

export class AiUsageTracker {
  private readonly store = new Map<string, TenantUsageRecord>();

  private getTodayKey(nowMs = Date.now()): string {
    return new Date(nowMs).toISOString().slice(0, 10);
  }

  private getOrCreate(tenantUserId: string, nowMs = Date.now()): TenantUsageRecord {
    const dayKey = this.getTodayKey(nowMs);
    const existing = this.store.get(tenantUserId);
    if (!existing || existing.dayKey !== dayKey) {
      const fresh: TenantUsageRecord = {
        dayKey,
        countToday: 0,
        minuteTimestamps: existing
          ? existing.minuteTimestamps.filter((ts) => nowMs - ts < 60_000)
          : [],
      };
      this.store.set(tenantUserId, fresh);
      return fresh;
    }
    existing.minuteTimestamps = existing.minuteTimestamps.filter(
      (ts) => nowMs - ts < 60_000
    );
    return existing;
  }

  getSnapshot(
    tenantUserId: string,
    config: AiAssistantConfig,
    nowMs = Date.now()
  ): { usedToday: number; remainingToday: number; dailyLimit: number } {
    const rec = this.getOrCreate(tenantUserId, nowMs);
    return {
      usedToday: rec.countToday,
      remainingToday: Math.max(0, config.dailyLimitPerTenant - rec.countToday),
      dailyLimit: config.dailyLimitPerTenant,
    };
  }

  tryConsume(
    tenantUserId: string,
    config: AiAssistantConfig,
    nowMs = Date.now()
  ):
    | { allowed: true; usedToday: number; remainingToday: number }
    | {
        allowed: false;
        code: 'RATE_LIMIT_EXCEEDED' | 'DAILY_LIMIT_REACHED';
        error: string;
        retryAfterSeconds: number;
        usedToday: number;
        remainingToday: number;
      } {
    const rec = this.getOrCreate(tenantUserId, nowMs);

    if (rec.minuteTimestamps.length >= config.rateLimitPerMinute) {
      const oldestTs = rec.minuteTimestamps[0] ?? nowMs;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((60_000 - (nowMs - oldestTs)) / 1000)
      );
      return {
        allowed: false,
        code: 'RATE_LIMIT_EXCEEDED',
        error: `Too many AI requests in a short time. Please wait ${retryAfterSeconds}s before asking again.`,
        retryAfterSeconds,
        usedToday: rec.countToday,
        remainingToday: Math.max(0, config.dailyLimitPerTenant - rec.countToday),
      };
    }

    if (rec.countToday >= config.dailyLimitPerTenant) {
      return {
        allowed: false,
        code: 'DAILY_LIMIT_REACHED',
        error: `Daily AI Assistant limit (${config.dailyLimitPerTenant} requests) reached for this store.`,
        retryAfterSeconds: 3600,
        usedToday: rec.countToday,
        remainingToday: 0,
      };
    }

    rec.countToday += 1;
    rec.minuteTimestamps.push(nowMs);
    return {
      allowed: true,
      usedToday: rec.countToday,
      remainingToday: Math.max(0, config.dailyLimitPerTenant - rec.countToday),
    };
  }

  refund(tenantUserId: string, nowMs = Date.now()): void {
    const rec = this.getOrCreate(tenantUserId, nowMs);
    if (rec.countToday > 0) {
      rec.countToday -= 1;
    }
    if (rec.minuteTimestamps.length > 0) {
      rec.minuteTimestamps.pop();
    }
  }
}

export interface ValidatedAiAssistInput {
  prompt: string;
  languageMode: AiAssistantLanguageMode;
  history: AiAssistantHistoryTurn[];
  attachment: {
    mimeType: AiAssistantAllowedMimeType;
    base64Data: string;
    sizeBytes: number;
  } | null;
  shopName?: string;
  activeBranchName?: string;
  customPermissions?: string[];
  stream: boolean;
}

export function validateAiAssistRequestBody(
  rawBody: unknown,
  maxImageBytes: number
):
  | { ok: true; value: ValidatedAiAssistInput }
  | { ok: false; status: number; error: string } {
  if (!rawBody || typeof rawBody !== 'object') {
    return { ok: false, status: 400, error: 'Request body must be a JSON object.' };
  }

  const body = rawBody as Record<string, unknown>;
  const rawPrompt =
    typeof body.prompt === 'string'
      ? body.prompt
      : typeof body.message === 'string'
      ? body.message
      : '';
  const prompt = sanitizeTextForAi(rawPrompt, 2000);

  const rawLang =
    typeof body.languageMode === 'string'
      ? body.languageMode.trim()
      : typeof body.language === 'string'
      ? body.language.trim()
      : 'auto';
  const languageMode: AiAssistantLanguageMode =
    rawLang === 'en' ||
    rawLang === 'ur' ||
    rawLang === 'roman_ur' ||
    rawLang === 'auto'
      ? rawLang
      : 'auto';

  let attachment: ValidatedAiAssistInput['attachment'] = null;
  if (body.attachment !== undefined && body.attachment !== null) {
    if (typeof body.attachment !== 'object') {
      return {
        ok: false,
        status: 400,
        error: 'Invalid screenshot attachment payload.',
      };
    }
    const att = body.attachment as Record<string, unknown>;
    const mimeType =
      typeof att.mimeType === 'string' ? att.mimeType.trim().toLowerCase() : '';
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType as AiAssistantAllowedMimeType)) {
      return {
        ok: false,
        status: 400,
        error:
          'Unsupported image format. Please upload PNG, JPEG, WEBP, or GIF screenshots only.',
      };
    }

    const rawBase64 = typeof att.base64Data === 'string' ? att.base64Data.trim() : '';
    const strippedBase64 = rawBase64
      .replace(/^data:image\/[a-z0-9+.-]+;base64,/i, '')
      .replace(/\s+/g, '');
    if (!strippedBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(strippedBase64)) {
      return {
        ok: false,
        status: 400,
        error: 'Screenshot base64 image data is invalid.',
      };
    }

    const decoded = Buffer.from(strippedBase64, 'base64');
    if (decoded.length === 0) {
      return {
        ok: false,
        status: 400,
        error: 'Screenshot file appears to be empty.',
      };
    }
    if (decoded.length > maxImageBytes) {
      return {
        ok: false,
        status: 413,
        error: `Screenshot exceeds the maximum allowed size (${Math.round(maxImageBytes / (1024 * 1024))} MB).`,
      };
    }

    attachment = {
      mimeType: mimeType as AiAssistantAllowedMimeType,
      base64Data: strippedBase64,
      sizeBytes: decoded.length,
    };
  }

  if (!prompt && !attachment) {
    return {
      ok: false,
      status: 400,
      error: 'Please enter a question or attach a screenshot for guidance.',
    };
  }

  // Keep only the most relevant 4 recent turns (max 600 chars each) to keep latency and tokens low.
  const history: AiAssistantHistoryTurn[] = [];
  if (Array.isArray(body.history)) {
    const recent = body.history.slice(-4);
    for (const item of recent) {
      if (!item || typeof item !== 'object') continue;
      const turn = item as Record<string, unknown>;
      const role =
        turn.role === 'assistant'
          ? 'assistant'
          : turn.role === 'user'
          ? 'user'
          : null;
      const text =
        typeof turn.text === 'string' ? sanitizeTextForAi(turn.text, 600) : '';
      if (role && text) {
        history.push({ role, text });
      }
    }
  }

  const customPermissions = Array.isArray(body.customPermissions)
    ? body.customPermissions
        .filter((p): p is string => typeof p === 'string')
        .slice(0, 30)
    : undefined;

  const rawBranchName =
    typeof body.activeBranchName === 'string'
      ? body.activeBranchName
      : typeof body.branchName === 'string'
      ? body.branchName
      : '';

  return {
    ok: true,
    value: {
      prompt:
        prompt ||
        'Examine this SmartBitz POS screenshot, explain what is visible, and give safe numbered steps.',
      languageMode,
      history,
      attachment,
      shopName:
        typeof body.shopName === 'string'
          ? sanitizeTextForAi(body.shopName, 80)
          : undefined,
      activeBranchName: rawBranchName
        ? sanitizeTextForAi(rawBranchName, 60)
        : undefined,
      customPermissions,
      stream: body.stream === true,
    },
  };
}

export function buildAiAssistantStatusPayload(
  tenantUserId: string,
  config: AiAssistantConfig,
  tracker: AiUsageTracker
): AiAssistantStatusResponse {
  const usage = tracker.getSnapshot(tenantUserId, config);
  const available = config.enabled && config.configured && usage.remainingToday > 0;
  let reason: string | undefined;
  if (!config.enabled) {
    reason = 'AI Assistant is disabled by server configuration.';
  } else if (!config.configured) {
    reason =
      'Server AI provider credentials (OPENROUTER_API_KEY) are not configured. All POS features continue working normally.';
  } else if (usage.remainingToday <= 0) {
    reason = 'Daily AI Assistant usage limit reached for this store.';
  }

  return {
    available,
    configured: config.configured,
    enabled: config.enabled,
    model: config.model,
    dailyLimit: usage.dailyLimit,
    usedToday: usage.usedToday,
    remainingToday: usage.remainingToday,
    maxImageBytes: config.maxImageBytes,
    reason,
  };
}

/**
 * Lightweight TTL cache strictly for generic, non-sensitive, single-turn POS how-to queries.
 * Never caches screenshots, multi-turn chats, or anything referencing customer/staff/sales/shop data.
 */
interface CachedReplyEntry {
  reply: string;
  model: string;
  expiresAt: number;
}

export function isSafeCacheablePosQuery(input: ValidatedAiAssistInput): boolean {
  if (input.attachment) return false;
  if (input.history.length > 0) return false;
  const prompt = input.prompt.trim();
  if (prompt.length < 8 || prompt.length > 220) return false;
  if (/\d/.test(prompt)) return false;
  if (prompt.includes('@') || prompt.includes('[REDACTED')) return false;
  if (
    /\b(?:rs\.?|pkr|usd|invoice|receipt|bill\s*#|order\s*#|customer|vendor|supplier|employee|cashier|balance|salary|profit|revenue|my\s+shop|my\s+store|hamari|mera)\b/i.test(
      prompt
    )
  ) {
    return false;
  }
  return true;
}

export class SafePosHowToCache {
  private readonly store = new Map<string, CachedReplyEntry>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(maxEntries = 64, ttlMs = 5 * 60_000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  private makeKey(params: {
    model: string;
    staffRole: EmployeeRole;
    languageMode: AiAssistantLanguageMode;
    prompt: string;
  }): string {
    const normalized = params.prompt.trim().toLowerCase().replace(/\s+/g, ' ');
    return `${params.model}::${params.staffRole}::${params.languageMode}::${normalized}`;
  }

  get(
    params: {
      model: string;
      staffRole: EmployeeRole;
      input: ValidatedAiAssistInput;
    },
    nowMs = Date.now()
  ): { reply: string; model: string } | null {
    if (!isSafeCacheablePosQuery(params.input)) return null;
    const key = this.makeKey({
      model: params.model,
      staffRole: params.staffRole,
      languageMode: params.input.languageMode,
      prompt: params.input.prompt,
    });
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= nowMs) {
      this.store.delete(key);
      return null;
    }
    return { reply: entry.reply, model: entry.model };
  }

  set(
    params: {
      model: string;
      staffRole: EmployeeRole;
      input: ValidatedAiAssistInput;
      reply: string;
      resolvedModel: string;
    },
    nowMs = Date.now()
  ): void {
    if (!isSafeCacheablePosQuery(params.input)) return;
    if (!params.reply.trim()) return;
    const key = this.makeKey({
      model: params.model,
      staffRole: params.staffRole,
      languageMode: params.input.languageMode,
      prompt: params.input.prompt,
    });
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }
    this.store.set(key, {
      reply: params.reply,
      model: params.resolvedModel,
      expiresAt: nowMs + this.ttlMs,
    });
  }
}

export type OpenRouterUserContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: OpenRouterUserContent;
}

export class AiProviderError extends Error {
  readonly httpStatus: number;
  readonly isTimeout: boolean;
  readonly isCancelled: boolean;

  constructor(
    message: string,
    options?: { httpStatus?: number; isTimeout?: boolean; isCancelled?: boolean }
  ) {
    super(message);
    this.name = 'AiProviderError';
    this.httpStatus = options?.httpStatus ?? 502;
    this.isTimeout = Boolean(options?.isTimeout);
    this.isCancelled = Boolean(options?.isCancelled);
  }
}

export type AiGenerateContentFn = (params: {
  model: string;
  messages: OpenRouterMessage[];
  apiKey: string;
  timeoutMs: number;
  appUrl: string;
  stream: boolean;
  signal?: AbortSignal;
  onChunk?: (delta: string, resolvedModel?: string) => void;
}) => Promise<{ reply: string; model: string } | string>;

export function buildOpenRouterMessages(
  input: ValidatedAiAssistInput,
  systemInstruction: string
): OpenRouterMessage[] {
  const messages: OpenRouterMessage[] = [
    { role: 'system', content: systemInstruction },
  ];

  for (const turn of input.history) {
    messages.push({
      role: turn.role === 'assistant' ? 'assistant' : 'user',
      content: turn.text,
    });
  }

  if (input.attachment) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: input.prompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:${input.attachment.mimeType};base64,${input.attachment.base64Data}`,
          },
        },
      ],
    });
  } else {
    messages.push({
      role: 'user',
      content: input.prompt,
    });
  }

  return messages;
}

function extractOpenRouterTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === 'object' && 'text' in part) {
          return typeof (part as { text?: unknown }).text === 'string'
            ? (part as { text: string }).text
            : '';
        }
        return '';
      })
      .join('');
  }
  return '';
}

export async function defaultOpenRouterChatCompletion(params: {
  model: string;
  messages: OpenRouterMessage[];
  apiKey: string;
  timeoutMs: number;
  appUrl: string;
  stream: boolean;
  signal?: AbortSignal;
  onChunk?: (delta: string, resolvedModel?: string) => void;
}): Promise<{ reply: string; model: string }> {
  const controller = new AbortController();
  let timedOut = false;
  let cancelled = false;

  const onExternalAbort = () => {
    cancelled = true;
    controller.abort();
  };

  if (params.signal) {
    if (params.signal.aborted) {
      throw new AiProviderError('AI request was cancelled.', {
        httpStatus: 499,
        isCancelled: true,
      });
    }
    params.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, params.timeoutMs);

  try {
    const resp = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': params.appUrl,
        'X-Title': 'SmartBitz POS',
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        stream: params.stream,
        max_tokens: 700,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      let parsedMsg = errBody;
      try {
        const parsed = JSON.parse(errBody) as {
          error?: { message?: string } | string;
          message?: string;
        };
        if (typeof parsed.error === 'string') parsedMsg = parsed.error;
        else if (parsed.error && typeof parsed.error.message === 'string') {
          parsedMsg = parsed.error.message;
        } else if (typeof parsed.message === 'string') {
          parsedMsg = parsed.message;
        }
      } catch {
        // keep plain error text
      }
      throw new AiProviderError(
        parsedMsg || `OpenRouter returned HTTP ${resp.status}.`,
        { httpStatus: resp.status }
      );
    }

    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    if (params.stream && resp.body && contentType.includes('text/event-stream')) {
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullReply = '';
      let resolvedModel = params.model;

      const processSseLine = (rawLine: string) => {
        const line = rawLine.trim();
        if (!line || line.startsWith(':')) return false;
        if (!line.startsWith('data:')) return false;
        const dataStr = line.slice(5).trim();
        if (dataStr === '[DONE]') {
          return true;
        }
        try {
          const chunk = JSON.parse(dataStr) as {
            model?: string;
            error?: { message?: string; code?: number };
            choices?: Array<{
              delta?: { content?: unknown };
              message?: { content?: unknown };
            }>;
          };
          if (chunk.error?.message) {
            throw new AiProviderError(chunk.error.message, {
              httpStatus:
                typeof chunk.error.code === 'number' ? chunk.error.code : 502,
            });
          }
          if (typeof chunk.model === 'string' && chunk.model.trim()) {
            resolvedModel = chunk.model.trim();
          }
          const deltaText = extractOpenRouterTextContent(
            chunk.choices?.[0]?.delta?.content ??
              chunk.choices?.[0]?.message?.content
          );
          if (deltaText) {
            fullReply += deltaText;
            params.onChunk?.(deltaText, resolvedModel);
          }
        } catch (parseErr) {
          if (parseErr instanceof AiProviderError) throw parseErr;
        }
        return false;
      };

      let reachedDone = false;
      while (!reachedDone) {
        const { value, done } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          if (processSseLine(rawLine)) {
            reachedDone = true;
            break;
          }
        }
      }
      if (!reachedDone && buffer.trim()) {
        processSseLine(buffer);
      }

      const finalText = fullReply.trim();
      if (!finalText) {
        throw new AiProviderError(
          'The free AI model returned an empty response. Please try again.',
          { httpStatus: 502 }
        );
      }
      return { reply: finalText, model: resolvedModel };
    }

    const data = (await resp.json()) as {
      model?: string;
      error?: { message?: string; code?: number };
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    if (data.error?.message) {
      throw new AiProviderError(data.error.message, {
        httpStatus: typeof data.error.code === 'number' ? data.error.code : 502,
      });
    }
    const text = extractOpenRouterTextContent(
      data.choices?.[0]?.message?.content
    ).trim();
    if (!text) {
      throw new AiProviderError(
        'The free AI model returned an empty response. Please try rephrasing your question.',
        { httpStatus: 502 }
      );
    }
    const resolvedModel =
      typeof data.model === 'string' && data.model.trim()
        ? data.model.trim()
        : params.model;
    if (params.onChunk) {
      params.onChunk(text, resolvedModel);
    }
    return { reply: text, model: resolvedModel };
  } catch (err) {
    if (err instanceof AiProviderError) {
      throw err;
    }
    if (cancelled || (params.signal?.aborted && !timedOut)) {
      throw new AiProviderError('AI request was cancelled.', {
        httpStatus: 499,
        isCancelled: true,
      });
    }
    if (timedOut || (err instanceof Error && err.name === 'AbortError')) {
      throw new AiProviderError(
        'AI request timed out while waiting for the free model.',
        { httpStatus: 504, isTimeout: true }
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
    params.signal?.removeEventListener('abort', onExternalAbort);
  }
}

export async function generatePosAssistantReply(params: {
  input: ValidatedAiAssistInput;
  staffRole: EmployeeRole;
  config: AiAssistantConfig;
  generator?: AiGenerateContentFn;
  signal?: AbortSignal;
  onChunk?: (delta: string, resolvedModel?: string) => void;
}): Promise<{ reply: string; model: string }> {
  const systemInstruction = buildPosAssistantSystemPrompt({
    staffRole: params.staffRole,
    shopName: params.input.shopName,
    activeBranchName: params.input.activeBranchName,
    languageMode: params.input.languageMode,
    prompt: params.input.prompt,
  });

  const messages = buildOpenRouterMessages(params.input, systemInstruction);
  const generateFn = params.generator ?? defaultOpenRouterChatCompletion;
  const output = await generateFn({
    model: params.config.model,
    messages,
    apiKey: params.config.apiKey,
    timeoutMs: params.config.timeoutMs,
    appUrl: params.config.appUrl,
    stream: Boolean(params.onChunk),
    signal: params.signal,
    onChunk: params.onChunk,
  });

  if (typeof output === 'string') {
    const trimmed = output.trim();
    if (!trimmed) {
      throw new AiProviderError('The AI assistant returned an empty response.', {
        httpStatus: 502,
      });
    }
    if (params.onChunk) {
      params.onChunk(trimmed, params.config.model);
    }
    return { reply: trimmed, model: params.config.model };
  }

  return {
    reply: output.reply,
    model: output.model || params.config.model,
  };
}

export function isVisionUnsupportedError(
  err: unknown,
  hadAttachment: boolean
): boolean {
  if (!hadAttachment) return false;
  const status = err instanceof AiProviderError ? err.httpStatus : undefined;
  const raw = err instanceof Error ? err.message : String(err || '');
  const looksLikeVisionRejection =
    /image|vision|multimodal|content must be a string|expected string|does not support.*image|no endpoints found.*image/i.test(
      raw
    );
  if (looksLikeVisionRejection) return true;
  if (status === 400 || status === 404 || status === 422) {
    return /unsupported|invalid content|media|endpoint/i.test(raw);
  }
  return false;
}

export function mapAiProviderError(
  err: unknown,
  hadAttachment = false
): {
  status: number;
  code: string;
  error: string;
} {
  if (err instanceof AiProviderError) {
    if (err.isCancelled || err.httpStatus === 499) {
      return {
        status: 499,
        code: 'REQUEST_CANCELLED',
        error: 'AI request was cancelled.',
      };
    }
    if (err.isTimeout || err.httpStatus === 504) {
      return {
        status: 504,
        code: 'AI_TIMEOUT',
        error:
          'The free AI model took too long to respond. Please try a shorter question or try again.',
      };
    }
  }

  if (isVisionUnsupportedError(err, hadAttachment)) {
    return {
      status: 422,
      code: 'VISION_UNSUPPORTED',
      error:
        'The currently routed free AI model does not support screenshot/image analysis right now. Please type the error or screen text instead.',
    };
  }

  const status = err instanceof AiProviderError ? err.httpStatus : undefined;
  const raw = err instanceof Error ? err.message : String(err || '');

  if (status === 429 || /RESOURCE_EXHAUSTED|429|rate limit|too many requests/i.test(raw)) {
    return {
      status: 429,
      code: 'PROVIDER_RATE_LIMITED',
      error:
        'Free AI model rate limit reached temporarily. Please wait a moment and try again.',
    };
  }
  if (
    status === 401 ||
    status === 403 ||
    /API_KEY_INVALID|invalid.*key|unauthorized|PERMISSION_DENIED/i.test(raw)
  ) {
    return {
      status: 502,
      code: 'PROVIDER_AUTH_ERROR',
      error:
        'Server OpenRouter credentials were rejected. Contact your platform administrator.',
    };
  }
  if (
    status === 404 ||
    status === 503 ||
    /NOT_FOUND|no endpoints found|unavailable/i.test(raw)
  ) {
    return {
      status: 502,
      code: 'PROVIDER_MODEL_UNAVAILABLE',
      error:
        'No free AI model is currently available for this request. Your POS continues operating normally.',
    };
  }

  return {
    status: 502,
    code: 'AI_UPSTREAM_ERROR',
    error:
      'Unable to reach the AI Assistant right now. Your POS terminal continues working normally.',
  };
}
