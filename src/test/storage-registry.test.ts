import { describe, expect, it } from "vitest";
import {
  isStorageDestinationEligible,
  redactStorageDestination,
  resolveStorageDestinationConfiguration,
  validateStorageDestinationMetadata,
} from "@/lib/server/storage/registry";

const lovable = () => validateStorageDestinationMetadata({
  destinationId: "lovable_source_01",
  providerType: "lovable_storage",
  accountAlias: "Lovable primary",
  secretPrefix: "LOVABLE_STORAGE_01",
  bucketName: "bq-sqwad-source-media",
  region: "africa-south1",
  purpose: "source_media",
  softCapBytes: 9_000_000_000,
  dailyEgressCapBytes: null,
  priority: 10,
  enabled: true,
  accountGroup: "lovable-default-workspace",
  mode: "active",
  replicaOf: null,
});

describe("storage destination registry", () => {
  it("keeps secret values out of the redacted destination response", () => {
    const metadata = lovable();
    const resolved = resolveStorageDestinationConfiguration(metadata, {
      LOVABLE_STORAGE_01_URL: "https://storage.example.test",
      LOVABLE_STORAGE_01_SERVICE_ROLE_KEY: "private-service-role-key",
    });
    const safe = JSON.stringify(redactStorageDestination(resolved));
    expect(resolved.configurationStatus).toBe("configured");
    expect(safe).not.toContain("private-service-role-key");
    expect(safe).not.toContain("storage.example.test");
  });

  it("marks missing secrets as misconfigured without exposing values", () => {
    const resolved = resolveStorageDestinationConfiguration(lovable(), {});
    expect(resolved.configurationStatus).toBe("misconfigured");
    expect(resolved.missingSecretNames).toEqual([
      "LOVABLE_STORAGE_01_URL",
      "LOVABLE_STORAGE_01_SERVICE_ROLE_KEY",
    ]);
  });

  it("rejects insecure endpoints and invalid metadata", () => {
    const metadata = validateStorageDestinationMetadata({
      ...lovable(),
      providerType: "backblaze_b2",
      secretPrefix: "B2_ACCOUNT_01",
    });
    const resolved = resolveStorageDestinationConfiguration(metadata, {
      B2_ACCOUNT_01_KEY_ID: "key-id",
      B2_ACCOUNT_01_APP_KEY: "application-key",
      B2_ACCOUNT_01_BUCKET_ID: "bucket-id",
      B2_ACCOUNT_01_ENDPOINT: "http://s3.us-west-004.backblazeb2.com",
    });
    expect(resolved.configurationStatus).toBe("misconfigured");
    expect(() => validateStorageDestinationMetadata({ ...lovable(), softCapBytes: -1 })).toThrow();
  });

  it("defaults legacy Lovable destinations into one workspace quota group", () => {
    const metadata = validateStorageDestinationMetadata({
      destinationId: "lovable_extra_02", providerType: "lovable_storage", accountAlias: "Extra bucket",
      secretPrefix: "LOVABLE_STORAGE_02", bucketName: "bucket-2", region: "africa-south1",
      purpose: "source_media", softCapBytes: 5_000_000_000, dailyEgressCapBytes: null,
      priority: 20, enabled: true,
    });
    expect(metadata.accountGroup).toBe("lovable-default-workspace");
  });

  it("does not route automatically when provider usage is unknown", () => {
    const resolved = resolveStorageDestinationConfiguration(lovable(), {
      LOVABLE_STORAGE_01_URL: "https://storage.example.test",
      LOVABLE_STORAGE_01_SERVICE_ROLE_KEY: "private-service-role-key",
    });
    expect(isStorageDestinationEligible(resolved, "source_media", 100, null)).toBe(false);
    expect(isStorageDestinationEligible(resolved, "source_media", 100, 8_999_999_000)).toBe(false);
    expect(isStorageDestinationEligible(resolved, "source_media", 100, 8_000_000_000)).toBe(true);
    const draining = validateStorageDestinationMetadata({ ...lovable(), mode: "drain" });
    const drainingResolved = resolveStorageDestinationConfiguration(draining, {
      LOVABLE_STORAGE_01_URL: "https://storage.example.test",
      LOVABLE_STORAGE_01_SERVICE_ROLE_KEY: "private-service-role-key",
    });
    expect(isStorageDestinationEligible(drainingResolved, "source_media", 100, 8_000_000_000)).toBe(false);
  });
});
