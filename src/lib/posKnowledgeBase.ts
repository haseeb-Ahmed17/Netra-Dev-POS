import type { AiAssistantLanguageMode, EmployeeRole } from '../types';

export interface PosKnowledgeModule {
  id: string;
  title: string;
  navLabel: string;
  minRoles: EmployeeRole[];
  capabilities: string[];
  limitations?: string[];
}

/**
 * Maintainable source of truth describing actual SmartBitz POS / Khaas Retail POS modules.
 * Update this catalog whenever new screens or workflows ship so the AI Assistant never invents features.
 */
export const SMARTBITZ_POS_KNOWLEDGE_MODULES: PosKnowledgeModule[] = [
  {
    id: 'pos_billing',
    title: 'POS Billing & Checkout',
    navLabel: 'POS Billing',
    minRoles: ['admin', 'manager', 'cashier'],
    capabilities: [
      'Search products by name, SKU, or barcode and filter by category (Beverages, Bakery, Pantry).',
      'Enter integer or decimal quantities using each product’s configured sellingUnit (kg, g, litre, ml, metre, cm, piece, packet, box, bottle).',
      'Apply per-item or bill-level discounts (% or fixed Rs.).',
      'Hold active bills (Held Bills) and resume or discard them later.',
      'Process Split Payments across Cash, JazzCash, EasyPaisa, Card, Bank Transfer, and Udhaar, with transaction ID tracking.',
      'Toggle Return Mode on the register or issue printable 58mm/80mm thermal receipts and live Customer Display updates.',
    ],
  },
  {
    id: 'barcode_qr_scanner',
    title: 'Barcode & QR Scanner',
    navLabel: 'POS Billing (Scanner)',
    minRoles: ['admin', 'manager', 'cashier'],
    capabilities: [
      'Supports USB/Bluetooth HID keyboard barcode scanners directly in the POS search/scan input.',
      'Built-in camera scanner supports barcode and QR code detection (@zxing/browser) and adds matching products to the cart.',
      'Products can store both barcode and qrCode values, and barcode stickers can be printed from Inventory.',
    ],
  },
  {
    id: 'inventory_products',
    title: 'Inventory & Products',
    navLabel: 'Stock & Adjustments / Inventory Report',
    minRoles: ['admin', 'manager'],
    capabilities: [
      'Create, edit, and (Admin/Manager) delete products with SKU, barcode, QR code, retail/wholesale/cost price, tax rate, and required sellingUnit selection.',
      'Track stock quantities with decimal precision, minStock/reorderLevel alerts, batchNumber, and expiryDate.',
      'Bulk import/update products via CSV and record audited stock adjustments (Damaged, Expired, Lost/Theft, Stock Count Correction).',
      'View Inventory Report with low-stock, out-of-stock, fast-moving, and slow-moving insights.',
    ],
  },
  {
    id: 'cash_drawer_shifts',
    title: 'Cash Drawer & Shifts',
    navLabel: 'Cash Drawer & Shifts',
    minRoles: ['admin', 'manager', 'cashier'],
    capabilities: [
      'Open a register shift with opening cash balance before cash billing.',
      'Automatically records cash_sale, cash_refund, and expense drawer movements linked to the active shift.',
      'Supports manual Cash In / Cash Out movements and hardware cash drawer kick when enabled in Store Settings.',
      'Close Shift reconciles expectedCash vs actualCash and records variance (closing requires Admin or Manager permission).',
    ],
  },
  {
    id: 'purchases_suppliers',
    title: 'Purchases & Suppliers (Vendors)',
    navLabel: 'Purchases / Vendors',
    minRoles: ['admin', 'manager'],
    capabilities: [
      'Manage vendor profiles, phone/address details, and payable balances.',
      'Create purchase invoices with status workflow (ordered, partial, received, returned), batch numbers, and expiry dates.',
      'Receiving stock automatically increments product inventory and logs purchase stock-in adjustments.',
      'Record vendor payments (cash, bank transfer, JazzCash, EasyPaisa) and purchase returns.',
    ],
  },
  {
    id: 'customers_udhaar',
    title: 'Customers & Udhaar (Khata)',
    navLabel: 'Customers / Udhaar / Khata',
    minRoles: ['admin', 'manager', 'cashier'],
    capabilities: [
      'Maintain customer CRM profiles with creditLimit, customer discount %, WhatsApp opt-in, and balance tracking.',
      'Dedicated Udhaar / Khata register for credit sales, partial/full payments, due dates, and reminder schedules (3 days, 1 week, 2 weeks, 1 month, custom).',
      'Send receipts and Udhaar reminders via manual WhatsApp wa.me links (always available) or optional server-side Meta WhatsApp Cloud API when configured.',
    ],
  },
  {
    id: 'returns_refunds',
    title: 'Returns, Exchanges & Cancellations',
    navLabel: 'Transactions',
    minRoles: ['admin', 'manager', 'cashier'],
    capabilities: [
      'Search completed orders by receipt number or customer and reprint thermal receipts.',
      'Process partial or full Return / Exchange from Transactions (cashiers/managers/admins), restoring returned stock quantities accurately.',
      'Cancel orders with mandatory cancellation reason (Admin/Manager permission required).',
    ],
  },
  {
    id: 'expenses',
    title: 'Shop Expenses',
    navLabel: 'Expenses',
    minRoles: ['admin', 'manager'],
    capabilities: [
      'Log expenses under Rent, Electricity, Staff Salary, Supplies, Maintenance, or Other.',
      'Optionally deduct an expense directly from an open Cash Drawer shift (paidFromDrawer).',
      'Supports recurring expenses (weekly, monthly, yearly) and pending/approved/rejected approval status.',
    ],
  },
  {
    id: 'analytics_reports',
    title: 'Executive Dashboard & Reports',
    navLabel: 'Dashboard / Audit Logs & Backups',
    minRoles: ['admin', 'manager'],
    capabilities: [
      'View Revenue, COGS, Gross Profit, Expenses, Net Profit, Tax, hourly/daily/weekly/monthly/yearly sales charts, and payment method breakdowns.',
      'Review top-selling products and inventory alerts (low/out-of-stock, fast-moving, slow-moving).',
      'Inspect Business Audit Logs, Employee Login/PIN Switch Activity, Offline Sync History, and export/restore full JSON backups (Admin only for backups).',
    ],
  },
  {
    id: 'staff_permissions',
    title: 'Staff & Permissions',
    navLabel: 'Staff & Permissions',
    minRoles: ['admin'],
    capabilities: [
      'Three roles: Admin, Manager, and Cashier, each authenticated with a hashed 4-digit Staff PIN (PBKDF2-SHA256 / pgcrypto).',
      'First-time store owners create their initial Store Admin PIN before standard PIN switching activates.',
      'Admins can add/edit/deactivate staff, assign branches/shifts, and grant safe custom operational permissions while keeping Admin-only actions protected.',
    ],
  },
  {
    id: 'branch_management',
    title: 'Branch Management & Transfers',
    navLabel: 'Branches',
    minRoles: ['admin', 'manager'],
    capabilities: [
      'Create and switch active store branches (Admin manages branches within SaaS subscription limits).',
      'Track branch-specific stock levels and create inter-branch Stock Transfers (pending -> approved -> completed/rejected).',
    ],
  },
  {
    id: 'online_orders_sync',
    title: 'Online Sync & Order Status',
    navLabel: 'Top Bar Sync / Audit Logs',
    minRoles: ['admin', 'manager', 'cashier'],
    capabilities: [
      'Cloud sync saves orders, inventory, customers, and Udhaar entries to Supabase when online.',
      'Offline sales queue safely in browser IndexedDB/localStorage and auto-sync when connectivity returns.',
    ],
    limitations: [
      'SmartBitz POS does NOT currently include a public customer-facing e-commerce storefront or external web checkout for online shopper orders. Orders are created at the POS terminal and synced to cloud.',
    ],
  },
];

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // JWT tokens (3 base64url segments)
  { pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, replacement: '[REDACTED_TOKEN]' },
  // Bearer headers
  { pattern: /\bBearer\s+[A-Za-z0-9._-]{12,}/gi, replacement: 'Bearer [REDACTED_TOKEN]' },
  // Common API keys (Google AIza, OpenAI/Stripe sk-, Supabase sb_, GitHub ghp_)
  { pattern: /\b(?:AIza[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z_-]{16,}|sb_[a-z]+_[0-9A-Za-z_-]{12,}|ghp_[0-9A-Za-z]{20,})\b/g, replacement: '[REDACTED_API_KEY]' },
  // Explicit password / pin / secret assignments
  {
    pattern: /\b(password|passcode|pin|pin_code|pinCode|pin_hash|pinHash|service_role|secret|api_key|apiKey)\b(\s*[:=]\s*)([^\s,;]+)/gi,
    replacement: '$1$2[REDACTED]',
  },
  // PBKDF2 hashes
  { pattern: /\bpbkdf2_sha256\$[^\s]+/gi, replacement: '[REDACTED_HASH]' },
  // 13-19 digit payment card sequences
  { pattern: /\b(?:\d[ -]*?){13,19}\b/g, replacement: '[REDACTED_CARD]' },
  // Pakistani CNIC (xxxxx-xxxxxxx-x)
  { pattern: /\b\d{5}-\d{7}-\d\b/g, replacement: '[REDACTED_ID]' },
];

export function sanitizeTextForAi(input: string, maxLength = 2000): string {
  let cleaned = typeof input === 'string' ? input.trim() : '';
  if (!cleaned) return '';
  for (const rule of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(rule.pattern, rule.replacement);
  }
  if (cleaned.length > maxLength) {
    cleaned = `${cleaned.slice(0, maxLength)}…`;
  }
  return cleaned;
}

const MODULE_KEYWORDS: Record<string, string[]> = {
  pos_billing: [
    'bill', 'billing', 'checkout', 'cart', 'sale', 'sell', 'discount', 'hold', 'held',
    'split', 'payment', 'cash', 'jazzcash', 'easypaisa', 'card', 'bank', 'receipt',
    'print', 'thermal', 'customer display', 'بل', 'سیل', 'رعایت', 'رسید', 'ادائیگی',
  ],
  barcode_qr_scanner: [
    'barcode', 'qr', 'scan', 'scanner', 'camera', 'usb', 'sticker', 'sku',
    'بارکوڈ', 'اسکین', 'کیمرہ',
  ],
  inventory_products: [
    'stock', 'inventory', 'product', 'item', 'unit', 'kg', 'litre', 'reorder',
    'minstock', 'expiry', 'expired', 'batch', 'csv', 'import', 'adjust', 'damage',
    'اسٹاک', 'آئٹم', 'قیمت', 'ایکسپائری',
  ],
  cash_drawer_shifts: [
    'shift', 'drawer', 'cash in', 'cash out', 'opening', 'closing', 'variance', 'till',
    'شفٹ', 'ڈراور', 'کیش',
  ],
  purchases_suppliers: [
    'purchase', 'supplier', 'vendor', 'po', 'payable', 'receive', 'خریداری', 'سپلائر',
  ],
  customers_udhaar: [
    'udhaar', 'khata', 'credit', 'receivable', 'reminder', 'whatsapp', 'customer',
    'ادھار', 'کھاتہ', 'گاہک', 'واٹس ایپ',
  ],
  returns_refunds: [
    'return', 'refund', 'exchange', 'cancel', 'void', 'transaction', 'واپسی', 'ریفنڈ', 'منسوخ',
  ],
  expenses: [
    'expense', 'expenses', 'rent', 'salary', 'electricity', 'recurring', 'kharcha', 'اخراجات', 'خرچہ',
  ],
  analytics_reports: [
    'report', 'dashboard', 'profit', 'cogs', 'revenue', 'analytics', 'audit', 'backup', 'restore', 'json',
    'رپورٹ', 'ڈیش بورڈ', 'منافع', 'بیک اپ',
  ],
  staff_permissions: [
    'staff', 'pin', 'role', 'permission', 'admin', 'manager', 'cashier', 'switch', 'اسٹاف', 'پن',
  ],
  branch_management: [
    'branch', 'branches', 'transfer', 'برانچ', 'ٹرانسفر',
  ],
  online_orders_sync: [
    'online', 'ecommerce', 'storefront', 'web order', 'sync', 'offline', 'internet',
    'آن لائن', 'آف لائن', 'سنک',
  ],
};

function selectModuleRelevance(
  prompt: string | undefined,
  accessibleModules: PosKnowledgeModule[]
): { detailed: PosKnowledgeModule[]; compact: PosKnowledgeModule[] } {
  const lower = (prompt || '').toLowerCase();
  if (!lower) {
    return { detailed: accessibleModules, compact: [] };
  }

  const matched = accessibleModules.filter((mod) =>
    (MODULE_KEYWORDS[mod.id] || []).some((kw) => lower.includes(kw))
  );

  if (matched.length === 0) {
    return { detailed: [], compact: accessibleModules };
  }

  const detailed = matched.slice(0, 4);
  const detailedIds = new Set(detailed.map((m) => m.id));
  const compact = accessibleModules.filter((m) => !detailedIds.has(m.id));
  return { detailed, compact };
}

export function buildPosAssistantSystemPrompt(options: {
  staffRole: EmployeeRole;
  shopName?: string;
  activeBranchName?: string;
  languageMode?: AiAssistantLanguageMode;
  prompt?: string;
}): string {
  const accessibleModules = SMARTBITZ_POS_KNOWLEDGE_MODULES.filter((mod) =>
    mod.minRoles.includes(options.staffRole)
  );
  const restrictedModules = SMARTBITZ_POS_KNOWLEDGE_MODULES.filter(
    (mod) => !mod.minRoles.includes(options.staffRole)
  );

  const { detailed, compact } = selectModuleRelevance(options.prompt, accessibleModules);

  const detailedDocs = detailed
    .map((m) => {
      const caps = m.capabilities.map((c) => `- ${c}`).join('\n');
      const lims = m.limitations?.length
        ? `\nLimitations:\n${m.limitations.map((l) => `- ${l}`).join('\n')}`
        : '';
      return `[${m.title} | ${m.navLabel}]\n${caps}${lims}`;
    })
    .join('\n\n');

  const compactDocs = compact
    .map((m) => {
      const firstCap = m.capabilities[0] ?? '';
      const limNote = m.limitations?.[0] ? ` Note: ${m.limitations[0]}` : '';
      return `- ${m.title} (${m.navLabel}): ${firstCap}${limNote}`;
    })
    .join('\n');

  const restrictedList =
    restrictedModules.length > 0
      ? restrictedModules.map((m) => `${m.title} (${m.minRoles.join('/')})`).join(', ')
      : 'None';

  const languageDirective =
    options.languageMode === 'ur'
      ? 'Reply in clear natural Urdu (اردو script).'
      : options.languageMode === 'roman_ur'
      ? 'Reply in clear Roman Urdu (Urdu in Latin script).'
      : options.languageMode === 'en'
      ? 'Reply in clear concise English.'
      : 'Match the user language: English -> English, Urdu script -> Urdu (اردو), Roman Urdu -> Roman Urdu.';

  const safeShopName = sanitizeTextForAi(options.shopName || 'Store', 80) || 'Store';
  const safeBranchName = sanitizeTextForAi(options.activeBranchName || '', 60);

  return [
    `You are SmartBitz POS (Khaas Retail) Assistant for "${safeShopName}"${safeBranchName ? ` (${safeBranchName})` : ''}, Role: ${options.staffRole}.`,
    languageDirective,
    'Rules:',
    '1. Answer strictly from the verified POS modules below; never invent screens or features (note: no public e-commerce storefront exists).',
    '2. Respect role limits; mention Admin/Manager approval if asked about restricted features.',
    '3. Read-only guidance only; never claim you changed DB records, sales, stock, or PINs.',
    '4. Never ask for or repeat PINs, passwords, API keys, tokens, or card/CNIC numbers.',
    '5. If an image/screenshot is provided, explain what is visible and give numbered steps.',
    detailedDocs ? `\nRELEVANT MODULES:\n${detailedDocs}` : '',
    compactDocs ? `\nOTHER ACCESSIBLE MODULES:\n${compactDocs}` : '',
    `\nRESTRICTED MODULES REQUIRING HIGHER ROLE: ${restrictedList}`,
  ]
    .filter(Boolean)
    .join('\n');
}
