import { describe, expect, it } from "vitest";
import { encodeFields, orderBatchGetDocuments } from "@/lib/server/firebase-admin";

describe("Firestore transactional batch reads", () => {
  it("restores requested document order when Firestore returns responses out of order", () => {
    const sessionName = "projects/demo/databases/(default)/documents/sessions/s1";
    const walletName = "projects/demo/databases/(default)/documents/wallets/u1";
    const heartbeatName = "projects/demo/databases/(default)/documents/sessions/s1/heartbeats/2";
    const requested = [sessionName, walletName, heartbeatName];
    const responses = [
      { found: { name: walletName!, fields: encodeFields({ balanceMinor: 500 }) } },
      { missing: heartbeatName! },
      { found: { name: sessionName!, fields: encodeFields({ active: true }) } },
    ];

    expect(orderBatchGetDocuments(requested, responses)).toEqual([
      { active: true },
      { balanceMinor: 500 },
      null,
    ]);
  });

  it("rejects duplicate or omitted document responses", () => {
    const walletName = "projects/demo/databases/(default)/documents/wallets/u1";
    const requested = [walletName];
    expect(() => orderBatchGetDocuments(requested, [
      { missing: requested[0]! },
      { missing: walletName },
    ])).toThrow(/invalid transactional read response/i);
    expect(() => orderBatchGetDocuments(requested, [])).toThrow(/omitted a document/i);
  });
});
