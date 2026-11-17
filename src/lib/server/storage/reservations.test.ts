import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, decodeFields, Firestore } from "../firebase-admin";
import { reserveStorageDestination } from "./reservations";
import { groupCapacityPath } from "./pool-index";

function makeFakeFirestore() {
  const docs = new Map<string, Record<string, unknown>>();
  const groupPath = groupCapacityPath("b2:account-01");
  docs.set("storageRouting/source_media", { cursor: 0 });
  docs.set(groupPath, { accountGroup: "b2:account-01", usageBytes: 0, knownUsageBytes: 0, unknownUsageCount: 0, reservedBytes: 0, capBytes: 100, freeBytes: 100 });
  docs.set("storageDestinations/b2-001", {
    destinationId: "b2-001", providerType: "backblaze_b2", accountAlias: "Test account",
    secretPrefix: "STORAGE_B2_01", bucketName: "test-bucket", region: "us-west-004",
    purpose: "source_media", softCapBytes: 100, accountCapBytes: 100,
    dailyEgressCapBytes: null, priority: 1, enabled: true,
    paidEgressEnabled: false, freeEgressBudgetBytes: null,
    accountGroup: "b2:account-01", mode: "active", replicaOf: null,
    usageBytes: 0, usageSource: "provider_listing", usageCheckedAt: "2026-11-17T00:00:00.000Z",
    reservedBytes: 0, healthStatus: "healthy", healthCheckedAt: "2026-11-17T00:00:00.000Z",
  });
  docs.set("storagePool/source_media__000", {
    purpose: "source_media", shardNumber: 0,
    entries: [{ id: "b2-001", priority: 1, freeBytes: 100, groupId: "b2:account-01", egressHeadroomBytes: null, state: "eligible" }],
  });

  let tail = Promise.resolve();
  const applyWrites = (writes: Array<Record<string, unknown>>) => {
    for (const write of writes) {
      if ("delete" in write) {
        docs.delete(String(write["delete"]).split("/documents/").pop()!);
        continue;
      }
      const update = write["update"] as { name: string; fields: Record<string, never> };
      const path = update.name.split("/documents/").pop()!;
      if ((write["currentDocument"] as { exists?: boolean } | undefined)?.exists === false && docs.has(path)) {
        throw new ApiError(409, "CONFLICT", "Concurrent document creation.");
      }
      const fields = decodeFields(update.fields as never);
      const mask = write["updateMask"] as { fieldPaths?: string[] } | undefined;
      if (mask?.fieldPaths) {
        const current = docs.get(path) ?? {};
        for (const key of mask.fieldPaths) current[key] = fields[key];
        docs.set(path, current);
      } else {
        docs.set(path, fields);
      }
    }
  };
  const fs = {
    async getDoc(path: string) { return docs.get(path) ?? null; },
    async setDoc(path: string, fields: Record<string, unknown>) { docs.set(path, fields); },
    async patchDoc(path: string, fields: Record<string, unknown>) { docs.set(path, { ...(docs.get(path) ?? {}), ...fields }); },
    async deleteDoc(path: string) { docs.delete(path); },
    docName(path: string) { return "projects/test/databases/(default)/documents/" + path; },
    async query(collection: string) {
      return [...docs.entries()]
        .filter(([path]) => path.startsWith(collection + "/"))
        .map(([path, value]) => ({ ...value, __id: path.split("/").pop()! }));
    },
    async commit(writes: Array<Record<string, unknown>>) { applyWrites(writes); },
    async transact(paths: string[], fn: (values: Array<Record<string, unknown> | null>) => unknown) {
      let release!: () => void;
      const previous = tail;
      tail = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try {
        const values = paths.map(path => docs.get(path) ?? null);
        const result = await fn(values) as { result: unknown; writes: Array<Record<string, unknown>> };
        applyWrites(result.writes);
        return result.result;
      } finally {
        release();
      }
    },
  };
  return { fs: fs as unknown as Firestore, docs };
}

beforeEach(() => {
  vi.stubEnv("STORAGE_B2_01_KEY_ID", "key-id");
  vi.stubEnv("STORAGE_B2_01_APP_KEY", "app-key");
  vi.stubEnv("STORAGE_B2_01_BUCKET_ID", "bucket-id");
  vi.stubEnv("STORAGE_B2_01_ENDPOINT", "https://s3.us-west-004.backblazeb2.com");
});
afterEach(() => vi.unstubAllEnvs());

afterEach(() => vi.unstubAllEnvs());

function stubB2Secrets() {
  vi.stubEnv("STORAGE_B2_01_KEY_ID", "test-key-id");
  vi.stubEnv("STORAGE_B2_01_APP_KEY", "test-app-key");
  vi.stubEnv("STORAGE_B2_01_BUCKET_ID", "test-bucket-id");
  vi.stubEnv("STORAGE_B2_01_ENDPOINT", "https://s3.us-west-004.backblazeb2.com");
}

describe("compact-pool reservations", () => {
  it("reserves capacity and updates the destination, group and index atomically", async () => {
    stubB2Secrets();
    const { fs, docs } = makeFakeFirestore();
    const result = await reserveStorageDestination(fs, {
      purpose: "source_media", incomingBytes: 70, reservationId: "reserve-0001",
    });
    expect(result.destinationId).toBe("b2-001");
    expect(docs.get("storageDestinations/b2-001")?.["reservedBytes"]).toBe(70);
    expect(docs.get(groupCapacityPath("b2:account-01"))?.["freeBytes"]).toBe(30);
    const shard = docs.get("storagePool/source_media__000");
    expect((shard?.["entries"] as Array<Record<string, unknown>>)[0]?.["freeBytes"]).toBe(30);
  });

  it("does not overbook when two reservations race for the same shared account", async () => {
    stubB2Secrets();
    const { fs, docs } = makeFakeFirestore();
    const results = await Promise.allSettled([
      reserveStorageDestination(fs, { purpose: "source_media", incomingBytes: 60, reservationId: "reserve-race-01" }),
      reserveStorageDestination(fs, { purpose: "source_media", incomingBytes: 60, reservationId: "reserve-race-02" }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(docs.get("storageDestinations/b2-001")?.["reservedBytes"]).toBe(60);
    expect(docs.get(groupCapacityPath("b2:account-01"))?.["freeBytes"]).toBe(40);
  });
});
