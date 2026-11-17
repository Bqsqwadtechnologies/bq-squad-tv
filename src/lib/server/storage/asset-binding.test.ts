import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeFields, Firestore } from "../firebase-admin";
import {
  bindAssetStreamStorage,
  classifyAssetMediaOutput,
  isAllowedHlsOutputPath,
  resolveAssetMediaBinding,
  resolveAssetStreamBinding,
} from "./asset-binding";

afterEach(() => vi.unstubAllEnvs());

describe("asset storage bindings", () => {
  it("keeps legacy assets on the original streaming location", () => {
    expect(resolveAssetStreamBinding({ streamObjectPrefix: "hls/asset-1/a2" }, "asset-1")).toEqual({
      streamDestinationId: "lovable-stream-legacy",
      streamReplicaIds: [],
      objectPrefix: "hls/asset-1/a2",
    });
    expect(resolveAssetStreamBinding({}, "asset-2")).toEqual({
      streamDestinationId: "lovable-stream-legacy",
      streamReplicaIds: [],
      objectPrefix: "hls/asset-2",
    });
  });

  it("resolves the primary, replicas and prefix from a modern asset", () => {
    expect(resolveAssetStreamBinding({
      streamDestinationId: "b2-001",
      streamReplicaIds: ["b2-002", "b2-001", "invalid id", "b2-003"],
      objectPrefix: "hls/asset-3/a4",
    }, "asset-3")).toEqual({
      streamDestinationId: "b2-001",
      streamReplicaIds: ["b2-002", "b2-003"],
      objectPrefix: "hls/asset-3/a4",
    });
  });

  it("classifies poster and thumbnail files while rejecting unsafe output paths", () => {
    expect(classifyAssetMediaOutput("poster.webp")).toBe("poster");
    expect(classifyAssetMediaOutput("thumbnail_001.jpg")).toBe("thumbnail");
    expect(classifyAssetMediaOutput("sprite_001.png")).toBe("sprite");
    expect(isAllowedHlsOutputPath("poster.webp")).toBe(true);
    expect(isAllowedHlsOutputPath("rendition/segment_00001.m4s")).toBe(true);
    expect(isAllowedHlsOutputPath("../../private.json")).toBe(false);
    expect(isAllowedHlsOutputPath("poster.exe")).toBe(false);
    expect(isAllowedHlsOutputPath("a".repeat(221) + ".jpg")).toBe(false);
  });

  it("resolves poster records through the same primary and replica binding", () => {
    expect(resolveAssetMediaBinding({
      mediaType: "poster",
      streamDestinationId: "lov-001",
      streamReplicaIds: ["b2-001"],
      objectPrefix: "hls/asset-4/a1",
      objectKey: "hls/asset-4/a1/poster.jpg",
    }, "asset-4")).toMatchObject({
      streamDestinationId: "lov-001",
      streamReplicaIds: ["b2-001"],
      objectPrefix: "hls/asset-4/a1",
      objectKey: "hls/asset-4/a1/poster.jpg",
      mediaType: "poster",
    });
  });

  it("switches the asset and committed reservation in one transaction", async () => {
    vi.stubEnv("STORAGE_B2_01_KEY_ID", "key-id");
    vi.stubEnv("STORAGE_B2_01_APP_KEY", "app-key");
    vi.stubEnv("STORAGE_B2_01_BUCKET_ID", "bucket-id");
    vi.stubEnv("STORAGE_B2_01_ENDPOINT", "https://s3.us-west-004.backblazeb2.com");
    const docs = new Map<string, Record<string, unknown>>([
      ["contentAssets/asset-5", {
        status: "processed_pending_review",
        streamObjectPrefix: "hls/asset-5/a1",
        hlsManifestKey: "hls/asset-5/a1/master.m3u8",
      }],
      ["storageDestinations/b2-001", {
        destinationId: "b2-001",
        providerType: "backblaze_b2",
        accountAlias: "Test account",
        secretPrefix: "STORAGE_B2_01",
        bucketName: "test-bucket",
        region: "us-west-004",
        purpose: "hls_streaming",
        softCapBytes: 1_000,
        accountCapBytes: 1_000,
        dailyEgressCapBytes: 100,
        priority: 1,
        enabled: true,
        paidEgressEnabled: false,
        freeEgressBudgetBytes: 500,
        accountGroup: "b2:account-01",
        mode: "active",
        replicaOf: null,
        usageBytes: 100,
        usageSource: "provider_listing",
        healthStatus: "healthy",
      }],
      ["storageReservations/reserve-asset-005", {
        destinationId: "b2-001",
        assetId: "asset-5",
        purpose: "hls_streaming",
        status: "committed",
        actualBytes: 100,
      }],
    ]);
    const fs = {
      docName(path: string) { return "projects/test/databases/(default)/documents/" + path; },
      async transact(paths: string[], callback: (values: Array<Record<string, unknown> | null>) => {
        result: unknown; writes: Array<Record<string, unknown>>;
      }) {
        const transaction = callback(paths.map(path => docs.get(path) ?? null));
        for (const write of transaction.writes) {
          const update = write["update"] as { name: string; fields: Record<string, never> };
          const path = update.name.split("/documents/").pop()!;
          const fields = decodeFields(update.fields as never);
          const mask = write["updateMask"] as { fieldPaths?: string[] } | undefined;
          if (mask?.fieldPaths) {
            const current = docs.get(path) ?? {};
            for (const key of mask.fieldPaths) current[key] = fields[key];
            docs.set(path, current);
          } else docs.set(path, fields);
        }
        return transaction.result;
      },
    };
    const binding = await bindAssetStreamStorage(fs as unknown as Firestore, {
      assetId: "asset-5",
      destinationId: "b2-001",
      objectPrefix: "hls/asset-5/a2",
      reservationId: "reserve-asset-005",
    });
    expect(binding).toEqual({
      streamDestinationId: "b2-001",
      streamReplicaIds: ["lovable-stream-legacy"],
      objectPrefix: "hls/asset-5/a2",
    });
    expect(docs.get("contentAssets/asset-5")?.["streamDestinationId"]).toBe("b2-001");
    expect(docs.get("contentAssets/asset-5")?.["streamReplicaIds"]).toEqual(["lovable-stream-legacy"]);
    expect(docs.get("storageReservations/reserve-asset-005")?.["bindingStatus"]).toBe("bound");
  });
});
