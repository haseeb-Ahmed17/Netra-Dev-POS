const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

export function generateUuid(): string {
  const cryptoObj =
    typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID().toLowerCase();
  }

  const bytes = new Uint8Array(16);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return formatBytesAsUuid(bytes);
}

function fnv1a32(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function formatBytesAsUuid(bytes: Uint8Array): string {
  const hex: string[] = [];
  for (let i = 0; i < 16; i += 1) {
    hex.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return (
    `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-` +
    `${hex[4]}${hex[5]}-` +
    `${hex[6]}${hex[7]}-` +
    `${hex[8]}${hex[9]}-` +
    `${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`
  );
}

/**
 * Generates a deterministic RFC-4122 UUID scoped to (userId, logicalKey).
 * Ensures demo reset IDs are valid PostgreSQL `uuid` values AND distinct across
 * different shopkeeper accounts so primary keys never collide.
 */
export function deterministicDemoUuid(
  userId: string,
  logicalKey: string
): string {
  const input = `${userId}:${logicalKey}`;
  const h1 = fnv1a32(`s1:${input}`, 0x811c9dc5);
  const h2 = fnv1a32(`s2:${input}`, 0x9e3779b1);
  const h3 = fnv1a32(`s3:${input}`, 0x85ebca6b);
  const h4 = fnv1a32(`s4:${input}`, 0xc2b2ae35);

  const bytes = new Uint8Array(16);
  const words = [h1, h2, h3, h4];
  for (let w = 0; w < 4; w += 1) {
    const word = words[w];
    bytes[w * 4] = (word >>> 24) & 0xff;
    bytes[w * 4 + 1] = (word >>> 16) & 0xff;
    bytes[w * 4 + 2] = (word >>> 8) & 0xff;
    bytes[w * 4 + 3] = word & 0xff;
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40; // RFC-4122 version 4 nibble
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC-4122 variant nibble

  return formatBytesAsUuid(bytes);
}
