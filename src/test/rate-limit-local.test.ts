import { describe, expect, it } from "vitest";
import { consumeLocalRateLimit } from "@/lib/server/rate-limit";

describe("per-instance rate-limit guard", () => {
  it("blocks excess requests within a local window and resets after expiry", () => {
    const key = "local-test-" + crypto.randomUUID();
    const policy = { limit: 2, windowMs: 1_000 };
    expect(consumeLocalRateLimit(key, policy, 10_000)).toBe(true);
    expect(consumeLocalRateLimit(key, policy, 10_100)).toBe(true);
    expect(consumeLocalRateLimit(key, policy, 10_200)).toBe(false);
    expect(consumeLocalRateLimit(key, policy, 11_001)).toBe(true);
  });
});
