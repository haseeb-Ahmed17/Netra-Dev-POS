import type {
  Customer,
  OrderRecord,
  StoreSettings,
  UdhaarEntry,
  WhatsAppMessageLog,
  WhatsAppMessageType,
} from '../types';
import { formatQuantityWithUnit } from './unitUtils';
import { getAuthenticatedRequestHeaders } from './supabaseClient';
import { generateUuid } from './idUtils';

export function normalizeWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('03') && digits.length === 11) {
    return `92${digits.slice(1)}`;
  }
  return digits;
}

export const DEFAULT_RECEIPT_TEMPLATE =
  '*{shopName}*\nCustomer: {customerName}\nBill: {receiptNumber} | {dateTime}\n\n{itemsList}\n\nTotal: Rs. {total}\nPaid: Rs. {paid}\nOutstanding Balance: Rs. {balance}\nThank you!';

export const DEFAULT_REMINDER_TEMPLATE =
  '*{shopName} — Payment Reminder*\nDear {customerName},\nCurrent Outstanding Balance: Rs. {balance}\nDue Date: {dueDate}\nPlease contact {shopPhone} if you need assistance.';

export function formatWhatsAppReceiptMessage(params: {
  shopSettings: StoreSettings;
  order: OrderRecord;
  customerName: string;
  outstandingBalance: number;
  templateOverride?: string;
}): string {
  const { shopSettings, order, customerName, outstandingBalance, templateOverride } = params;
  const dateStr = new Date(order.createdAt).toLocaleString('en-PK', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const itemsList = order.items
    .map((item) => {
      const qtyUnit = formatQuantityWithUnit(item.quantity, item.sellingUnit || 'piece', 'en');
      return `• ${item.nameEn} (${qtyUnit} × Rs. ${Math.round(item.unitPrice)}) = Rs. ${Math.round(item.lineTotal)}`;
    })
    .join('\n');

  const paid =
    order.paidAmount !== undefined
      ? order.paidAmount
      : order.paymentMethod === 'udhaar'
      ? 0
      : order.total;

  const tpl = templateOverride?.trim() || DEFAULT_RECEIPT_TEMPLATE;
  return tpl
    .replaceAll('{shopName}', shopSettings.storeName || 'Khaas Retail')
    .replaceAll('{shopPhone}', shopSettings.phone || '')
    .replaceAll('{customerName}', customerName || 'Walk-in Customer')
    .replaceAll('{receiptNumber}', order.receiptNumber)
    .replaceAll('{dateTime}', dateStr)
    .replaceAll('{itemsList}', itemsList)
    .replaceAll('{total}', Math.round(order.total).toLocaleString('en-PK'))
    .replaceAll('{paid}', Math.round(paid).toLocaleString('en-PK'))
    .replaceAll('{balance}', Math.round(Math.max(0, outstandingBalance)).toLocaleString('en-PK'));
}

export function formatWhatsAppReminderMessage(params: {
  shopSettings: StoreSettings;
  customer: Pick<Customer, 'name' | 'balance' | 'dueDate'>;
  templateOverride?: string;
}): string {
  const { shopSettings, customer, templateOverride } = params;
  const tpl = templateOverride?.trim() || DEFAULT_REMINDER_TEMPLATE;
  return tpl
    .replaceAll('{shopName}', shopSettings.storeName || 'Khaas Retail')
    .replaceAll('{shopPhone}', shopSettings.phone || '')
    .replaceAll('{customerName}', customer.name)
    .replaceAll('{balance}', Math.round(Math.max(0, customer.balance)).toLocaleString('en-PK'))
    .replaceAll('{dueDate}', customer.dueDate || 'Due now');
}

export function formatWhatsAppStatementMessage(params: {
  shopSettings: StoreSettings;
  customer: Customer;
  entries: UdhaarEntry[];
}): string {
  const { shopSettings, customer, entries } = params;
  const recentLines = entries
    .slice(0, 8)
    .map((e) => {
      const d = new Date(e.createdAt).toLocaleDateString('en-PK');
      const sign = e.type === 'credit' ? '+Credit' : '-Payment';
      return `• ${d} | ${sign} Rs. ${Math.round(e.amount)} (${e.note || 'Ledger'})`;
    })
    .join('\n');

  return [
    `*${shopSettings.storeName || 'Khaas Retail'} — Account Statement*`,
    `Customer: ${customer.name}`,
    `Date: ${new Date().toLocaleDateString('en-PK')}`,
    `Outstanding Balance: Rs. ${Math.round(Math.max(0, customer.balance)).toLocaleString('en-PK')}`,
    customer.dueDate ? `Due Date: ${customer.dueDate}` : '',
    recentLines ? `\nRecent Entries:\n${recentLines}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildManualWhatsAppUrl(phone: string, message: string): string {
  const cleanPhone = normalizeWhatsAppPhone(phone);
  const encoded = encodeURIComponent(message);
  return cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

export interface SendWhatsAppResult {
  logEntry: WhatsAppMessageLog;
  manualFallbackUrl?: string;
  cloudConfigured: boolean;
}

export async function dispatchWhatsAppMessage(params: {
  customerId?: string;
  customerName: string;
  phone: string;
  messageType: WhatsAppMessageType;
  content: string;
  whatsappOptIn: boolean;
  existingAttempts?: number;
}): Promise<SendWhatsAppResult> {
  const now = new Date().toISOString();
  const cleanPhone = normalizeWhatsAppPhone(params.phone);
  const attempts = (params.existingAttempts ?? 0) + 1;

  if (!params.whatsappOptIn) {
    return {
      cloudConfigured: false,
      logEntry: {
        id: generateUuid(),
        customerId: params.customerId,
        customerName: params.customerName,
        phone: cleanPhone || params.phone,
        messageType: params.messageType,
        content: params.content,
        status: 'failed',
        deliveryMode: 'manual_link',
        errorMessage: 'Customer has not opted in to WhatsApp messages.',
        attempts,
        createdAt: now,
      },
    };
  }

  try {
    const headers = await getAuthenticatedRequestHeaders();
    const res = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: cleanPhone,
        message: params.content,
        messageType: params.messageType,
      }),
    });

    const data = (await res.json()) as {
      delivered?: boolean;
      configured?: boolean;
      providerMessageId?: string;
      error?: string;
    };

    if (res.ok && data.delivered) {
      return {
        cloudConfigured: true,
        logEntry: {
          id: generateUuid(),
          customerId: params.customerId,
          customerName: params.customerName,
          phone: cleanPhone,
          messageType: params.messageType,
          content: params.content,
          status: 'sent_api',
          deliveryMode: 'cloud_api',
          providerMessageId: data.providerMessageId,
          attempts,
          createdAt: now,
        },
      };
    }

    // If Cloud API credentials are absent on server, do NOT claim automatic delivery; return explicit manual fallback URL.
    if (data.configured === false) {
      const manualUrl = buildManualWhatsAppUrl(cleanPhone, params.content);
      return {
        cloudConfigured: false,
        manualFallbackUrl: manualUrl,
        logEntry: {
          id: generateUuid(),
          customerId: params.customerId,
          customerName: params.customerName,
          phone: cleanPhone || params.phone,
          messageType: params.messageType,
          content: params.content,
          status: 'manual_fallback',
          deliveryMode: 'manual_link',
          errorMessage:
            'WhatsApp Cloud API credentials are not configured on the server. Use manual WhatsApp link.',
          attempts,
          createdAt: now,
        },
      };
    }

    return {
      cloudConfigured: Boolean(data.configured),
      manualFallbackUrl: buildManualWhatsAppUrl(cleanPhone, params.content),
      logEntry: {
        id: generateUuid(),
        customerId: params.customerId,
        customerName: params.customerName,
        phone: cleanPhone,
        messageType: params.messageType,
        content: params.content,
        status: 'failed',
        deliveryMode: 'cloud_api',
        errorMessage: data.error || `HTTP ${res.status}`,
        attempts,
        createdAt: now,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error sending WhatsApp message';
    return {
      cloudConfigured: false,
      manualFallbackUrl: buildManualWhatsAppUrl(cleanPhone, params.content),
      logEntry: {
        id: generateUuid(),
        customerId: params.customerId,
        customerName: params.customerName,
        phone: cleanPhone || params.phone,
        messageType: params.messageType,
        content: params.content,
        status: 'pending_retry',
        deliveryMode: 'manual_link',
        errorMessage: msg,
        attempts,
        createdAt: now,
      },
    };
  }
}
