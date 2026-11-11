import { describe, expect, it } from "vitest";
import { assertIntegrityChallenge } from "@/lib/server/integrity-challenge";

const now = new Date("2026-11-11T05:00:00.000Z");
const validChallenge = {
  uid: "viewer-1",
  used: false,
  createdAt: "2026-11-11T04:59:00.000Z",
};

describe("one-use Play Integrity challenge validation", () => {
  it("accepts a fresh unused challenge owned by the viewer", () => {
    expect(() => assertIntegrityChallenge(validChallenge, "viewer-1", now)).not.toThrow();
  });

  it("rejects missing, foreign, replayed and expired challenges", () => {
    expect(() => assertIntegrityChallenge(null, "viewer-1", now)).toThrow();
    expect(() => assertIntegrityChallenge(validChallenge, "viewer-2", now)).toThrow();
    expect(() => assertIntegrityChallenge({ ...validChallenge, used: true }, "viewer-1", now)).toThrow();
    expect(() => assertIntegrityChallenge({
      ...validChallenge, createdAt: "2026-11-11T04:50:00.000Z",
    }, "viewer-1", now)).toThrow();
  });

  it("rejects invalid and future challenge timestamps", () => {
    expect(() => assertIntegrityChallenge({
      ...validChallenge, createdAt: "not-a-date",
    }, "viewer-1", now)).toThrow();
    expect(() => assertIntegrityChallenge({
      ...validChallenge, createdAt: "2026-11-11T05:02:00.000Z",
    }, "viewer-1", now)).toThrow();
  });
});
