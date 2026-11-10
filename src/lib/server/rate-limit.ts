import { ApiError, type Firestore, encodeFields } from "./firebase-admin";

export type RateLimitPolicy = { limit: number; windowMs: number };

export async function enforceRateLimit(
  fs: Firestore,
  key: string,
  policy: RateLimitPolicy,
  now = Date.now(),
): Promise<{ remaining: number; resetAt: number }> {
  if (!key || !Number.isSafeInteger(policy.limit) || policy.limit < 1 ||
      !Number.isSafeInteger(policy.windowMs) || policy.windowMs < 1000) {
    throw new ApiError(500, "RATE_LIMIT_POLICY_INVALID", "The rate-limit policy is invalid.");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const keyHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const path = `rateLimits/${keyHash}`;
  return fs.transact([path], ([current]) => {
    const startedAt = typeof current?.["windowStartedAt"] === "number" ? current["windowStartedAt"] as number : now;
    const count = typeof current?.["count"] === "number" ? current["count"] as number : 0;
    const activeWindow = now - startedAt < policy.windowMs && now >= startedAt;
    const nextStartedAt = activeWindow ? startedAt : now;
    const nextCount = (activeWindow ? count : 0) + 1;
    const resetAt = nextStartedAt + policy.windowMs;
    if (nextCount > policy.limit) {
      throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please try again later.");
    }
    return {
      result: { remaining: policy.limit - nextCount, resetAt },
      writes: [{
        update: {
          name: fs.docName(path),
          fields: encodeFields({ windowStartedAt: nextStartedAt, count: nextCount, updatedAt: new Date(now).toISOString() }),
        },
      }],
    };
  });
}
