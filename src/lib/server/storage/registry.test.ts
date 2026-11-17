import { describe, expect, it } from "vitest";
import {
  redactStorageDestination,
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
    accountGroup: "b2:account-01",
    mode: "active",
    replicaOf: null,
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

  it("supports account groups, drain mode, replicas and producer verification", () => {
    const value = validateStorageDestinationMetadata({
      ...metadata("STORAGE_B2_01"), purpose: "producer_verification",
      accountGroup: "b2:account-01", mode: "drain", replicaOf: "b2-primary-01",
    });
    expect(value.purpose).toBe("producer_verification");
    expect(value.accountGroup).toBe("b2:account-01");
    expect(value.mode).toBe("drain");
    expect(value.replicaOf).toBe("b2-primary-01");
  });

  it("keeps paid egress off and accepts an explicit shared account cap", () => {
    const value = validateStorageDestinationMetadata({
      ...metadata("STORAGE_B2_01"),
      accountCapBytes: 20_000_000_000,
      freeEgressBudgetBytes: 30_000_000_000,
    });
    expect(value.accountCapBytes).toBe(20_000_000_000);
    expect(value.paidEgressEnabled).toBe(false);
    expect(value.freeEgressBudgetBytes).toBe(30_000_000_000);
  });

  it("rejects invalid destination metadata", () => {
    expect(() => validateStorageDestinationMetadata({})).toThrow();
  });
});


describe("Lovable credential bundles", () => {
  const lovableMetadata = (destinationId: string, bucketName: string) => validateStorageDestinationMetadata({
    destinationId, providerType: "lovable_storage", accountAlias: "Lovable project",
    secretPrefix: "STORAGE_LOV_BUNDLE_01", bucketName, region: "africa-south1",
    purpose: "source_media", softCapBytes: 4_500_000_000, accountCapBytes: 4_500_000_000,
    dailyEgressCapBytes: null, priority: 10, enabled: true,
    accountGroup: "lovable:project-a", mode: "active", replicaOf: null,
  });

  it("resolves an item bundle by both destination id and bucket", () => {
    const key = "never-return-this-service-role-key";
    const config = resolveStorageDestinationConfiguration(lovableMetadata("lov-001", "bucket-a"), {
      STORAGE_LOV_BUNDLE_01: JSON.stringify({ items: [
        { destinationId: "lov-001", bucket: "bucket-a", url: "https://project-a.supabase.co", serviceRoleKey: key },
        { destinationId: "lov-002", bucket: "bucket-b", url: "https://project-a.supabase.co", serviceRoleKey: "another-private-key" },
      ] }),
    });
    expect(config.configurationStatus).toBe("configured");
    expect(config.credentials?.serviceRoleKey).toBe(key);
    expect(JSON.stringify(redactStorageDestination(config))).not.toContain(key);
    expect(JSON.stringify(redactStorageDestination(config))).not.toContain("project-a.supabase.co");
  });

  it("resolves the shared-project bundle form for an allowed bucket", () => {
    const config = resolveStorageDestinationConfiguration(lovableMetadata("lov-002", "bucket-b"), {
      STORAGE_LOV_BUNDLE_01: JSON.stringify({
        url: "https://project-a.supabase.co", serviceRoleKey: "private-key",
        buckets: ["bucket-a", "bucket-b"],
      }),
    });
    expect(config.configurationStatus).toBe("configured");
  });

  it("fails closed for malformed, oversized or non-matching bundles", () => {
    for (const bundle of [
      "{broken",
      JSON.stringify({ items: Array.from({ length: 26 }, (_, i) => ({
        destinationId: "lov-" + String(i).padStart(3, "0"), bucket: "bucket-" + i,
        url: "https://project-a.supabase.co", serviceRoleKey: "private-key",
      })) }),
      JSON.stringify({ items: [{ destinationId: "other-id", bucket: "bucket-a", url: "https://project-a.supabase.co", serviceRoleKey: "private-key" }] }),
      JSON.stringify({ url: "http://project-a.supabase.co", serviceRoleKey: "private-key", buckets: ["bucket-a"] }),
    ]) {
      const config = resolveStorageDestinationConfiguration(lovableMetadata("lov-001", "bucket-a"), {
        STORAGE_LOV_BUNDLE_01: bundle,
      });
      expect(config.configurationStatus).toBe("misconfigured");
      expect(config.credentials).toBeUndefined();
    }
  });

  it("accepts a shared-project bundle containing 326 bucket names", () => {
    const buckets = Array.from({ length: 326 }, (_, index) => "bucket-" + String(index + 1).padStart(3, "0"));
    const config = resolveStorageDestinationConfiguration(lovableMetadata("lov-326", "bucket-326"), {
      STORAGE_LOV_BUNDLE_01: JSON.stringify({
        url: "https://project-a.supabase.co",
        serviceRoleKey: "private-key",
        buckets,
      }),
    });
    expect(config.configurationStatus).toBe("configured");
  });

  it("reports a missing bundle by name without throwing or exposing values", () => {
    const config = resolveStorageDestinationConfiguration(lovableMetadata("lov-001", "bucket-a"), {});
    expect(config.configurationStatus).toBe("misconfigured");
    expect(config.missingSecretNames).toEqual(["STORAGE_LOV_BUNDLE_01"]);
  });
});


describe("provider listing usage state", () => {
  it("accepts provider_listing as the authoritative reconciliation source", () => {
    const metadata = validateStorageDestinationMetadata({
      destinationId: "lov-usage-01", providerType: "lovable_storage",
      accountAlias: "Lovable usage", secretPrefix: "STORAGE_LOV_BUNDLE_01",
      bucketName: "bucket-usage", region: "africa-south1", purpose: "source_media",
      softCapBytes: 4_500_000_000, accountCapBytes: 4_500_000_000,
      dailyEgressCapBytes: null, priority: 10, enabled: true,
      accountGroup: "lovable:project-a", mode: "active", replicaOf: null,
      usageBytes: 1234, usageSource: "provider_listing", usageCheckedAt: "2026-11-17T00:00:00.000Z",
    });
    expect(metadata.usageSource).toBe("provider_listing");
  });
});
