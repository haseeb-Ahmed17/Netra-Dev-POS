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
var import_node_crypto = __toESM(require("node:crypto"), 1);
var import_express = __toESM(require("express"), 1);
var import_supabase_js = require("@supabase/supabase-js");

// src/lib/rbac.ts
var ACTION_REQUIRED_ROLES = {
  "dashboard.view": ["admin", "manager"],
  "reports.view": ["admin", "manager"],
  "pos.checkout": ["admin", "manager", "cashier"],
  "orders.read": ["admin", "manager", "cashier"],
  "orders.return": ["admin", "manager", "cashier"],
  "orders.cancel": ["admin", "manager"],
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
    title: "Online Sync & Order Status",
    navLabel: "Top Bar Sync / Audit Logs",
    minRoles: ["admin", "manager", "cashier"],
    capabilities: [
      "Cloud sync saves orders, inventory, customers, and Udhaar entries to Supabase when online.",
      "Offline sales queue safely in browser IndexedDB/localStorage and auto-sync when connectivity returns."
    ],
    limitations: [
      "SmartBitz POS does NOT currently include a public customer-facing e-commerce storefront or external web checkout for online shopper orders. Orders are created at the POS terminal and synced to cloud."
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
  return import_node_crypto.default.timingSafeEqual(bufA, bufB);
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
var SESSION_SIGNING_KEY = process.env.STAFF_SESSION_SECRET || SUPABASE_SERVICE_ROLE_KEY || import_node_crypto.default.randomBytes(32).toString("hex");
var hasPublicSupabase = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("YOUR_PROJECT_REF") && SUPABASE_ANON_KEY.length > 20 && !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY");
var hasServiceRole = hasPublicSupabase && SUPABASE_SERVICE_ROLE_KEY.length > 20 && !SUPABASE_SERVICE_ROLE_KEY.includes("YOUR_");
var adminSupabase = hasServiceRole ? (0, import_supabase_js.createClient)(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
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
  return (0, import_supabase_js.createClient)(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
    id: `saas-audit-${import_node_crypto.default.randomUUID()}`,
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
  const sig = import_node_crypto.default.createHmac("sha256", SESSION_SIGNING_KEY).update(body).digest("base64url");
  return `sbz_${body}.${sig}`;
}
function verifySignedStaffToken(token, expectedUserId) {
  if (!token.startsWith("sbz_")) return null;
  const rest = token.slice(4);
  const dotIdx = rest.indexOf(".");
  if (dotIdx <= 0) return null;
  const body = rest.slice(0, dotIdx);
  const sig = rest.slice(dotIdx + 1);
  const expectedSig = import_node_crypto.default.createHmac("sha256", SESSION_SIGNING_KEY).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !import_node_crypto.default.timingSafeEqual(a, b)) {
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
      const dbToken = import_node_crypto.default.randomBytes(24).toString("hex");
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
