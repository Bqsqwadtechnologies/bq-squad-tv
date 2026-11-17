import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeFields, Firestore } from "../firebase-admin";
import { calculateStorageGroupCap, getStoragePoolEntries, rebuildStoragePoolIndex, adjustPoolShardEntries } from "./pool-index";

afterEach(() => vi.unstubAllEnvs());

function destination(id: string, usageBytes: number | null = 0) {
  return {
    __id: id,
    destinationId: id,
    providerType: "backblaze_b2",
    accountAlias: "Test account",
    secretPrefix: "STORAGE_B2_01",
    bucketName: "bucket-" + id,
    region: "us-west-004",
    purpose: "source_media",
    softCapBytes: 1_000,
    accountCapBytes: 500_000,
    dailyEgressCapBytes: null,
    priority: 100,
    enabled: true,
    paidEgressEnabled: false,
    freeEgressBudgetBytes: null,
    accountGroup: "b2:shared-account",
    mode: "active",
    replicaOf: null,
    usageBytes,
    usageSource: usageBytes === null ? null : "provider_listing",
    usageCheckedAt: usageBytes === null ? null : "2026-11-17T00:00:00.000Z",
    reservedBytes: 0,
    healthStatus: "healthy",
    healthCheckedAt: "2026-11-17T00:00:00.000Z",
  };
}

function fakeFirestore(rows: Array<Record<string, unknown>>) {
  const documents = new Map<string, Record<string, unknown>>();
  const writes: unknown[] = [];
  const fs = {
    async query(collection: string) {
      if (collection === "storageDestinations") return rows;
      return [...documents.entries()]
        .filter(([path]) => path.startsWith(collection + "/"))
        .map(([path, value]) => ({ ...value, __id: path.split("/").pop()! }));
    },
    async getDoc(path: string) { return documents.get(path) ?? null; },
    docName(path: string) { return "projects/test/databases/(default)/documents/" + path; },
    async commit(batch: Array<Record<string, unknown>>) {
      writes.push(...batch);
      for (const write of batch) {
        if ("delete" in write) {
          const name = String(write["delete"]);
          documents.delete(name.split("/documents/").pop()!);
          continue;
        }
        const update = write["update"] as { name: string; fields: Record<string, never> };
        const path = update.name.split("/documents/").pop()!;
        documents.set(path, decodeFields(update.fields as never));
      }
    },
  };
  return { fs: fs as unknown as Firestore, documents, writes };
}

describe("compact storage pool index", () => {
  it("shards 400 eligible destinations into documents of at most 200 entries", async () => {
    vi.stubEnv("STORAGE_B2_01_KEY_ID", "key-id");
    vi.stubEnv("STORAGE_B2_01_APP_KEY", "app-key");
    vi.stubEnv("STORAGE_B2_01_BUCKET_ID", "bucket-id");
    vi.stubEnv("STORAGE_B2_01_ENDPOINT", "https://s3.us-west-004.backblazeb2.com");
    const { fs, documents } = fakeFirestore(Array.from({ length: 400 }, (_, i) =>
      destination("b2-" + String(i + 1).padStart(3, "0"))));
    const result = await rebuildStoragePoolIndex(fs, ["source_media"]);
    expect(result.destinationCount).toBe(400);
    expect(result.eligibleCount).toBe(400);
    expect(result.shardCount).toBe(2);
    const first = documents.get("storagePool/source_media__000");
    const second = documents.get("storagePool/source_media__001");
    expect((first?.["entries"] as unknown[]).length).toBe(200);
    expect((second?.["entries"] as unknown[]).length).toBe(200);
    expect(await getStoragePoolEntries(fs, "source_media")).toHaveLength(400);
  });

  it("excludes unknown usage from the compact pool", async () => {
    vi.stubEnv("STORAGE_B2_01_KEY_ID", "key-id");
    vi.stubEnv("STORAGE_B2_01_APP_KEY", "app-key");
    vi.stubEnv("STORAGE_B2_01_BUCKET_ID", "bucket-id");
    vi.stubEnv("STORAGE_B2_01_ENDPOINT", "https://s3.us-west-004.backblazeb2.com");
    const { fs } = fakeFirestore([destination("b2-known", 10), destination("b2-unknown", null)]);
    const result = await rebuildStoragePoolIndex(fs, ["source_media"]);
    expect(result.eligibleCount).toBe(0);
    expect(await getStoragePoolEntries(fs, "source_media")).toEqual([]);
  });

  it("applies one conservative capacity cap across buckets sharing an account", () => {
    expect(calculateStorageGroupCap([
      { softCapBytes: 4_500_000_000, accountCapBytes: 4_500_000_000 },
      { softCapBytes: 4_500_000_000, accountCapBytes: 4_500_000_000 },
      { softCapBytes: 4_500_000_000, accountCapBytes: 4_500_000_000 },
    ])).toBe(4_500_000_000);
    expect(calculateStorageGroupCap([
      { softCapBytes: 4_500_000_000, accountCapBytes: 4_500_000_000 },
      { softCapBytes: 4_500_000_000, accountCapBytes: 5_000_000_000 },
    ])).toBeNull();
  });

  it("adjusts only the selected destination entry and marks it full at zero", () => {
    const entries = [
      { id: "b2-one", priority: 1, freeBytes: 100, groupId: "b2:a", egressHeadroomBytes: null, state: "eligible" },
      { id: "b2-two", priority: 1, freeBytes: 200, groupId: "b2:a", egressHeadroomBytes: null, state: "eligible" },
    ];
    expect(adjustPoolShardEntries(entries, "b2-one", -100)).toEqual([
      { ...entries[0], freeBytes: 0, state: "full" },
      entries[1],
    ]);
  });
});
