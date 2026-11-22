import { describe, expect, it, vi, beforeEach } from "vitest";

const mockDb = new Map<string, any>();

vi.mock("@/lib/server/firebase-admin", () => {
  class MockApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  return {
    ApiError: MockApiError,
    Firestore: {
      create: vi.fn(async () => ({
        getDoc: vi.fn(async (path: string) => mockDb.get(path) || null),
        createDoc: vi.fn(async (path: string, data: any) => {
          if (mockDb.has(path)) {
            throw new MockApiError(409, "CONFLICT", "Document already exists: " + path);
          }
          mockDb.set(path, { ...data, __id: path.split("/").pop() });
        }),
        setDoc: vi.fn(async (path: string, data: any) => {
          mockDb.set(path, { ...data, __id: path.split("/").pop() });
        }),
        patchDoc: vi.fn(async (path: string, data: any) => {
          const current = mockDb.get(path) || {};
          mockDb.set(path, { ...current, ...data });
        }),
        query: vi.fn(async (col: string, _options?: any) => {
          const results: any[] = [];
          for (const [key, val] of mockDb.entries()) {
            if (key.startsWith(`${col}/`)) {
              results.push({ ...val, __id: key.split("/").pop() });
            }
          }
          return results;
        }),
      })),
    },
  };
});

import {
  CROCKFORD_ALPHABET,
  PREFIX_MAP,
  computeCheckChar,
  generatePublicId,
  generateChannelId,
  validatePublicId,
  slugifyChannelTitle,
  ensurePublicId,
  lookupByPublicId,
  backfillUniversalIds,
  type PublicIdType,
} from "@/lib/server/universal-ids";
import { Firestore } from "@/lib/server/firebase-admin";

describe("Batch N15 & N16 — Universal Public IDs and Channel Slugs", () => {
  beforeEach(() => {
    mockDb.clear();
  });

  it("uses strictly the Crockford Base32 alphabet (no I, L, O, U)", () => {
    expect(CROCKFORD_ALPHABET).toHaveLength(32);
    expect(CROCKFORD_ALPHABET).not.toContain("I");
    expect(CROCKFORD_ALPHABET).not.toContain("L");
    expect(CROCKFORD_ALPHABET).not.toContain("O");
    expect(CROCKFORD_ALPHABET).not.toContain("U");
  });

  it("computes reproducible and accurate check characters for 9-char payloads", () => {
    const payload = "012345678";
    const check = computeCheckChar(payload);
    expect(check).toBeDefined();
    expect(CROCKFORD_ALPHABET).toContain(check);
    expect(computeCheckChar(payload)).toBe(check);
  });

  it("detects single-character substitutions (typos)", () => {
    const payload = "A1B2C3D4E";
    const check = computeCheckChar(payload);

    for (let i = 0; i < 9; i++) {
      const originalChar = payload[i];
      const substituteChar = originalChar === "A" ? "B" : "A";
      const mutated = payload.slice(0, i) + substituteChar + payload.slice(i + 1);
      const mutatedCheck = computeCheckChar(mutated);
      expect(mutatedCheck).not.toBe(check);
    }
  });

  it("detects adjacent character transpositions", () => {
    const payload = "123456789";
    const swapped = "213456789";
    const check1 = computeCheckChar(payload);
    const check2 = computeCheckChar(swapped);
    expect(check1).not.toBe(check2);
  });

  it("generates correctly formatted public IDs for all entity types", () => {
    const types: PublicIdType[] = ["viewer", "producer", "provider", "zillionaire", "channel"];

    for (const type of types) {
      const id = type === "channel" ? generateChannelId() : generatePublicId(type);
      const prefix = PREFIX_MAP[type];
      expect(id.startsWith(prefix)).toBe(true);

      const validation = validatePublicId(id, type);
      expect(validation.valid).toBe(true);
      expect(validation.type).toBe(type);
    }
  });

  it("rejects corrupted or truncated public IDs", () => {
    const validViewerId = generatePublicId("viewer");
    expect(validatePublicId(validViewerId).valid).toBe(true);

    const corruptCheck = validViewerId.slice(0, -1) + (validViewerId.slice(-1) === "0" ? "1" : "0");
    const checkResult = validatePublicId(corruptCheck);
    expect(checkResult.valid).toBe(false);
    expect(checkResult.reason).toContain("typo");

    expect(validatePublicId(validViewerId.slice(0, -2)).valid).toBe(false);
    expect(validatePublicId("INVALID-1234567890").valid).toBe(false);

    const typeMismatch = validatePublicId(validViewerId, "producer");
    expect(typeMismatch.valid).toBe(false);
    expect(typeMismatch.reason).toContain("Expected ID of type producer");
  });

  it("ensures public ID immutability and persistence in Firestore", async () => {
    const fs = await Firestore.create();
    const uid = "test-user-" + Date.now();
    await fs.createDoc("users/" + uid, {
      uid,
      email: "test@bqsqwad.tv",
      createdAt: new Date().toISOString(),
    });

    const assignedId = await ensurePublicId(fs, uid, "viewer");
    expect(assignedId.startsWith("BQ-V-")).toBe(true);

    const userDoc = await fs.getDoc("users/" + uid);
    expect(userDoc?.["publicId"]).toBe(assignedId);

    const indexDoc = await fs.getDoc("publicIds/" + assignedId);
    expect(indexDoc?.["uid"]).toBe(uid);
    expect(indexDoc?.["type"]).toBe("viewer");

    const secondCall = await ensurePublicId(fs, uid, "viewer", assignedId);
    expect(secondCall).toBe(assignedId);

    const lookup = await lookupByPublicId(fs, assignedId);
    expect(lookup).toEqual({
      uid,
      type: "viewer",
      entityId: undefined,
    });
  });

  it("slugifies channel titles cleanly for public addresses", () => {
    expect(slugifyChannelTitle("BQ Squad Live Sports!")).toBe("bq-squad-live-sports");
    expect(slugifyChannelTitle("Cinema & Premieres (HD)")).toBe("cinema-premieres-hd");
    expect(slugifyChannelTitle("   ---Channel 123---   ")).toBe("channel-123");
    expect(slugifyChannelTitle("")).toBe("channel");
  });

  it("runs idempotent backfill across legacy user accounts", async () => {
    const fs = await Firestore.create();
    const uid1 = "legacy-user-1";
    const uid2 = "legacy-user-2";

    await fs.createDoc("users/" + uid1, { uid: uid1, email: "u1@tv.bqsqwad.com" });
    await fs.createDoc("users/" + uid2, { uid: uid2, email: "u2@tv.bqsqwad.com" });

    const result = await backfillUniversalIds(fs, 100);
    expect(result.processed).toBeGreaterThanOrEqual(2);
    expect(result.updated).toBeGreaterThanOrEqual(2);

    const u1After = await fs.getDoc("users/" + uid1);
    expect(u1After?.["publicId"]).toBeDefined();
    expect(validatePublicId(u1After?.["publicId"] as string).valid).toBe(true);

    const secondResult = await backfillUniversalIds(fs, 100);
    expect(secondResult.failures).toBe(0);
    const u1Second = await fs.getDoc("users/" + uid1);
    expect(u1Second?.["publicId"]).toBe(u1After?.["publicId"]);
  });
});
