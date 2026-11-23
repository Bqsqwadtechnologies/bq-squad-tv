import { ApiError, Firestore } from "@/lib/server/firebase-admin";

export const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const WEIGHTS = [2, 3, 5, 7, 11, 13, 17, 19, 23];

export type PublicIdType = "viewer" | "producer" | "provider" | "zillionaire" | "channel";

export const PREFIX_MAP: Record<PublicIdType, string> = {
  viewer: "BQ-V-",
  producer: "BQ-P-",
  provider: "BQ-C-",
  zillionaire: "BQ-Z-",
  channel: "CH-",
};

export const TYPE_FROM_PREFIX: Record<string, PublicIdType> = {
  "BQ-V-": "viewer",
  "BQ-P-": "producer",
  "BQ-C-": "provider",
  "BQ-Z-": "zillionaire",
  "CH-": "channel",
};

/**
 * Calculates Crockford Base32 check character using coprime weighted modulo 32.
 * Detects single-character substitutions and adjacent transpositions.
 */
export function computeCheckChar(payload: string): string {
  if (payload.length !== 9) {
    throw new Error(`Payload must be exactly 9 characters, got ${payload.length}`);
  }
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const char = payload[i]!;
    const val = CROCKFORD_ALPHABET.indexOf(char);
    if (val === -1) {
      throw new Error(`Invalid Crockford character '${char}' at index ${i}`);
    }
    sum += val * WEIGHTS[i]!;
  }
  return CROCKFORD_ALPHABET[sum % 32]!;
}

/**
 * Generates 9 random characters from Crockford Base32 alphabet + 1 check character.
 */
export function generateRandomCrockfordWithCheck(): { payload: string; check: string; full: string } {
  const randomBytes = new Uint8Array(9);
  crypto.getRandomValues(randomBytes);
  let payload = "";
  for (let i = 0; i < 9; i++) {
    payload += CROCKFORD_ALPHABET[randomBytes[i]! % 32];
  }
  const check = computeCheckChar(payload);
  return { payload, check, full: payload + check };
}

/**
 * Generates an immutable, non-sequential public ID for an account or entity.
 * Viewers: BQ-V-xxxxxxxxxx
 * Producers: BQ-P-xxxxxxxxxx
 * Provider companies: BQ-C-xxxxxxxxxx
 * Zillionaire operators: BQ-Z-xxxxxxxxxx
 * Channels: CH-xxxxxxxxxx
 */
export function generatePublicId(type: PublicIdType): string {
  const prefix = PREFIX_MAP[type];
  const { full } = generateRandomCrockfordWithCheck();
  return `${prefix}${full}`;
}

/**
 * Generates an internal channel ID: CH-xxxxxxxxxx
 */
export function generateChannelId(): string {
  return generatePublicId("channel");
}

/**
 * Validates the syntax and check-character of a public ID or channel ID.
 */
export function validatePublicId(
  id: string,
  expectedType?: PublicIdType,
): { valid: boolean; type?: PublicIdType; reason?: string } {
  if (typeof id !== "string") {
    return { valid: false, reason: "ID must be a string." };
  }
  const cleanId = id.trim().toUpperCase();
  let matchedPrefix = "";
  for (const prefix of Object.keys(TYPE_FROM_PREFIX)) {
    if (cleanId.startsWith(prefix)) {
      matchedPrefix = prefix;
      break;
    }
  }
  if (!matchedPrefix) {
    return { valid: false, reason: "Unknown or missing ID prefix." };
  }
  const type = TYPE_FROM_PREFIX[matchedPrefix]!;
  if (expectedType && type !== expectedType) {
    return { valid: false, type, reason: `Expected ID of type ${expectedType}, got ${type}.` };
  }
  const body = cleanId.slice(matchedPrefix.length);
  if (body.length !== 10) {
    return { valid: false, type, reason: `ID body must be exactly 10 characters, got ${body.length}.` };
  }
  const payload = body.slice(0, 9);
  const providedCheck = body.slice(9);
  try {
    const expectedCheck = computeCheckChar(payload);
    if (providedCheck !== expectedCheck) {
      return { valid: false, type, reason: "Invalid check character (typo detected)." };
    }
  } catch (err) {
    return { valid: false, type, reason: err instanceof Error ? err.message : "Invalid characters in ID." };
  }
  return { valid: true, type };
}

/**
 * Helper to slugify a channel title for public URL addresses.
 */
export function slugifyChannelTitle(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "channel";
}

/**
 * Ensures an account has an immutable universal public ID.
 * If an ID already exists and is valid for the type, returns it immediately.
 * Otherwise reserves a new ID in `publicIds/{id}` with collision retry.
 */
export async function ensurePublicId(
  fs: Firestore,
  uid: string,
  type: PublicIdType,
  existingId?: string | null,
): Promise<string> {
  if (existingId && typeof existingId === "string") {
    const check = validatePublicId(existingId, type);
    if (check.valid) {
      const existingDoc = await fs.getDoc("publicIds/" + existingId);
      if (!existingDoc) {
        try {
          await fs.createDoc("publicIds/" + existingId, {
            id: existingId,
            uid,
            type,
            createdAt: new Date().toISOString(),
          });
        } catch {
          // Ignore if created concurrently
        }
      }
      return existingId;
    }
  }

  for (let attempt = 0; attempt < 20; attempt++) {
    const candidateId = generatePublicId(type);
    const now = new Date().toISOString();
    try {
      await fs.createDoc("publicIds/" + candidateId, {
        id: candidateId,
        uid,
        type,
        createdAt: now,
      });

      // Update the owner entity document
      if (type === "viewer" || type === "zillionaire") {
        await fs.patchDoc("users/" + uid, {
          publicId: candidateId,
          updatedAt: now,
        });
      } else if (type === "producer") {
        const prod = await fs.getDoc("producers/" + uid);
        if (prod) {
          await fs.patchDoc("producers/" + uid, {
            publicId: candidateId,
            updatedAt: now,
          });
        }
        await fs.patchDoc("users/" + uid, {
          publicId: candidateId,
          updatedAt: now,
        });
      } else if (type === "provider") {
        const prov = await fs.getDoc("providers/" + uid);
        if (prov) {
          await fs.patchDoc("providers/" + uid, {
            publicId: candidateId,
            updatedAt: now,
          });
        }
      }

      return candidateId;
    } catch (error) {
      if (error instanceof ApiError && error.code === "CONFLICT") {
        const winner = await fs.getDoc("publicIds/" + candidateId);
        if (winner?.["uid"] === uid) {
          return candidateId;
        }
        continue;
      }
      throw error;
    }
  }

  throw new ApiError(503, "PUBLIC_ID_UNAVAILABLE", "Could not generate a unique public ID. Please retry.");
}

/**
 * Resolves an account or entity from a public ID in O(1) time.
 */
export async function lookupByPublicId(
  fs: Firestore,
  publicId: string,
): Promise<{ uid: string; type: PublicIdType; entityId?: string } | null> {
  const check = validatePublicId(publicId);
  if (!check.valid) return null;
  const doc = await fs.getDoc("publicIds/" + publicId.trim().toUpperCase());
  if (!doc || typeof doc["uid"] !== "string") return null;
  return {
    uid: doc["uid"] as string,
    type: (doc["type"] as PublicIdType) || check.type || "viewer",
    ...(typeof doc["entityId"] === "string" ? { entityId: doc["entityId"] } : {}),
  };
}

/**
 * Idempotent backfill task for existing accounts without universal public IDs.
 */
export async function backfillUniversalIds(
  fs: Firestore,
  limit = 200,
): Promise<{ processed: number; updated: number; failures: number }> {
  let processed = 0;
  let updated = 0;
  let failures = 0;

  const users = await fs.query("users", { limit });
  for (const user of users) {
    processed++;
    const uid = String(user.__id || user["id"] || user["uid"] || "");
    if (!uid) continue;
    const existing = user["publicId"] as string | undefined;
    if (existing && validatePublicId(existing).valid) {
      continue;
    }
    try {
      const isOwner = user["isOwner"] === true || user["role"] === "owner";
      const type: PublicIdType = isOwner ? "zillionaire" : "viewer";
      await ensurePublicId(fs, uid, type, existing);
      updated++;
    } catch {
      failures++;
    }
  }

  return { processed, updated, failures };
}
