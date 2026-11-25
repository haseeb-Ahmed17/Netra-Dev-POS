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
  "workspace.reset": ["admin"]
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
var DEFAULT_INITIAL_FOUNDER_EMAIL = "bc260436573mha@vu.edu.pk";
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
function createPosExpressApp() {
  const app = (0, import_express.default)();
  app.use(import_express.default.json({ limit: "1mb" }));
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      supabaseConfigured: hasPublicSupabase,
      adminServiceConfigured: hasServiceRole,
      whatsappConfigured: Boolean(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID)
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
