import { describe, expect, it } from "vitest";
import type { StorageDestinationConfiguration } from "./registry";
import { presignBackblazeHlsGet } from "./backblaze-signing";

function configuration(): StorageDestinationConfiguration {
  return {
    configurationStatus: "configured",
    missingSecretNames: [],
    metadata: {
      destinationId: "b2_test",
      providerType: "backblaze_b2",
      accountAlias: "Test B2",
      secretPrefix: "STORAGE_B2_01",
      bucketName: "test-bucket",
      region: "us-west-004",
      purpose: "hls_streaming",
      softCapBytes: 9_000_000_000,
      dailyEgressCapBytes: null,
      priority: 1,
      enabled: true,
      accountGroup: "b2:test",
      mode: "active",
      deliveryMode: "direct_signed",
      replicaOf: null,
    },
    credentials: {
      keyId: "AKIDEXAMPLE",
      applicationKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      endpoint: "https://s3.us-west-004.backblazeb2.com",
      bucketId: "bucket-id",
    },
  };
}

describe("Backblaze HLS SigV4 signing", () => {
  it("matches a fixed SigV4 signing vector and fixed UTC clock", async () => {
    const url = await presignBackblazeHlsGet({
      configuration: configuration(),
      objectKey: "hls/asset_1/a1/segment_00001.ts",
      expiresInSeconds: 60,
      now: new Date("2013-05-24T00:00:00.000Z"),
    });
    expect(url).toContain("X-Amz-Date=20130524T000000Z");
    expect(url).toContain("X-Amz-Expires=60");
    expect(url).toContain("X-Amz-Signature=829f5b21256acb82f6246e4d558792ae9d0e139d3931229bf2cbd3ef3d084ddc");
  });

  it("encodes path segments without changing separators", async () => {
    const config = configuration();
    config.metadata.bucketName = "test-bucket";
    const url = await presignBackblazeHlsGet({
      configuration: config,
      objectKey: "hls/asset_1/a1/subtitle_english.vtt",
      expiresInSeconds: 120,
      now: new Date("2026-11-17T12:00:00.000Z"),
    });
    expect(new URL(url).pathname).toBe("/test-bucket/hls/asset_1/a1/subtitle_english.vtt");
  });

  it("rejects source files and invalid TTLs", async () => {
    await expect(presignBackblazeHlsGet({
      configuration: configuration(),
      objectKey: "producers/owner/channel/asset/source.mp4",
      expiresInSeconds: 60,
    })).rejects.toThrow();
    await expect(presignBackblazeHlsGet({
      configuration: configuration(),
      objectKey: "hls/asset_1/a1/segment_00001.ts",
      expiresInSeconds: 21_601,
    })).rejects.toThrow();
  });
});
