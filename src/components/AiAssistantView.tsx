import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  AlertTriangle,
  Bot,
  ImagePlus,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type { TranslationStrings } from '../i18n';
import { formatTimeShort } from '../i18n';
import { askAiAssistant, fetchAiAssistantStatus } from '../lib/posRepository';
import type {
  AiAssistantAllowedMimeType,
  AiAssistantHistoryTurn,
  AiAssistantLanguageMode,
  AiAssistantMessage,
  AiAssistantStatusResponse,
  EmployeeRole,
  Language,
} from '../types';

interface AiAssistantViewProps {
  userId: string;
  employeeId: string | null;
  activeRole: EmployeeRole;
  customPermissions?: string[];
  shopName: string;
  activeBranchName?: string;
  lang: Language;
  t: TranslationStrings;
}

interface PendingAttachment {
  mimeType: AiAssistantAllowedMimeType;
  base64Data: string;
  previewUrl: string;
  fileName: string;
  sizeBytes: number;
}

const ALLOWED_MIME_TYPES = new Set<AiAssistantAllowedMimeType>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const DEFAULT_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_PERSISTED_MESSAGES = 30;
const MAX_PERSISTED_IMAGE_CHARS = 150_000;
const MAX_HISTORY_TURNS_SENT = 4;

interface QuickPromptPreset {
  id: string;
  label: string;
  prompt: string;
  languageHint?: AiAssistantLanguageMode;
}

function getQuickPrompts(role: EmployeeRole): QuickPromptPreset[] {
  const base: QuickPromptPreset[] = [
    {
      id: 'split_bill',
      label: 'Split Payment & Udhaar Checkout',
      prompt: 'How do I complete a split payment or Udhaar bill in POS Billing?',
      languageHint: 'en',
    },
    {
      id: 'barcode_scanner',
      label: 'Barcode / Camera Scanner Setup',
      prompt: 'Hardware USB barcode scanner ya camera scanner se item kaise scan karein?',
      languageHint: 'roman_ur',
    },
    {
      id: 'shift_close',
      label: 'Cash Drawer & Shift Closing',
      prompt: 'شفٹ بند کرتے وقت کیش ڈراور کا حساب اور فرق کیسے چیک کریں؟',
      languageHint: 'ur',
    },
    {
      id: 'returns_refund',
      label: 'Returns & Refunds Workflow',
      prompt: 'How do I process a customer return or refund without breaking stock counts?',
      languageHint: 'en',
    },
  ];

  if (role === 'admin' || role === 'manager') {
    base.push(
      {
        id: 'stock_purchase',
        label: 'Supplier Purchases & Stock Adjust',
        prompt: 'Supplier purchase order receive karne aur damaged stock adjust karne ka sahi tareeqa kya hai?',
        languageHint: 'roman_ur',
      },
      {
        id: 'branch_staff',
        label: 'Branches, Staff PINs & Permissions',
        prompt: 'How do branch stock transfers and custom staff role permissions work in SmartBitz POS?',
        languageHint: 'en',
      }
    );
  }

  return base;
}

function renderInlineFormatting(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={idx}
          className="px-1 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[12px]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={idx}>{part}</Fragment>;
  });
}

const FormattedReplyText = memo(function FormattedReplyText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div dir="auto" className="space-y-1.5 text-sm leading-relaxed text-slate-800">
      {lines.map((rawLine, idx) => {
        const trimmed = rawLine.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }
        const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
        if (bulletMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 ps-1">
              <span className="text-teal-700 font-bold leading-relaxed select-none" aria-hidden="true">
                •
              </span>
              <span className="flex-1">{renderInlineFormatting(bulletMatch[1])}</span>
            </div>
          );
        }
        const numberedMatch = trimmed.match(/^(\d+\.)\s+(.*)$/);
        if (numberedMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 ps-1">
              <span className="text-teal-700 font-semibold tabular-nums shrink-0">
                {numberedMatch[1]}
              </span>
              <span className="flex-1">{renderInlineFormatting(numberedMatch[2])}</span>
            </div>
          );
        }
        if (trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
          const headingText = trimmed.replace(/^#{2,3}\s+/, '');
          return (
            <p key={idx} className="font-semibold text-slate-900 pt-1">
              {renderInlineFormatting(headingText)}
            </p>
          );
        }
        return <p key={idx}>{renderInlineFormatting(rawLine)}</p>;
      })}
    </div>
  );
});

const MessageBubble = memo(function MessageBubble({
  msg,
  lang,
  sendingLabel,
}: {
  msg: AiAssistantMessage;
  lang: Language;
  sendingLabel: string;
}) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] lg:max-w-[75%] rounded-xl px-4 py-3 border ${
          isUser
            ? 'bg-teal-700 text-white border-teal-800'
            : msg.error
            ? 'bg-red-50 text-red-900 border-red-200'
            : 'bg-white text-slate-800 border-slate-200 shadow-xs'
        }`}
      >
        {msg.imagePreviewUrl && (
          <div className="mb-2.5 overflow-hidden rounded-lg border border-black/10 bg-white">
            <img
              src={msg.imagePreviewUrl}
              alt={msg.imageName || 'POS Screenshot'}
              referrerPolicy="no-referrer"
              className="max-h-64 w-auto object-contain mx-auto"
            />
          </div>
        )}
        {!msg.imagePreviewUrl && msg.imageName && (
          <p className="text-[11px] opacity-80 mb-1.5 font-medium">
            Screenshot: {msg.imageName}
          </p>
        )}

        {isUser ? (
          <p dir="auto" className="text-sm leading-relaxed whitespace-pre-wrap">
            {msg.text}
          </p>
        ) : msg.error ? (
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle
              className="w-4 h-4 text-red-600 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <p dir="auto" className="leading-relaxed">
              {msg.text}
            </p>
          </div>
        ) : msg.text ? (
          <FormattedReplyText text={msg.text} />
        ) : (
          <p className="text-xs font-medium text-slate-500">{sendingLabel}</p>
        )}

        <div
          className={`mt-2 flex items-center justify-between gap-3 text-[11px] tabular-nums ${
            isUser ? 'text-teal-100' : msg.error ? 'text-red-700' : 'text-slate-400'
          }`}
        >
          <span>{formatTimeShort(msg.createdAt, lang)}</span>
          {!isUser && !msg.error && msg.modelUsed && <span>{msg.modelUsed}</span>}
        </div>
      </div>
    </div>
  );
});

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function AiAssistantView({
  userId,
  employeeId,
  activeRole,
  customPermissions,
  shopName,
  activeBranchName,
  lang,
  t,
}: AiAssistantViewProps) {
  const scopeKey = `${userId}_${employeeId || activeRole}`;
  const chatStorageKey = `smartbitz_ai_chat_${scopeKey}`;
  const langStorageKey = `smartbitz_ai_lang_${scopeKey}`;

  const [messages, setMessages] = useState<AiAssistantMessage[]>(() => {
    try {
      const raw = localStorage.getItem(chatStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as AiAssistantMessage[]) : [];
    } catch {
      return [];
    }
  });

  const [languageMode, setLanguageMode] = useState<AiAssistantLanguageMode>(() => {
    try {
      const saved = localStorage.getItem(langStorageKey);
      if (saved === 'auto' || saved === 'en' || saved === 'ur' || saved === 'roman_ur') {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return 'auto';
  });

  const [status, setStatus] = useState<AiAssistantStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const activeRequestAbortRef = useRef<AbortController | null>(null);
  const inFlightLockRef = useRef(false);
  const lastSubmissionRef = useRef<{ signature: string; at: number }>({
    signature: '',
    at: 0,
  });

  const abortActiveRequest = useCallback(() => {
    if (activeRequestAbortRef.current) {
      activeRequestAbortRef.current.abort();
      activeRequestAbortRef.current = null;
    }
    inFlightLockRef.current = false;
  }, []);

  // Reload scoped chat history if staff member or user switches, and abort any pending AI call
  useEffect(() => {
    abortActiveRequest();
    setIsSending(false);
    try {
      const raw = localStorage.getItem(chatStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setMessages(Array.isArray(parsed) ? (parsed as AiAssistantMessage[]) : []);
    } catch {
      setMessages([]);
    }

    try {
      const savedLang = localStorage.getItem(langStorageKey);
      if (
        savedLang === 'auto' ||
        savedLang === 'en' ||
        savedLang === 'ur' ||
        savedLang === 'roman_ur'
      ) {
        setLanguageMode(savedLang);
      } else {
        setLanguageMode('auto');
      }
    } catch {
      setLanguageMode('auto');
    }

    setAttachment(null);
    setAttachmentError(null);
  }, [chatStorageKey, langStorageKey, abortActiveRequest]);

  // Abort active request cleanly on unmount
  useEffect(() => {
    return () => {
      abortActiveRequest();
    };
  }, [abortActiveRequest]);

  // Persist conversation history cleanly once streaming finishes (skip transient empty stream bubbles)
  useEffect(() => {
    if (isSending) return;
    try {
      const trimmed = messages
        .filter((m) => m.text.trim().length > 0 || Boolean(m.imagePreviewUrl))
        .slice(-MAX_PERSISTED_MESSAGES)
        .map((m) => ({
          ...m,
          imagePreviewUrl:
            m.imagePreviewUrl && m.imagePreviewUrl.length <= MAX_PERSISTED_IMAGE_CHARS
              ? m.imagePreviewUrl
              : undefined,
        }));
      localStorage.setItem(chatStorageKey, JSON.stringify(trimmed));
    } catch {
      // Ignore quota errors cleanly
    }
  }, [messages, chatStorageKey, isSending]);

  useEffect(() => {
    try {
      localStorage.setItem(langStorageKey, languageMode);
    } catch {
      // Ignore storage errors
    }
  }, [languageMode, langStorageKey]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingStatus(true);
    void fetchAiAssistantStatus(controller.signal)
      .then((res) => {
        if (!controller.signal.aborted && res !== null) {
          setStatus(res);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingStatus(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [userId, employeeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: isSending ? 'auto' : 'smooth' });
  }, [messages.length, isSending]);

  const maxImageBytes = status?.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const quickPrompts = useMemo(() => getQuickPrompts(activeRole), [activeRole]);

  const processImageFile = useCallback(
    (file: File) => {
      setAttachmentError(null);
      if (!ALLOWED_MIME_TYPES.has(file.type as AiAssistantAllowedMimeType)) {
        setAttachmentError(t.aiInvalidFileError);
        return;
      }
      if (file.size > maxImageBytes) {
        setAttachmentError(t.aiFileTooLargeError);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const commaIdx = result.indexOf(',');
        if (!result.startsWith('data:') || commaIdx === -1) {
          setAttachmentError(t.aiInvalidFileError);
          return;
        }
        const base64Data = result.slice(commaIdx + 1).trim();
        if (!base64Data) {
          setAttachmentError(t.aiInvalidFileError);
          return;
        }
        setAttachment({
          mimeType: file.type as AiAssistantAllowedMimeType,
          base64Data,
          previewUrl: result,
          fileName: file.name || 'screenshot.png',
          sizeBytes: file.size,
        });
      };
      reader.onerror = () => {
        setAttachmentError(t.aiInvalidFileError);
      };
      reader.readAsDataURL(file);
    },
    [maxImageBytes, t.aiFileTooLargeError, t.aiInvalidFileError]
  );

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          processImageFile(file);
          return;
        }
      }
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleClearChat = () => {
    abortActiveRequest();
    setIsSending(false);
    setMessages([]);
    setAttachment(null);
    setAttachmentError(null);
    try {
      localStorage.removeItem(chatStorageKey);
    } catch {
      // ignore
    }
  };

  const sendMessage = async (
    overrideText?: string,
    overrideLang?: AiAssistantLanguageMode,
    allowCancelPrevious = false
  ) => {
    const messageText = (overrideText ?? input).trim();
    const currentAttachment = overrideText ? null : attachment;
    if (!messageText && !currentAttachment) return;

    const chosenLang = overrideLang ?? languageMode;
    const signature = `${chosenLang}::${messageText}::${currentAttachment?.fileName ?? ''}`;
    const nowMs = Date.now();

    // Prevent duplicate rapid submissions
    if (
      lastSubmissionRef.current.signature === signature &&
      nowMs - lastSubmissionRef.current.at < 800
    ) {
      return;
    }

    if (inFlightLockRef.current) {
      if (!allowCancelPrevious) {
        return;
      }
      abortActiveRequest();
    }

    lastSubmissionRef.current = { signature, at: nowMs };
    inFlightLockRef.current = true;

    const controller = new AbortController();
    activeRequestAbortRef.current = controller;

    const nowIso = new Date().toISOString();
    const userMsgId = `u_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
    const assistantMsgId = `a_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;

    const userMsg: AiAssistantMessage = {
      id: userMsgId,
      role: 'user',
      text: messageText || 'Please analyze this POS screenshot and explain what to do next.',
      language: chosenLang,
      imagePreviewUrl: currentAttachment?.previewUrl,
      imageName: currentAttachment?.fileName,
      createdAt: nowIso,
    };

    const streamingPlaceholder: AiAssistantMessage = {
      id: assistantMsgId,
      role: 'assistant',
      text: '',
      createdAt: nowIso,
    };

    const historyPayload: AiAssistantHistoryTurn[] = messages
      .filter((m) => !m.error && m.text.trim().length > 0)
      .slice(-MAX_HISTORY_TURNS_SENT)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMsg, streamingPlaceholder]);
    if (!overrideText) {
      setInput('');
      setAttachment(null);
      setAttachmentError(null);
    }
    setIsSending(true);

    let streamedText = '';
    let streamedModel: string | undefined;

    try {
      const result = await askAiAssistant(
        {
          message: messageText,
          language: chosenLang,
          history: historyPayload,
          attachment: currentAttachment
            ? {
                mimeType: currentAttachment.mimeType,
                base64Data: currentAttachment.base64Data,
                fileName: currentAttachment.fileName,
              }
            : null,
          activeModule: 'ai_assistant',
          shopName,
          branchName: activeBranchName,
          customPermissions,
        },
        {
          signal: controller.signal,
          onChunk: (delta, model) => {
            if (controller.signal.aborted) return;
            streamedText += delta;
            if (model) streamedModel = model;
            const snapshotText = streamedText;
            const snapshotModel = streamedModel;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, text: snapshotText, modelUsed: snapshotModel ?? m.modelUsed }
                  : m
              )
            );
          },
        }
      );

      if (result.usage) {
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                dailyLimit: result.usage!.dailyLimit,
                usedToday: result.usage!.usedToday,
                remainingToday: result.usage!.remainingToday,
              }
            : prev
        );
      }

      if (result.code === 'REQUEST_CANCELLED' || controller.signal.aborted) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  text: streamedText ? `${streamedText}\n\n[${t.aiCancelledMsg}]` : t.aiCancelledMsg,
                  error: !streamedText,
                }
              : m
          )
        );
        return;
      }

      if (!result.ok) {
        if (result.code === 'AI_NOT_CONFIGURED' || result.code === 'AI_DISABLED') {
          setStatus((prev) =>
            prev
              ? {
                  ...prev,
                  available: false,
                  reason: result.error,
                }
              : prev
          );
        }

        const errText =
          result.code === 'DAILY_LIMIT_REACHED'
            ? t.aiQuotaReachedMsg
            : result.error || t.aiUnavailableFallback;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  text: errText,
                  createdAt: new Date().toISOString(),
                  error: true,
                }
              : m
          )
        );
        return;
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                text: result.reply || streamedText || '',
                createdAt: new Date().toISOString(),
                modelUsed: result.model || streamedModel,
                error: false,
              }
            : m
        )
      );
    } finally {
      if (activeRequestAbortRef.current === controller) {
        activeRequestAbortRef.current = null;
        inFlightLockRef.current = false;
        setIsSending(false);
      }
    }
  };

  const handleComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // If user edits and submits a brand-new message while another is streaming, cancel old and submit new
      void sendMessage(undefined, undefined, true);
    }
  };

  const isUnavailable = Boolean(status && !status.available);
  const quotaExhausted = Boolean(status && status.available && status.remainingToday <= 0);
  const canSubmit =
    !isSending &&
    !isUnavailable &&
    !quotaExhausted &&
    (input.trim().length > 0 || Boolean(attachment));

  const roleLabel =
    activeRole === 'admin'
      ? t.roleAdmin
      : activeRole === 'manager'
      ? t.roleManager
      : t.roleCashier;

  const languageOptions = useMemo<Array<{ id: AiAssistantLanguageMode; label: string }>>(
    () => [
      { id: 'auto', label: t.aiLanguageAuto },
      { id: 'en', label: t.aiLanguageEnglish },
      { id: 'ur', label: t.aiLanguageUrdu },
      { id: 'roman_ur', label: t.aiLanguageRomanUrdu },
    ],
    [t.aiLanguageAuto, t.aiLanguageEnglish, t.aiLanguageUrdu, t.aiLanguageRomanUrdu]
  );

  return (
    <div className="space-y-4">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-teal-700" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-900 tracking-tight">
              {t.aiAssistantTitle}
            </h1>
            <p className="text-sm text-slate-600 mt-0.5">{t.aiAssistantSubtitle}</p>
            <p className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
              <span>{shopName}</span>
              {activeBranchName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{activeBranchName}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>{roleLabel}</span>
              {!loadingStatus && status && status.model && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{status.model}</span>
                </>
              )}
              {!loadingStatus && status && status.dailyLimit > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {t.aiRemainingQuotaLabel}: {status.remainingToday}/{status.dailyLimit}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Language Mode Segmented Control & Clear Chat */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="Response language"
            className="inline-flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5"
          >
            {languageOptions.map((opt) => {
              const selected = languageMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setLanguageMode(opt.id)}
                  aria-pressed={selected}
                  className={`px-2.5 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selected
                      ? 'bg-white text-teal-800 font-semibold shadow-xs border border-slate-200/70'
                      : 'text-slate-600 hover:text-slate-900 font-medium border border-transparent'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleClearChat}
            disabled={messages.length === 0 && !attachment && !isSending}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>{t.aiClearChatBtn}</span>
          </button>
        </div>
      </div>

      {/* Unavailable / Quota Notice */}
      {!loadingStatus && isUnavailable && (
        <div
          role="status"
          className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-950"
        >
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold">{t.aiUnavailableTitle}</p>
            <p className="text-xs text-amber-900 leading-relaxed">
              {status?.reason || t.aiUnavailableFallback}
            </p>
          </div>
        </div>
      )}

      {!loadingStatus && quotaExhausted && (
        <div
          role="status"
          className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-950"
        >
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs font-medium">{t.aiQuotaReachedMsg}</p>
        </div>
      )}

      {/* Main Chat Container */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col bg-white border rounded-xl shadow-xs overflow-hidden min-h-[540px] max-h-[calc(100vh-16rem)] transition-colors ${
          isDragging ? 'border-teal-600 ring-2 ring-teal-600/20' : 'border-slate-200'
        }`}
      >
        {isDragging && (
          <div className="absolute inset-0 z-20 bg-teal-50/90 border-2 border-dashed border-teal-600 rounded-xl flex items-center justify-center pointer-events-none">
            <div className="text-center px-6 py-4 bg-white border border-teal-200 rounded-xl shadow-xs">
              <ImagePlus className="w-7 h-7 text-teal-700 mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-900">{t.aiUploadScreenshotBtn}</p>
              <p className="text-xs text-slate-500 mt-0.5">{t.aiDropHint}</p>
            </div>
          </div>
        )}

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/40">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto py-8 text-center space-y-5">
              <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center mx-auto">
                <Bot className="w-6 h-6 text-teal-700" aria-hidden="true" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-base font-semibold text-slate-900">{t.aiEmptyTitle}</h2>
                <p className="text-sm text-slate-600 leading-relaxed">{t.aiEmptySubtitle}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-start pt-2">
                {quickPrompts.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={isUnavailable || quotaExhausted}
                    onClick={() => void sendMessage(preset.prompt, preset.languageHint, true)}
                    className="p-3 bg-white border border-slate-200 hover:border-teal-300 hover:bg-teal-50/40 rounded-lg transition-colors text-start disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <p className="text-xs font-semibold text-slate-900">{preset.label}</p>
                    <p dir="auto" className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {preset.prompt}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                lang={lang}
                sendingLabel={t.aiSendingLabel}
              />
            ))
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Composer Footer */}
        <div className="border-t border-slate-200 bg-white p-4 space-y-3 shrink-0">
          {attachmentError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
            >
              <span>{attachmentError}</span>
              <button
                type="button"
                onClick={() => setAttachmentError(null)}
                aria-label={t.closeBtn}
                className="text-red-700 hover:text-red-900 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {attachment && (
            <div className="flex items-center justify-between gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={attachment.previewUrl}
                  alt={attachment.fileName}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-md object-cover border border-slate-200 shrink-0 bg-white"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">
                    {attachment.fileName}
                  </p>
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    {attachment.mimeType} · {formatFileSize(attachment.sizeBytes)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 bg-white border border-slate-200 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.aiRemoveAttachmentBtn}</span>
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) processImageFile(file);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending || isUnavailable}
              title={t.aiDropHint}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ImagePlus className="w-4 h-4 text-teal-700" aria-hidden="true" />
              <span>{t.aiUploadScreenshotBtn}</span>
            </button>

            <textarea
              dir="auto"
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              onPaste={handlePaste}
              disabled={isUnavailable}
              placeholder={t.aiInputPlaceholder}
              className="flex-1 min-h-[44px] max-h-36 resize-y px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50/70 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 disabled:opacity-60"
            />

            {isSending ? (
              <button
                type="button"
                onClick={abortActiveRequest}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                <span>{t.aiStopBtn}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={!canSubmit}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
                <span>{t.aiSendBtn}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-700 shrink-0" aria-hidden="true" />
            <span>{t.aiPrivacyNotice}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
