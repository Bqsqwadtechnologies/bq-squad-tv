import { describe, expect, it } from "vitest";
import { signSessionLeaseToken, verifySessionLeaseToken } from "./session-lease-token";

const secret = "test-only-streaming-hmac-secret-32-bytes";

describe("signed session lease", () => {
  it("round-trips cumulative sequence and playback progress", async () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      sid: "session_123",
      seq: 4,
      positionMs: 120_000,
      billedSeconds: 120,
      leaseExp: now + 45,
    };
    const token = await signSessionLeaseToken(claims, secret);
    await expect(verifySessionLeaseToken(token, claims.sid, now, secret)).resolves.toEqual(claims);
  });

  it("rejects tampering, another session and expired leases", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signSessionLeaseToken(
      {
        sid: "session_123",
        seq: 1,
        positionMs: 30_000,
        billedSeconds: 30,
        leaseExp: now + 45,
      },
      secret,
    );
    await expect(
      verifySessionLeaseToken(token + "x", "session_123", now, secret),
    ).rejects.toThrow();
    await expect(verifySessionLeaseToken(token, "session_other", now, secret)).rejects.toThrow();
    await expect(verifySessionLeaseToken(token, "session_123", now + 46, secret)).rejects.toThrow();
  });
});
