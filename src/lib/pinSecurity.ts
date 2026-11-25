export const PBKDF2_PREFIX = 'pbkdf2_sha256';
export const PBKDF2_ITERATIONS = 100000;
export const REDACTED_PIN_SENTINEL = '****';

export const DEMO_PIN_HASHES: Record<'1234' | '2222' | '1111', string> = {
  '1234': 'pbkdf2_sha256$100000$a1b2c3d4e5f60718293a4b5c6d7e8f90$ca1be9e2534f95e439dd905233c2cadf4be34117c0c9a790965f412ceb14ce23',
  '2222': 'pbkdf2_sha256$100000$b2c3d4e5f60718293a4b5c6d7e8f90a1$91f287c6f9da3fcd127352dff45b87133486124cdce3d7ff83215cebca2ded82',
  '1111': 'pbkdf2_sha256$100000$c3d4e5f60718293a4b5c6d7e8f90a1b2$a6c27b54275428421e84b039bfcee7038d2e22e317ae3bc169ba3c199a9d31e3',
};

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin.trim());
}

export function isStoredPinHash(value?: string | null): boolean {
  if (!value) return false;
  return (
    value.startsWith(`${PBKDF2_PREFIX}$`) ||
    value.startsWith('$2a$') ||
    value.startsWith('$2b$') ||
    value.startsWith('$2y$')
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    return null;
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto SubtleCrypto is unavailable in this environment.');
  }
  return subtle;
}

async function derivePbkdf2Sha256Hex(
  pin: string,
  saltBytes: Uint8Array,
  iterations: number
): Promise<string> {
  const subtle = getSubtleCrypto();
  const encoder = new TextEncoder();
  const baseKey = await subtle.importKey(
    'raw',
    encoder.encode(pin.trim()),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const normalizedSalt = new Uint8Array(saltBytes.length);
  normalizedSalt.set(saltBytes);
  const derivedBits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: normalizedSalt,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    256
  );
  return bytesToHex(new Uint8Array(derivedBits));
}

export async function hashPinAsync(pin: string, saltHexOverride?: string): Promise<string> {
  const normalized = pin.trim();
  if (!isValidPinFormat(normalized)) {
    throw new Error('Staff PIN must be exactly 4 numeric digits.');
  }
  let saltBytes: Uint8Array<ArrayBuffer>;
  if (saltHexOverride) {
    const parsed = hexToBytes(saltHexOverride);
    if (!parsed) throw new Error('Invalid PIN salt.');
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

export async function verifyPinHashAsync(
  candidatePin: string,
  storedHash?: string | null
): Promise<boolean> {
  const normalized = candidatePin.trim();
  if (!isValidPinFormat(normalized) || !storedHash) {
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== PBKDF2_PREFIX) {
    return false;
  }
  const iterations = Number(parts[1]);
  const saltBytes = hexToBytes(parts[2]);
  const expectedHex = parts[3];
  if (!Number.isInteger(iterations) || iterations < 10000 || !saltBytes || !expectedHex) {
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

export function stripPlaintextPin<T extends object>(
  record: T
): Omit<T, 'pinCode' | 'pin_code'> {
  const copy = { ...record } as Record<string, unknown>;
  delete copy.pinCode;
  delete copy.pin_code;
  return copy as Omit<T, 'pinCode' | 'pin_code'>;
}

export type PinStateClassification =
  | 'hashed'
  | 'demo_fixture'
  | 'legacy_4digit'
  | 'unconfigured';

const DEMO_FIXTURE_HASH_SET = new Set<string>(Object.values(DEMO_PIN_HASHES));

export function isDemoFixturePinHash(value?: string | null): boolean {
  if (!value) return false;
  return DEMO_FIXTURE_HASH_SET.has(value.trim());
}

export function classifyEmployeePin(opts: {
  pinHash?: string | null;
  pinCode?: string | null;
}): PinStateClassification {
  const pinHash = typeof opts.pinHash === 'string' ? opts.pinHash.trim() : '';
  const pinCode = typeof opts.pinCode === 'string' ? opts.pinCode.trim() : '';
  if (isDemoFixturePinHash(pinHash) || isDemoFixturePinHash(pinCode)) {
    return 'demo_fixture';
  }
  if (isStoredPinHash(pinHash) || isStoredPinHash(pinCode)) {
    return 'hashed';
  }
  if (isValidPinFormat(pinCode)) {
    return 'legacy_4digit';
  }
  return 'unconfigured';
}

export function hasConfiguredAdmin(
  employees: ReadonlyArray<{
    role: string;
    isActive: boolean;
    hasPin?: boolean;
    pinHash?: string;
    isDemoFixturePin?: boolean;
    pinState?: PinStateClassification;
  }>,
  options?: { allowDemoFixturePins?: boolean }
): boolean {
  const allowDemo = options?.allowDemoFixturePins === true;
  return employees.some((emp) => {
    const normalizedRole = String(emp.role || '').trim().toLowerCase();
    if (normalizedRole !== 'admin' || emp.isActive === false) {
      return false;
    }
    const isDemoFixture =
      emp.isDemoFixturePin === true ||
      emp.pinState === 'demo_fixture' ||
      isDemoFixturePinHash(emp.pinHash);
    if (isDemoFixture && !allowDemo) {
      return false;
    }
    return emp.hasPin === true || isStoredPinHash(emp.pinHash);
  });
}

