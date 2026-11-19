import { ApiError, type Firestore, encodeFields } from "./firebase-admin";

export type RateLimitPolicy = { limit: number; windowMs: number };
const localWindows = new Map<string, { startedAt: number; count: number }>();

/** Cheap per-instance guard; Firestore remains authoritative across instances. */
export function consumeLocalRateLimit(
  key: string,
  policy: RateLimitPolicy,
  now = Date.now(),
): boolean {
  const current = localWindows.get(key);
  const active =
    current !== undefined && now >= current.startedAt && now - current.startedAt < policy.windowMs;
  const next = {
    startedAt: active ? current.startedAt : now,
    count: (active ? current.count : 0) + 1,
  };
  if (next.count > policy.limit) return false;
  if (localWindows.size >= 10_000 && !localWindows.has(key)) {
    for (const [candidate, window] of localWindows) {
      if (now < window.startedAt || now - window.startedAt >= policy.windowMs)
        localWindows.delete(candidate);
      if (localWindows.size < 8_000) break;
    }
  }
  localWindows.set(key, next);
  return true;
}

export async function enforceRateLimit(
  fs: Firestore,
  key: string,
  policy: RateLimitPolicy,
  now = Date.now(),
): Promise<{ remaining: number; resetAt: number }> {
  if (
    !key ||
    !Number.isSafeInteger(policy.limit) ||
    policy.limit < 1 ||
    !Number.isSafeInteger(policy.windowMs) ||
    policy.windowMs < 1000
  ) {
    throw new ApiError(500, "RATE_LIMIT_POLICY_INVALID", "The rate-limit policy is invalid.");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const keyHash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if (process.env["NODE_ENV"] !== "test" && !consumeLocalRateLimit(keyHash, policy, now)) {
    throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please try again later.");
  }
  const path = `rateLimits/${keyHash}`;
  return fs.transact([path], ([current]) => {
    const startedAt =
      typeof current?.["windowStartedAt"] === "number"
        ? (current["windowStartedAt"] as number)
        : now;
    const count = typeof current?.["count"] === "number" ? (current["count"] as number) : 0;
    const activeWindow = now - startedAt < policy.windowMs && now >= startedAt;
    const nextStartedAt = activeWindow ? startedAt : now;
    const nextCount = (activeWindow ? count : 0) + 1;
    const resetAt = nextStartedAt + policy.windowMs;
    if (nextCount > policy.limit) {
      throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please try again later.");
    }
    return {
      result: { remaining: policy.limit - nextCount, resetAt },
      writes: [
        {
          update: {
            name: fs.docName(path),
            fields: encodeFields({
              windowStartedAt: nextStartedAt,
              count: nextCount,
              updatedAt: new Date(now).toISOString(),
            }),
          },
        },
      ],
    };
  });
}
