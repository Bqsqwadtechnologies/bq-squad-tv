const PBKDF2_ITERATIONS = 210_000;
const HASH_VERSION = 2;

export type ParentalPinHash = {
  hash: string;
  salt?: string;
  version?: number;
};

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

async function derivePinHash(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return new Uint8Array(bits);
}

async function legacyPinHash(pin: string, uid: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("bq-sqwad-tv:parental-pin:" + uid + ":" + pin),
  );
  return new Uint8Array(digest);
}

export async function hashParentalPin(pin: string): Promise<ParentalPinHash & { salt: string; version: 2 }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePinHash(pin, salt);
  return { hash: toHex(hash), salt: toHex(salt), version: HASH_VERSION };
}

/**
 * Version 2 uses PBKDF2-HMAC-SHA-256 with a random per-PIN salt.
 * Missing/version 1 records remain verifiable using the legacy UID-bound SHA-256 scheme.
 */
export async function verifyParentalPin(pin: string, uid: string, record: ParentalPinHash): Promise<boolean> {
  const expected = fromHex(record.hash);
  if (!expected) return false;

  if (record.version === HASH_VERSION) {
    if (!record.salt) return false;
    const salt = fromHex(record.salt);
    if (!salt || salt.length !== 16) return false;
    return constantTimeEqual(await derivePinHash(pin, salt), expected);
  }

  if (record.version === undefined || record.version === 1) {
    return constantTimeEqual(await legacyPinHash(pin, uid), expected);
  }
  return false;
}
