import { ApiError, Firestore } from "@/lib/server/firebase-admin";

const ACCOUNT_ID_MIN = 1_000_000;
const ACCOUNT_ID_RANGE = 9_000_000;

/**
 * Assigns a permanent, numeric customer/account reference.
 * The separate create-only index prevents two users from receiving the same ID.
 * It is an identifier/reference only; authentication remains email + Firebase Auth.
 */
export async function ensureAccountId(
  fs: Firestore,
  uid: string,
  profile?: Record<string, unknown> | null,
): Promise<string> {
  const current = profile ?? (await fs.getDoc("users/" + uid));
  const existing = current?.["accountId"];
  if (typeof existing === "string" && /^\d{7,12}$/.test(existing)) {
    const index = await fs.getDoc("accountIdIndex/" + existing);
    if (index?.["uid"] === uid) return existing;
    if (!index) {
      try {
        await fs.createDoc("accountIdIndex/" + existing, {
          uid,
          createdAt: new Date().toISOString(),
        });
        return existing;
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== "CONFLICT") throw error;
        const winner = await fs.getDoc("accountIdIndex/" + existing);
        if (winner?.["uid"] === uid) return existing;
      }
    } else {
      throw new ApiError(409, "ACCOUNT_ID_COLLISION", "Your account reference needs support review.");
    }
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const accountId = String(ACCOUNT_ID_MIN + (random[0]! % ACCOUNT_ID_RANGE));
    try {
      await fs.createDoc("accountIdIndex/" + accountId, {
        uid,
        createdAt: new Date().toISOString(),
      });
      await fs.patchDoc("users/" + uid, {
        accountId,
        updatedAt: new Date().toISOString(),
      });
      return accountId;
    } catch (error) {
      if (error instanceof ApiError && error.code === "CONFLICT") {
        const winner = await fs.getDoc("accountIdIndex/" + accountId);
        if (winner?.["uid"] === uid) {
          await fs.patchDoc("users/" + uid, {
            accountId,
            updatedAt: new Date().toISOString(),
          });
          return accountId;
        }
        continue;
      }
      throw error;
    }
  }
  throw new ApiError(503, "ACCOUNT_ID_UNAVAILABLE", "Could not assign an account reference. Please retry.");
}
