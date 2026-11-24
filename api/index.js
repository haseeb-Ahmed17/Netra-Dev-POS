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
  createPosExpressApp: () => createPosExpressApp
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

// serverApp.ts
function isRpcMissingError(message) {
  return /PGRST202|Could not find the function/i.test(message || "");
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
function rowHasConfiguredPin(row) {
  const pinHash = typeof row.pin_hash === "string" ? row.pin_hash.trim() : "";
  const pinCode = typeof row.pin_code === "string" ? row.pin_code.trim() : "";
  return isStoredPinHash(pinHash) || pinCode !== "" && pinCode !== REDACTED_PIN_SENTINEL;
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
  return {
    id: data.user.id,
    email: (data.user.email || "").toLowerCase(),
    jwt
  };
}
async function verifyIsExplicitSuperAdmin(user) {
  if (adminSupabase) {
    const { data: data2, error: error2 } = await adminSupabase.from("super_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (error2) return false;
    return Boolean(data2?.user_id);
  }
  const userClient = createUserScopedSupabase(user.jwt);
  if (!userClient) return false;
  const { data, error } = await userClient.from("super_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (error) return false;
  return Boolean(data?.user_id);
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
    const isSuperAdmin = await verifyIsExplicitSuperAdmin(user);
    return res.json({ isSuperAdmin, userId: user.id });
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
    const { data, error } = await client.from("subscriptions").select("*").order("created_at", { ascending: false });
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    return res.json({ subscriptions: data || [] });
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
    const { expiresAt, isBlocked, planName, maxBranches, maxEmployees, paymentHistory } = req.body;
    const payload = {
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (typeof expiresAt === "string" && !Number.isNaN(Date.parse(expiresAt))) {
      payload.expires_at = expiresAt;
    }
    if (typeof isBlocked === "boolean") {
      payload.is_blocked = isBlocked;
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
    const client = adminSupabase ?? createUserScopedSupabase(user.jwt);
    if (!client) {
      return res.status(503).json({ error: "Supabase client unavailable on server." });
    }
    const { error } = await client.from("subscriptions").update(payload).eq("user_id", targetUserId);
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    return res.json({ ok: true });
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
      (r) => r.role === "admin" && r.is_active !== false && rowHasConfiguredPin(r)
    );
    if (alreadyConfigured) {
      return res.status(409).json({
        ok: false,
        error: "An active Store Admin PIN is already configured. Sign in with your Admin PIN to manage staff."
      });
    }
    const unconfiguredAdmin = existingRows.find(
      (r) => r.role === "admin" && r.is_active !== false && !rowHasConfiguredPin(r)
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
  createPosExpressApp
});
module.exports = module.exports.createPosExpressApp();
