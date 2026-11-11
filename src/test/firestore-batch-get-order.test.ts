import { describe, expect, it } from "vitest";
import { encodeFields, orderBatchGetDocuments } from "@/lib/server/firebase-admin";

describe("Firestore transactional batch reads", () => {
  it("restores requested document order when Firestore returns responses out of order", () => {
    const requested = [
      "projects/demo/databases/(default)/documents/sessions/s1",
      "projects/demo/databases/(default)/documents/wallets/u1",
      "projects/demo/databases/(default)/documents/sessions/s1/heartbeats/2",
    ];
    const responses = [
      { found: { name: requested[1]!, fields: encodeFields({ balanceMinor: 500 }) } },
      { missing: requested[2]! },
      { found: { name: requested[0]!, fields: encodeFields({ active: true }) } },
    ];

    expect(orderBatchGetDocuments(requested, responses)).toEqual([
      { active: true },
      { balanceMinor: 500 },
      null,
    ]);
  });

  it("rejects duplicate or omitted document responses", () => {
    const requested = ["projects/demo/databases/(default)/documents/wallets/u1"];
    expect(() => orderBatchGetDocuments(requested, [
      { missing: requested[0]! },
      { missing: requested[0] },
    ])).toThrow(/invalid transactional read response/i);
    expect(() => orderBatchGetDocuments(requested, [])).toThrow(/omitted a document/i);
  });
});
