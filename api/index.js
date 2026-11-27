var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// serverApp.ts
var serverApp_exports = {};
__export(serverApp_exports, {
  DEFAULT_INITIAL_FOUNDER_EMAIL: () => DEFAULT_INITIAL_FOUNDER_EMAIL,
  compareFounderEmails: () => compareFounderEmails,
  createPosExpressApp: () => createPosExpressApp,
  maskEmailForDiagnostics: () => maskEmailForDiagnostics,
  normalizeEmailForComparison: () => normalizeEmailForComparison,
  resolveFounderEmailConfig: () => resolveFounderEmailConfig,
  verifyIsExplicitSuperAdminWithDiagnostics: () => verifyIsExplicitSuperAdminWithDiagnostics
});
module.exports = __toCommonJS(serverApp_exports);
var import_config = require("dotenv/config");
var import_node_crypto2 = __toESM(require("node:crypto"), 1);
var import_express = __toESM(require("express"), 1);
var import_supabase_js2 = require("@supabase/supabase-js");

// src/lib/rbac.ts
var ACTION_REQUIRED_ROLES = {
  "dashboard.view": ["admin", "manager"],
  "reports.view": ["admin", "manager"],
  "pos.checkout": ["admin", "manager", "cashier"],
  "orders.read": ["admin", "manager", "cashier"],
  "orders.return": ["admin", "manager", "cashier"],
  "orders.cancel": ["admin", "manager"],
  "omnichannel.read": ["admin", "manager", "cashier"],
  "omnichannel.create": ["admin", "manager", "cashier"],
  "omnichannel.manage_status": ["admin", "manager", "cashier"],
  "omnichannel.payment": ["admin", "manager"],
  "storefront.manage": ["admin"],
  "shifts.manage": ["admin", "manager", "cashier"],
  "shifts.close": ["admin", "manager"],
  "inventory.write": ["admin", "manager"],
  "purchases.write": ["admin", "manager"],
  "vendors.write": ["admin", "manager"],
  "expenses.write": ["admin", "manager"],
  "expenses.approve": ["admin", "manager"],
  "customers.write": ["admin", "manager", "cashier"],
  "customers.delete": ["admin"],
  "udhaar.write": ["admin", "manager", "cashier"],
  "branches.manage": ["admin"],
  "transfers.approve": ["admin", "manager"],
  "whatsapp.send": ["admin", "manager", "cashier"],
  "audit.view": ["admin", "manager"],
  "backup.manage": ["admin"],
  "staff.manage": ["admin"],
  "settings.write": ["admin"],
  "workspace.reset": ["admin"],
  "ai.assist": ["admin", "manager", "cashier"]
};
function hasRolePermission(role, action, customPermissions) {
  if (!role) return false;
  if (role === "admin") return true;
  if (Array.isArray(customPermissions) && customPermissions.length > 0) {
    const adminOnlyActions = [
      "staff.manage",
      "backup.manage",
      "workspace.reset",
      "settings.write",
      "storefront.manage",
      "customers.delete",
      "branches.manage"
    ];
    if (!adminOnlyActions.includes(action) && customPermissions.includes(action)) {
      return true;
    }
  }
  return ACTION_REQUIRED_ROLES[action].includes(role);
}

// src/lib/pinSecurity.ts
var PBKDF2_PREFIX = "pbkdf2_sha256";
var PBKDF2_ITERATIONS = 1e5;
var REDACTED_PIN_SENTINEL = "****";
var DEMO_PIN_HASHES = {
  "1234": "pbkdf2_sha256$100000$a1b2c3d4e5f60718293a4b5c6d7e8f90$ca1be9e2534f95e439dd905233c2cadf4be34117c0c9a790965f412ceb14ce23",
  "2222": "pbkdf2_sha256$100000$b2c3d4e5f60718293a4b5c6d7e8f90a1$91f287c6f9da3fcd127352dff45b87133486124cdce3d7ff83215cebca2ded82",
  "1111": "pbkdf2_sha256$100000$c3d4e5f60718293a4b5c6d7e8f90a1b2$a6c27b54275428421e84b039bfcee7038d2e22e317ae3bc169ba3c199a9d31e3"
};
function isValidPinFormat(pin) {
  return /^\d{4}$/.test(pin.trim());
}
function isStoredPinHash(value) {
  if (!value) return false;
  return value.startsWith(`${PBKDF2_PREFIX}$`) || value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$");
}
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    return null;
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
function getSubtleCrypto() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto SubtleCrypto is unavailable in this environment.");
  }
  return subtle;
}
async function derivePbkdf2Sha256Hex(pin, saltBytes, iterations) {
  const subtle = getSubtleCrypto();
  const encoder = new TextEncoder();
  const baseKey = await subtle.importKey(
    "raw",
    encoder.encode(pin.trim()),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const normalizedSalt = new Uint8Array(saltBytes.length);
  normalizedSalt.set(saltBytes);
  const derivedBits = await subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: normalizedSalt,
      iterations,
      hash: "SHA-256"
    },
    baseKey,
    256
  );
  return bytesToHex(new Uint8Array(derivedBits));
}
async function hashPinAsync(pin, saltHexOverride) {
  const normalized = pin.trim();
  if (!isValidPinFormat(normalized)) {
    throw new Error("Staff PIN must be exactly 4 numeric digits.");
  }
  let saltBytes;
  if (saltHexOverride) {
    const parsed = hexToBytes(saltHexOverride);
    if (!parsed) throw new Error("Invalid PIN salt.");
    saltBytes = new Uint8Array(new ArrayBuffer(parsed.length));
    saltBytes.set(parsed);
  } else {
    saltBytes = new Uint8Array(new ArrayBuffer(16));
    globalThis.crypto.getRandomValues(saltBytes);
  }
  const saltHex = bytesToHex(saltBytes);
  const hashHex = await derivePbkdf2Sha256Hex(normalized, saltBytes, PBKDF2_ITERATIONS);
  return `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`;
}
async function verifyPinHashAsync(candidatePin, storedHash) {
  const normalized = candidatePin.trim();
  if (!isValidPinFormat(normalized) || !storedHash) {
    return false;
  }
  const parts = storedHash.split("$");
  if (parts.length !== 4 || parts[0] !== PBKDF2_PREFIX) {
    return false;
  }
  const iterations = Number(parts[1]);
  const saltBytes = hexToBytes(parts[2]);
  const expectedHex = parts[3];
  if (!Number.isInteger(iterations) || iterations < 1e4 || !saltBytes || !expectedHex) {
    return false;
  }
  const derivedHex = await derivePbkdf2Sha256Hex(normalized, saltBytes, iterations);
  if (derivedHex.length !== expectedHex.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < derivedHex.length; i++) {
    diff |= derivedHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return diff === 0;
}
var DEMO_FIXTURE_HASH_SET = new Set(Object.values(DEMO_PIN_HASHES));
function isDemoFixturePinHash(value) {
  if (!value) return false;
  return DEMO_FIXTURE_HASH_SET.has(value.trim());
}
function classifyEmployeePin(opts) {
  const pinHash = typeof opts.pinHash === "string" ? opts.pinHash.trim() : "";
  const pinCode = typeof opts.pinCode === "string" ? opts.pinCode.trim() : "";
  if (isDemoFixturePinHash(pinHash) || isDemoFixturePinHash(pinCode)) {
    return "demo_fixture";
  }
  if (isStoredPinHash(pinHash) || isStoredPinHash(pinCode)) {
    return "hashed";
  }
  if (isValidPinFormat(pinCode)) {
    return "legacy_4digit";
  }
  return "unconfigured";
}

// src/lib/posKnowledgeBase.ts
var SMARTBITZ_POS_KNOWLEDGE_MODULES = [
  {
    id: "pos_billing",
    title: "POS Billing & Checkout",
    navLabel: "POS Billing",
    minRoles: ["admin", "manager", "cashier"],
    capabilities: [
      "Search products by name, SKU, or barcode and filter by category (Beverages, Bakery, Pantry).",
      "Enter integer or decimal quantities using each product\u2019s configured sellingUnit (kg, g, litre, ml, metre, cm, piece, packet, box, bottle).",
      "Apply per-item or bill-level discounts (% or fixed Rs.).",
      "Hold active bills (Held Bills) and resume or discard them later.",
      "Process Split Payments across Cash, JazzCash, EasyPaisa, Card, Bank Transfer, and Udhaar, with transaction ID tracking.",
      "Toggle Return Mode on the register or issue printable 58mm/80mm thermal receipts and live Customer Display updates."
    ]
  },
  {
    id: "barcode_qr_scanner",
    title: "Barcode & QR Scanner",
    navLabel: "POS Billing (Scanner)",
    minRoles: ["admin", "manager", "cashier"],
    capabilities: [
      "Supports USB/Bluetooth HID keyboard barcode scanners directly in the POS search/scan input.",
      "Built-in camera scanner supports barcode and QR code detection (@zxing/browser) and adds matching products to the cart.",
      "Products can store both barcode and qrCode values, and barcode stickers can be printed from Inventory."
    ]
  },
  {
    id: "inventory_products",
    title: "Inventory & Products",
    navLabel: "Stock & Adjustments / Inventory Report",
    minRoles: ["admin", "manager"],
    capabilities: [
      "Create, edit, and (Admin/Manager) delete products with SKU, barcode, QR code, retail/wholesale/cost price, tax rate, and required sellingUnit selection.",
      "Track stock quantities with decimal precision, minStock/reorderLevel alerts, batchNumber, and expiryDate.",
      "Bulk import/update products via CSV and record audited stock adjustments (Damaged, Expired, Lost/Theft, Stock Count Correction).",
      "View Inventory Report with low-stock, out-of-stock, fast-moving, and slow-moving insights."
    ]
  },
  {
    id: "cash_drawer_shifts",
    title: "Cash Drawer & Shifts",
    navLabel: "Cash Drawer & Shifts",
    minRoles: ["admin", "manager", "cashier"],
    capabilities: [
      "Open a register shift with opening cash balance before cash billing.",
      "Automatically records cash_sale, cash_refund, and expense drawer movements linked to the active shift.",
      "Supports manual Cash In / Cash Out movements and hardware cash drawer kick when enabled in Store Settings.",
      "Close Shift reconciles expectedCash vs actualCash and records variance (closing requires Admin or Manager permission)."
    ]
  },
  {
    id: "purchases_suppliers",
    title: "Purchases & Suppliers (Vendors)",
    navLabel: "Purchases / Vendors",
    minRoles: ["admin", "manager"],
    capabilities: [
      "Manage vendor profiles, phone/address details, and payable balances.",
      "Create purchase invoices with status workflow (ordered, partial, received, returned), batch numbers, and expiry dates.",
      "Receiving stock automatically increments product inventory and logs purchase stock-in adjustments.",
      "Record vendor payments (cash, bank transfer, JazzCash, EasyPaisa) and purchase returns."
    ]
  },
  {
    id: "customers_udhaar",
    title: "Customers & Udhaar (Khata)",
    navLabel: "Customers / Udhaar / Khata",
    minRoles: ["admin", "manager", "cashier"],
    capabilities: [
      "Maintain customer CRM profiles with creditLimit, customer discount %, WhatsApp opt-in, and balance tracking.",
      "Dedicated Udhaar / Khata register for credit sales, partial/full payments, due dates, and reminder schedules (3 days, 1 week, 2 weeks, 1 month, custom).",
      "Send receipts and Udhaar reminders via manual WhatsApp wa.me links (always available) or optional server-side Meta WhatsApp Cloud API when configured."
    ]
  },
  {
    id: "returns_refunds",
    title: "Returns, Exchanges & Cancellations",
    navLabel: "Transactions",
    minRoles: ["admin", "manager", "cashier"],
    capabilities: [
      "Search completed orders by receipt number or customer and reprint thermal receipts.",
      "Process partial or full Return / Exchange from Transactions (cashiers/managers/admins), restoring returned stock quantities accurately.",
      "Cancel orders with mandatory cancellation reason (Admin/Manager permission required)."
    ]
  },
  {
    id: "expenses",
    title: "Shop Expenses",
    navLabel: "Expenses",
    minRoles: ["admin", "manager"],
    capabilities: [
      "Log expenses under Rent, Electricity, Staff Salary, Supplies, Maintenance, or Other.",
      "Optionally deduct an expense directly from an open Cash Drawer shift (paidFromDrawer).",
      "Supports recurring expenses (weekly, monthly, yearly) and pending/approved/rejected approval status."
    ]
  },
  {
    id: "analytics_reports",
    title: "Executive Dashboard & Reports",
    navLabel: "Dashboard / Audit Logs & Backups",
    minRoles: ["admin", "manager"],
    capabilities: [
      "View Revenue, COGS, Gross Profit, Expenses, Net Profit, Tax, hourly/daily/weekly/monthly/yearly sales charts, and payment method breakdowns.",
      "Review top-selling products and inventory alerts (low/out-of-stock, fast-moving, slow-moving).",
      "Inspect Business Audit Logs, Employee Login/PIN Switch Activity, Offline Sync History, and export/restore full JSON backups (Admin only for backups)."
    ]
  },
  {
    id: "staff_permissions",
    title: "Staff & Permissions",
    navLabel: "Staff & Permissions",
    minRoles: ["admin"],
    capabilities: [
      "Three roles: Admin, Manager, and Cashier, each authenticated with a hashed 4-digit Staff PIN (PBKDF2-SHA256 / pgcrypto).",
      "First-time store owners create their initial Store Admin PIN before standard PIN switching activates.",
      "Admins can add/edit/deactivate staff, assign branches/shifts, and grant safe custom operational permissions while keeping Admin-only actions protected."
    ]
  },
  {
    id: "branch_management",
    title: "Branch Management & Transfers",
    navLabel: "Branches",
    minRoles: ["admin", "manager"],
    capabilities: [
      "Create and switch active store branches (Admin manages branches within SaaS subscription limits).",
      "Track branch-specific stock levels and create inter-branch Stock Transfers (pending -> approved -> completed/rejected)."
    ]
  },
  {
    id: "online_orders_sync",
    title: "Omnichannel Orders, Public Storefront & Cloud Sync",
    navLabel: "Omnichannel Orders / Storefront",
    minRoles: ["admin", "manager", "cashier"],
    capabilities: [
      "Each shop can enable a public online storefront link (?store=<slug>) displaying only public product prices, stock availability, and images.",
      "Central Omnichannel Orders dashboard manages Website, WhatsApp, and Phone orders through New -> Accepted -> Preparing -> Ready -> Delivered (or Rejected/Cancelled).",
      "Stock is deducted once only when an order transitions to Accepted, and restored once if an accepted/preparing/ready order is cancelled.",
      "Cloud sync saves orders, inventory, customers, and Udhaar entries to Supabase when online; offline POS sales queue safely in IndexedDB/localStorage."
    ],
    limitations: [
      "Automatic WhatsApp Cloud API delivery and webhooks require server WhatsApp credentials; without them, SmartBitz uses manual wa.me fallback links. Live online card payment gateways require server payment configuration."
    ]
  }
];
var SENSITIVE_PATTERNS = [
  // JWT tokens (3 base64url segments)
  { pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, replacement: "[REDACTED_TOKEN]" },
  // Bearer headers
  { pattern: /\bBearer\s+[A-Za-z0-9._-]{12,}/gi, replacement: "Bearer [REDACTED_TOKEN]" },
  // Common API keys (Google AIza, OpenAI/Stripe sk-, Supabase sb_, GitHub ghp_)
  { pattern: /\b(?:AIza[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z_-]{16,}|sb_[a-z]+_[0-9A-Za-z_-]{12,}|ghp_[0-9A-Za-z]{20,})\b/g, replacement: "[REDACTED_API_KEY]" },
  // Explicit password / pin / secret assignments
  {
    pattern: /\b(password|passcode|pin|pin_code|pinCode|pin_hash|pinHash|service_role|secret|api_key|apiKey)\b(\s*[:=]\s*)([^\s,;]+)/gi,
    replacement: "$1$2[REDACTED]"
  },
  // PBKDF2 hashes
  { pattern: /\bpbkdf2_sha256\$[^\s]+/gi, replacement: "[REDACTED_HASH]" },
  // 13-19 digit payment card sequences
  { pattern: /\b(?:\d[ -]*?){13,19}\b/g, replacement: "[REDACTED_CARD]" },
  // Pakistani CNIC (xxxxx-xxxxxxx-x)
  { pattern: /\b\d{5}-\d{7}-\d\b/g, replacement: "[REDACTED_ID]" }
];
function sanitizeTextForAi(input, maxLength = 2e3) {
  let cleaned = typeof input === "string" ? input.trim() : "";
  if (!cleaned) return "";
  for (const rule of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(rule.pattern, rule.replacement);
  }
  if (cleaned.length > maxLength) {
    cleaned = `${cleaned.slice(0, maxLength)}\u2026`;
  }
  return cleaned;
}
var MODULE_KEYWORDS = {
  pos_billing: [
    "bill",
    "billing",
    "checkout",
    "cart",
    "sale",
    "sell",
    "discount",
    "hold",
    "held",
    "split",
    "payment",
    "cash",
    "jazzcash",
    "easypaisa",
    "card",
    "bank",
    "receipt",
    "print",
    "thermal",
    "customer display",
    "\u0628\u0644",
    "\u0633\u06CC\u0644",
    "\u0631\u0639\u0627\u06CC\u062A",
    "\u0631\u0633\u06CC\u062F",
    "\u0627\u062F\u0627\u0626\u06CC\u06AF\u06CC"
  ],
  barcode_qr_scanner: [
    "barcode",
    "qr",
    "scan",
    "scanner",
    "camera",
    "usb",
    "sticker",
    "sku",
    "\u0628\u0627\u0631\u06A9\u0648\u0688",
    "\u0627\u0633\u06A9\u06CC\u0646",
    "\u06A9\u06CC\u0645\u0631\u06C1"
  ],
  inventory_products: [
    "stock",
    "inventory",
    "product",
    "item",
    "unit",
    "kg",
    "litre",
    "reorder",
    "minstock",
    "expiry",
    "expired",
    "batch",
    "csv",
    "import",
    "adjust",
    "damage",
    "\u0627\u0633\u0679\u0627\u06A9",
    "\u0622\u0626\u0679\u0645",
    "\u0642\u06CC\u0645\u062A",
    "\u0627\u06CC\u06A9\u0633\u067E\u0627\u0626\u0631\u06CC"
  ],
  cash_drawer_shifts: [
    "shift",
    "drawer",
    "cash in",
    "cash out",
    "opening",
    "closing",
    "variance",
    "till",
    "\u0634\u0641\u0679",
    "\u0688\u0631\u0627\u0648\u0631",
    "\u06A9\u06CC\u0634"
  ],
  purchases_suppliers: [
    "purchase",
    "supplier",
    "vendor",
    "po",
    "payable",
    "receive",
    "\u062E\u0631\u06CC\u062F\u0627\u0631\u06CC",
    "\u0633\u067E\u0644\u0627\u0626\u0631"
  ],
  customers_udhaar: [
    "udhaar",
    "khata",
    "credit",
    "receivable",
    "reminder",
    "whatsapp",
    "customer",
    "\u0627\u062F\u06BE\u0627\u0631",
    "\u06A9\u06BE\u0627\u062A\u06C1",
    "\u06AF\u0627\u06C1\u06A9",
    "\u0648\u0627\u0679\u0633 \u0627\u06CC\u067E"
  ],
  returns_refunds: [
    "return",
    "refund",
    "exchange",
    "cancel",
    "void",
    "transaction",
    "\u0648\u0627\u067E\u0633\u06CC",
    "\u0631\u06CC\u0641\u0646\u0688",
    "\u0645\u0646\u0633\u0648\u062E"
  ],
  expenses: [
    "expense",
    "expenses",
    "rent",
    "salary",
    "electricity",
    "recurring",
    "kharcha",
    "\u0627\u062E\u0631\u0627\u062C\u0627\u062A",
    "\u062E\u0631\u0686\u06C1"
  ],
  analytics_reports: [
    "report",
    "dashboard",
    "profit",
    "cogs",
    "revenue",
    "analytics",
    "audit",
    "backup",
    "restore",
    "json",
    "\u0631\u067E\u0648\u0631\u0679",
    "\u0688\u06CC\u0634 \u0628\u0648\u0631\u0688",
    "\u0645\u0646\u0627\u0641\u0639",
    "\u0628\u06CC\u06A9 \u0627\u067E"
  ],
  staff_permissions: [
    "staff",
    "pin",
    "role",
    "permission",
    "admin",
    "manager",
    "cashier",
    "switch",
    "\u0627\u0633\u0679\u0627\u0641",
    "\u067E\u0646"
  ],
  branch_management: [
    "branch",
    "branches",
    "transfer",
    "\u0628\u0631\u0627\u0646\u0686",
    "\u0679\u0631\u0627\u0646\u0633\u0641\u0631"
  ],
  online_orders_sync: [
    "online",
    "ecommerce",
    "storefront",
    "web order",
    "sync",
    "offline",
    "internet",
    "\u0622\u0646 \u0644\u0627\u0626\u0646",
    "\u0622\u0641 \u0644\u0627\u0626\u0646",
    "\u0633\u0646\u06A9"
  ]
};
function selectModuleRelevance(prompt, accessibleModules) {
  const lower = (prompt || "").toLowerCase();
  if (!lower) {
    return { detailed: accessibleModules, compact: [] };
  }
  const matched = accessibleModules.filter(
    (mod) => (MODULE_KEYWORDS[mod.id] || []).some((kw) => lower.includes(kw))
  );
  if (matched.length === 0) {
    return { detailed: [], compact: accessibleModules };
  }
  const detailed = matched.slice(0, 4);
  const detailedIds = new Set(detailed.map((m) => m.id));
  const compact = accessibleModules.filter((m) => !detailedIds.has(m.id));
  return { detailed, compact };
}
function buildPosAssistantSystemPrompt(options) {
  const accessibleModules = SMARTBITZ_POS_KNOWLEDGE_MODULES.filter(
    (mod) => mod.minRoles.includes(options.staffRole)
  );
  const restrictedModules = SMARTBITZ_POS_KNOWLEDGE_MODULES.filter(
    (mod) => !mod.minRoles.includes(options.staffRole)
  );
  const { detailed, compact } = selectModuleRelevance(options.prompt, accessibleModules);
  const detailedDocs = detailed.map((m) => {
    const caps = m.capabilities.map((c) => `- ${c}`).join("\n");
    const lims = m.limitations?.length ? `
Limitations:
${m.limitations.map((l) => `- ${l}`).join("\n")}` : "";
    return `[${m.title} | ${m.navLabel}]
${caps}${lims}`;
  }).join("\n\n");
  const compactDocs = compact.map((m) => {
    const firstCap = m.capabilities[0] ?? "";
    const limNote = m.limitations?.[0] ? ` Note: ${m.limitations[0]}` : "";
    return `- ${m.title} (${m.navLabel}): ${firstCap}${limNote}`;
  }).join("\n");
  const restrictedList = restrictedModules.length > 0 ? restrictedModules.map((m) => `${m.title} (${m.minRoles.join("/")})`).join(", ") : "None";
  const languageDirective = options.languageMode === "ur" ? "Reply in clear natural Urdu (\u0627\u0631\u062F\u0648 script)." : options.languageMode === "roman_ur" ? "Reply in clear Roman Urdu (Urdu in Latin script)." : options.languageMode === "en" ? "Reply in clear concise English." : "Match the user language: English -> English, Urdu script -> Urdu (\u0627\u0631\u062F\u0648), Roman Urdu -> Roman Urdu.";
  const safeShopName = sanitizeTextForAi(options.shopName || "Store", 80) || "Store";
  const safeBranchName = sanitizeTextForAi(options.activeBranchName || "", 60);
  return [
    `You are SmartBitz POS (Khaas Retail) Assistant for "${safeShopName}"${safeBranchName ? ` (${safeBranchName})` : ""}, Role: ${options.staffRole}.`,
    languageDirective,
    "Rules:",
    "1. Answer strictly from the verified POS modules below; never invent screens or features (note: no public e-commerce storefront exists).",
    "2. Respect role limits; mention Admin/Manager approval if asked about restricted features.",
    "3. Read-only guidance only; never claim you changed DB records, sales, stock, or PINs.",
    "4. Never ask for or repeat PINs, passwords, API keys, tokens, or card/CNIC numbers.",
    "5. If an image/screenshot is provided, explain what is visible and give numbered steps.",
    detailedDocs ? `
RELEVANT MODULES:
${detailedDocs}` : "",
    compactDocs ? `
OTHER ACCESSIBLE MODULES:
${compactDocs}` : "",
    `
RESTRICTED MODULES REQUIRING HIGHER ROLE: ${restrictedList}`
  ].filter(Boolean).join("\n");
}

// serverAiAssistant.ts
var OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
var DEFAULT_AI_ASSISTANT_MODEL = "openrouter/free";
var DEFAULT_OPENROUTER_TIMEOUT_MS = 25e3;
var ALLOWED_IMAGE_MIME_TYPES = /* @__PURE__ */ new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
]);
function parsePositiveInt(raw, fallback, min, max) {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}
function resolveAiAssistantConfig(env = process.env) {
  const rawEnabled = (env.AI_ASSISTANT_ENABLED ?? "true").trim().toLowerCase();
  const enabled = !["false", "0", "no", "off", "disabled"].includes(rawEnabled);
  const rawKey = (env.OPENROUTER_API_KEY || "").trim();
  const configured = rawKey.length > 10 && !rawKey.includes("MY_OPENROUTER_API_KEY") && !rawKey.includes("YOUR_");
  const requestedModel = (env.OPENROUTER_MODEL || "").trim();
  const model = requestedModel || DEFAULT_AI_ASSISTANT_MODEL;
  const rawAppUrl = (env.APP_URL || "").trim();
  const appUrl = /^https?:\/\//i.test(rawAppUrl) ? rawAppUrl : "https://smartbitz-pos.local";
  return {
    enabled,
    configured,
    apiKey: configured ? rawKey : "",
    model,
    dailyLimitPerTenant: parsePositiveInt(
      env.AI_ASSISTANT_DAILY_LIMIT_PER_TENANT,
      50,
      1,
      5e3
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
      5e3,
      6e4
    ),
    appUrl
  };
}
var AiUsageTracker = class {
  constructor() {
    this.store = /* @__PURE__ */ new Map();
  }
  getTodayKey(nowMs = Date.now()) {
    return new Date(nowMs).toISOString().slice(0, 10);
  }
  getOrCreate(tenantUserId, nowMs = Date.now()) {
    const dayKey = this.getTodayKey(nowMs);
    const existing = this.store.get(tenantUserId);
    if (!existing || existing.dayKey !== dayKey) {
      const fresh = {
        dayKey,
        countToday: 0,
        minuteTimestamps: existing ? existing.minuteTimestamps.filter((ts) => nowMs - ts < 6e4) : []
      };
      this.store.set(tenantUserId, fresh);
      return fresh;
    }
    existing.minuteTimestamps = existing.minuteTimestamps.filter(
      (ts) => nowMs - ts < 6e4
    );
    return existing;
  }
  getSnapshot(tenantUserId, config, nowMs = Date.now()) {
    const rec = this.getOrCreate(tenantUserId, nowMs);
    return {
      usedToday: rec.countToday,
      remainingToday: Math.max(0, config.dailyLimitPerTenant - rec.countToday),
      dailyLimit: config.dailyLimitPerTenant
    };
  }
  tryConsume(tenantUserId, config, nowMs = Date.now()) {
    const rec = this.getOrCreate(tenantUserId, nowMs);
    if (rec.minuteTimestamps.length >= config.rateLimitPerMinute) {
      const oldestTs = rec.minuteTimestamps[0] ?? nowMs;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((6e4 - (nowMs - oldestTs)) / 1e3)
      );
      return {
        allowed: false,
        code: "RATE_LIMIT_EXCEEDED",
        error: `Too many AI requests in a short time. Please wait ${retryAfterSeconds}s before asking again.`,
        retryAfterSeconds,
        usedToday: rec.countToday,
        remainingToday: Math.max(0, config.dailyLimitPerTenant - rec.countToday)
      };
    }
    if (rec.countToday >= config.dailyLimitPerTenant) {
      return {
        allowed: false,
        code: "DAILY_LIMIT_REACHED",
        error: `Daily AI Assistant limit (${config.dailyLimitPerTenant} requests) reached for this store.`,
        retryAfterSeconds: 3600,
        usedToday: rec.countToday,
        remainingToday: 0
      };
    }
    rec.countToday += 1;
    rec.minuteTimestamps.push(nowMs);
    return {
      allowed: true,
      usedToday: rec.countToday,
      remainingToday: Math.max(0, config.dailyLimitPerTenant - rec.countToday)
    };
  }
  refund(tenantUserId, nowMs = Date.now()) {
    const rec = this.getOrCreate(tenantUserId, nowMs);
    if (rec.countToday > 0) {
      rec.countToday -= 1;
    }
    if (rec.minuteTimestamps.length > 0) {
      rec.minuteTimestamps.pop();
    }
  }
};
function validateAiAssistRequestBody(rawBody, maxImageBytes) {
  if (!rawBody || typeof rawBody !== "object") {
    return { ok: false, status: 400, error: "Request body must be a JSON object." };
  }
  const body = rawBody;
  const rawPrompt = typeof body.prompt === "string" ? body.prompt : typeof body.message === "string" ? body.message : "";
  const prompt = sanitizeTextForAi(rawPrompt, 2e3);
  const rawLang = typeof body.languageMode === "string" ? body.languageMode.trim() : typeof body.language === "string" ? body.language.trim() : "auto";
  const languageMode = rawLang === "en" || rawLang === "ur" || rawLang === "roman_ur" || rawLang === "auto" ? rawLang : "auto";
  let attachment = null;
  if (body.attachment !== void 0 && body.attachment !== null) {
    if (typeof body.attachment !== "object") {
      return {
        ok: false,
        status: 400,
        error: "Invalid screenshot attachment payload."
      };
    }
    const att = body.attachment;
    const mimeType = typeof att.mimeType === "string" ? att.mimeType.trim().toLowerCase() : "";
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      return {
        ok: false,
        status: 400,
        error: "Unsupported image format. Please upload PNG, JPEG, WEBP, or GIF screenshots only."
      };
    }
    const rawBase64 = typeof att.base64Data === "string" ? att.base64Data.trim() : "";
    const strippedBase64 = rawBase64.replace(/^data:image\/[a-z0-9+.-]+;base64,/i, "").replace(/\s+/g, "");
    if (!strippedBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(strippedBase64)) {
      return {
        ok: false,
        status: 400,
        error: "Screenshot base64 image data is invalid."
      };
    }
    const decoded = Buffer.from(strippedBase64, "base64");
    if (decoded.length === 0) {
      return {
        ok: false,
        status: 400,
        error: "Screenshot file appears to be empty."
      };
    }
    if (decoded.length > maxImageBytes) {
      return {
        ok: false,
        status: 413,
        error: `Screenshot exceeds the maximum allowed size (${Math.round(maxImageBytes / (1024 * 1024))} MB).`
      };
    }
    attachment = {
      mimeType,
      base64Data: strippedBase64,
      sizeBytes: decoded.length
    };
  }
  if (!prompt && !attachment) {
    return {
      ok: false,
      status: 400,
      error: "Please enter a question or attach a screenshot for guidance."
    };
  }
  const history = [];
  if (Array.isArray(body.history)) {
    const recent = body.history.slice(-4);
    for (const item of recent) {
      if (!item || typeof item !== "object") continue;
      const turn = item;
      const role = turn.role === "assistant" ? "assistant" : turn.role === "user" ? "user" : null;
      const text = typeof turn.text === "string" ? sanitizeTextForAi(turn.text, 600) : "";
      if (role && text) {
        history.push({ role, text });
      }
    }
  }
  const customPermissions = Array.isArray(body.customPermissions) ? body.customPermissions.filter((p) => typeof p === "string").slice(0, 30) : void 0;
  const rawBranchName = typeof body.activeBranchName === "string" ? body.activeBranchName : typeof body.branchName === "string" ? body.branchName : "";
  return {
    ok: true,
    value: {
      prompt: prompt || "Examine this SmartBitz POS screenshot, explain what is visible, and give safe numbered steps.",
      languageMode,
      history,
      attachment,
      shopName: typeof body.shopName === "string" ? sanitizeTextForAi(body.shopName, 80) : void 0,
      activeBranchName: rawBranchName ? sanitizeTextForAi(rawBranchName, 60) : void 0,
      customPermissions,
      stream: body.stream === true
    }
  };
}
function buildAiAssistantStatusPayload(tenantUserId, config, tracker) {
  const usage = tracker.getSnapshot(tenantUserId, config);
  const available = config.enabled && config.configured && usage.remainingToday > 0;
  let reason;
  if (!config.enabled) {
    reason = "AI Assistant is disabled by server configuration.";
  } else if (!config.configured) {
    reason = "Server AI provider credentials (OPENROUTER_API_KEY) are not configured. All POS features continue working normally.";
  } else if (usage.remainingToday <= 0) {
    reason = "Daily AI Assistant usage limit reached for this store.";
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
    reason
  };
}
function isSafeCacheablePosQuery(input) {
  if (input.attachment) return false;
  if (input.history.length > 0) return false;
  const prompt = input.prompt.trim();
  if (prompt.length < 8 || prompt.length > 220) return false;
  if (/\d/.test(prompt)) return false;
  if (prompt.includes("@") || prompt.includes("[REDACTED")) return false;
  if (/\b(?:rs\.?|pkr|usd|invoice|receipt|bill\s*#|order\s*#|customer|vendor|supplier|employee|cashier|balance|salary|profit|revenue|my\s+shop|my\s+store|hamari|mera)\b/i.test(
    prompt
  )) {
    return false;
  }
  return true;
}
var SafePosHowToCache = class {
  constructor(maxEntries = 64, ttlMs = 5 * 6e4) {
    this.store = /* @__PURE__ */ new Map();
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }
  makeKey(params) {
    const normalized = params.prompt.trim().toLowerCase().replace(/\s+/g, " ");
    return `${params.model}::${params.staffRole}::${params.languageMode}::${normalized}`;
  }
  get(params, nowMs = Date.now()) {
    if (!isSafeCacheablePosQuery(params.input)) return null;
    const key = this.makeKey({
      model: params.model,
      staffRole: params.staffRole,
      languageMode: params.input.languageMode,
      prompt: params.input.prompt
    });
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= nowMs) {
      this.store.delete(key);
      return null;
    }
    return { reply: entry.reply, model: entry.model };
  }
  set(params, nowMs = Date.now()) {
    if (!isSafeCacheablePosQuery(params.input)) return;
    if (!params.reply.trim()) return;
    const key = this.makeKey({
      model: params.model,
      staffRole: params.staffRole,
      languageMode: params.input.languageMode,
      prompt: params.input.prompt
    });
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }
    this.store.set(key, {
      reply: params.reply,
      model: params.resolvedModel,
      expiresAt: nowMs + this.ttlMs
    });
  }
};
var AiProviderError = class extends Error {
  constructor(message, options) {
    super(message);
    this.name = "AiProviderError";
    this.httpStatus = options?.httpStatus ?? 502;
    this.isTimeout = Boolean(options?.isTimeout);
    this.isCancelled = Boolean(options?.isCancelled);
  }
};
function buildOpenRouterMessages(input, systemInstruction) {
  const messages = [
    { role: "system", content: systemInstruction }
  ];
  for (const turn of input.history) {
    messages.push({
      role: turn.role === "assistant" ? "assistant" : "user",
      content: turn.text
    });
  }
  if (input.attachment) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: input.prompt },
        {
          type: "image_url",
          image_url: {
            url: `data:${input.attachment.mimeType};base64,${input.attachment.base64Data}`
          }
        }
      ]
    });
  } else {
    messages.push({
      role: "user",
      content: input.prompt
    });
  }
  return messages;
}
function extractOpenRouterTextContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (part && typeof part === "object" && "text" in part) {
        return typeof part.text === "string" ? part.text : "";
      }
      return "";
    }).join("");
  }
  return "";
}
async function defaultOpenRouterChatCompletion(params) {
  const controller = new AbortController();
  let timedOut = false;
  let cancelled = false;
  const onExternalAbort = () => {
    cancelled = true;
    controller.abort();
  };
  if (params.signal) {
    if (params.signal.aborted) {
      throw new AiProviderError("AI request was cancelled.", {
        httpStatus: 499,
        isCancelled: true
      });
    }
    params.signal.addEventListener("abort", onExternalAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, params.timeoutMs);
  try {
    const resp = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": params.appUrl,
        "X-Title": "SmartBitz POS"
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        stream: params.stream,
        max_tokens: 700
      }),
      signal: controller.signal
    });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      let parsedMsg = errBody;
      try {
        const parsed = JSON.parse(errBody);
        if (typeof parsed.error === "string") parsedMsg = parsed.error;
        else if (parsed.error && typeof parsed.error.message === "string") {
          parsedMsg = parsed.error.message;
        } else if (typeof parsed.message === "string") {
          parsedMsg = parsed.message;
        }
      } catch {
      }
      throw new AiProviderError(
        parsedMsg || `OpenRouter returned HTTP ${resp.status}.`,
        { httpStatus: resp.status }
      );
    }
    const contentType = (resp.headers.get("content-type") || "").toLowerCase();
    if (params.stream && resp.body && contentType.includes("text/event-stream")) {
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullReply = "";
      let resolvedModel2 = params.model;
      const processSseLine = (rawLine) => {
        const line = rawLine.trim();
        if (!line || line.startsWith(":")) return false;
        if (!line.startsWith("data:")) return false;
        const dataStr = line.slice(5).trim();
        if (dataStr === "[DONE]") {
          return true;
        }
        try {
          const chunk = JSON.parse(dataStr);
          if (chunk.error?.message) {
            throw new AiProviderError(chunk.error.message, {
              httpStatus: typeof chunk.error.code === "number" ? chunk.error.code : 502
            });
          }
          if (typeof chunk.model === "string" && chunk.model.trim()) {
            resolvedModel2 = chunk.model.trim();
          }
          const deltaText = extractOpenRouterTextContent(
            chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content
          );
          if (deltaText) {
            fullReply += deltaText;
            params.onChunk?.(deltaText, resolvedModel2);
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
        buffer = lines.pop() ?? "";
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
          "The free AI model returned an empty response. Please try again.",
          { httpStatus: 502 }
        );
      }
      return { reply: finalText, model: resolvedModel2 };
    }
    const data = await resp.json();
    if (data.error?.message) {
      throw new AiProviderError(data.error.message, {
        httpStatus: typeof data.error.code === "number" ? data.error.code : 502
      });
    }
    const text = extractOpenRouterTextContent(
      data.choices?.[0]?.message?.content
    ).trim();
    if (!text) {
      throw new AiProviderError(
        "The free AI model returned an empty response. Please try rephrasing your question.",
        { httpStatus: 502 }
      );
    }
    const resolvedModel = typeof data.model === "string" && data.model.trim() ? data.model.trim() : params.model;
    if (params.onChunk) {
      params.onChunk(text, resolvedModel);
    }
    return { reply: text, model: resolvedModel };
  } catch (err) {
    if (err instanceof AiProviderError) {
      throw err;
    }
    if (cancelled || params.signal?.aborted && !timedOut) {
      throw new AiProviderError("AI request was cancelled.", {
        httpStatus: 499,
        isCancelled: true
      });
    }
    if (timedOut || err instanceof Error && err.name === "AbortError") {
      throw new AiProviderError(
        "AI request timed out while waiting for the free model.",
        { httpStatus: 504, isTimeout: true }
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
    params.signal?.removeEventListener("abort", onExternalAbort);
  }
}
async function generatePosAssistantReply(params) {
  const systemInstruction = buildPosAssistantSystemPrompt({
    staffRole: params.staffRole,
    shopName: params.input.shopName,
    activeBranchName: params.input.activeBranchName,
    languageMode: params.input.languageMode,
    prompt: params.input.prompt
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
    onChunk: params.onChunk
  });
  if (typeof output === "string") {
    const trimmed = output.trim();
    if (!trimmed) {
      throw new AiProviderError("The AI assistant returned an empty response.", {
        httpStatus: 502
      });
    }
    if (params.onChunk) {
      params.onChunk(trimmed, params.config.model);
    }
    return { reply: trimmed, model: params.config.model };
  }
  return {
    reply: output.reply,
    model: output.model || params.config.model
  };
}
function isVisionUnsupportedError(err, hadAttachment) {
  if (!hadAttachment) return false;
  const status = err instanceof AiProviderError ? err.httpStatus : void 0;
  const raw = err instanceof Error ? err.message : String(err || "");
  const looksLikeVisionRejection = /image|vision|multimodal|content must be a string|expected string|does not support.*image|no endpoints found.*image/i.test(
    raw
  );
  if (looksLikeVisionRejection) return true;
  if (status === 400 || status === 404 || status === 422) {
    return /unsupported|invalid content|media|endpoint/i.test(raw);
  }
  return false;
}
function mapAiProviderError(err, hadAttachment = false) {
  if (err instanceof AiProviderError) {
    if (err.isCancelled || err.httpStatus === 499) {
      return {
        status: 499,
        code: "REQUEST_CANCELLED",
        error: "AI request was cancelled."
      };
    }
    if (err.isTimeout || err.httpStatus === 504) {
      return {
        status: 504,
        code: "AI_TIMEOUT",
        error: "The free AI model took too long to respond. Please try a shorter question or try again."
      };
    }
  }
  if (isVisionUnsupportedError(err, hadAttachment)) {
    return {
      status: 422,
      code: "VISION_UNSUPPORTED",
      error: "The currently routed free AI model does not support screenshot/image analysis right now. Please type the error or screen text instead."
    };
  }
  const status = err instanceof AiProviderError ? err.httpStatus : void 0;
  const raw = err instanceof Error ? err.message : String(err || "");
  if (status === 429 || /RESOURCE_EXHAUSTED|429|rate limit|too many requests/i.test(raw)) {
    return {
      status: 429,
      code: "PROVIDER_RATE_LIMITED",
      error: "Free AI model rate limit reached temporarily. Please wait a moment and try again."
    };
  }
  if (status === 401 || status === 403 || /API_KEY_INVALID|invalid.*key|unauthorized|PERMISSION_DENIED/i.test(raw)) {
    return {
      status: 502,
      code: "PROVIDER_AUTH_ERROR",
      error: "Server OpenRouter credentials were rejected. Contact your platform administrator."
    };
  }
  if (status === 404 || status === 503 || /NOT_FOUND|no endpoints found|unavailable/i.test(raw)) {
    return {
      status: 502,
      code: "PROVIDER_MODEL_UNAVAILABLE",
      error: "No free AI model is currently available for this request. Your POS continues operating normally."
    };
  }
  return {
    status: 502,
    code: "AI_UPSTREAM_ERROR",
    error: "Unable to reach the AI Assistant right now. Your POS terminal continues working normally."
  };
}

// serverOmnichannelOrders.ts
var import_node_crypto = __toESM(require("node:crypto"), 1);

// src/lib/idUtils.ts
function generateUuid() {
  const cryptoObj = typeof globalThis !== "undefined" ? globalThis.crypto : void 0;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID().toLowerCase();
  }
  const bytes = new Uint8Array(16);
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  return formatBytesAsUuid(bytes);
}
function formatBytesAsUuid(bytes) {
  const hex = [];
  for (let i = 0; i < 16; i += 1) {
    hex.push(bytes[i].toString(16).padStart(2, "0"));
  }
  return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
}

// src/lib/unitUtils.ts
var SELLING_UNITS = [
  "kg",
  "g",
  "litre",
  "ml",
  "metre",
  "cm",
  "piece",
  "packet",
  "box",
  "bottle"
];
var SELLING_UNIT_SET = new Set(SELLING_UNITS);
function normalizeSellingUnit(value) {
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (SELLING_UNIT_SET.has(trimmed)) {
      return trimmed;
    }
  }
  return "piece";
}
function roundQuantity(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1e3) / 1e3;
}
function roundCurrency(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function formatQuantity(qty) {
  const safe = roundQuantity(qty);
  if (safe <= 0 && qty === 0) return "0";
  return Number(safe.toFixed(3)).toString();
}
var UNIT_SHORT_EN = {
  kg: "kg",
  g: "g",
  litre: "litre",
  ml: "ml",
  metre: "metre",
  cm: "cm",
  piece: "piece",
  packet: "packet",
  box: "box",
  bottle: "bottle"
};
var UNIT_SHORT_UR = {
  kg: "\u06A9\u0644\u0648",
  g: "\u06AF\u0631\u0627\u0645",
  litre: "\u0644\u06CC\u0679\u0631",
  ml: "\u0645\u0644\u06CC \u0644\u06CC\u0679\u0631",
  metre: "\u0645\u06CC\u0679\u0631",
  cm: "\u0633\u06CC\u0646\u0679\u06CC \u0645\u06CC\u0679\u0631",
  piece: "\u067E\u06CC\u0633",
  packet: "\u067E\u06CC\u06A9\u0679",
  box: "\u0688\u0628\u06C1",
  bottle: "\u0628\u0648\u062A\u0644"
};
function getUnitLabel(unit, lang = "en") {
  const normalized = normalizeSellingUnit(unit);
  return lang === "ur" ? UNIT_SHORT_UR[normalized] : UNIT_SHORT_EN[normalized];
}

// src/lib/supabaseClient.ts
var import_supabase_js = require("@supabase/supabase-js");
var import_meta = {};
var supabaseUrl = import_meta.env?.VITE_SUPABASE_URL;
var supabaseAnonKey = import_meta.env?.VITE_SUPABASE_ANON_KEY;
var hasValidUrl = typeof supabaseUrl === "string" && supabaseUrl.startsWith("https://") && !supabaseUrl.includes("YOUR_PROJECT_REF");
var hasValidKey = typeof supabaseAnonKey === "string" && supabaseAnonKey.length > 20 && !supabaseAnonKey.includes("YOUR_SUPABASE_ANON_KEY");
var isSupabaseConfigured = Boolean(hasValidUrl && hasValidKey);
var activeStaffSessionToken = null;
var staffSessionAwareFetch = (input, init) => {
  if (!activeStaffSessionToken) {
    return fetch(input, init);
  }
  const headers = new Headers(init?.headers);
  if (!headers.has("x-staff-session")) {
    headers.set("x-staff-session", activeStaffSessionToken);
  }
  return fetch(input, { ...init, headers });
};
var supabase = isSupabaseConfigured ? (0, import_supabase_js.createClient)(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: staffSessionAwareFetch
  }
}) : null;

// src/lib/whatsappService.ts
function normalizeWhatsAppPhone(phone) {
  const digits = phone.replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return digits.slice(1);
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("03") && digits.length === 11) {
    return `92${digits.slice(1)}`;
  }
  return digits;
}
function buildManualWhatsAppUrl(phone, message) {
  const cleanPhone = normalizeWhatsAppPhone(phone);
  const encoded = encodeURIComponent(message);
  return cleanPhone ? `https://wa.me/${cleanPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

// src/lib/omnichannelOrders.ts
var OMNICHANNEL_STATUS_TRANSITIONS = {
  new: ["accepted", "rejected", "cancelled"],
  accepted: ["preparing", "ready", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["delivered", "cancelled"],
  delivered: [],
  rejected: [],
  cancelled: []
};
function isValidOmnichannelTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) return false;
  return OMNICHANNEL_STATUS_TRANSITIONS[fromStatus]?.includes(toStatus) ?? false;
}
function slugifyStoreName(input) {
  const cleaned = input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "my-shop";
}
function generateOmnichannelOrderNumber(channel, now = /* @__PURE__ */ new Date()) {
  const prefix = channel === "website" ? "WEB" : channel === "whatsapp" ? "WA" : "PHN";
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = String(Math.floor(1e3 + Math.random() * 9e3));
  return `${prefix}-${y}${m}${d}-${rand}`;
}
function resolveProductStockForBranch(product, branchId) {
  if (branchId && product.branchStock && Object.prototype.hasOwnProperty.call(product.branchStock, branchId)) {
    return roundQuantity(Number(product.branchStock[branchId] ?? 0));
  }
  return roundQuantity(Number(product.stock ?? 0));
}
function calculateOmnichannelOrderTotals(rawItems, productsById, options) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, code: "EMPTY_ITEMS", error: "Order must include at least one item." };
  }
  const mergedQty = /* @__PURE__ */ new Map();
  for (const row of rawItems) {
    const productId = String(row.productId || "").trim();
    const qty = roundQuantity(Number(row.quantity));
    if (!productId || !Number.isFinite(qty) || qty <= 0) {
      return {
        ok: false,
        code: "INVALID_QUANTITY",
        error: "All items must have a valid product and quantity greater than 0."
      };
    }
    mergedQty.set(productId, roundQuantity((mergedQty.get(productId) ?? 0) + qty));
  }
  const items = [];
  let subtotal = 0;
  let taxAmount = 0;
  for (const [productId, quantity] of mergedQty.entries()) {
    const product = productsById.get(productId);
    if (!product) {
      return {
        ok: false,
        code: "PRODUCT_NOT_FOUND",
        error: `Selected product (${productId}) was not found in this shop catalog.`
      };
    }
    const available = resolveProductStockForBranch(product, options?.branchId);
    if (available <= 0) {
      return {
        ok: false,
        code: "OUT_OF_STOCK",
        error: `${product.nameEn} is currently out of stock.`
      };
    }
    const unitPrice = roundCurrency(Number(product.price || 0));
    const taxRate = Math.max(0, Number(product.taxRate || 0));
    const lineSubtotal = roundCurrency(unitPrice * quantity);
    const lineTax = roundCurrency(lineSubtotal * taxRate / 100);
    const lineTotal = roundCurrency(lineSubtotal + lineTax);
    subtotal = roundCurrency(subtotal + lineSubtotal);
    taxAmount = roundCurrency(taxAmount + lineTax);
    items.push({
      productId: product.id,
      sku: product.sku,
      nameEn: product.nameEn,
      nameUr: product.nameUr,
      category: product.category,
      sellingUnit: product.sellingUnit,
      quantity,
      unitPrice,
      taxRate,
      lineTotal
    });
  }
  const requestedDiscount = Math.max(0, roundCurrency(Number(options?.discountAmount ?? 0)));
  const discountAmount = Math.min(requestedDiscount, subtotal);
  const total = Math.max(0, roundCurrency(subtotal - discountAmount + taxAmount));
  return {
    ok: true,
    items,
    subtotal,
    discountAmount,
    taxAmount,
    total
  };
}
function applyOmnichannelStockReservation(order, products, actorName, nowIso = (/* @__PURE__ */ new Date()).toISOString()) {
  if (order.stockReserved) {
    return {
      ok: false,
      code: "ALREADY_RESERVED",
      error: "Stock has already been reserved/deducted for this order."
    };
  }
  const productMap = new Map(products.map((p) => [p.id, p]));
  const branchId = order.branchId;
  for (const item of order.items) {
    const qty = roundQuantity(Number(item.quantity));
    if (qty <= 0) {
      return {
        ok: false,
        code: "INVALID_QUANTITY",
        error: `Order item ${item.nameEn} has an invalid quantity.`
      };
    }
    const product = productMap.get(item.productId);
    if (!product) {
      return {
        ok: false,
        code: "PRODUCT_NOT_FOUND",
        error: `Product ${item.nameEn} no longer exists in inventory.`
      };
    }
    const available = resolveProductStockForBranch(product, branchId);
    if (available + 1e-4 < qty) {
      const unitLabel = getUnitLabel(product.sellingUnit, "en");
      return {
        ok: false,
        code: "INSUFFICIENT_STOCK",
        error: `Insufficient stock for ${product.nameEn}: available ${formatQuantity(available)} ${unitLabel}, requested ${formatQuantity(qty)} ${unitLabel}.`
      };
    }
  }
  const adjustments = [];
  const qtyByProduct = /* @__PURE__ */ new Map();
  for (const item of order.items) {
    qtyByProduct.set(
      item.productId,
      roundQuantity((qtyByProduct.get(item.productId) ?? 0) + Number(item.quantity))
    );
  }
  const updatedProducts = products.map((product) => {
    const qty = qtyByProduct.get(product.id);
    if (!qty) return product;
    const prevGlobal = roundQuantity(Number(product.stock ?? 0));
    const nextGlobal = Math.max(0, roundQuantity(prevGlobal - qty));
    const nextBranchStock = product.branchStock ? { ...product.branchStock } : void 0;
    let prevTracked = prevGlobal;
    let nextTracked = nextGlobal;
    if (branchId && nextBranchStock && Object.prototype.hasOwnProperty.call(nextBranchStock, branchId)) {
      prevTracked = roundQuantity(Number(nextBranchStock[branchId] ?? 0));
      nextTracked = Math.max(0, roundQuantity(prevTracked - qty));
      nextBranchStock[branchId] = nextTracked;
    }
    adjustments.push({
      id: generateUuid(),
      productId: product.id,
      productName: product.nameEn,
      sku: product.sku,
      sellingUnit: product.sellingUnit,
      branchId,
      adjustmentType: "Sale Stock Out",
      quantityChange: -qty,
      previousStock: prevTracked,
      newStock: nextTracked,
      reason: `Omnichannel Order Accepted: ${order.orderNumber}`,
      actorName,
      createdAt: nowIso
    });
    return {
      ...product,
      stock: nextGlobal,
      branchStock: nextBranchStock
    };
  });
  return {
    ok: true,
    updatedProducts,
    adjustments
  };
}
function applyOmnichannelStockRestoration(order, products, actorName, targetStatus, nowIso = (/* @__PURE__ */ new Date()).toISOString()) {
  if (!order.stockReserved || order.stockRestoredAt) {
    return {
      ok: true,
      restored: false,
      updatedProducts: products,
      adjustments: []
    };
  }
  const branchId = order.branchId;
  const qtyByProduct = /* @__PURE__ */ new Map();
  for (const item of order.items) {
    const qty = roundQuantity(Number(item.quantity));
    if (qty > 0) {
      qtyByProduct.set(item.productId, roundQuantity((qtyByProduct.get(item.productId) ?? 0) + qty));
    }
  }
  const adjustments = [];
  const label = targetStatus === "rejected" ? "Rejected" : "Cancelled";
  const updatedProducts = products.map((product) => {
    const qty = qtyByProduct.get(product.id);
    if (!qty) return product;
    const prevGlobal = roundQuantity(Number(product.stock ?? 0));
    const nextGlobal = roundQuantity(prevGlobal + qty);
    const nextBranchStock = product.branchStock ? { ...product.branchStock } : void 0;
    let prevTracked = prevGlobal;
    let nextTracked = nextGlobal;
    if (branchId && nextBranchStock && Object.prototype.hasOwnProperty.call(nextBranchStock, branchId)) {
      prevTracked = roundQuantity(Number(nextBranchStock[branchId] ?? 0));
      nextTracked = roundQuantity(prevTracked + qty);
      nextBranchStock[branchId] = nextTracked;
    }
    adjustments.push({
      id: generateUuid(),
      productId: product.id,
      productName: product.nameEn,
      sku: product.sku,
      sellingUnit: product.sellingUnit,
      branchId,
      adjustmentType: "Sale Return In",
      quantityChange: qty,
      previousStock: prevTracked,
      newStock: nextTracked,
      reason: `Omnichannel Order ${label}: ${order.orderNumber}`,
      actorName,
      createdAt: nowIso
    });
    return {
      ...product,
      stock: nextGlobal,
      branchStock: nextBranchStock
    };
  });
  return {
    ok: true,
    restored: true,
    updatedProducts,
    adjustments
  };
}
function transitionOmnichannelOrderStatus(params) {
  const { order, targetStatus, actor, products, reason, notificationEntry } = params;
  const nowIso = params.nowIso ?? (/* @__PURE__ */ new Date()).toISOString();
  if (!isValidOmnichannelTransition(order.status, targetStatus)) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      error: `Cannot move order ${order.orderNumber} from "${order.status}" to "${targetStatus}".`
    };
  }
  let updatedProducts = products;
  let adjustments = [];
  let stockReserved = order.stockReserved;
  let stockReservedAt = order.stockReservedAt;
  let stockRestoredAt = order.stockRestoredAt;
  let didReserveStock = false;
  let didRestoreStock = false;
  if (targetStatus === "accepted") {
    const reserveRes = applyOmnichannelStockReservation(order, products, actor.name, nowIso);
    if (!reserveRes.ok) {
      return reserveRes;
    }
    updatedProducts = reserveRes.updatedProducts;
    adjustments = reserveRes.adjustments;
    stockReserved = true;
    stockReservedAt = nowIso;
    didReserveStock = true;
  } else if (targetStatus === "cancelled" || targetStatus === "rejected") {
    const restoreRes = applyOmnichannelStockRestoration(
      order,
      products,
      actor.name,
      targetStatus,
      nowIso
    );
    updatedProducts = restoreRes.updatedProducts;
    adjustments = restoreRes.adjustments;
    if (restoreRes.restored) {
      stockReserved = false;
      stockRestoredAt = nowIso;
      didRestoreStock = true;
    }
  }
  const historyEntry = {
    status: targetStatus,
    changedAt: nowIso,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    note: reason?.trim() || void 0
  };
  const updatedOrder = {
    ...order,
    status: targetStatus,
    stockReserved,
    stockReservedAt,
    stockRestoredAt,
    cancellationReason: targetStatus === "cancelled" || targetStatus === "rejected" ? reason?.trim() || order.cancellationReason : order.cancellationReason,
    statusHistory: [...order.statusHistory ?? [], historyEntry],
    notificationLog: notificationEntry ? [...order.notificationLog ?? [], notificationEntry] : [...order.notificationLog ?? []],
    updatedBy: actor.name,
    updatedAt: nowIso
  };
  return {
    ok: true,
    order: updatedOrder,
    updatedProducts,
    adjustments,
    didReserveStock,
    didRestoreStock
  };
}
function buildOmnichannelNotificationMessage(storeName, order, event) {
  const totalText = `Rs. ${Math.round(order.total).toLocaleString("en-PK")}`;
  switch (event) {
    case "new_order":
      return `Assalam-o-Alaikum ${order.customerName}! ${storeName} received your order ${order.orderNumber} (${totalText}). We will confirm shortly.`;
    case "order_accepted":
      return `Good news ${order.customerName}! Your ${storeName} order ${order.orderNumber} (${totalText}) has been ACCEPTED and is being packed.`;
    case "order_ready":
      return `${storeName}: Your order ${order.orderNumber} (${totalText}) is READY for dispatch/pickup!`;
    case "order_delivered":
      return `${storeName}: Your order ${order.orderNumber} (${totalText}) has been DELIVERED. Thank you for shopping with us!`;
  }
}
function buildManualWhatsAppFallbackUrl(phone, text) {
  return buildManualWhatsAppUrl(phone, text);
}
function normalizeOmnichannelPaymentDefaults(method, requestedStatus, onlineGatewayConfigured = false) {
  if (method === "online" && !onlineGatewayConfigured) {
    return {
      ok: false,
      error: "Online card payment gateway is not configured on this server. Please choose Cash on Delivery or another configured payment method."
    };
  }
  if (method === "cod") {
    return {
      ok: true,
      paymentMethod: "cod",
      paymentStatus: requestedStatus ?? "cod_pending"
    };
  }
  return {
    ok: true,
    paymentMethod: method,
    paymentStatus: requestedStatus ?? "unpaid"
  };
}
function parseWhatsAppOrderMessageText(messageText, products) {
  const lines = messageText.split(/\r?\n|,+/).map((line) => line.trim()).filter(Boolean);
  const items = [];
  const unmatchedLines = [];
  for (const line of lines) {
    let qty = 1;
    let query = line;
    const prefixMatch = line.match(/^(\d+(?:\.\d+)?)\s*(?:x|kg|g|l|ltr|litre|pcs|piece|pack|box|dozen)?\s+(.+)$/i);
    const suffixMatch = line.match(/^(.+?)\s*(?:x|\*)\s*(\d+(?:\.\d+)?)$/i);
    if (prefixMatch) {
      qty = roundQuantity(Number(prefixMatch[1]));
      query = prefixMatch[2].trim();
    } else if (suffixMatch) {
      query = suffixMatch[1].trim();
      qty = roundQuantity(Number(suffixMatch[2]));
    }
    const qLower = query.toLowerCase();
    const matched = products.find(
      (p) => p.sku.toLowerCase() === qLower || p.barcode.toLowerCase() === qLower || p.nameEn.toLowerCase() === qLower || p.nameEn.toLowerCase().includes(qLower)
    );
    if (matched && qty > 0) {
      items.push({ productId: matched.id, quantity: qty });
    } else {
      unmatchedLines.push(line);
    }
  }
  return { items, unmatchedLines };
}

// serverOmnichannelOrders.ts
var storefrontRateBuckets = /* @__PURE__ */ new Map();
function checkStorefrontRateLimit(key, maxRequests, windowMs = 6e4) {
  const now = Date.now();
  const entry = storefrontRateBuckets.get(key);
  if (!entry || now >= entry.resetAt) {
    storefrontRateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count += 1;
  return true;
}
function timingSafeEquals(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return import_node_crypto.default.timingSafeEqual(bufA, bufB);
}
function verifyWhatsAppSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret || !signatureHeader || !rawBody) return false;
  const trimmed = signatureHeader.trim();
  if (!trimmed.startsWith("sha256=")) return false;
  const expected = "sha256=" + import_node_crypto.default.createHmac("sha256", appSecret).update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody).digest("hex");
  return timingSafeEquals(trimmed, expected);
}
function isMissingColumnOrTable(err) {
  if (!err) return false;
  return err.code === "42703" || err.code === "42P01" || err.code === "42883" || err.code === "PGRST205" || err.code === "PGRST202" || /column .* does not exist|relation .* does not exist|function .* does not exist|Could not find/i.test(
    err.message || ""
  );
}
function mapOmnichannelOrderRow(row) {
  return {
    id: String(row.id),
    userId: typeof row.user_id === "string" ? row.user_id : void 0,
    orderNumber: String(row.order_number || ""),
    channel: row.channel || "website",
    status: row.status || "new",
    branchId: typeof row.branch_id === "string" && row.branch_id ? row.branch_id : void 0,
    branchName: typeof row.branch_name === "string" && row.branch_name ? row.branch_name : void 0,
    customerId: typeof row.customer_id === "string" && row.customer_id ? row.customer_id : void 0,
    customerName: String(row.customer_name || ""),
    customerPhone: String(row.customer_phone || ""),
    deliveryAddress: String(row.delivery_address || ""),
    notes: typeof row.notes === "string" && row.notes ? row.notes : void 0,
    items: Array.isArray(row.items) ? row.items : [],
    subtotal: roundCurrency(Number(row.subtotal ?? 0)),
    discountAmount: roundCurrency(Number(row.discount_amount ?? 0)),
    taxAmount: roundCurrency(Number(row.tax_amount ?? 0)),
    total: roundCurrency(Number(row.total ?? 0)),
    paymentMethod: row.payment_method || "cod",
    paymentStatus: row.payment_status || "unpaid",
    paidAmount: roundCurrency(Number(row.paid_amount ?? 0)),
    idempotencyKey: typeof row.idempotency_key === "string" && row.idempotency_key ? row.idempotency_key : void 0,
    externalMessageId: typeof row.external_message_id === "string" && row.external_message_id ? row.external_message_id : void 0,
    stockReserved: Boolean(row.stock_reserved),
    stockReservedAt: typeof row.stock_reserved_at === "string" ? row.stock_reserved_at : void 0,
    stockRestoredAt: typeof row.stock_restored_at === "string" ? row.stock_restored_at : void 0,
    statusHistory: Array.isArray(row.status_history) ? row.status_history : [],
    notificationLog: Array.isArray(row.notification_log) ? row.notification_log : [],
    cancellationReason: typeof row.cancellation_reason === "string" && row.cancellation_reason ? row.cancellation_reason : void 0,
    createdBy: String(row.created_by || "customer"),
    updatedBy: String(row.updated_by || "customer"),
    createdAt: String(row.created_at || (/* @__PURE__ */ new Date()).toISOString()),
    updatedAt: String(row.updated_at || (/* @__PURE__ */ new Date()).toISOString())
  };
}
function mapProductRow(row) {
  return {
    id: String(row.id),
    sku: String(row.sku || ""),
    barcode: String(row.barcode || ""),
    qrCode: typeof row.qr_code === "string" ? row.qr_code : void 0,
    nameEn: String(row.name_en || ""),
    nameUr: String(row.name_ur || row.name_en || ""),
    category: row.category === "beverages" || row.category === "bakery" || row.category === "pantry" ? row.category : "pantry",
    brand: typeof row.brand === "string" ? row.brand : void 0,
    variant: typeof row.variant === "string" ? row.variant : void 0,
    price: roundCurrency(Number(row.price ?? 0)),
    cost: roundCurrency(Number(row.cost ?? 0)),
    taxRate: Number(row.tax_rate ?? 0),
    sellingUnit: row.selling_unit || "piece",
    stock: roundQuantity(Number(row.stock ?? 0)),
    branchId: typeof row.branch_id === "string" ? row.branch_id : void 0,
    branchStock: row.branch_stock && typeof row.branch_stock === "object" ? row.branch_stock : void 0,
    image: String(row.image || "")
  };
}
async function dispatchWhatsAppNotification(params) {
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const messagePreview = buildOmnichannelNotificationMessage(
    params.storeName,
    params.order,
    params.event
  );
  const manualShareUrl = buildManualWhatsAppFallbackUrl(
    params.order.customerPhone,
    messagePreview
  );
  const accessToken = params.env?.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN ?? "";
  const phoneNumberId = params.env?.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
  const apiVersion = params.env?.apiVersion ?? process.env.WHATSAPP_API_VERSION ?? "v20.0";
  if (params.sendOverride) {
    try {
      const res = await params.sendOverride({
        phone: params.order.customerPhone,
        text: messagePreview
      });
      return {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        event: params.event,
        channel: "whatsapp",
        status: res.delivered ? "sent" : "manual_fallback",
        recipientPhone: params.order.customerPhone,
        messagePreview,
        manualShareUrl: res.delivered ? void 0 : manualShareUrl,
        error: res.error,
        createdAt: nowIso
      };
    } catch (err) {
      return {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        event: params.event,
        channel: "whatsapp",
        status: "failed",
        recipientPhone: params.order.customerPhone,
        messagePreview,
        manualShareUrl,
        error: err instanceof Error ? err.message : "Notification dispatch failed.",
        createdAt: nowIso
      };
    }
  }
  if (!accessToken || !phoneNumberId) {
    return {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      event: params.event,
      channel: "whatsapp",
      status: "manual_fallback",
      recipientPhone: params.order.customerPhone,
      messagePreview,
      manualShareUrl,
      createdAt: nowIso
    };
  }
  const digits = params.order.customerPhone.replace(/[^\d]/g, "");
  const toPhone = digits.startsWith("0") && digits.length >= 10 ? `92${digits.slice(1)}` : digits;
  if (toPhone.length < 10) {
    return {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      event: params.event,
      channel: "whatsapp",
      status: "skipped",
      recipientPhone: params.order.customerPhone,
      messagePreview,
      error: "Invalid recipient phone number.",
      createdAt: nowIso
    };
  }
  try {
    const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toPhone,
        type: "text",
        text: { preview_url: false, body: messagePreview.slice(0, 4096) }
      })
    });
    if (!upstream.ok) {
      const payload = await upstream.json().catch(() => ({}));
      return {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        event: params.event,
        channel: "whatsapp",
        status: "manual_fallback",
        recipientPhone: params.order.customerPhone,
        messagePreview,
        manualShareUrl,
        error: payload.error?.message || `WhatsApp Cloud API HTTP ${upstream.status}`,
        createdAt: nowIso
      };
    }
    return {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      event: params.event,
      channel: "whatsapp",
      status: "sent",
      recipientPhone: params.order.customerPhone,
      messagePreview,
      createdAt: nowIso
    };
  } catch (err) {
    return {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      event: params.event,
      channel: "whatsapp",
      status: "manual_fallback",
      recipientPhone: params.order.customerPhone,
      messagePreview,
      manualShareUrl,
      error: err instanceof Error ? err.message : "Network error calling WhatsApp Cloud API.",
      createdAt: nowIso
    };
  }
}
function registerOmnichannelRoutes(app, deps) {
  const { adminSupabase: adminSupabase2, memoryStore, authenticateReq, checkOpAccess, resolveStaff } = deps;
  const onlineGatewayConfigured = Boolean(deps.onlineGatewayConfigured);
  function getWaEnv() {
    return {
      accessToken: deps.whatsappEnv?.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN ?? "",
      phoneNumberId: deps.whatsappEnv?.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
      verifyToken: deps.whatsappEnv?.verifyToken ?? process.env.WHATSAPP_VERIFY_TOKEN ?? "",
      appSecret: deps.whatsappEnv?.appSecret ?? process.env.WHATSAPP_APP_SECRET ?? "",
      apiVersion: deps.whatsappEnv?.apiVersion ?? process.env.WHATSAPP_API_VERSION ?? "v20.0"
    };
  }
  async function appendSupabaseOrderAuditLog(params) {
    if (!adminSupabase2) return;
    try {
      await adminSupabase2.from("order_audit_logs").insert({
        id: `oaud-${import_node_crypto.default.randomUUID()}`,
        user_id: params.userId,
        order_id: params.orderId,
        action: params.action,
        actor_id: params.actorId,
        actor_name: params.actorName,
        actor_role: params.actorRole,
        previous_status: params.previousStatus ?? null,
        new_status: params.newStatus ?? null,
        details: params.details,
        created_at: params.createdAt
      });
    } catch {
    }
  }
  async function requireAuthorizedStaff(req, res, requiredAction) {
    const user = await authenticateReq(req);
    if (!user) {
      res.status(401).json({ ok: false, error: "Authentication required." });
      return null;
    }
    const opAccess = await checkOpAccess(user);
    if (!opAccess.allowed) {
      res.status(403).json({
        ok: false,
        error: opAccess.status === "suspended" ? "Store access is suspended. Order operations are paused while records remain preserved." : "Store account is blocked."
      });
      return null;
    }
    const staff = await resolveStaff(req, user);
    if (!staff.role) {
      res.status(401).json({ ok: false, error: "Verified staff PIN session is required." });
      return null;
    }
    if (!hasRolePermission(staff.role, requiredAction)) {
      res.status(403).json({
        ok: false,
        error: `Role '${staff.role}' is not authorized for '${requiredAction}'.`
      });
      return null;
    }
    let employeeName = staff.employeeName || "";
    if (!employeeName && memoryStore) {
      employeeName = user.email.split("@")[0] || staff.role;
    } else if (!employeeName && adminSupabase2 && staff.employeeId) {
      const empRes = await adminSupabase2.from("employees").select("name").eq("id", staff.employeeId).eq("user_id", user.id).maybeSingle();
      if (!empRes.error && empRes.data?.name) {
        employeeName = String(empRes.data.name);
      }
    }
    return {
      user,
      staff: {
        role: staff.role,
        employeeId: staff.employeeId || `staff-${staff.role}`,
        employeeName: employeeName || staff.role.toUpperCase()
      }
    };
  }
  async function loadPublicStorefrontBySlug(slug) {
    const cleanSlug = slugifyStoreName(slug);
    const waEnv = getWaEnv();
    const whatsappConfigured = Boolean(waEnv.accessToken && waEnv.phoneNumberId);
    if (memoryStore) {
      const tenant = memoryStore.findTenantBySlug(cleanSlug);
      if (!tenant || !tenant.settings.storefrontEnabled) {
        return { ok: false, status: 404, error: "Online storefront not found or currently offline." };
      }
      if (tenant.subscriptionStatus === "suspended" || tenant.subscriptionStatus === "blocked") {
        return { ok: false, status: 403, error: "This store is currently unavailable for online orders." };
      }
      const publicBranches = tenant.branches.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name, isMain: b.isMain }));
      const defaultBranchId2 = publicBranches.find((b) => b.isMain)?.id || publicBranches[0]?.id;
      const publicProducts2 = tenant.products.filter((p) => resolveProductStockForBranch(p, defaultBranchId2) > 0 || p.stock > 0).map((p) => ({
        id: p.id,
        sku: p.sku,
        nameEn: p.nameEn,
        nameUr: p.nameUr,
        category: p.category,
        brand: p.brand,
        variant: p.variant,
        price: roundCurrency(p.price),
        sellingUnit: p.sellingUnit,
        stock: roundQuantity(p.stock),
        branchStock: p.branchStock,
        image: p.image
      }));
      return {
        ok: true,
        userId: tenant.userId,
        products: tenant.products,
        data: {
          storeSlug: cleanSlug,
          storeName: tenant.settings.storeName,
          storeDescription: tenant.settings.storefrontDescription || "",
          phone: tenant.settings.phone || "",
          address: tenant.settings.address || "",
          codEnabled: tenant.settings.codEnabled !== false,
          onlinePaymentConfigured: onlineGatewayConfigured,
          whatsappConfigured,
          defaultTaxRate: Number(tenant.settings.defaultTaxRate ?? 0),
          branches: publicBranches,
          products: publicProducts2
        }
      };
    }
    if (!adminSupabase2) {
      return { ok: false, status: 503, error: "Storefront service unavailable." };
    }
    const storeRes = await adminSupabase2.from("store_settings").select(
      "user_id, store_name, phone, address, default_tax_rate, storefront_slug, storefront_enabled, storefront_description, cod_enabled"
    ).ilike("storefront_slug", cleanSlug).maybeSingle();
    if (storeRes.error) {
      if (isMissingColumnOrTable(storeRes.error)) {
        return { ok: false, status: 503, error: "Storefront schema migration has not been applied yet." };
      }
      return { ok: false, status: 500, error: storeRes.error.message };
    }
    const row = storeRes.data;
    if (!row || !row.storefront_enabled) {
      return { ok: false, status: 404, error: "Online storefront not found or currently offline." };
    }
    const tenantUserId = String(row.user_id);
    const subRes = await adminSupabase2.from("subscriptions").select("is_blocked, status").eq("user_id", tenantUserId).maybeSingle();
    if (!subRes.error && subRes.data) {
      const st = String(subRes.data.status || "");
      if (Boolean(subRes.data.is_blocked) || st === "suspended" || st === "blocked") {
        return { ok: false, status: 403, error: "This store is currently unavailable for online orders." };
      }
    }
    const [branchesRes, productsRes] = await Promise.all([
      adminSupabase2.from("branches").select("id, name, is_main, is_active").eq("user_id", tenantUserId).eq("is_active", true),
      adminSupabase2.from("products").select("id, sku, barcode, name_en, name_ur, category, brand, variant, price, tax_rate, selling_unit, stock, branch_stock, image").eq("user_id", tenantUserId).order("name_en", { ascending: true })
    ]);
    const branches = (branchesRes.data || []).map((b) => ({
      id: String(b.id),
      name: String(b.name || "Main Branch"),
      isMain: Boolean(b.is_main)
    }));
    const fullProducts = (productsRes.data || []).map(mapProductRow);
    const defaultBranchId = branches.find((b) => b.isMain)?.id || branches[0]?.id;
    const publicProducts = fullProducts.filter((p) => resolveProductStockForBranch(p, defaultBranchId) > 0 || p.stock > 0).map((p) => ({
      id: p.id,
      sku: p.sku,
      nameEn: p.nameEn,
      nameUr: p.nameUr,
      category: p.category,
      brand: p.brand,
      variant: p.variant,
      price: p.price,
      sellingUnit: p.sellingUnit,
      stock: p.stock,
      branchStock: p.branchStock,
      image: p.image
    }));
    return {
      ok: true,
      userId: tenantUserId,
      products: fullProducts,
      data: {
        storeSlug: cleanSlug,
        storeName: String(row.store_name || "Shop Storefront"),
        storeDescription: String(row.storefront_description || ""),
        phone: String(row.phone || ""),
        address: String(row.address || ""),
        codEnabled: row.cod_enabled !== false,
        onlinePaymentConfigured: onlineGatewayConfigured,
        whatsappConfigured,
        defaultTaxRate: Number(row.default_tax_rate ?? 0),
        branches,
        products: publicProducts
      }
    };
  }
  app.get("/api/storefront/:slug", async (req, res) => {
    const ip = req.ip || "unknown";
    if (!checkStorefrontRateLimit(`sf-get:${ip}`, 180)) {
      return res.status(429).json({ ok: false, error: "Too many storefront requests. Please wait a moment." });
    }
    const loaded = await loadPublicStorefrontBySlug(String(req.params.slug || ""));
    if (!loaded.ok) {
      return res.status(loaded.status).json({ ok: false, error: loaded.error });
    }
    return res.json({ ok: true, storefront: loaded.data });
  });
  app.post("/api/storefront/:slug/orders", async (req, res) => {
    const ip = req.ip || "unknown";
    if (!checkStorefrontRateLimit(`sf-post:${ip}`, 60)) {
      return res.status(429).json({ ok: false, error: "Too many order submissions. Please wait a moment." });
    }
    const loaded = await loadPublicStorefrontBySlug(String(req.params.slug || ""));
    if (!loaded.ok) {
      return res.status(loaded.status).json({ ok: false, error: loaded.error });
    }
    const body = req.body || {};
    const customerName = String(body.customerName || "").trim();
    const customerPhone = String(body.customerPhone || "").trim();
    const deliveryAddress = String(body.deliveryAddress || "").trim();
    const notes = String(body.notes || "").trim();
    const idempotencyKey = String(body.idempotencyKey || req.header("x-idempotency-key") || "").trim();
    if (customerName.length < 2) {
      return res.status(400).json({ ok: false, error: "Customer name is required." });
    }
    if (customerPhone.replace(/[^\d]/g, "").length < 7) {
      return res.status(400).json({ ok: false, error: "A valid phone number is required." });
    }
    if (deliveryAddress.length < 4) {
      return res.status(400).json({ ok: false, error: "Delivery address is required." });
    }
    const requestedMethod = body.paymentMethod || "cod";
    if (requestedMethod === "cod" && !loaded.data.codEnabled) {
      return res.status(400).json({ ok: false, error: "Cash on Delivery is disabled for this storefront." });
    }
    const allowedPublicMethods = [
      "cod",
      "bank_transfer",
      "jazzcash",
      "easypaisa",
      "online"
    ];
    if (!allowedPublicMethods.includes(requestedMethod)) {
      return res.status(400).json({ ok: false, error: "Unsupported storefront payment method." });
    }
    const paymentNorm = normalizeOmnichannelPaymentDefaults(
      requestedMethod,
      void 0,
      onlineGatewayConfigured
    );
    if (paymentNorm.ok === false) {
      return res.status(400).json({ ok: false, error: paymentNorm.error });
    }
    let resolvedBranchId;
    let resolvedBranchName;
    if (body.branchId) {
      const branchMatch = loaded.data.branches.find((b) => b.id === body.branchId);
      if (!branchMatch) {
        return res.status(400).json({ ok: false, error: "Selected store branch is invalid." });
      }
      resolvedBranchId = branchMatch.id;
      resolvedBranchName = branchMatch.name;
    } else if (loaded.data.branches.length > 0) {
      const main = loaded.data.branches.find((b) => b.isMain) || loaded.data.branches[0];
      resolvedBranchId = main.id;
      resolvedBranchName = main.name;
    }
    if (idempotencyKey) {
      if (memoryStore) {
        const tenant = memoryStore.tenants.get(loaded.userId);
        const dup = tenant?.orders.find((o) => o.idempotencyKey === idempotencyKey);
        if (dup) {
          return res.status(200).json({
            ok: true,
            deduplicated: true,
            order: {
              id: dup.id,
              orderNumber: dup.orderNumber,
              status: dup.status,
              total: dup.total,
              paymentMethod: dup.paymentMethod,
              paymentStatus: dup.paymentStatus,
              createdAt: dup.createdAt
            }
          });
        }
      } else if (adminSupabase2) {
        const dupRes = await adminSupabase2.from("omnichannel_orders").select("*").eq("user_id", loaded.userId).eq("idempotency_key", idempotencyKey).maybeSingle();
        if (!dupRes.error && dupRes.data) {
          const dup = mapOmnichannelOrderRow(dupRes.data);
          return res.status(200).json({
            ok: true,
            deduplicated: true,
            order: {
              id: dup.id,
              orderNumber: dup.orderNumber,
              status: dup.status,
              total: dup.total,
              paymentMethod: dup.paymentMethod,
              paymentStatus: dup.paymentStatus,
              createdAt: dup.createdAt
            }
          });
        }
      }
    }
    const productsById = new Map(loaded.products.map((p) => [p.id, p]));
    const calc = calculateOmnichannelOrderTotals(body.items || [], productsById, {
      branchId: resolvedBranchId
    });
    if (calc.ok === false) {
      return res.status(400).json({ ok: false, code: calc.code, error: calc.error });
    }
    for (const item of calc.items) {
      const prod = productsById.get(item.productId);
      const avail = resolveProductStockForBranch(prod, resolvedBranchId);
      if (avail + 1e-4 < item.quantity) {
        return res.status(409).json({
          ok: false,
          code: "INSUFFICIENT_STOCK",
          error: `Only ${avail} ${prod.sellingUnit} available for ${prod.nameEn}.`
        });
      }
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const orderNumber = generateOmnichannelOrderNumber("website");
    const orderId = `omni-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newOrder = {
      id: orderId,
      userId: loaded.userId,
      orderNumber,
      channel: "website",
      status: "new",
      branchId: resolvedBranchId,
      branchName: resolvedBranchName,
      customerName,
      customerPhone,
      deliveryAddress,
      notes: notes || void 0,
      items: calc.items,
      subtotal: calc.subtotal,
      discountAmount: calc.discountAmount,
      taxAmount: calc.taxAmount,
      total: calc.total,
      paymentMethod: paymentNorm.paymentMethod,
      paymentStatus: paymentNorm.paymentStatus,
      paidAmount: 0,
      idempotencyKey: idempotencyKey || void 0,
      stockReserved: false,
      statusHistory: [
        {
          status: "new",
          changedAt: nowIso,
          actorId: "public_storefront",
          actorName: customerName,
          actorRole: "customer",
          note: "Order placed on public storefront"
        }
      ],
      notificationLog: [],
      createdBy: customerName,
      updatedBy: customerName,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    const notif = await dispatchWhatsAppNotification({
      storeName: loaded.data.storeName,
      order: newOrder,
      event: "new_order",
      env: getWaEnv(),
      sendOverride: deps.whatsappSendOverride
    });
    newOrder.notificationLog = [notif];
    if (memoryStore) {
      const tenant = memoryStore.tenants.get(loaded.userId);
      tenant.orders.unshift(newOrder);
      tenant.auditLogs.unshift({
        id: `oaud-${Date.now()}`,
        orderId: newOrder.id,
        action: "website_order_created",
        actorId: "public_storefront",
        actorName: customerName,
        actorRole: "customer",
        newStatus: "new",
        details: `Website order ${orderNumber} placed (${newOrder.total}). Stock NOT deducted yet.`,
        createdAt: nowIso
      });
    } else if (adminSupabase2) {
      const rpcRes = await adminSupabase2.rpc("create_omnichannel_order", {
        p_user_id: loaded.userId,
        p_channel: "website",
        p_customer_name: customerName,
        p_customer_phone: customerPhone,
        p_delivery_address: deliveryAddress,
        p_notes: notes,
        p_branch_id: resolvedBranchId ?? null,
        p_customer_id: null,
        p_discount_amount: 0,
        p_payment_method: paymentNorm.paymentMethod,
        p_payment_status: paymentNorm.paymentStatus,
        p_paid_amount: 0,
        p_idempotency_key: idempotencyKey || null,
        p_external_message_id: null,
        p_order_number: orderNumber,
        p_items: calc.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity
        })),
        p_actor_id: "public_storefront",
        p_actor_name: customerName,
        p_actor_role: "customer",
        p_notification_entry: notif,
        p_allow_online_payment: onlineGatewayConfigured,
        p_require_stock_check: true,
        p_history_note: "Order placed on public storefront",
        p_audit_action: "website_order_created",
        p_audit_details: `Website order ${orderNumber} placed (${newOrder.total}). Stock NOT deducted yet.`
      });
      if (rpcRes.error && !isMissingColumnOrTable(rpcRes.error)) {
        const statusCode = rpcRes.error.code === "42501" ? 403 : 500;
        return res.status(statusCode).json({ ok: false, error: rpcRes.error.message });
      }
      if (!rpcRes.error && rpcRes.data) {
        const payload = rpcRes.data;
        if (!payload.ok) {
          const statusCode = payload.code === "INSUFFICIENT_STOCK" || payload.code === "OUT_OF_STOCK" ? 409 : payload.code === "STORE_UNAVAILABLE" ? 403 : payload.code === "STOREFRONT_OFFLINE" ? 404 : 400;
          return res.status(statusCode).json({
            ok: false,
            code: payload.code,
            error: payload.error || "Could not submit storefront order."
          });
        }
        const saved = mapOmnichannelOrderRow(payload.order);
        if (payload.deduplicated) {
          return res.status(200).json({
            ok: true,
            deduplicated: true,
            order: {
              id: saved.id,
              orderNumber: saved.orderNumber,
              status: saved.status,
              total: saved.total,
              paymentMethod: saved.paymentMethod,
              paymentStatus: saved.paymentStatus,
              createdAt: saved.createdAt
            }
          });
        }
        return res.status(201).json({
          ok: true,
          order: {
            id: saved.id,
            orderNumber: saved.orderNumber,
            status: saved.status,
            subtotal: saved.subtotal,
            taxAmount: saved.taxAmount,
            total: saved.total,
            paymentMethod: saved.paymentMethod,
            paymentStatus: saved.paymentStatus,
            createdAt: saved.createdAt,
            notification: notif
          }
        });
      }
      const insertRes = await adminSupabase2.from("omnichannel_orders").insert({
        id: newOrder.id,
        user_id: loaded.userId,
        branch_id: newOrder.branchId ?? null,
        branch_name: newOrder.branchName ?? "",
        order_number: newOrder.orderNumber,
        channel: "website",
        status: "new",
        customer_id: null,
        customer_name: newOrder.customerName,
        customer_phone: newOrder.customerPhone,
        delivery_address: newOrder.deliveryAddress,
        notes: newOrder.notes ?? "",
        items: newOrder.items,
        subtotal: newOrder.subtotal,
        discount_amount: newOrder.discountAmount,
        tax_amount: newOrder.taxAmount,
        total: newOrder.total,
        payment_method: newOrder.paymentMethod,
        payment_status: newOrder.paymentStatus,
        paid_amount: 0,
        idempotency_key: newOrder.idempotencyKey ?? null,
        stock_reserved: false,
        status_history: newOrder.statusHistory,
        notification_log: newOrder.notificationLog,
        created_by: newOrder.createdBy,
        updated_by: newOrder.updatedBy,
        created_at: nowIso,
        updated_at: nowIso
      });
      if (insertRes.error) {
        return res.status(500).json({ ok: false, error: insertRes.error.message });
      }
      await appendSupabaseOrderAuditLog({
        userId: loaded.userId,
        orderId: newOrder.id,
        action: "website_order_created",
        actorId: "public_storefront",
        actorName: customerName,
        actorRole: "customer",
        newStatus: "new",
        details: `Website order ${orderNumber} placed (${newOrder.total}). Stock NOT deducted yet.`,
        createdAt: nowIso
      });
    }
    return res.status(201).json({
      ok: true,
      order: {
        id: newOrder.id,
        orderNumber: newOrder.orderNumber,
        status: newOrder.status,
        subtotal: newOrder.subtotal,
        taxAmount: newOrder.taxAmount,
        total: newOrder.total,
        paymentMethod: newOrder.paymentMethod,
        paymentStatus: newOrder.paymentStatus,
        createdAt: newOrder.createdAt,
        notification: notif
      }
    });
  });
  app.get("/api/webhooks/whatsapp", (req, res) => {
    const { verifyToken } = getWaEnv();
    const mode = String(req.query["hub.mode"] || "");
    const token = String(req.query["hub.verify_token"] || "");
    const challenge = String(req.query["hub.challenge"] || "");
    if (!verifyToken) {
      return res.status(503).json({
        ok: false,
        error: "WHATSAPP_VERIFY_TOKEN is not configured on this server."
      });
    }
    if (mode === "subscribe" && timingSafeEquals(token, verifyToken)) {
      return res.status(200).type("text/plain").send(challenge);
    }
    return res.status(403).json({ ok: false, error: "Invalid webhook verification token." });
  });
  app.post("/api/webhooks/whatsapp", async (req, res) => {
    const waEnv = getWaEnv();
    const rawBody = req.rawBody;
    const sigHeader = req.header("x-hub-signature-256");
    if (!waEnv.appSecret) {
      return res.status(503).json({
        ok: false,
        error: "WHATSAPP_APP_SECRET is not configured for webhook signature verification."
      });
    }
    const payloadBytes = rawBody ?? Buffer.from(JSON.stringify(req.body || {}), "utf8");
    if (!verifyWhatsAppSignature(payloadBytes, sigHeader, waEnv.appSecret)) {
      return res.status(401).json({ ok: false, error: "Invalid X-Hub-Signature-256." });
    }
    const body = req.body;
    const createdOrders = [];
    const deduplicatedMessages = [];
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const val = change.value;
        if (!val || !Array.isArray(val.messages)) continue;
        const phoneNumberId = String(val.metadata?.phone_number_id || "").trim();
        const contactsMap = /* @__PURE__ */ new Map();
        for (const c of val.contacts || []) {
          if (c.wa_id) contactsMap.set(c.wa_id, c.profile?.name || "WhatsApp Customer");
        }
        let tenantUserId = null;
        let tenantStoreName = "Shop";
        let tenantProducts = [];
        let tenantBranches = [];
        if (memoryStore) {
          const tenant = memoryStore.findTenantByWhatsAppPhoneId(phoneNumberId);
          if (!tenant) continue;
          if (tenant.subscriptionStatus === "suspended" || tenant.subscriptionStatus === "blocked") {
            continue;
          }
          tenantUserId = tenant.userId;
          tenantStoreName = tenant.settings.storeName;
          tenantProducts = tenant.products;
          tenantBranches = tenant.branches;
        } else if (adminSupabase2 && phoneNumberId) {
          const stRes = await adminSupabase2.from("store_settings").select("user_id, store_name").eq("whatsapp_business_phone_id", phoneNumberId).maybeSingle();
          if (stRes.error || !stRes.data) continue;
          tenantUserId = String(stRes.data.user_id);
          tenantStoreName = String(stRes.data.store_name || "Shop");
          const subRes = await adminSupabase2.from("subscriptions").select("is_blocked, status").eq("user_id", tenantUserId).maybeSingle();
          if (!subRes.error && subRes.data && (Boolean(subRes.data.is_blocked) || ["suspended", "blocked"].includes(
            String(subRes.data.status || "")
          ))) {
            continue;
          }
          const [prodRes, branchRes] = await Promise.all([
            adminSupabase2.from("products").select("*").eq("user_id", tenantUserId),
            adminSupabase2.from("branches").select("*").eq("user_id", tenantUserId).eq("is_active", true)
          ]);
          tenantProducts = (prodRes.data || []).map(mapProductRow);
          tenantBranches = (branchRes.data || []).map((b) => ({
            id: String(b.id),
            name: String(b.name || "Main"),
            code: String(b.code || "MAIN"),
            address: String(b.address || ""),
            phone: String(b.phone || ""),
            isMain: Boolean(b.is_main),
            isActive: b.is_active !== false,
            createdAt: String(b.created_at || "")
          }));
        }
        if (!tenantUserId) continue;
        const defaultBranch = tenantBranches.find((b) => b.isMain) || tenantBranches[0];
        const productsById = new Map(tenantProducts.map((p) => [p.id, p]));
        for (const msg of val.messages) {
          const messageId = String(msg.id || "").trim();
          const fromPhone = String(msg.from || "").trim();
          if (!messageId || !fromPhone) continue;
          const eventKey = `whatsapp:${messageId}`;
          if (memoryStore) {
            if (memoryStore.webhookEventIds.has(eventKey)) {
              deduplicatedMessages.push(messageId);
              continue;
            }
          } else if (adminSupabase2) {
            const evRes = await adminSupabase2.from("webhook_events").select("id").eq("channel", "whatsapp").eq("event_id", messageId).maybeSingle();
            if (!evRes.error && evRes.data) {
              deduplicatedMessages.push(messageId);
              continue;
            }
          }
          let rawItems = [];
          let extraNotes = "";
          if (msg.order?.product_items && Array.isArray(msg.order.product_items)) {
            for (const pi of msg.order.product_items) {
              const retailerId = String(pi.product_retailer_id || "").trim().toLowerCase();
              const matched = tenantProducts.find(
                (p) => p.sku.toLowerCase() === retailerId || p.id.toLowerCase() === retailerId
              );
              if (matched && Number(pi.quantity) > 0) {
                rawItems.push({ productId: matched.id, quantity: roundQuantity(Number(pi.quantity)) });
              }
            }
          }
          if (rawItems.length === 0 && msg.text?.body) {
            const parsed = parseWhatsAppOrderMessageText(msg.text.body, tenantProducts);
            rawItems = parsed.items;
            if (parsed.unmatchedLines.length > 0) {
              extraNotes = `Unmatched WhatsApp text: ${parsed.unmatchedLines.join("; ")}`;
            }
          }
          if (rawItems.length === 0) {
            if (memoryStore) memoryStore.webhookEventIds.add(eventKey);
            continue;
          }
          const calc = calculateOmnichannelOrderTotals(rawItems, productsById, {
            branchId: defaultBranch?.id
          });
          if (calc.ok === false) {
            if (memoryStore) memoryStore.webhookEventIds.add(eventKey);
            continue;
          }
          const customerName = contactsMap.get(fromPhone) || `WhatsApp ${fromPhone}`;
          const nowIso = (/* @__PURE__ */ new Date()).toISOString();
          const orderNumber = generateOmnichannelOrderNumber("whatsapp");
          const orderId = `omni-wa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const order = {
            id: orderId,
            userId: tenantUserId,
            orderNumber,
            channel: "whatsapp",
            status: "new",
            branchId: defaultBranch?.id,
            branchName: defaultBranch?.name,
            customerName,
            customerPhone: fromPhone,
            deliveryAddress: "Confirm via WhatsApp",
            notes: extraNotes || msg.text?.body || void 0,
            items: calc.items,
            subtotal: calc.subtotal,
            discountAmount: calc.discountAmount,
            taxAmount: calc.taxAmount,
            total: calc.total,
            paymentMethod: "cod",
            paymentStatus: "cod_pending",
            paidAmount: 0,
            externalMessageId: messageId,
            stockReserved: false,
            statusHistory: [
              {
                status: "new",
                changedAt: nowIso,
                actorId: "whatsapp_webhook",
                actorName: customerName,
                actorRole: "webhook",
                note: `Incoming WhatsApp order (${messageId})`
              }
            ],
            notificationLog: [],
            createdBy: "WhatsApp Webhook",
            updatedBy: "WhatsApp Webhook",
            createdAt: nowIso,
            updatedAt: nowIso
          };
          const notif = await dispatchWhatsAppNotification({
            storeName: tenantStoreName,
            order,
            event: "new_order",
            env: waEnv,
            sendOverride: deps.whatsappSendOverride
          });
          order.notificationLog = [notif];
          if (memoryStore) {
            memoryStore.webhookEventIds.add(eventKey);
            const memTenant = memoryStore.tenants.get(tenantUserId);
            memTenant?.orders.unshift(order);
            memTenant?.auditLogs.unshift({
              id: `oaud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              orderId: order.id,
              action: "whatsapp_order_created",
              actorId: "whatsapp_webhook",
              actorName: customerName,
              actorRole: "webhook",
              newStatus: "new",
              details: `Incoming WhatsApp order ${order.orderNumber} (${messageId}) logged.`,
              createdAt: nowIso
            });
            createdOrders.push(order.orderNumber);
          } else if (adminSupabase2) {
            const payloadHash = import_node_crypto.default.createHash("sha256").update(payloadBytes).digest("hex");
            const whIns = await adminSupabase2.from("webhook_events").insert({
              id: `whev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              channel: "whatsapp",
              event_id: messageId,
              user_id: tenantUserId,
              payload_hash: payloadHash,
              status: "processed",
              created_at: nowIso
            });
            if (whIns.error?.code === "23505") {
              deduplicatedMessages.push(messageId);
              continue;
            }
            const rpcRes = await adminSupabase2.rpc("create_omnichannel_order", {
              p_user_id: tenantUserId,
              p_channel: "whatsapp",
              p_customer_name: order.customerName,
              p_customer_phone: order.customerPhone,
              p_delivery_address: order.deliveryAddress,
              p_notes: order.notes ?? "",
              p_branch_id: order.branchId ?? null,
              p_customer_id: null,
              p_discount_amount: 0,
              p_payment_method: "cod",
              p_payment_status: "cod_pending",
              p_paid_amount: 0,
              p_idempotency_key: null,
              p_external_message_id: messageId,
              p_order_number: order.orderNumber,
              p_items: calc.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity
              })),
              p_actor_id: "whatsapp_webhook",
              p_actor_name: order.customerName,
              p_actor_role: "webhook",
              p_notification_entry: notif,
              p_allow_online_payment: onlineGatewayConfigured,
              p_require_stock_check: false,
              p_history_note: `Incoming WhatsApp order (${messageId})`,
              p_audit_action: "whatsapp_order_created",
              p_audit_details: `Incoming WhatsApp order ${order.orderNumber} (${messageId}) logged.`
            });
            if (!rpcRes.error && rpcRes.data) {
              const payload = rpcRes.data;
              if (payload.deduplicated) {
                deduplicatedMessages.push(messageId);
              } else if (payload.ok && payload.order) {
                createdOrders.push(String(payload.order.order_number || order.orderNumber));
              }
            } else if (!rpcRes.error || isMissingColumnOrTable(rpcRes.error)) {
              const ins = await adminSupabase2.from("omnichannel_orders").insert({
                id: order.id,
                user_id: tenantUserId,
                branch_id: order.branchId ?? null,
                branch_name: order.branchName ?? "",
                order_number: order.orderNumber,
                channel: "whatsapp",
                status: "new",
                customer_name: order.customerName,
                customer_phone: order.customerPhone,
                delivery_address: order.deliveryAddress,
                notes: order.notes ?? "",
                items: order.items,
                subtotal: order.subtotal,
                discount_amount: order.discountAmount,
                tax_amount: order.taxAmount,
                total: order.total,
                payment_method: order.paymentMethod,
                payment_status: order.paymentStatus,
                paid_amount: 0,
                external_message_id: messageId,
                stock_reserved: false,
                status_history: order.statusHistory,
                notification_log: order.notificationLog,
                created_by: order.createdBy,
                updated_by: order.updatedBy,
                created_at: nowIso,
                updated_at: nowIso
              });
              if (!ins.error) {
                createdOrders.push(order.orderNumber);
                await appendSupabaseOrderAuditLog({
                  userId: tenantUserId,
                  orderId: order.id,
                  action: "whatsapp_order_created",
                  actorId: "whatsapp_webhook",
                  actorName: order.customerName,
                  actorRole: "webhook",
                  newStatus: "new",
                  details: `Incoming WhatsApp order ${order.orderNumber} (${messageId}) logged.`,
                  createdAt: nowIso
                });
              }
            }
          }
        }
      }
    }
    return res.status(200).json({
      ok: true,
      createdOrders,
      deduplicatedMessages
    });
  });
  app.get("/api/omnichannel/orders", async (req, res) => {
    const auth = await requireAuthorizedStaff(req, res, "omnichannel.read");
    if (!auth) return;
    const channel = typeof req.query.channel === "string" ? req.query.channel : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : "";
    const paymentStatus = typeof req.query.paymentStatus === "string" ? req.query.paymentStatus : "";
    const customerQuery = typeof req.query.customerQuery === "string" ? req.query.customerQuery.trim().toLowerCase() : "";
    const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : "";
    const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : "";
    let orders = [];
    if (memoryStore) {
      orders = [...memoryStore.tenants.get(auth.user.id)?.orders || []];
    } else if (adminSupabase2) {
      const q = adminSupabase2.from("omnichannel_orders").select("*").eq("user_id", auth.user.id).order("created_at", { ascending: false });
      const { data, error } = await q;
      if (error) {
        if (isMissingColumnOrTable(error)) {
          return res.json({ ok: true, orders: [], schemaPending: true });
        }
        return res.status(500).json({ ok: false, error: error.message });
      }
      orders = (data || []).map(mapOmnichannelOrderRow);
    }
    const filtered = orders.filter((o) => {
      if (channel && o.channel !== channel) return false;
      if (status && o.status !== status) return false;
      if (branchId && o.branchId !== branchId) return false;
      if (paymentStatus && o.paymentStatus !== paymentStatus) return false;
      if (customerQuery) {
        const hay = `${o.orderNumber} ${o.customerName} ${o.customerPhone}`.toLowerCase();
        if (!hay.includes(customerQuery)) return false;
      }
      if (dateFrom && o.createdAt.slice(0, 10) < dateFrom) return false;
      if (dateTo && o.createdAt.slice(0, 10) > dateTo) return false;
      return true;
    });
    return res.json({ ok: true, orders: filtered });
  });
  app.post("/api/omnichannel/orders", async (req, res) => {
    const auth = await requireAuthorizedStaff(req, res, "omnichannel.create");
    if (!auth) return;
    const body = req.body || {};
    if (body.channel !== void 0 && body.channel !== "whatsapp" && body.channel !== "phone") {
      return res.status(400).json({
        ok: false,
        error: "Staff order channel must be phone or whatsapp."
      });
    }
    const channel = body.channel === "whatsapp" ? "whatsapp" : "phone";
    if (body.discountAmount !== void 0 && (!Number.isFinite(Number(body.discountAmount)) || Number(body.discountAmount) < 0)) {
      return res.status(400).json({ ok: false, error: "Discount amount must be a non-negative number." });
    }
    if (body.paidAmount !== void 0 && (!Number.isFinite(Number(body.paidAmount)) || Number(body.paidAmount) < 0)) {
      return res.status(400).json({ ok: false, error: "Paid amount must be a non-negative number." });
    }
    if (body.paymentStatus !== void 0 && !["unpaid", "cod_pending", "partially_paid", "paid"].includes(body.paymentStatus)) {
      return res.status(400).json({ ok: false, error: "Invalid initial payment status." });
    }
    const idempotencyKey = String(body.idempotencyKey || req.header("x-idempotency-key") || "").trim();
    if (idempotencyKey) {
      if (memoryStore) {
        const dup = memoryStore.tenants.get(auth.user.id)?.orders.find((o) => o.idempotencyKey === idempotencyKey);
        if (dup) return res.json({ ok: true, deduplicated: true, order: dup });
      } else if (adminSupabase2) {
        const dupRes = await adminSupabase2.from("omnichannel_orders").select("*").eq("user_id", auth.user.id).eq("idempotency_key", idempotencyKey).maybeSingle();
        if (!dupRes.error && dupRes.data) {
          return res.json({
            ok: true,
            deduplicated: true,
            order: mapOmnichannelOrderRow(dupRes.data)
          });
        }
      }
    }
    let tenantProducts = [];
    let tenantBranches = [];
    let tenantCustomers = [];
    let storeName = "Shop";
    if (memoryStore) {
      const t = memoryStore.tenants.get(auth.user.id);
      if (!t) return res.status(404).json({ ok: false, error: "Shop workspace not found." });
      tenantProducts = t.products;
      tenantBranches = t.branches;
      tenantCustomers = t.customers;
      storeName = t.settings.storeName;
    } else if (adminSupabase2) {
      const [prodRes, branchRes, custRes, stRes] = await Promise.all([
        adminSupabase2.from("products").select("*").eq("user_id", auth.user.id),
        adminSupabase2.from("branches").select("*").eq("user_id", auth.user.id),
        adminSupabase2.from("customers").select("*").eq("user_id", auth.user.id),
        adminSupabase2.from("store_settings").select("store_name").eq("user_id", auth.user.id).maybeSingle()
      ]);
      tenantProducts = (prodRes.data || []).map(mapProductRow);
      tenantBranches = (branchRes.data || []).map((b) => ({
        id: String(b.id),
        name: String(b.name || "Main"),
        code: String(b.code || ""),
        address: String(b.address || ""),
        phone: String(b.phone || ""),
        isMain: Boolean(b.is_main),
        isActive: b.is_active !== false,
        createdAt: String(b.created_at || "")
      }));
      tenantCustomers = (custRes.data || []).map((c) => ({
        id: String(c.id),
        name: String(c.name || ""),
        phone: String(c.phone || ""),
        address: String(c.address || ""),
        balance: Number(c.balance ?? 0),
        createdAt: String(c.created_at || "")
      }));
      storeName = String(stRes.data?.store_name || "Shop");
    }
    const requestedBranchId = typeof body.branchId === "string" ? body.branchId.trim() : "";
    const branchMatch = requestedBranchId ? tenantBranches.find((b) => b.id === requestedBranchId && b.isActive !== false) : tenantBranches.find((b) => b.isActive !== false && b.isMain) || tenantBranches.find((b) => b.isActive !== false) || tenantBranches[0];
    if (requestedBranchId && !branchMatch) {
      return res.status(400).json({ ok: false, error: "Selected store branch is invalid or inactive." });
    }
    const paymentNorm = normalizeOmnichannelPaymentDefaults(
      body.paymentMethod || "cod",
      body.paymentStatus,
      onlineGatewayConfigured
    );
    if (paymentNorm.ok === false) {
      return res.status(400).json({ ok: false, error: paymentNorm.error });
    }
    const productsById = new Map(tenantProducts.map((p) => [p.id, p]));
    const calc = calculateOmnichannelOrderTotals(body.items || [], productsById, {
      discountAmount: body.discountAmount,
      branchId: branchMatch?.id
    });
    if (calc.ok === false) {
      return res.status(400).json({ ok: false, code: calc.code, error: calc.error });
    }
    let customerId = typeof body.customerId === "string" && body.customerId.trim() ? body.customerId.trim() : void 0;
    let customerName = String(body.customerName || "").trim();
    let customerPhone = String(body.customerPhone || "").trim();
    let deliveryAddress = String(body.deliveryAddress || "").trim();
    if (customerId) {
      const existing = tenantCustomers.find((c) => c.id === customerId);
      if (!existing) {
        return res.status(404).json({ ok: false, error: "Selected customer does not belong to this shop." });
      }
      customerName = customerName || existing.name;
      customerPhone = customerPhone || existing.phone;
      deliveryAddress = deliveryAddress || existing.address || "Shop Pickup / Phone Order";
    }
    if (customerName.length < 2 || customerPhone.replace(/[^\d]/g, "").length < 7) {
      return res.status(400).json({ ok: false, error: "Customer name and valid phone number are required." });
    }
    if (!customerId) {
      const createdCustomerId = import_node_crypto.default.randomUUID();
      const customerNowIso = (/* @__PURE__ */ new Date()).toISOString();
      const newCustomer = {
        id: createdCustomerId,
        name: customerName,
        phone: customerPhone,
        address: deliveryAddress || "",
        balance: 0,
        whatsappOptIn: true,
        createdAt: customerNowIso
      };
      customerId = createdCustomerId;
      if (memoryStore) {
        memoryStore.tenants.get(auth.user.id)?.customers.push(newCustomer);
      } else if (adminSupabase2) {
        const custIns = await adminSupabase2.from("customers").insert({
          id: newCustomer.id,
          user_id: auth.user.id,
          name: newCustomer.name,
          phone: newCustomer.phone,
          address: newCustomer.address,
          balance: 0,
          created_at: customerNowIso
        });
        if (custIns.error) {
          return res.status(500).json({ ok: false, error: custIns.error.message });
        }
      }
    }
    const paidAmount = Math.min(
      calc.total,
      Math.max(0, roundCurrency(Number(body.paidAmount ?? 0)))
    );
    const resolvedPaymentStatus = paidAmount >= calc.total && calc.total > 0 ? "paid" : paidAmount > 0 ? "partially_paid" : paymentNorm.paymentStatus;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const orderNumber = generateOmnichannelOrderNumber(channel);
    const order = {
      id: `omni-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: auth.user.id,
      orderNumber,
      channel,
      status: "new",
      branchId: branchMatch?.id,
      branchName: branchMatch?.name,
      customerId,
      customerName,
      customerPhone,
      deliveryAddress: deliveryAddress || "Counter Pickup",
      notes: body.notes?.trim() || void 0,
      items: calc.items,
      subtotal: calc.subtotal,
      discountAmount: calc.discountAmount,
      taxAmount: calc.taxAmount,
      total: calc.total,
      paymentMethod: paymentNorm.paymentMethod,
      paymentStatus: resolvedPaymentStatus,
      paidAmount,
      idempotencyKey: idempotencyKey || void 0,
      stockReserved: false,
      statusHistory: [
        {
          status: "new",
          changedAt: nowIso,
          actorId: auth.staff.employeeId,
          actorName: auth.staff.employeeName,
          actorRole: auth.staff.role,
          note: `${channel === "whatsapp" ? "Manual WhatsApp" : "Phone"} order logged`
        }
      ],
      notificationLog: [],
      createdBy: auth.staff.employeeName,
      updatedBy: auth.staff.employeeName,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    const notif = await dispatchWhatsAppNotification({
      storeName,
      order,
      event: "new_order",
      env: getWaEnv(),
      sendOverride: deps.whatsappSendOverride
    });
    order.notificationLog = [notif];
    if (memoryStore) {
      const tenant = memoryStore.tenants.get(auth.user.id);
      tenant.orders.unshift(order);
      tenant.auditLogs.unshift({
        id: `oaud-${Date.now()}`,
        orderId: order.id,
        action: `${channel}_order_created`,
        actorId: auth.staff.employeeId,
        actorName: auth.staff.employeeName,
        actorRole: auth.staff.role,
        newStatus: "new",
        details: `${channel} order ${order.orderNumber} created by ${auth.staff.employeeName}`,
        createdAt: nowIso
      });
    } else if (adminSupabase2) {
      const rpcRes = await adminSupabase2.rpc("create_omnichannel_order", {
        p_user_id: auth.user.id,
        p_channel: channel,
        p_customer_name: customerName,
        p_customer_phone: customerPhone,
        p_delivery_address: deliveryAddress || "Counter Pickup",
        p_notes: body.notes?.trim() || "",
        p_branch_id: branchMatch?.id ?? null,
        p_customer_id: customerId ?? null,
        p_discount_amount: calc.discountAmount,
        p_payment_method: paymentNorm.paymentMethod,
        p_payment_status: resolvedPaymentStatus,
        p_paid_amount: paidAmount,
        p_idempotency_key: idempotencyKey || null,
        p_external_message_id: null,
        p_order_number: orderNumber,
        p_items: calc.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity
        })),
        p_actor_id: auth.staff.employeeId,
        p_actor_name: auth.staff.employeeName,
        p_actor_role: auth.staff.role,
        p_notification_entry: notif,
        p_allow_online_payment: onlineGatewayConfigured,
        p_require_stock_check: false,
        p_history_note: `${channel === "whatsapp" ? "Manual WhatsApp" : "Phone"} order logged`,
        p_audit_action: `${channel}_order_created`,
        p_audit_details: `${channel} order ${order.orderNumber} created by ${auth.staff.employeeName}`
      });
      if (rpcRes.error && !isMissingColumnOrTable(rpcRes.error)) {
        const statusCode = rpcRes.error.code === "42501" ? 403 : 500;
        return res.status(statusCode).json({ ok: false, error: rpcRes.error.message });
      }
      if (!rpcRes.error && rpcRes.data) {
        const payload = rpcRes.data;
        if (!payload.ok) {
          const statusCode = payload.code === "INSUFFICIENT_STOCK" || payload.code === "OUT_OF_STOCK" ? 409 : payload.code === "STORE_UNAVAILABLE" ? 403 : 400;
          return res.status(statusCode).json({
            ok: false,
            code: payload.code,
            error: payload.error || "Could not create order."
          });
        }
        const saved = mapOmnichannelOrderRow(payload.order);
        if (payload.deduplicated) {
          return res.json({ ok: true, deduplicated: true, order: saved });
        }
        return res.status(201).json({ ok: true, order: saved, customerId: saved.customerId ?? customerId });
      }
      const ins = await adminSupabase2.from("omnichannel_orders").insert({
        id: order.id,
        user_id: auth.user.id,
        branch_id: order.branchId ?? null,
        branch_name: order.branchName ?? "",
        order_number: order.orderNumber,
        channel: order.channel,
        status: "new",
        customer_id: order.customerId ?? null,
        customer_name: order.customerName,
        customer_phone: order.customerPhone,
        delivery_address: order.deliveryAddress,
        notes: order.notes ?? "",
        items: order.items,
        subtotal: order.subtotal,
        discount_amount: order.discountAmount,
        tax_amount: order.taxAmount,
        total: order.total,
        payment_method: order.paymentMethod,
        payment_status: order.paymentStatus,
        paid_amount: order.paidAmount,
        idempotency_key: order.idempotencyKey ?? null,
        stock_reserved: false,
        status_history: order.statusHistory,
        notification_log: order.notificationLog,
        created_by: order.createdBy,
        updated_by: order.updatedBy,
        created_at: nowIso,
        updated_at: nowIso
      });
      if (ins.error) {
        return res.status(500).json({ ok: false, error: ins.error.message });
      }
      await appendSupabaseOrderAuditLog({
        userId: auth.user.id,
        orderId: order.id,
        action: `${channel}_order_created`,
        actorId: auth.staff.employeeId,
        actorName: auth.staff.employeeName,
        actorRole: auth.staff.role,
        newStatus: "new",
        details: `${channel} order ${order.orderNumber} created by ${auth.staff.employeeName}`,
        createdAt: nowIso
      });
    }
    return res.status(201).json({ ok: true, order, customerId });
  });
  app.patch("/api/omnichannel/orders/:id/status", async (req, res) => {
    const body = req.body || {};
    const targetStatus = body.status;
    if (!targetStatus || !["accepted", "preparing", "ready", "delivered", "rejected", "cancelled"].includes(
      targetStatus
    )) {
      return res.status(400).json({ ok: false, error: "Valid target status is required." });
    }
    const requiredAction = targetStatus === "cancelled" || targetStatus === "rejected" ? "orders.cancel" : "omnichannel.manage_status";
    const auth = await requireAuthorizedStaff(req, res, requiredAction);
    if (!auth) return;
    const orderId = String(req.params.id || "");
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (memoryStore) {
      const tenant = memoryStore.tenants.get(auth.user.id);
      if (!tenant) return res.status(404).json({ ok: false, error: "Shop workspace not found." });
      const existing2 = tenant.orders.find((o) => o.id === orderId);
      if (!existing2) {
        return res.status(404).json({ ok: false, error: "Order not found for this shop." });
      }
      if (!isValidOmnichannelTransition(existing2.status, targetStatus)) {
        return res.status(400).json({
          ok: false,
          code: "INVALID_TRANSITION",
          error: `Cannot move order ${existing2.orderNumber} from "${existing2.status}" to "${targetStatus}".`
        });
      }
      let notif2;
      if (targetStatus === "accepted" || targetStatus === "ready" || targetStatus === "delivered") {
        const eventMap = {
          accepted: "order_accepted",
          ready: "order_ready",
          delivered: "order_delivered"
        };
        notif2 = await dispatchWhatsAppNotification({
          storeName: tenant.settings.storeName,
          order: existing2,
          event: eventMap[targetStatus],
          env: getWaEnv(),
          sendOverride: deps.whatsappSendOverride
        });
      }
      const result = transitionOmnichannelOrderStatus({
        order: existing2,
        targetStatus,
        actor: {
          id: auth.staff.employeeId,
          name: auth.staff.employeeName,
          role: auth.staff.role
        },
        products: tenant.products,
        reason: body.reason,
        notificationEntry: notif2,
        nowIso
      });
      if (result.ok === false) {
        const codeStatus = result.code === "INSUFFICIENT_STOCK" ? 409 : 400;
        return res.status(codeStatus).json({ ok: false, code: result.code, error: result.error });
      }
      tenant.products = result.updatedProducts;
      tenant.orders = tenant.orders.map((o) => o.id === orderId ? result.order : o);
      if (result.adjustments.length > 0) {
        tenant.adjustments.unshift(...result.adjustments);
      }
      tenant.auditLogs.unshift({
        id: `oaud-${Date.now()}`,
        orderId,
        action: `order_status_${targetStatus}`,
        actorId: auth.staff.employeeId,
        actorName: auth.staff.employeeName,
        actorRole: auth.staff.role,
        previousStatus: existing2.status,
        newStatus: targetStatus,
        details: body.reason?.trim() || `Moved from ${existing2.status} to ${targetStatus}`,
        createdAt: nowIso
      });
      return res.json({
        ok: true,
        order: result.order,
        updatedProducts: result.updatedProducts,
        adjustments: result.adjustments,
        didReserveStock: result.didReserveStock,
        didRestoreStock: result.didRestoreStock
      });
    }
    if (!adminSupabase2) {
      return res.status(503).json({ ok: false, error: "Database service unavailable." });
    }
    const orderRes = await adminSupabase2.from("omnichannel_orders").select("*").eq("id", orderId).eq("user_id", auth.user.id).maybeSingle();
    if (orderRes.error || !orderRes.data) {
      return res.status(404).json({ ok: false, error: "Order not found for this shop." });
    }
    const existing = mapOmnichannelOrderRow(orderRes.data);
    if (!isValidOmnichannelTransition(existing.status, targetStatus)) {
      return res.status(400).json({
        ok: false,
        code: "INVALID_TRANSITION",
        error: `Cannot move order ${existing.orderNumber} from "${existing.status}" to "${targetStatus}".`
      });
    }
    const storeRes = await adminSupabase2.from("store_settings").select("store_name").eq("user_id", auth.user.id).maybeSingle();
    const storeName = String(storeRes.data?.store_name || "Shop");
    let notif;
    if (targetStatus === "accepted" || targetStatus === "ready" || targetStatus === "delivered") {
      const eventMap = {
        accepted: "order_accepted",
        ready: "order_ready",
        delivered: "order_delivered"
      };
      notif = await dispatchWhatsAppNotification({
        storeName,
        order: existing,
        event: eventMap[targetStatus],
        env: getWaEnv(),
        sendOverride: deps.whatsappSendOverride
      });
    }
    const historyEntry = {
      status: targetStatus,
      changedAt: nowIso,
      actorId: auth.staff.employeeId,
      actorName: auth.staff.employeeName,
      actorRole: auth.staff.role,
      note: body.reason?.trim() || void 0
    };
    if (targetStatus === "accepted") {
      const rpcRes = await adminSupabase2.rpc("accept_omnichannel_order_with_stock", {
        p_user_id: auth.user.id,
        p_order_id: orderId,
        p_actor_id: auth.staff.employeeId,
        p_actor_name: auth.staff.employeeName,
        p_actor_role: auth.staff.role,
        p_history_entry: historyEntry,
        p_notification_entry: notif ?? null
      });
      if (rpcRes.error && !isMissingColumnOrTable(rpcRes.error)) {
        const statusCode = rpcRes.error.code === "42501" ? 403 : 500;
        return res.status(statusCode).json({ ok: false, error: rpcRes.error.message });
      }
      if (!rpcRes.error && rpcRes.data) {
        const payload = rpcRes.data;
        if (!payload.ok) {
          return res.status(payload.code === "INSUFFICIENT_STOCK" ? 409 : 400).json({
            ok: false,
            code: payload.code,
            error: payload.error || "Could not accept order."
          });
        }
        return res.json({
          ok: true,
          order: mapOmnichannelOrderRow(payload.order),
          didReserveStock: true,
          didRestoreStock: false
        });
      }
    }
    if (targetStatus === "cancelled" || targetStatus === "rejected") {
      const rpcRes = await adminSupabase2.rpc("cancel_or_reject_omnichannel_order_with_restock", {
        p_user_id: auth.user.id,
        p_order_id: orderId,
        p_target_status: targetStatus,
        p_reason: body.reason?.trim() || "",
        p_actor_id: auth.staff.employeeId,
        p_actor_name: auth.staff.employeeName,
        p_actor_role: auth.staff.role,
        p_history_entry: historyEntry
      });
      if (rpcRes.error && !isMissingColumnOrTable(rpcRes.error)) {
        const statusCode = rpcRes.error.code === "42501" ? 403 : 500;
        return res.status(statusCode).json({ ok: false, error: rpcRes.error.message });
      }
      if (!rpcRes.error && rpcRes.data) {
        const payload = rpcRes.data;
        if (!payload.ok) {
          return res.status(400).json({ ok: false, code: payload.code, error: payload.error });
        }
        return res.json({
          ok: true,
          order: mapOmnichannelOrderRow(payload.order),
          didReserveStock: false,
          didRestoreStock: Boolean(payload.restocked)
        });
      }
    }
    if (targetStatus === "preparing" || targetStatus === "ready" || targetStatus === "delivered") {
      const rpcRes = await adminSupabase2.rpc("transition_omnichannel_order_status", {
        p_user_id: auth.user.id,
        p_order_id: orderId,
        p_target_status: targetStatus,
        p_note: body.reason?.trim() || null,
        p_actor_id: auth.staff.employeeId,
        p_actor_name: auth.staff.employeeName,
        p_actor_role: auth.staff.role,
        p_notification_entry: notif ?? null
      });
      if (rpcRes.error && !isMissingColumnOrTable(rpcRes.error)) {
        const statusCode = rpcRes.error.code === "42501" ? 403 : 500;
        return res.status(statusCode).json({ ok: false, error: rpcRes.error.message });
      }
      if (!rpcRes.error && rpcRes.data) {
        const payload = rpcRes.data;
        if (!payload.ok) {
          return res.status(400).json({
            ok: false,
            code: payload.code,
            error: payload.error || "Could not update order status."
          });
        }
        return res.json({
          ok: true,
          order: mapOmnichannelOrderRow(payload.order),
          didReserveStock: false,
          didRestoreStock: false
        });
      }
    }
    const prodRes = await adminSupabase2.from("products").select("*").eq("user_id", auth.user.id);
    const tenantProducts = (prodRes.data || []).map(mapProductRow);
    const transition = transitionOmnichannelOrderStatus({
      order: existing,
      targetStatus,
      actor: {
        id: auth.staff.employeeId,
        name: auth.staff.employeeName,
        role: auth.staff.role
      },
      products: tenantProducts,
      reason: body.reason,
      notificationEntry: notif,
      nowIso
    });
    if (transition.ok === false) {
      return res.status(transition.code === "INSUFFICIENT_STOCK" ? 409 : 400).json({ ok: false, code: transition.code, error: transition.error });
    }
    if (transition.didReserveStock || transition.didRestoreStock) {
      const prevMap = new Map(tenantProducts.map((p) => [p.id, p]));
      for (const updatedProd of transition.updatedProducts) {
        const prev = prevMap.get(updatedProd.id);
        if (prev && prev.stock !== updatedProd.stock) {
          await adminSupabase2.from("products").update({
            stock: updatedProd.stock,
            branch_stock: updatedProd.branchStock ?? {},
            updated_at: nowIso
          }).eq("id", updatedProd.id).eq("user_id", auth.user.id);
        }
      }
      if (transition.adjustments.length > 0) {
        await adminSupabase2.from("inventory_adjustments").insert(
          transition.adjustments.map((a) => ({
            id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a.id) ? a.id : import_node_crypto.default.randomUUID(),
            user_id: auth.user.id,
            product_id: a.productId,
            product_name: a.productName,
            sku: a.sku,
            selling_unit: a.sellingUnit,
            branch_id: a.branchId ?? null,
            adjustment_type: a.adjustmentType,
            quantity_change: a.quantityChange,
            previous_stock: a.previousStock,
            new_stock: a.newStock,
            reason: a.reason,
            actor_name: a.actorName ?? auth.staff.employeeName,
            created_at: a.createdAt
          }))
        );
      }
    }
    const upd = await adminSupabase2.from("omnichannel_orders").update({
      status: transition.order.status,
      stock_reserved: transition.order.stockReserved,
      stock_reserved_at: transition.order.stockReservedAt ?? null,
      stock_restored_at: transition.order.stockRestoredAt ?? null,
      cancellation_reason: transition.order.cancellationReason ?? null,
      status_history: transition.order.statusHistory,
      notification_log: transition.order.notificationLog,
      updated_by: auth.staff.employeeName,
      updated_at: nowIso
    }).eq("id", orderId).eq("user_id", auth.user.id);
    if (upd.error) {
      return res.status(500).json({ ok: false, error: upd.error.message });
    }
    await appendSupabaseOrderAuditLog({
      userId: auth.user.id,
      orderId,
      action: `order_status_${targetStatus}`,
      actorId: auth.staff.employeeId,
      actorName: auth.staff.employeeName,
      actorRole: auth.staff.role,
      previousStatus: existing.status,
      newStatus: targetStatus,
      details: body.reason?.trim() || `Moved from ${existing.status} to ${targetStatus}`,
      createdAt: nowIso
    });
    return res.json({
      ok: true,
      order: transition.order,
      updatedProducts: transition.updatedProducts,
      adjustments: transition.adjustments,
      didReserveStock: transition.didReserveStock,
      didRestoreStock: transition.didRestoreStock
    });
  });
  app.patch("/api/omnichannel/orders/:id/payment", async (req, res) => {
    const auth = await requireAuthorizedStaff(req, res, "omnichannel.payment");
    if (!auth) return;
    const orderId = String(req.params.id || "");
    const body = req.body || {};
    if (body.paymentMethod !== void 0 && !["cod", "cash", "card", "jazzcash", "easypaisa", "bank_transfer", "online"].includes(
      body.paymentMethod
    )) {
      return res.status(400).json({ ok: false, error: "Unsupported payment method." });
    }
    if (body.paymentStatus !== void 0 && !["unpaid", "cod_pending", "partially_paid", "paid", "refunded"].includes(body.paymentStatus)) {
      return res.status(400).json({ ok: false, error: "Invalid payment status." });
    }
    if (body.paidAmount !== void 0 && (!Number.isFinite(Number(body.paidAmount)) || Number(body.paidAmount) < 0)) {
      return res.status(400).json({ ok: false, error: "Paid amount must be a non-negative number." });
    }
    if (body.paymentMethod === "online" && !onlineGatewayConfigured) {
      return res.status(400).json({
        ok: false,
        error: "Online card payment gateway is not configured on this server."
      });
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (memoryStore) {
      const tenant = memoryStore.tenants.get(auth.user.id);
      const existing2 = tenant?.orders.find((o) => o.id === orderId);
      if (!tenant || !existing2) {
        return res.status(404).json({ ok: false, error: "Order not found for this shop." });
      }
      const nextMethod2 = body.paymentMethod ?? existing2.paymentMethod;
      const nextPaid2 = body.paidAmount !== void 0 ? Math.min(existing2.total, Math.max(0, roundCurrency(Number(body.paidAmount)))) : body.paymentStatus === "paid" ? existing2.total : existing2.paidAmount;
      const nextStatus2 = body.paymentStatus ?? (nextPaid2 >= existing2.total && existing2.total > 0 ? "paid" : nextPaid2 > 0 ? "partially_paid" : nextMethod2 === "cod" ? "cod_pending" : "unpaid");
      const updated = {
        ...existing2,
        paymentMethod: nextMethod2,
        paymentStatus: nextStatus2,
        paidAmount: nextPaid2,
        updatedBy: auth.staff.employeeName,
        updatedAt: nowIso
      };
      tenant.orders = tenant.orders.map((o) => o.id === orderId ? updated : o);
      tenant.auditLogs.unshift({
        id: `oaud-${Date.now()}`,
        orderId,
        action: "order_payment_updated",
        actorId: auth.staff.employeeId,
        actorName: auth.staff.employeeName,
        actorRole: auth.staff.role,
        previousStatus: existing2.status,
        newStatus: existing2.status,
        details: `Payment updated to ${nextStatus2} (${nextMethod2}, paid ${nextPaid2})`,
        createdAt: nowIso
      });
      return res.json({ ok: true, order: updated });
    }
    if (!adminSupabase2) {
      return res.status(503).json({ ok: false, error: "Database service unavailable." });
    }
    const orderRes = await adminSupabase2.from("omnichannel_orders").select("*").eq("id", orderId).eq("user_id", auth.user.id).maybeSingle();
    if (orderRes.error || !orderRes.data) {
      return res.status(404).json({ ok: false, error: "Order not found for this shop." });
    }
    const existing = mapOmnichannelOrderRow(orderRes.data);
    const nextMethod = body.paymentMethod ?? existing.paymentMethod;
    const nextPaid = body.paidAmount !== void 0 ? Math.min(existing.total, Math.max(0, roundCurrency(Number(body.paidAmount)))) : body.paymentStatus === "paid" ? existing.total : existing.paidAmount;
    const nextStatus = body.paymentStatus ?? (nextPaid >= existing.total && existing.total > 0 ? "paid" : nextPaid > 0 ? "partially_paid" : nextMethod === "cod" ? "cod_pending" : "unpaid");
    const upd = await adminSupabase2.from("omnichannel_orders").update({
      payment_method: nextMethod,
      payment_status: nextStatus,
      paid_amount: nextPaid,
      updated_by: auth.staff.employeeName,
      updated_at: nowIso
    }).eq("id", orderId).eq("user_id", auth.user.id).select("*").single();
    if (upd.error) {
      return res.status(500).json({ ok: false, error: upd.error.message });
    }
    await appendSupabaseOrderAuditLog({
      userId: auth.user.id,
      orderId,
      action: "order_payment_updated",
      actorId: auth.staff.employeeId,
      actorName: auth.staff.employeeName,
      actorRole: auth.staff.role,
      previousStatus: existing.status,
      newStatus: existing.status,
      details: `Payment updated to ${nextStatus} (${nextMethod}, paid ${nextPaid})`,
      createdAt: nowIso
    });
    return res.json({
      ok: true,
      order: mapOmnichannelOrderRow(upd.data)
    });
  });
  app.post("/api/omnichannel/storefront-settings", async (req, res) => {
    const auth = await requireAuthorizedStaff(req, res, "storefront.manage");
    if (!auth) return;
    const body = req.body || {};
    const cleanSlug = slugifyStoreName(String(body.storefrontSlug || ""));
    if (cleanSlug.length < 3) {
      return res.status(400).json({ ok: false, error: "Storefront slug must be at least 3 characters." });
    }
    if (memoryStore) {
      const collision = memoryStore.findTenantBySlug(cleanSlug);
      if (collision && collision.userId !== auth.user.id) {
        return res.status(409).json({ ok: false, error: "This storefront link slug is already taken by another shop." });
      }
      const tenant = memoryStore.tenants.get(auth.user.id);
      if (!tenant) return res.status(404).json({ ok: false, error: "Shop not found." });
      tenant.settings = {
        ...tenant.settings,
        storefrontSlug: cleanSlug,
        storefrontEnabled: Boolean(body.storefrontEnabled),
        storefrontDescription: String(body.storefrontDescription ?? tenant.settings.storefrontDescription ?? ""),
        codEnabled: body.codEnabled !== false,
        whatsappPhoneNumberId: String(body.whatsappPhoneNumberId ?? tenant.settings.whatsappPhoneNumberId ?? "")
      };
      return res.json({ ok: true, settings: tenant.settings });
    }
    if (!adminSupabase2) {
      return res.status(503).json({ ok: false, error: "Database service unavailable." });
    }
    const collisionRes = await adminSupabase2.from("store_settings").select("user_id").ilike("storefront_slug", cleanSlug).neq("user_id", auth.user.id).maybeSingle();
    if (!collisionRes.error && collisionRes.data) {
      return res.status(409).json({ ok: false, error: "This storefront link slug is already in use by another shop." });
    }
    const upd = await adminSupabase2.from("store_settings").update({
      storefront_slug: cleanSlug,
      storefront_enabled: Boolean(body.storefrontEnabled),
      storefront_description: String(body.storefrontDescription || ""),
      cod_enabled: body.codEnabled !== false,
      whatsapp_business_phone_id: String(body.whatsappPhoneNumberId || "").trim() || null,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("user_id", auth.user.id);
    if (upd.error) {
      return res.status(500).json({ ok: false, error: upd.error.message });
    }
    return res.json({
      ok: true,
      storefrontSlug: cleanSlug,
      storefrontEnabled: Boolean(body.storefrontEnabled)
    });
  });
}

// serverApp.ts
function isRpcMissingError(message) {
  return /PGRST202|Could not find the function/i.test(message || "");
}
function isTableMissingError(err) {
  if (!err) return false;
  return err.code === "PGRST205" || err.code === "42P01" || /Could not find the table|relation .* does not exist/i.test(err.message || "");
}
function isMissingColumnError(err) {
  if (!err) return false;
  return err.code === "42703" || /column .* does not exist|Could not find the .* column/i.test(err.message || "");
}
function timingSafePinEquals(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return import_node_crypto2.default.timingSafeEqual(bufA, bufB);
}
function normalizeEmployeeRole(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "admin" || raw === "manager" || raw === "cashier") {
    return raw;
  }
  return "cashier";
}
function rowHasConfiguredPin(row) {
  const pinHash = typeof row.pin_hash === "string" ? row.pin_hash.trim() : "";
  const pinCode = typeof row.pin_code === "string" ? row.pin_code.trim() : "";
  if (isDemoFixturePinHash(pinHash) || isDemoFixturePinHash(pinCode)) {
    return false;
  }
  return isStoredPinHash(pinHash) || isStoredPinHash(pinCode) || isValidPinFormat(pinCode);
}
function classifyPinState(row) {
  return classifyEmployeePin({
    pinHash: typeof row.pin_hash === "string" ? row.pin_hash : void 0,
    pinCode: typeof row.pin_code === "string" ? row.pin_code : void 0
  });
}
async function selectEmployeesWithSchemaFallback(client, userId, options) {
  let query = client.from("employees").select("id, name, phone, role, is_active, pin_hash, pin_code, created_at").eq("user_id", userId);
  if (options?.activeOnly) query = query.eq("is_active", true);
  if (options?.employeeId) query = query.eq("id", options.employeeId);
  const res = await query;
  if (!res.error) {
    return {
      rows: res.data || [],
      supportsPinHashColumn: true,
      error: null
    };
  }
  if (!isMissingColumnError(res.error)) {
    return { rows: [], supportsPinHashColumn: true, error: res.error };
  }
  let legacyQuery = client.from("employees").select("id, name, phone, role, is_active, pin_code, created_at").eq("user_id", userId);
  if (options?.activeOnly) legacyQuery = legacyQuery.eq("is_active", true);
  if (options?.employeeId) legacyQuery = legacyQuery.eq("id", options.employeeId);
  const legacyRes = await legacyQuery;
  return {
    rows: legacyRes.data || [],
    supportsPinHashColumn: false,
    error: legacyRes.error
  };
}
var SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
var SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
var SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
var WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
var WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
var WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || "v20.0";
var SESSION_SIGNING_KEY = process.env.STAFF_SESSION_SECRET || SUPABASE_SERVICE_ROLE_KEY || import_node_crypto2.default.randomBytes(32).toString("hex");
var hasPublicSupabase = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("YOUR_PROJECT_REF") && SUPABASE_ANON_KEY.length > 20 && !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY");
var hasServiceRole = hasPublicSupabase && SUPABASE_SERVICE_ROLE_KEY.length > 20 && !SUPABASE_SERVICE_ROLE_KEY.includes("YOUR_");
var adminSupabase = hasServiceRole ? (0, import_supabase_js2.createClient)(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
}) : null;
function createUserScopedSupabase(jwt, staffSessionToken) {
  if (!hasPublicSupabase) return null;
  const headers = {
    Authorization: `Bearer ${jwt}`
  };
  if (staffSessionToken) {
    headers["x-staff-session"] = staffSessionToken;
  }
  return (0, import_supabase_js2.createClient)(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers }
  });
}
function extractBearerToken(req) {
  const raw = req.header("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match ? match[1].trim() : null;
}
var DEFAULT_INITIAL_FOUNDER_EMAIL = "bc260436573@vu.edu.pk";
function stripZeroWidthChars(value) {
  return value.replace(/[\u200B-\u200D\uFEFF]/g, "");
}
function normalizeEmailForComparison(raw) {
  if (typeof raw !== "string") return "";
  let cleaned = stripZeroWidthChars(raw).trim();
  cleaned = cleaned.replace(/^['"]+|['"]+$/g, "").trim();
  return cleaned.toLowerCase();
}
function resolveFounderEmailConfig(rawEnvValue = process.env.INITIAL_FOUNDER_EMAIL) {
  const raw = typeof rawEnvValue === "string" ? stripZeroWidthChars(rawEnvValue) : "";
  const trimmed = raw.trim();
  const rawEnvHadWhitespace = raw !== trimmed;
  const rawEnvHadSurroundingQuotes = trimmed.length >= 2 && (trimmed.startsWith('"') && trimmed.endsWith('"') || trimmed.startsWith("'") && trimmed.endsWith("'"));
  const unquoted = trimmed.replace(/^['"]+|['"]+$/g, "").trim().toLowerCase();
  if (unquoted && unquoted !== "undefined" && unquoted !== "null") {
    return {
      effectiveFounderEmail: unquoted,
      founderEmailSource: "env_override",
      rawEnvHadSurroundingQuotes,
      rawEnvHadWhitespace
    };
  }
  return {
    effectiveFounderEmail: DEFAULT_INITIAL_FOUNDER_EMAIL,
    founderEmailSource: "default_fallback",
    rawEnvHadSurroundingQuotes,
    rawEnvHadWhitespace
  };
}
function maskEmailForDiagnostics(email) {
  const normalized = normalizeEmailForComparison(email);
  if (!normalized) return "(empty)";
  const atIdx = normalized.indexOf("@");
  if (atIdx <= 0) return "***";
  const local = normalized.slice(0, atIdx);
  const domain = normalized.slice(atIdx + 1);
  const maskedLocal = local.length <= 2 ? `${local[0] || ""}***` : local.length <= 4 ? `${local[0]}***${local.slice(-1)}` : `${local.slice(0, 3)}***${local.slice(-1)}`;
  return `${maskedLocal}@${domain}`;
}
function compareFounderEmails(verifiedEmail, effectiveFounderEmail) {
  const normalizedUser = normalizeEmailForComparison(verifiedEmail);
  const normalizedFounder = normalizeEmailForComparison(effectiveFounderEmail);
  if (!normalizedFounder) {
    return {
      emailMatchesFounder: false,
      domainsMatch: false,
      localPartsMatch: false,
      emailComparisonSummary: "founder_email_unconfigured"
    };
  }
  if (!normalizedUser) {
    return {
      emailMatchesFounder: false,
      domainsMatch: false,
      localPartsMatch: false,
      emailComparisonSummary: "authenticated_email_missing"
    };
  }
  const [userLocal = "", userDomain = ""] = normalizedUser.split("@");
  const [founderLocal = "", founderDomain = ""] = normalizedFounder.split("@");
  const domainsMatch = Boolean(userDomain && founderDomain && userDomain === founderDomain);
  const localPartsMatch = Boolean(userLocal && founderLocal && userLocal === founderLocal);
  const emailMatchesFounder = normalizedUser === normalizedFounder;
  const emailComparisonSummary = emailMatchesFounder ? "exact_match" : localPartsMatch && !domainsMatch ? "domain_mismatch" : !localPartsMatch && domainsMatch ? "local_part_mismatch" : "both_local_and_domain_mismatch";
  return {
    emailMatchesFounder,
    domainsMatch,
    localPartsMatch,
    emailComparisonSummary
  };
}
function resolveSuperAdminAllowlist(rawEnvValue = process.env.SUPER_ADMIN_USER_IDS) {
  return new Set(
    (rawEnvValue || "").replace(/['"]/g, "").split(",").map((s) => s.trim()).filter(Boolean)
  );
}
var platformAuditMemoryLog = [];
var unmigratedStatusOverlay = /* @__PURE__ */ new Map();
async function recordSaasAuditLog(client, entry) {
  const full = {
    id: `saas-audit-${import_node_crypto2.default.randomUUID()}`,
    ...entry,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  platformAuditMemoryLog.unshift(full);
  if (platformAuditMemoryLog.length > 200) {
    platformAuditMemoryLog.length = 200;
  }
  if (client) {
    try {
      await client.from("saas_audit_logs").insert(full);
    } catch {
    }
  }
  return full;
}
async function authenticateSupabaseRequest(req) {
  if (!hasPublicSupabase) return null;
  const jwt = extractBearerToken(req);
  if (!jwt) return null;
  const client = adminSupabase ?? createUserScopedSupabase(jwt);
  if (!client) return null;
  const { data, error } = await client.auth.getUser(jwt);
  if (error || !data?.user) {
    return null;
  }
  const rawRole = typeof data.user.app_metadata?.role === "string" ? data.user.app_metadata.role.trim().toLowerCase() : void 0;
  return {
    id: data.user.id,
    email: normalizeEmailForComparison(data.user.email || ""),
    emailConfirmed: Boolean(
      data.user.email_confirmed_at || data.user.confirmed_at
    ),
    appMetadataRole: rawRole,
    jwt
  };
}
async function verifyIsExplicitSuperAdminWithDiagnostics(user, overrides) {
  const effectiveAdminClient = overrides && "adminClient" in overrides ? overrides.adminClient ?? null : adminSupabase;
  const founderConfig = resolveFounderEmailConfig(
    overrides && "rawFounderEnv" in overrides ? overrides.rawFounderEnv : process.env.INITIAL_FOUNDER_EMAIL
  );
  const allowlist = resolveSuperAdminAllowlist(
    overrides && "rawAllowlistEnv" in overrides ? overrides.rawAllowlistEnv : process.env.SUPER_ADMIN_USER_IDS
  );
  const initialComparison = compareFounderEmails(
    user.email,
    founderConfig.effectiveFounderEmail
  );
  const diagnostics = {
    hasServiceRole: Boolean(effectiveAdminClient),
    allowlistMatched: allowlist.has(user.id),
    jwtAppMetadataIsSuperAdmin: user.appMetadataRole === "super_admin",
    authAdminLookupSucceeded: false,
    authAdminAppMetadataIsSuperAdmin: false,
    superAdminsTableAvailable: false,
    inSuperAdminsTable: false,
    emailMatchesFounder: initialComparison.emailMatchesFounder,
    emailConfirmed: user.emailConfirmed,
    founderEmailSource: founderConfig.founderEmailSource,
    configuredFounderEmailMasked: maskEmailForDiagnostics(founderConfig.effectiveFounderEmail),
    authenticatedUserEmailMasked: maskEmailForDiagnostics(user.email),
    authenticatedEmailSource: user.email ? "jwt_user" : "none",
    rawEnvHadSurroundingQuotes: founderConfig.rawEnvHadSurroundingQuotes,
    rawEnvHadWhitespace: founderConfig.rawEnvHadWhitespace,
    domainsMatch: initialComparison.domainsMatch,
    localPartsMatch: initialComparison.localPartsMatch,
    emailComparisonSummary: initialComparison.emailComparisonSummary,
    founderProvisioningAttempted: false,
    founderProvisionedNow: false,
    founderProvisioningBlockedReason: null,
    rpcFallbackIsSuperAdmin: false
  };
  if (diagnostics.allowlistMatched || diagnostics.jwtAppMetadataIsSuperAdmin) {
    return { isSuperAdmin: true, diagnostics };
  }
  if (effectiveAdminClient) {
    let authUser = null;
    try {
      const { data: authLookup, error: authErr } = await effectiveAdminClient.auth.admin.getUserById(user.id);
      if (!authErr && authLookup?.user) {
        diagnostics.authAdminLookupSucceeded = true;
        authUser = authLookup.user;
        if (authUser?.app_metadata?.role === "super_admin") {
          diagnostics.authAdminAppMetadataIsSuperAdmin = true;
          return { isSuperAdmin: true, diagnostics };
        }
      }
    } catch {
      diagnostics.authAdminLookupSucceeded = false;
    }
    const saLookup = await effectiveAdminClient.from("super_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    diagnostics.superAdminsTableAvailable = !isTableMissingError(saLookup.error);
    if (!saLookup.error && saLookup.data?.user_id) {
      diagnostics.inSuperAdminsTable = true;
      if (diagnostics.authAdminLookupSucceeded && authUser?.app_metadata?.role !== "super_admin") {
        await effectiveAdminClient.auth.admin.updateUserById(user.id, {
          app_metadata: {
            ...authUser?.app_metadata || {},
            role: "super_admin",
            super_admin_provisioned_at: (/* @__PURE__ */ new Date()).toISOString()
          }
        }).catch(() => void 0);
      }
      return { isSuperAdmin: true, diagnostics };
    }
    const rawAuthAdminEmail = typeof authUser?.email === "string" ? authUser.email : "";
    const rawJwtEmail = typeof user.email === "string" ? user.email : "";
    diagnostics.authenticatedEmailSource = rawAuthAdminEmail.trim() ? "auth_admin" : rawJwtEmail.trim() ? "jwt_user" : "none";
    const verifiedEmail = normalizeEmailForComparison(rawAuthAdminEmail || rawJwtEmail);
    diagnostics.authenticatedUserEmailMasked = maskEmailForDiagnostics(verifiedEmail);
    diagnostics.emailConfirmed = Boolean(
      authUser?.email_confirmed_at || authUser?.confirmed_at || user.emailConfirmed
    );
    const comparison = compareFounderEmails(verifiedEmail, founderConfig.effectiveFounderEmail);
    diagnostics.emailMatchesFounder = comparison.emailMatchesFounder;
    diagnostics.domainsMatch = comparison.domainsMatch;
    diagnostics.localPartsMatch = comparison.localPartsMatch;
    diagnostics.emailComparisonSummary = comparison.emailComparisonSummary;
    if (diagnostics.emailMatchesFounder && diagnostics.emailConfirmed) {
      diagnostics.founderProvisioningAttempted = true;
      try {
        const { error: metaErr } = await effectiveAdminClient.auth.admin.updateUserById(user.id, {
          app_metadata: {
            ...authUser?.app_metadata || {},
            role: "super_admin",
            super_admin_provisioned_at: (/* @__PURE__ */ new Date()).toISOString()
          }
        });
        if (!metaErr) {
          diagnostics.founderProvisionedNow = true;
          if (diagnostics.superAdminsTableAvailable) {
            const byEmailUpsert = await effectiveAdminClient.from("super_admins").upsert(
              { user_id: user.id, email: verifiedEmail },
              { onConflict: "email" }
            );
            if (byEmailUpsert.error) {
              await effectiveAdminClient.from("super_admins").upsert(
                { user_id: user.id, email: verifiedEmail },
                { onConflict: "user_id" }
              );
            }
          }
          await recordSaasAuditLog(effectiveAdminClient, {
            actor_user_id: user.id,
            actor_email: verifiedEmail,
            target_user_id: user.id,
            target_email: verifiedEmail,
            target_shop_name: String(authUser?.user_metadata?.shop_name || "Platform Founder"),
            action: "founder_provisioned",
            previous_status: "unassigned",
            new_status: "super_admin",
            details: "Server-verified Founder Super Admin provisioning succeeded."
          });
          return { isSuperAdmin: true, diagnostics };
        }
        diagnostics.founderProvisioningBlockedReason = "auth_admin_update_failed";
      } catch {
        diagnostics.founderProvisioningBlockedReason = "auth_admin_update_exception";
      }
    } else if (diagnostics.emailMatchesFounder && !diagnostics.emailConfirmed) {
      diagnostics.founderProvisioningBlockedReason = "email_unconfirmed";
    } else {
      diagnostics.founderProvisioningBlockedReason = "email_mismatch";
    }
  } else {
    diagnostics.founderProvisioningBlockedReason = "service_role_unavailable";
  }
  const userClient = overrides && "userClient" in overrides ? overrides.userClient ?? null : createUserScopedSupabase(user.jwt);
  if (userClient) {
    const { data: rpcOk, error: rpcErr } = await userClient.rpc("is_super_admin");
    if (!rpcErr && rpcOk === true) {
      diagnostics.rpcFallbackIsSuperAdmin = true;
      return { isSuperAdmin: true, diagnostics };
    }
    const { data, error } = await userClient.from("super_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (!error && data?.user_id) {
      diagnostics.inSuperAdminsTable = true;
      diagnostics.superAdminsTableAvailable = true;
      return { isSuperAdmin: true, diagnostics };
    }
  }
  return { isSuperAdmin: false, diagnostics };
}
async function verifyIsExplicitSuperAdmin(user) {
  const result = await verifyIsExplicitSuperAdminWithDiagnostics(user);
  return result.isSuperAdmin;
}
async function checkTenantOperationalAccess(user) {
  const client = adminSupabase ?? createUserScopedSupabase(user.jwt);
  if (!client) return { allowed: true };
  let subRow = null;
  const primary = await client.from("subscriptions").select("is_blocked, status, suspended_reason, expires_at").eq("user_id", user.id).maybeSingle();
  if (!primary.error) {
    subRow = primary.data ?? null;
  } else if (isMissingColumnError(primary.error)) {
    const legacy = await client.from("subscriptions").select("is_blocked, expires_at").eq("user_id", user.id).maybeSingle();
    if (!legacy.error) {
      subRow = legacy.data ?? null;
    }
  }
  const overlay = unmigratedStatusOverlay.get(user.id);
  const rawStatus = typeof subRow?.status === "string" && ["active", "suspended", "blocked"].includes(subRow.status) ? subRow.status : overlay?.status;
  const isBlocked = Boolean(subRow?.is_blocked);
  const effectiveStatus = rawStatus === "suspended" ? "suspended" : rawStatus === "blocked" || isBlocked ? "blocked" : "active";
  if (effectiveStatus === "suspended" || effectiveStatus === "blocked") {
    const reason = typeof subRow?.suspended_reason === "string" && subRow.suspended_reason ? subRow.suspended_reason : overlay?.suspendedReason || "";
    return {
      allowed: false,
      status: effectiveStatus,
      reason
    };
  }
  return { allowed: true, status: "active" };
}
function signStaffToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = import_node_crypto2.default.createHmac("sha256", SESSION_SIGNING_KEY).update(body).digest("base64url");
  return `sbz_${body}.${sig}`;
}
function verifySignedStaffToken(token, expectedUserId) {
  if (!token.startsWith("sbz_")) return null;
  const rest = token.slice(4);
  const dotIdx = rest.indexOf(".");
  if (dotIdx <= 0) return null;
  const body = rest.slice(0, dotIdx);
  const sig = rest.slice(dotIdx + 1);
  const expectedSig = import_node_crypto2.default.createHmac("sha256", SESSION_SIGNING_KEY).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !import_node_crypto2.default.timingSafeEqual(a, b)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (parsed.uid !== expectedUserId) return null;
    if (typeof parsed.exp !== "number" || Date.now() > parsed.exp) return null;
    if (!["admin", "manager", "cashier"].includes(parsed.role)) return null;
    return parsed;
  } catch {
    return null;
  }
}
async function resolveVerifiedStaffRole(req, user) {
  const token = (req.header("x-staff-session") || "").trim();
  if (!token) {
    return { role: null, employeeId: null };
  }
  const signed = verifySignedStaffToken(token, user.id);
  if (signed) {
    return { role: signed.role, employeeId: signed.empId };
  }
  if (adminSupabase) {
    const { data, error } = await adminSupabase.from("staff_sessions").select("role, employee_id, expires_at").eq("token", token).eq("user_id", user.id).maybeSingle();
    if (!error && data && new Date(data.expires_at).getTime() > Date.now()) {
      return { role: data.role, employeeId: data.employee_id };
    }
    return { role: null, employeeId: null };
  }
  const userClient = createUserScopedSupabase(user.jwt, token);
  if (userClient) {
    const { data, error } = await userClient.rpc("current_staff_role");
    if (!error && typeof data === "string" && ["admin", "manager", "cashier"].includes(data)) {
      return { role: data, employeeId: null };
    }
  }
  return { role: null, employeeId: null };
}
async function issueFallbackStaffToken(userId, employeeId, role) {
  const expiresMs = Date.now() + 12 * 60 * 60 * 1e3;
  const expiresAt = new Date(expiresMs).toISOString();
  const signedToken = signStaffToken({
    uid: userId,
    empId: employeeId,
    role,
    exp: expiresMs
  });
  if (adminSupabase) {
    try {
      const dbToken = import_node_crypto2.default.randomBytes(24).toString("hex");
      const { error } = await adminSupabase.from("staff_sessions").insert({
        token: dbToken,
        user_id: userId,
        employee_id: employeeId,
        role,
        expires_at: expiresAt
      });
      if (!error) {
        return { token: dbToken, signedToken, expiresAt };
      }
    } catch {
    }
  }
  return { token: signedToken, signedToken, expiresAt };
}
function createPosExpressApp(options) {
  const app = (0, import_express.default)();
  const aiUsageTracker = new AiUsageTracker();
  const aiHowToCache = new SafePosHowToCache();
  app.use(
    "/api/webhooks/whatsapp",
    import_express.default.json({
      limit: "1mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app.use("/api/ai/assist", import_express.default.json({ limit: "8mb" }));
  app.use(import_express.default.json({ limit: "1mb" }));
  const authenticateReq = options?.authenticateOverride ?? authenticateSupabaseRequest;
  const checkOpAccess = options?.tenantAccessOverride ?? checkTenantOperationalAccess;
  const resolveStaff = options?.staffRoleOverride ?? resolveVerifiedStaffRole;
  app.get("/api/health", (_req, res) => {
    const aiConfig = resolveAiAssistantConfig(options?.aiEnv);
    res.json({
      ok: true,
      supabaseConfigured: hasPublicSupabase,
      adminServiceConfigured: hasServiceRole,
      whatsappConfigured: Boolean(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID),
      aiConfigured: aiConfig.configured && aiConfig.enabled
    });
  });
  app.get("/api/admin/me", async (req, res) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required.", isSuperAdmin: false });
    }
    const result = await verifyIsExplicitSuperAdminWithDiagnostics(user);
    return res.json({
      isSuperAdmin: result.isSuperAdmin,
      userId: user.id,
      diagnostics: result.diagnostics
    });
  });
  app.get("/api/admin/subscriptions", async (req, res) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const isSuperAdmin = await verifyIsExplicitSuperAdmin(user);
    if (!isSuperAdmin) {
      return res.status(403).json({ error: "Forbidden: explicit super_admin role required." });
    }
    const client = adminSupabase ?? createUserScopedSupabase(user.jwt);
    if (!client) {
      return res.status(503).json({ error: "Supabase client unavailable on server." });
    }
    const { data: subRows, error: subErr } = await client.from("subscriptions").select("*").order("created_at", { ascending: false });
    if (subErr) {
      return res.status(500).json({ error: subErr.message });
    }
    const subByUserId = new Map(
      (subRows || []).map((r) => [String(r.user_id), r])
    );
    const storeNameByUserId = /* @__PURE__ */ new Map();
    const empStatsByUserId = /* @__PURE__ */ new Map();
    const authUsersList = [];
    if (adminSupabase) {
      const [usersRes, settingsRes, empPrimary] = await Promise.all([
        adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1e3 }),
        adminSupabase.from("store_settings").select("user_id, store_name"),
        adminSupabase.from("employees").select("id, user_id, role, is_active, pin_hash, pin_code")
      ]);
      if (!usersRes.error && Array.isArray(usersRes.data?.users)) {
        for (const u of usersRes.data.users) {
          authUsersList.push({
            id: u.id,
            email: (u.email || "").trim().toLowerCase(),
            shopName: typeof u.user_metadata?.shop_name === "string" && u.user_metadata.shop_name.trim() ? u.user_metadata.shop_name.trim() : void 0,
            createdAt: u.created_at || (/* @__PURE__ */ new Date()).toISOString(),
            lastSignInAt: u.last_sign_in_at || void 0
          });
        }
      }
      if (!settingsRes.error && Array.isArray(settingsRes.data)) {
        for (const row of settingsRes.data) {
          const uid = String(row.user_id || "");
          const sname = typeof row.store_name === "string" ? row.store_name.trim() : "";
          if (uid && sname) {
            storeNameByUserId.set(uid, sname);
          }
        }
      }
      let empRows = [];
      if (!empPrimary.error && Array.isArray(empPrimary.data)) {
        empRows = empPrimary.data;
      } else if (isMissingColumnError(empPrimary.error)) {
        const empLegacy = await adminSupabase.from("employees").select("id, user_id, role, is_active, pin_code");
        if (!empLegacy.error && Array.isArray(empLegacy.data)) {
          empRows = empLegacy.data;
        }
      }
      for (const row of empRows) {
        const uid = String(row.user_id || "");
        if (!uid) continue;
        const curr = empStatsByUserId.get(uid) ?? {
          employeeCount: 0,
          activeEmployeeCount: 0,
          adminConfigured: false
        };
        curr.employeeCount += 1;
        const isActive = row.is_active !== false;
        if (isActive) curr.activeEmployeeCount += 1;
        if (normalizeEmployeeRole(row.role) === "admin" && isActive && rowHasConfiguredPin(row)) {
          curr.adminConfigured = true;
        }
        empStatsByUserId.set(uid, curr);
      }
    }
    const allUserIds = /* @__PURE__ */ new Set([
      ...subByUserId.keys(),
      ...authUsersList.map((u) => u.id)
    ]);
    const authByUserId = new Map(authUsersList.map((u) => [u.id, u]));
    const merged = Array.from(allUserIds).map((uid) => {
      const row = subByUserId.get(uid);
      const authU = authByUserId.get(uid);
      const empStats = empStatsByUserId.get(uid) ?? {
        employeeCount: 0,
        activeEmployeeCount: 0,
        adminConfigured: false
      };
      const overlay = unmigratedStatusOverlay.get(uid);
      const createdAt = String(row?.created_at || authU?.createdAt || (/* @__PURE__ */ new Date()).toISOString());
      const defaultTrialExpiry = new Date(
        new Date(createdAt).getTime() + 30 * 24 * 60 * 60 * 1e3
      ).toISOString();
      const rawStatus = typeof row?.status === "string" && ["active", "suspended", "blocked"].includes(row.status) ? row.status : overlay?.status;
      const isBlocked = Boolean(row?.is_blocked);
      const status = rawStatus === "suspended" ? "suspended" : rawStatus === "blocked" || isBlocked ? "blocked" : "active";
      return {
        user_id: uid,
        email: String(row?.email || authU?.email || ""),
        shop_name: storeNameByUserId.get(uid) || (row?.shop_name ? String(row.shop_name) : "") || authU?.shopName || "",
        plan_name: String(row?.plan_name || "30-Day Free Trial"),
        expires_at: String(row?.expires_at || defaultTrialExpiry),
        is_blocked: status !== "active" || isBlocked,
        status,
        suspended_reason: typeof row?.suspended_reason === "string" && row.suspended_reason || overlay?.suspendedReason || "",
        suspended_at: row?.suspended_at || overlay?.suspendedAt || null,
        trial_ends_at: row?.trial_ends_at || defaultTrialExpiry,
        max_branches: row?.max_branches ?? 3,
        max_employees: row?.max_employees ?? 15,
        payment_history: Array.isArray(row?.payment_history) ? row.payment_history : [],
        employee_count: empStats.employeeCount,
        active_employee_count: empStats.activeEmployeeCount,
        admin_configured: empStats.adminConfigured,
        last_sign_in_at: authU?.lastSignInAt ?? null,
        created_at: createdAt,
        updated_at: row?.updated_at || createdAt
      };
    });
    merged.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    let dbAuditRows = [];
    const auditRes = await client.from("saas_audit_logs").select("*").order("created_at", { ascending: false }).limit(100);
    if (!auditRes.error && Array.isArray(auditRes.data)) {
      dbAuditRows = auditRes.data;
    }
    const seenIds = new Set(dbAuditRows.map((a) => a.id));
    const combinedLogs = [
      ...dbAuditRows,
      ...platformAuditMemoryLog.filter((a) => !seenIds.has(a.id))
    ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 100);
    return res.json({ subscriptions: merged, auditLogs: combinedLogs });
  });
  app.get("/api/admin/audit-logs", async (req, res) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const isSuperAdmin = await verifyIsExplicitSuperAdmin(user);
    if (!isSuperAdmin) {
      return res.status(403).json({ error: "Forbidden: explicit super_admin role required." });
    }
    const client = adminSupabase ?? createUserScopedSupabase(user.jwt);
    let dbAuditRows = [];
    if (client) {
      const auditRes = await client.from("saas_audit_logs").select("*").order("created_at", { ascending: false }).limit(100);
      if (!auditRes.error && Array.isArray(auditRes.data)) {
        dbAuditRows = auditRes.data;
      }
    }
    const seenIds = new Set(dbAuditRows.map((a) => a.id));
    const combinedLogs = [
      ...dbAuditRows,
      ...platformAuditMemoryLog.filter((a) => !seenIds.has(a.id))
    ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 100);
    return res.json({ auditLogs: combinedLogs });
  });
  app.post("/api/admin/subscriptions/:userId", async (req, res) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const isSuperAdmin = await verifyIsExplicitSuperAdmin(user);
    if (!isSuperAdmin) {
      return res.status(403).json({ error: "Forbidden: explicit super_admin role required." });
    }
    const targetUserId = String(req.params.userId || "").trim();
    if (!targetUserId) {
      return res.status(400).json({ error: "Target userId is required." });
    }
    const {
      expiresAt,
      isBlocked,
      status,
      suspendedReason,
      planName,
      maxBranches,
      maxEmployees,
      paymentHistory,
      actionLabel
    } = req.body;
    const normalizedStatus = status && ["active", "suspended", "blocked"].includes(status) ? status : typeof isBlocked === "boolean" ? isBlocked ? "blocked" : "active" : void 0;
    const effectiveBlocked = normalizedStatus !== void 0 ? normalizedStatus !== "active" : typeof isBlocked === "boolean" ? isBlocked : void 0;
    if (targetUserId === user.id && effectiveBlocked === true) {
      return res.status(400).json({
        error: "Cannot suspend or block the active platform Super Admin account."
      });
    }
    const client = adminSupabase ?? createUserScopedSupabase(user.jwt);
    if (!client) {
      return res.status(503).json({ error: "Supabase client unavailable on server." });
    }
    const existingSubRes = await client.from("subscriptions").select("*").eq("user_id", targetUserId).maybeSingle();
    const existingRow = existingSubRes.data ?? null;
    const prevOverlay = unmigratedStatusOverlay.get(targetUserId);
    const previousStatus = typeof existingRow?.status === "string" ? existingRow.status : existingRow?.is_blocked ? prevOverlay?.status || "blocked" : "active";
    let targetEmail = String(existingRow?.email || "");
    let targetShopName = String(existingRow?.shop_name || "");
    if ((!targetEmail || !targetShopName) && adminSupabase) {
      const authLookup = await adminSupabase.auth.admin.getUserById(targetUserId);
      if (!authLookup.error && authLookup.data?.user) {
        targetEmail = targetEmail || (authLookup.data.user.email || "").toLowerCase();
        targetShopName = targetShopName || String(authLookup.data.user.user_metadata?.shop_name || "");
      }
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const defaultExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString();
    const payload = {
      updated_at: nowIso
    };
    if (typeof expiresAt === "string" && !Number.isNaN(Date.parse(expiresAt))) {
      payload.expires_at = expiresAt;
    }
    if (typeof effectiveBlocked === "boolean") {
      payload.is_blocked = effectiveBlocked;
    }
    if (normalizedStatus) {
      payload.status = normalizedStatus;
      payload.suspended_at = normalizedStatus === "active" ? null : nowIso;
      payload.suspended_reason = normalizedStatus === "active" ? "" : String(suspendedReason || "").trim();
      if (normalizedStatus === "active") {
        unmigratedStatusOverlay.delete(targetUserId);
      } else {
        unmigratedStatusOverlay.set(targetUserId, {
          status: normalizedStatus,
          suspendedReason: String(suspendedReason || "").trim(),
          suspendedAt: nowIso
        });
      }
    }
    if (typeof planName === "string" && planName.trim()) {
      payload.plan_name = planName.trim();
    }
    if (typeof maxBranches === "number" && Number.isFinite(maxBranches) && maxBranches >= 1) {
      payload.max_branches = Math.floor(maxBranches);
    }
    if (typeof maxEmployees === "number" && Number.isFinite(maxEmployees) && maxEmployees >= 1) {
      payload.max_employees = Math.floor(maxEmployees);
    }
    if (Array.isArray(paymentHistory)) {
      payload.payment_history = paymentHistory;
    }
    const writeSubscriptionCompat = async (fields) => {
      const optionalCols = [
        "status",
        "suspended_at",
        "suspended_reason",
        "max_branches",
        "max_employees",
        "payment_history"
      ];
      let candidate = { ...fields };
      for (let attempt = 0; attempt <= optionalCols.length; attempt++) {
        const op = existingRow ? await client.from("subscriptions").update(candidate).eq("user_id", targetUserId) : await client.from("subscriptions").upsert(
          {
            user_id: targetUserId,
            email: targetEmail || "owner@store.local",
            shop_name: targetShopName,
            plan_name: String(candidate.plan_name || "30-Day Free Trial"),
            expires_at: String(candidate.expires_at || defaultExpiry),
            is_blocked: Boolean(candidate.is_blocked ?? false),
            created_at: nowIso,
            ...candidate
          },
          { onConflict: "user_id" }
        );
        if (!op.error) return { error: null };
        if (!isMissingColumnError(op.error)) return { error: op.error };
        const msg = op.error.message || "";
        const matchedCol = optionalCols.find(
          (col) => col in candidate && new RegExp(`\\b${col}\\b`, "i").test(msg)
        );
        if (matchedCol) {
          const nextCandidate = { ...candidate };
          delete nextCandidate[matchedCol];
          candidate = nextCandidate;
        } else {
          const coreOnly = {
            updated_at: nowIso
          };
          if ("expires_at" in candidate) coreOnly.expires_at = candidate.expires_at;
          if ("is_blocked" in candidate) coreOnly.is_blocked = candidate.is_blocked;
          if ("plan_name" in candidate) coreOnly.plan_name = candidate.plan_name;
          candidate = coreOnly;
        }
      }
      return { error: null };
    };
    const writeRes = await writeSubscriptionCompat(payload);
    if (writeRes.error) {
      return res.status(500).json({ error: writeRes.error.message });
    }
    const nextStatusLabel = normalizedStatus ?? (effectiveBlocked === true ? "blocked" : effectiveBlocked === false ? "active" : previousStatus);
    const derivedAction = actionLabel || (normalizedStatus === "suspended" ? "shop_suspended" : normalizedStatus === "blocked" ? "shop_blocked" : normalizedStatus === "active" && previousStatus !== "active" ? "shop_activated" : "subscription_updated");
    const auditEntry = await recordSaasAuditLog(client, {
      actor_user_id: user.id,
      actor_email: user.email,
      target_user_id: targetUserId,
      target_email: targetEmail,
      target_shop_name: targetShopName || targetEmail,
      action: derivedAction,
      previous_status: previousStatus,
      new_status: nextStatusLabel,
      details: [
        planName ? `Plan: ${planName}` : null,
        expiresAt ? `Expires: ${expiresAt.slice(0, 10)}` : null,
        suspendedReason ? `Reason: ${suspendedReason}` : null
      ].filter(Boolean).join(" \u2022 ") || `Updated status to ${nextStatusLabel}`
    });
    return res.json({ ok: true, auditLog: auditEntry });
  });
  app.get("/api/staff/bootstrap-status", async (req, res) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }
    const userClient = createUserScopedSupabase(user.jwt);
    if (!userClient && !adminSupabase) {
      return res.status(503).json({ ok: false, error: "Supabase client unavailable." });
    }
    const userLookup = userClient ? await selectEmployeesWithSchemaFallback(userClient, user.id) : null;
    let effectiveRows = userLookup?.rows ?? [];
    let supportsPinHashColumn = userLookup?.supportsPinHashColumn ?? false;
    let source = "user_rls";
    const rlsReadable = Boolean(userLookup && !userLookup.error);
    const rlsError = userLookup?.error?.message ?? null;
    if ((!userLookup || userLookup.error) && adminSupabase) {
      const adminLookup = await selectEmployeesWithSchemaFallback(adminSupabase, user.id);
      if (adminLookup.error) {
        return res.status(500).json({ ok: false, error: adminLookup.error.message });
      }
      effectiveRows = adminLookup.rows;
      supportsPinHashColumn = adminLookup.supportsPinHashColumn;
      source = "service_role_scoped";
    } else if (userLookup?.error) {
      return res.status(500).json({ ok: false, error: userLookup.error.message });
    }
    const employees = effectiveRows.map((row) => {
      const pinState = classifyPinState(row);
      const isDemoFixturePin = pinState === "demo_fixture";
      return {
        id: String(row.id),
        name: String(row.name || ""),
        phone: String(row.phone || ""),
        role: normalizeEmployeeRole(row.role),
        hasPin: !isDemoFixturePin && rowHasConfiguredPin(row),
        isDemoFixturePin,
        pinState,
        isActive: row.is_active !== false,
        createdAt: String(row.created_at || "")
      };
    });
    const adminConfigured = employees.some(
      (emp) => emp.role === "admin" && emp.isActive && emp.hasPin && !emp.isDemoFixturePin
    );
    return res.json({
      ok: true,
      userId: user.id,
      source,
      rlsReadable,
      rlsError,
      supportsPinHashColumn,
      employeeCount: employees.length,
      hasConfiguredAdmin: adminConfigured,
      needsInitialAdminSetup: !adminConfigured,
      employees
    });
  });
  app.post("/api/staff/bootstrap-admin", async (req, res) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }
    const body = req.body;
    const cleanName = String(body.name || "").trim();
    const cleanPhone = String(body.phone || "").trim();
    const cleanPin = String(body.pin || "").trim();
    if (!cleanName || cleanName.length > 80) {
      return res.status(400).json({ ok: false, error: "Valid Admin name (1-80 characters) is required." });
    }
    if (!isValidPinFormat(cleanPin)) {
      return res.status(400).json({ ok: false, error: "PIN must be exactly 4 numeric digits." });
    }
    if (isStoredPinHash(cleanPin)) {
      return res.status(400).json({ ok: false, error: "Send raw 4-digit PIN only over TLS; never pass precomputed hash." });
    }
    const userClient = createUserScopedSupabase(user.jwt);
    const dbClient = adminSupabase ?? userClient;
    if (!userClient || !dbClient) {
      return res.status(503).json({ ok: false, error: "Supabase client unavailable." });
    }
    const existingLookup = await selectEmployeesWithSchemaFallback(dbClient, user.id);
    if (existingLookup.error) {
      return res.status(500).json({ ok: false, error: existingLookup.error.message });
    }
    const existingRows = existingLookup.rows;
    const alreadyConfigured = existingRows.some(
      (r) => normalizeEmployeeRole(r.role) === "admin" && r.is_active !== false && rowHasConfiguredPin(r)
    );
    if (alreadyConfigured) {
      return res.status(409).json({
        ok: false,
        error: "An active Store Admin PIN is already configured. Sign in with your Admin PIN to manage staff."
      });
    }
    const unconfiguredAdmin = existingRows.find(
      (r) => normalizeEmployeeRole(r.role) === "admin" && r.is_active !== false && !rowHasConfiguredPin(r)
    );
    const targetEmployeeId = typeof unconfiguredAdmin?.id === "string" && unconfiguredAdmin.id ? unconfiguredAdmin.id : `${user.id.slice(0, 8)}-emp-admin`;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const createdAt = typeof unconfiguredAdmin?.created_at === "string" && unconfiguredAdmin.created_at ? unconfiguredAdmin.created_at : nowIso;
    const { error: setRpcErr } = await userClient.rpc("set_staff_pin", {
      p_employee_id: targetEmployeeId,
      p_name: cleanName,
      p_role: "admin",
      p_phone: cleanPhone,
      p_pin: cleanPin,
      p_is_active: true
    });
    if (!setRpcErr) {
      const { data: verifyData, error: verifyRpcErr } = await userClient.rpc("verify_staff_pin", {
        p_pin: cleanPin,
        p_employee_id: targetEmployeeId
      });
      const verified = verifyData || {};
      const signedToken = signStaffToken({
        uid: user.id,
        empId: targetEmployeeId,
        role: "admin",
        exp: Date.now() + 12 * 60 * 60 * 1e3
      });
      if (!verifyRpcErr && verified.ok && verified.token && verified.expiresAt) {
        return res.json({
          ok: true,
          employee: {
            id: targetEmployeeId,
            name: cleanName,
            phone: cleanPhone,
            role: "admin",
            hasPin: true,
            isActive: true,
            createdAt
          },
          session: {
            token: verified.token,
            employeeId: targetEmployeeId,
            role: "admin",
            expiresAt: verified.expiresAt,
            signedToken
          }
        });
      }
    }
    const canFallback = !setRpcErr || isRpcMissingError(setRpcErr.message) || setRpcErr.code === "42501" && Boolean(adminSupabase);
    if (!canFallback) {
      const status = setRpcErr?.code === "42501" ? 403 : 400;
      return res.status(status).json({ ok: false, error: setRpcErr?.message || "Unable to create initial Admin." });
    }
    const pbkdf2Hash = await hashPinAsync(cleanPin);
    let upsertErr = null;
    if (existingLookup.supportsPinHashColumn) {
      const resUp = await dbClient.from("employees").upsert(
        {
          id: targetEmployeeId,
          user_id: user.id,
          name: cleanName,
          phone: cleanPhone,
          role: "admin",
          pin_code: REDACTED_PIN_SENTINEL,
          pin_hash: pbkdf2Hash,
          pin_updated_at: nowIso,
          is_active: true,
          created_at: createdAt
        },
        { onConflict: "id" }
      );
      upsertErr = resUp.error;
    }
    if (!existingLookup.supportsPinHashColumn || isMissingColumnError(upsertErr)) {
      const legacyUp = await dbClient.from("employees").upsert(
        {
          id: targetEmployeeId,
          user_id: user.id,
          name: cleanName,
          phone: cleanPhone,
          role: "admin",
          pin_code: pbkdf2Hash,
          is_active: true,
          created_at: createdAt
        },
        { onConflict: "id" }
      );
      upsertErr = legacyUp.error;
    }
    if (upsertErr) {
      return res.status(upsertErr.code === "42501" ? 403 : 400).json({
        ok: false,
        error: upsertErr.message
      });
    }
    const issued = await issueFallbackStaffToken(user.id, targetEmployeeId, "admin");
    return res.json({
      ok: true,
      employee: {
        id: targetEmployeeId,
        name: cleanName,
        phone: cleanPhone,
        role: "admin",
        hasPin: true,
        isActive: true,
        createdAt
      },
      session: {
        token: issued.token,
        employeeId: targetEmployeeId,
        role: "admin",
        expiresAt: issued.expiresAt,
        signedToken: issued.signedToken
      }
    });
  });
  app.post("/api/staff/verify-pin", async (req, res) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }
    const opAccess = await checkTenantOperationalAccess(user);
    if (!opAccess.allowed) {
      return res.status(403).json({
        ok: false,
        error: opAccess.status === "suspended" ? "This store subscription is currently suspended. POS access is paused while all shop records remain preserved." : "This store account is blocked. Contact platform support while your shop records remain preserved."
      });
    }
    const { pin, employeeId } = req.body;
    const cleanPin = String(pin || "").trim();
    if (!isValidPinFormat(cleanPin)) {
      return res.status(400).json({ ok: false, error: "PIN must be exactly 4 numeric digits." });
    }
    const userClient = createUserScopedSupabase(user.jwt);
    if (!userClient) {
      return res.status(503).json({ ok: false, error: "Supabase client unavailable." });
    }
    const { data, error } = await userClient.rpc("verify_staff_pin", {
      p_pin: cleanPin,
      p_employee_id: employeeId || null
    });
    const result = data || {};
    if (!error && result.ok && result.token && result.employeeId && result.role) {
      return res.json({
        ok: true,
        token: result.token,
        employeeId: result.employeeId,
        name: result.name,
        role: result.role,
        expiresAt: result.expiresAt,
        signedToken: signStaffToken({
          uid: user.id,
          empId: result.employeeId,
          role: result.role,
          exp: Date.now() + 12 * 60 * 60 * 1e3
        })
      });
    }
    const dbClient = adminSupabase ?? userClient;
    const empLookup = await selectEmployeesWithSchemaFallback(dbClient, user.id, {
      employeeId: employeeId || void 0,
      activeOnly: true
    });
    for (const row of empLookup.rows) {
      const storedHash = typeof row.pin_hash === "string" ? row.pin_hash.trim() : "";
      const storedPinCode = typeof row.pin_code === "string" ? row.pin_code.trim() : "";
      const hashCandidate = storedHash.startsWith("pbkdf2_sha256$") ? storedHash : storedPinCode.startsWith("pbkdf2_sha256$") ? storedPinCode : "";
      const hashMatches = hashCandidate ? await verifyPinHashAsync(cleanPin, hashCandidate) : isValidPinFormat(storedPinCode) && timingSafePinEquals(cleanPin, storedPinCode);
      if (hashMatches) {
        const empId = String(row.id);
        const empRole = row.role;
        const empName = String(row.name || "");
        const issued = await issueFallbackStaffToken(user.id, empId, empRole);
        return res.json({
          ok: true,
          token: issued.token,
          employeeId: empId,
          name: empName,
          role: empRole,
          expiresAt: issued.expiresAt,
          signedToken: issued.signedToken
        });
      }
    }
    if (error && !isRpcMissingError(error.message)) {
      return res.status(400).json({ ok: false, error: error.message });
    }
    return res.status(401).json({
      ok: false,
      error: result.error || "Invalid or inactive staff PIN."
    });
  });
  app.post("/api/staff/save-employee", async (req, res) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const opAccess = await checkTenantOperationalAccess(user);
    if (!opAccess.allowed) {
      return res.status(403).json({
        error: opAccess.status === "suspended" ? "Store access is suspended. Staff changes are disabled while records remain preserved." : "Store account is blocked."
      });
    }
    const staffToken = (req.header("x-staff-session") || "").trim();
    const userClient = createUserScopedSupabase(user.jwt, staffToken || null);
    if (!userClient) {
      return res.status(503).json({ error: "Supabase client unavailable." });
    }
    const body = req.body;
    if (!body.id || !body.name || !body.role) {
      return res.status(400).json({ error: "Employee id, name, and role are required." });
    }
    if (!["admin", "manager", "cashier"].includes(body.role)) {
      return res.status(400).json({ error: "Invalid employee role." });
    }
    if (body.pin && body.pin !== REDACTED_PIN_SENTINEL && !isValidPinFormat(body.pin)) {
      return res.status(400).json({ error: "PIN must be exactly 4 numeric digits." });
    }
    if (body.pin && isStoredPinHash(body.pin)) {
      return res.status(400).json({ error: "Send raw 4-digit PIN only over TLS; never pass precomputed hash." });
    }
    const { data, error } = await userClient.rpc("set_staff_pin", {
      p_employee_id: body.id,
      p_name: body.name,
      p_role: body.role,
      p_phone: body.phone || "",
      p_pin: body.pin && body.pin !== REDACTED_PIN_SENTINEL ? body.pin : null,
      p_is_active: typeof body.isActive === "boolean" ? body.isActive : true
    });
    if (!error) {
      return res.json(data || { ok: true });
    }
    if (!isRpcMissingError(error.message)) {
      const status = error.code === "42501" ? 403 : error.code === "23505" ? 409 : 400;
      return res.status(status).json({ error: error.message });
    }
    const staff = await resolveVerifiedStaffRole(req, user);
    if (staff.role !== "admin") {
      return res.status(403).json({ error: "Only an authenticated Admin can manage staff accounts." });
    }
    const dbClient = adminSupabase ?? userClient;
    const empLookup = await selectEmployeesWithSchemaFallback(dbClient, user.id);
    if (empLookup.error) {
      return res.status(500).json({ error: empLookup.error.message });
    }
    const existingList = empLookup.rows;
    const existingRow = existingList.find((r) => String(r.id) === body.id);
    const cleanPin = body.pin && body.pin !== REDACTED_PIN_SENTINEL ? body.pin.trim() : "";
    if (!existingRow && !cleanPin) {
      return res.status(400).json({ error: "A 4-digit PIN is required when adding a new employee." });
    }
    if (cleanPin) {
      for (const other of existingList) {
        if (String(other.id) !== body.id) {
          const otherHash = typeof other.pin_hash === "string" && other.pin_hash.startsWith("pbkdf2_sha256$") ? other.pin_hash : typeof other.pin_code === "string" && other.pin_code.startsWith("pbkdf2_sha256$") ? other.pin_code : "";
          if (otherHash && await verifyPinHashAsync(cleanPin, otherHash)) {
            return res.status(409).json({ error: "This 4-digit PIN is already assigned to another staff member." });
          }
          if (!otherHash && typeof other.pin_code === "string" && isValidPinFormat(other.pin_code) && timingSafePinEquals(cleanPin, other.pin_code.trim())) {
            return res.status(409).json({ error: "This 4-digit PIN is already assigned to another staff member." });
          }
        }
      }
    }
    const existingHash = typeof existingRow?.pin_hash === "string" && existingRow.pin_hash ? existingRow.pin_hash : typeof existingRow?.pin_code === "string" ? existingRow.pin_code : void 0;
    const nextHash = cleanPin ? await hashPinAsync(cleanPin) : existingHash;
    let upsertErr = null;
    if (empLookup.supportsPinHashColumn) {
      const payload = {
        id: body.id,
        user_id: user.id,
        name: body.name.trim(),
        phone: (body.phone || "").trim(),
        role: body.role,
        pin_code: REDACTED_PIN_SENTINEL,
        is_active: typeof body.isActive === "boolean" ? body.isActive : true
      };
      if (nextHash) {
        payload.pin_hash = nextHash;
        payload.pin_updated_at = (/* @__PURE__ */ new Date()).toISOString();
      }
      const resUp = await dbClient.from("employees").upsert(payload, { onConflict: "id" });
      upsertErr = resUp.error;
    }
    if (!empLookup.supportsPinHashColumn || isMissingColumnError(upsertErr)) {
      const legacyPayload = {
        id: body.id,
        user_id: user.id,
        name: body.name.trim(),
        phone: (body.phone || "").trim(),
        role: body.role,
        pin_code: nextHash || REDACTED_PIN_SENTINEL,
        is_active: typeof body.isActive === "boolean" ? body.isActive : true
      };
      const legacyUp = await dbClient.from("employees").upsert(legacyPayload, { onConflict: "id" });
      upsertErr = legacyUp.error;
    }
    if (upsertErr) {
      return res.status(upsertErr.code === "42501" ? 403 : 400).json({ error: upsertErr.message });
    }
    return res.json({ ok: true, id: body.id, role: body.role, hasPin: Boolean(nextHash) });
  });
  app.delete("/api/staff/:id", async (req, res) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const opAccess = await checkTenantOperationalAccess(user);
    if (!opAccess.allowed) {
      return res.status(403).json({
        error: opAccess.status === "suspended" ? "Store access is suspended. Staff changes are disabled while records remain preserved." : "Store account is blocked."
      });
    }
    const staffToken = (req.header("x-staff-session") || "").trim();
    const userClient = createUserScopedSupabase(user.jwt, staffToken || null);
    if (!userClient) {
      return res.status(503).json({ error: "Supabase client unavailable." });
    }
    const targetId = String(req.params.id || "").trim();
    const { data, error } = await userClient.rpc("delete_staff_member", {
      p_employee_id: targetId
    });
    if (!error) {
      return res.json(data || { ok: true });
    }
    if (!isRpcMissingError(error.message)) {
      const status = error.code === "42501" ? 403 : 400;
      return res.status(status).json({ error: error.message });
    }
    const staff = await resolveVerifiedStaffRole(req, user);
    if (staff.role !== "admin") {
      return res.status(403).json({ error: "Only an authenticated Admin can remove staff accounts." });
    }
    const dbClient = adminSupabase ?? userClient;
    const { error: delErr } = await dbClient.from("employees").delete().eq("id", targetId).eq("user_id", user.id);
    if (delErr) {
      return res.status(400).json({ error: delErr.message });
    }
    return res.json({ ok: true });
  });
  app.post("/api/rbac/authorize", async (req, res) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ allowed: false, error: "Authentication required." });
    }
    const opAccess = await checkTenantOperationalAccess(user);
    if (!opAccess.allowed) {
      return res.status(403).json({
        allowed: false,
        error: opAccess.status === "suspended" ? "Store access is currently suspended. POS billing is disabled while all shop records remain preserved." : "Store account is blocked."
      });
    }
    const { action, customPermissions } = req.body;
    if (!action) {
      return res.status(400).json({ allowed: false, error: "Action parameter is required." });
    }
    const staff = await resolveVerifiedStaffRole(req, user);
    if (!staff.role) {
      return res.status(401).json({
        allowed: false,
        error: "Verified staff PIN session is required."
      });
    }
    if (!hasRolePermission(staff.role, action, customPermissions)) {
      return res.status(403).json({
        allowed: false,
        role: staff.role,
        error: `Role '${staff.role}' is not authorized to perform '${action}'.`
      });
    }
    return res.json({ allowed: true, role: staff.role, employeeId: staff.employeeId });
  });
  app.post("/api/whatsapp/send", async (req, res) => {
    const user = await authenticateSupabaseRequest(req);
    if (!user) {
      return res.status(401).json({ delivered: false, configured: false, error: "Authentication required." });
    }
    const opAccess = await checkTenantOperationalAccess(user);
    if (!opAccess.allowed) {
      return res.status(403).json({
        delivered: false,
        configured: false,
        error: "Store access is suspended or blocked."
      });
    }
    const staff = await resolveVerifiedStaffRole(req, user);
    if (!staff.role) {
      return res.status(401).json({
        delivered: false,
        configured: false,
        error: "Verified staff PIN session is required."
      });
    }
    if (!hasRolePermission(staff.role, "whatsapp.send")) {
      return res.status(403).json({
        delivered: false,
        configured: false,
        error: "Not authorized to dispatch WhatsApp messages."
      });
    }
    const { phone, to, text, message } = req.body;
    const digits = String(phone || to || "").replace(/[^\d]/g, "");
    const normalizedPhone = digits.startsWith("0") && digits.length >= 10 ? `92${digits.slice(1)}` : digits;
    const messageBody = String(text || message || "").trim();
    if (normalizedPhone.length < 10 || !messageBody) {
      return res.status(400).json({
        delivered: false,
        configured: Boolean(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID),
        error: "Valid recipient phone number and non-empty message text are required."
      });
    }
    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      return res.status(200).json({
        delivered: false,
        configured: false,
        error: "WhatsApp Cloud API credentials are not configured on the server. Use manual WhatsApp share fallback."
      });
    }
    try {
      const endpoint = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: normalizedPhone,
          type: "text",
          text: {
            preview_url: false,
            body: messageBody.slice(0, 4096)
          }
        })
      });
      const payload = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        return res.status(502).json({
          delivered: false,
          configured: true,
          error: payload.error?.message || `WhatsApp Graph API returned HTTP ${upstream.status}.`
        });
      }
      return res.json({
        delivered: true,
        configured: true,
        providerMessageId: payload.messages?.[0]?.id
      });
    } catch (err) {
      return res.status(502).json({
        delivered: false,
        configured: true,
        error: err instanceof Error ? err.message : "Network error calling WhatsApp Cloud API."
      });
    }
  });
  app.get("/api/ai/status", async (req, res) => {
    const user = await authenticateReq(req);
    if (!user) {
      return res.status(401).json({ available: false, error: "Authentication required." });
    }
    const opAccess = await checkOpAccess(user);
    if (!opAccess.allowed) {
      return res.status(403).json({
        available: false,
        error: opAccess.status === "suspended" ? "Store access is suspended. AI Assistant is unavailable while records remain preserved." : "Store account is blocked."
      });
    }
    const staff = await resolveStaff(req, user);
    if (!staff.role) {
      return res.status(401).json({
        available: false,
        error: "Verified staff PIN session is required."
      });
    }
    if (!hasRolePermission(staff.role, "ai.assist")) {
      return res.status(403).json({
        available: false,
        error: `Role '${staff.role}' is not authorized to access AI Assistant.`
      });
    }
    const aiConfig = resolveAiAssistantConfig(options?.aiEnv);
    return res.json(buildAiAssistantStatusPayload(user.id, aiConfig, aiUsageTracker));
  });
  app.post("/api/ai/assist", async (req, res) => {
    const user = await authenticateReq(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }
    const opAccess = await checkOpAccess(user);
    if (!opAccess.allowed) {
      return res.status(403).json({
        ok: false,
        error: opAccess.status === "suspended" ? "Store access is suspended. AI Assistant is unavailable while records remain preserved." : "Store account is blocked."
      });
    }
    const staff = await resolveStaff(req, user);
    if (!staff.role) {
      return res.status(401).json({
        ok: false,
        error: "Verified staff PIN session is required."
      });
    }
    const aiConfig = resolveAiAssistantConfig(options?.aiEnv);
    const validated = validateAiAssistRequestBody(req.body, aiConfig.maxImageBytes);
    if (!validated.ok) {
      return res.status(validated.status).json({
        ok: false,
        error: validated.error
      });
    }
    if (!hasRolePermission(staff.role, "ai.assist", validated.value.customPermissions)) {
      return res.status(403).json({
        ok: false,
        role: staff.role,
        error: `Role '${staff.role}' is not authorized to use AI Assistant.`
      });
    }
    if (!aiConfig.enabled) {
      return res.status(503).json({
        ok: false,
        configured: aiConfig.configured,
        enabled: false,
        code: "AI_DISABLED",
        error: "AI Assistant is currently disabled on the server."
      });
    }
    if (!aiConfig.configured) {
      return res.status(503).json({
        ok: false,
        configured: false,
        enabled: true,
        code: "AI_NOT_CONFIGURED",
        error: "AI Assistant is not configured on the server yet (OPENROUTER_API_KEY missing). All POS features remain fully operational."
      });
    }
    const quota = aiUsageTracker.tryConsume(user.id, aiConfig);
    if (!quota.allowed) {
      res.setHeader("Retry-After", String(quota.retryAfterSeconds));
      return res.status(429).json({
        ok: false,
        configured: true,
        enabled: true,
        code: quota.code,
        error: quota.error,
        usage: {
          dailyLimit: aiConfig.dailyLimitPerTenant,
          usedToday: quota.usedToday,
          remainingToday: quota.remainingToday
        }
      });
    }
    const usageSnapshot = {
      dailyLimit: aiConfig.dailyLimitPerTenant,
      usedToday: quota.usedToday,
      remainingToday: quota.remainingToday
    };
    const wantsStream = validated.value.stream || (req.header("accept") || "").toLowerCase().includes("text/event-stream");
    const cached = aiHowToCache.get({
      model: aiConfig.model,
      staffRole: staff.role,
      input: validated.value
    });
    if (cached) {
      if (wantsStream) {
        res.status(200);
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.write(
          `event: chunk
data: ${JSON.stringify({ delta: cached.reply, model: cached.model })}

`
        );
        res.write(
          `event: done
data: ${JSON.stringify({
            ok: true,
            reply: cached.reply,
            model: cached.model,
            cached: true,
            usage: usageSnapshot
          })}

`
        );
        return res.end();
      }
      return res.json({
        ok: true,
        reply: cached.reply,
        model: cached.model,
        cached: true,
        usage: usageSnapshot
      });
    }
    const abortController = new AbortController();
    const onResponseClose = () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    };
    res.on("close", onResponseClose);
    let streamHeadersSent = false;
    let chunksSent = 0;
    const ensureStreamHeaders = () => {
      if (!streamHeadersSent) {
        streamHeadersSent = true;
        res.status(200);
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
      }
    };
    try {
      const result = await generatePosAssistantReply({
        input: validated.value,
        staffRole: staff.role,
        config: aiConfig,
        generator: options?.aiGenerator,
        signal: abortController.signal,
        onChunk: wantsStream ? (delta, resolvedModel) => {
          if (res.writableEnded || abortController.signal.aborted) return;
          ensureStreamHeaders();
          chunksSent += 1;
          res.write(
            `event: chunk
data: ${JSON.stringify({
              delta,
              model: resolvedModel || aiConfig.model
            })}

`
          );
        } : void 0
      });
      aiHowToCache.set({
        model: aiConfig.model,
        staffRole: staff.role,
        input: validated.value,
        reply: result.reply,
        resolvedModel: result.model
      });
      if (wantsStream) {
        ensureStreamHeaders();
        res.write(
          `event: done
data: ${JSON.stringify({
            ok: true,
            reply: result.reply,
            model: result.model,
            cached: false,
            usage: usageSnapshot
          })}

`
        );
        return res.end();
      }
      return res.json({
        ok: true,
        reply: result.reply,
        model: result.model,
        cached: false,
        usage: usageSnapshot
      });
    } catch (err) {
      if (chunksSent === 0) {
        aiUsageTracker.refund(user.id);
      }
      const mapped = mapAiProviderError(err, Boolean(validated.value.attachment));
      const updatedUsage = aiUsageTracker.getSnapshot(user.id, aiConfig);
      if (abortController.signal.aborted && res.writableEnded) {
        return;
      }
      if (streamHeadersSent) {
        if (!res.writableEnded) {
          res.write(
            `event: error
data: ${JSON.stringify({
              ok: false,
              code: mapped.code,
              error: mapped.error,
              usage: updatedUsage
            })}

`
          );
          res.end();
        }
        return;
      }
      return res.status(mapped.status).json({
        ok: false,
        configured: true,
        enabled: true,
        code: mapped.code,
        error: mapped.error,
        usage: updatedUsage
      });
    } finally {
      res.off("close", onResponseClose);
    }
  });
  registerOmnichannelRoutes(app, {
    adminSupabase,
    memoryStore: options?.omnichannelStoreOverride,
    authenticateReq,
    checkOpAccess,
    resolveStaff,
    whatsappEnv: options?.whatsappEnvOverride,
    whatsappSendOverride: options?.whatsappSendOverride,
    onlineGatewayConfigured: options?.onlineGatewayConfigured
  });
  return app;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_INITIAL_FOUNDER_EMAIL,
  compareFounderEmails,
  createPosExpressApp,
  maskEmailForDiagnostics,
  normalizeEmailForComparison,
  resolveFounderEmailConfig,
  verifyIsExplicitSuperAdminWithDiagnostics
});
module.exports = module.exports.createPosExpressApp();
