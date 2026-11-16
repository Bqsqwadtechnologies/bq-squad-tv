import { describe, expect, it } from "vitest";
import {
  resolveStorageDestinationConfiguration,
  validateStorageDestinationMetadata,
  type StorageDestinationMetadata,
} from "./registry";

function metadata(secretPrefix: string): StorageDestinationMetadata {
  return {
    destinationId: "b2-test-01",
    providerType: "backblaze_b2",
    accountAlias: "B2 test",
    secretPrefix,
    bucketName: "bq-test-bucket",
    region: "us-west-004",
    purpose: "source_media",
    softCapBytes: 9_000_000_000,
    dailyEgressCapBytes: null,
    priority: 10,
    enabled: true,
  };
}

describe("storage destination registry", () => {
  it("resolves all eleven numbered B2 secret groups without exposing missing values", () => {
    for (let index = 1; index <= 11; index++) {
      const prefix = "STORAGE_B2_" + String(index).padStart(2, "0");
      const result = resolveStorageDestinationConfiguration(metadata(prefix), {
        [prefix + "_KEY_ID"]: "test-key-id",
        [prefix + "_APP_KEY"]: "test-app-key",
        [prefix + "_BUCKET_ID"]: "test-bucket-id",
        [prefix + "_ENDPOINT"]: "https://s3.us-west-004.backblazeb2.com",
      });
      expect(result.configurationStatus).toBe("configured");
      expect(result.credentials?.keyId).toBe("test-key-id");
    }
  });

  it("continues to support the NN01-NN10 secret prefixes from the earlier inventory", () => {
    for (let index = 1; index <= 10; index++) {
      const prefix = "STORAGE_B2_NN" + String(index).padStart(2, "0");
      const result = resolveStorageDestinationConfiguration(metadata(prefix), {
        [prefix + "_KEY_ID"]: "test-key-id",
        [prefix + "_APP_KEY"]: "test-app-key",
        [prefix + "_BUCKET_ID"]: "test-bucket-id",
        [prefix + "_ENDPOINT"]: "https://s3.us-west-004.backblazeb2.com",
      });
      expect(result.configurationStatus).toBe("configured");
    }
  });

  it("fails closed when a B2 credential is missing", () => {
    const result = resolveStorageDestinationConfiguration(metadata("STORAGE_B2_01"), {});
    expect(result.configurationStatus).toBe("misconfigured");
    expect(result.missingSecretNames).toContain("STORAGE_B2_01_KEY_ID");
    expect(JSON.stringify(result)).not.toContain("test-app-key");
  });

  it("rejects an untrusted B2 endpoint", () => {
    const prefix = "STORAGE_B2_01";
    const result = resolveStorageDestinationConfiguration(metadata(prefix), {
      [prefix + "_KEY_ID"]: "test-key-id",
      [prefix + "_APP_KEY"]: "test-app-key",
      [prefix + "_BUCKET_ID"]: "test-bucket-id",
      [prefix + "_ENDPOINT"]: "https://example.com",
    });
    expect(result.configurationStatus).toBe("misconfigured");
    expect(result.missingSecretNames).toEqual(["VALID_BACKBLAZE_HTTPS_ENDPOINT"]);
  });

  it("rejects invalid destination metadata", () => {
    expect(() => validateStorageDestinationMetadata({})).toThrow();
  });
});
