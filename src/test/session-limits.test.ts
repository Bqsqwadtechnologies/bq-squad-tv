import { describe, expect, it } from "vitest";
import {
  ACTIVE_SESSION_LEASE_MS,
  acquireSessionLease,
  liveSessionLeases,
  releaseSessionLease,
  renewSessionLease,
} from "@/lib/server/session-limits";

describe("concurrent playback session leases", () => {
  it("prunes expired and malformed leases", () => {
    expect(
      liveSessionLeases(
        {
          live: 20_000,
          expired: 9_999,
          malformed: "later",
        },
        10_000,
      ),
    ).toEqual({ live: 20_000 });
  });

  it("atomically refuses a session when the configured limit is reached", () => {
    const existing = { first: 70_000, second: 80_000 };
    expect(acquireSessionLease(existing, "third", 10_000, 2)).toBeNull();
  });

  it("acquires a lease and sets its bounded expiry", () => {
    expect(acquireSessionLease({ stale: 1 }, "new-session", 10_000, 2)).toEqual({
      "new-session": 10_000 + ACTIVE_SESSION_LEASE_MS,
    });
  });

  it("renews active leases and releases ended sessions", () => {
    const renewed = renewSessionLease({ sessionA: 15_000, stale: 1 }, "sessionA", 10_000);
    expect(renewed["sessionA"]).toBe(10_000 + ACTIVE_SESSION_LEASE_MS);
    const released = releaseSessionLease(renewed, "sessionA", 11_000);
    expect(released).toEqual({});
  });
});
