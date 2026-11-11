import { ApiError, type Firestore, type FirestoreWrite, encodeFields } from "./firebase-admin";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function assertIntegrityChallenge(
  challenge: Record<string, unknown> | null,
  uid: string,
  now = new Date(),
): void {
  if (!challenge) {
    throw new ApiError(403, "INTEGRITY_CHALLENGE_INVALID", "The Play Integrity challenge does not exist.");
  }
  if (challenge["uid"] !== uid) {
    throw new ApiError(403, "INTEGRITY_CHALLENGE_INVALID", "The Play Integrity challenge belongs to another account.");
  }
  if (challenge["used"] !== false) {
    throw new ApiError(403, "INTEGRITY_CHALLENGE_REPLAYED", "The Play Integrity challenge has already been used.");
  }
  const createdAt = typeof challenge["createdAt"] === "string"
    ? Date.parse(challenge["createdAt"] as string)
    : Number.NaN;
  if (
    !Number.isFinite(createdAt) ||
    createdAt > now.getTime() + 60_000 ||
    now.getTime() - createdAt > CHALLENGE_TTL_MS
  ) {
    throw new ApiError(403, "INTEGRITY_CHALLENGE_EXPIRED", "The Play Integrity challenge has expired.");
  }
}

/** Atomically consumes a one-use challenge so the same attestation cannot start multiple sessions. */
export async function consumeIntegrityChallenge(
  fs: Firestore,
  nonce: string,
  uid: string,
  now = new Date(),
): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(nonce)) {
    throw new ApiError(400, "INTEGRITY_CHALLENGE_INVALID", "The Play Integrity challenge is invalid.");
  }
  const path = "integrityChallenges/" + nonce;
  await fs.transact([path], (docs) => {
    const challenge = docs[0] ?? null;
    assertIntegrityChallenge(challenge, uid, now);
    const fields = { used: true, usedAt: now.toISOString() };
    const write: FirestoreWrite = {
      update: { name: fs.docName(path), fields: encodeFields(fields) },
      updateMask: { fieldPaths: ["used", "usedAt"] },
    };
    return { result: undefined, writes: [write] };
  });
}
