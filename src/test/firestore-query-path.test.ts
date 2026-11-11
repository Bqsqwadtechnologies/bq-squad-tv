import { describe, expect, it } from "vitest";
import { resolveFirestoreQueryTarget } from "@/lib/server/firebase-admin";

describe("Firestore collection query paths", () => {
  it("keeps root collections at the database documents endpoint", () => {
    expect(resolveFirestoreQueryTarget("ledger")).toEqual({
      parentPath: null,
      collectionId: "ledger",
    });
  });

  it("resolves nested subcollections to their parent document", () => {
    expect(resolveFirestoreQueryTarget("channels/channel_1/schedule")).toEqual({
      parentPath: "channels/channel_1",
      collectionId: "schedule",
    });
    expect(resolveFirestoreQueryTarget("channels/channel_1/members")).toEqual({
      parentPath: "channels/channel_1",
      collectionId: "members",
    });
  });

  it("rejects document paths and unsafe path segments", () => {
    expect(() => resolveFirestoreQueryTarget("channels/channel_1")).toThrow();
    expect(() => resolveFirestoreQueryTarget("channels/../schedule")).toThrow();
    expect(() => resolveFirestoreQueryTarget("")).toThrow();
  });
});
