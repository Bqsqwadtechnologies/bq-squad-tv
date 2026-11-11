import { describe, expect, it } from "vitest";
import { decodeLedgerCursor, encodeLedgerCursor } from "@/lib/server/ledger";

describe("wallet ledger cursors", () => {
  it("round-trips timestamp and document id", () => {
    const cursor = { createdAt: "2026-11-10T12:30:00.000Z", id: "entry_123" };
    expect(decodeLedgerCursor(encodeLedgerCursor(cursor))).toEqual(cursor);
  });

  it("rejects malformed, oversized and unsafe cursors", () => {
    expect(() => decodeLedgerCursor("not-a-cursor")).toThrow();
    expect(() => decodeLedgerCursor("x".repeat(513))).toThrow();
    expect(() => decodeLedgerCursor(encodeLedgerCursor({ createdAt: "invalid", id: "entry" }))).toThrow();
    expect(() => decodeLedgerCursor(encodeLedgerCursor({ createdAt: "2026-11-10T12:30:00Z", id: "../users" }))).toThrow();
  });

  it("returns null when no cursor is supplied", () => {
    expect(decodeLedgerCursor(null)).toBeNull();
  });
});
