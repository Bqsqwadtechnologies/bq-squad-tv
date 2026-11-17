import { describe, expect, it } from "vitest";
import { auditEntryHash } from "@/lib/server/audit";

describe("tamper-evident audit entry hashing", () => {
  it("is deterministic regardless of object property insertion order", async () => {
    const first = await auditEntryHash({ actorUid: "u1", action: "wallet.limit", sequence: 1 });
    const second = await auditEntryHash({ sequence: 1, action: "wallet.limit", actorUid: "u1" });
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
  it("changes when any audited field changes", async () => {
    const first = await auditEntryHash({ action: "wallet.limit", amountMinor: 100 });
    const changed = await auditEntryHash({ action: "wallet.limit", amountMinor: 101 });
    expect(changed).not.toBe(first);
  });
});
