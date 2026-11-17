import { describe, expect, it } from "vitest";
import { decryptStorageConfigurationBackup, encryptStorageConfigurationBackup } from "./config-backup";

const sample = {
  version: 1 as const,
  createdAt: "2026-11-17T00:00:00.000Z",
  destinations: [{ destinationId: "lov-001", accountGroup: "lovable-project" }],
  poolIndex: [{ purpose: "hls_streaming", shard: 0 }],
  assetBindings: [{ assetId: "asset-1", streamDestinationId: "lov-001" }],
  egressLedgers: [{ accountGroup: "lovable-project", monthBytes: 100 }],
};

describe("encrypted storage configuration backups", () => {
  it("round-trips the non-secret configuration", async () => {
    const encrypted = await encryptStorageConfigurationBackup(sample, "a-long-owner-managed-backup-secret-value");
    expect(encrypted).not.toContain("lov-001");
    await expect(decryptStorageConfigurationBackup(encrypted, "a-long-owner-managed-backup-secret-value")).resolves.toEqual(sample);
  });
  it("rejects the wrong key and secret-bearing payloads", async () => {
    const encrypted = await encryptStorageConfigurationBackup(sample, "a-long-owner-managed-backup-secret-value");
    await expect(decryptStorageConfigurationBackup(encrypted, "a-different-owner-managed-secret-value")).rejects.toThrow();
    await expect(encryptStorageConfigurationBackup({
      ...sample, destinations: [{ destinationId: "lov-001", serviceRoleKey: "must-not-be-exported" }],
    }, "a-long-owner-managed-backup-secret-value").then(value =>
      decryptStorageConfigurationBackup(value, "a-long-owner-managed-backup-secret-value"),
    )).rejects.toThrow();
  });
});
