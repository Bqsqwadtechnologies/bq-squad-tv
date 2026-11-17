import { describe, expect, it } from "vitest";
import { ApiError, decodeFields, Firestore } from "../firebase-admin";
import {
  estimatePlaybackProgressBytes,
  estimateExpectedPlaybackBytes,
  recordExpectedStorageEgressProgress,
  releaseExpectedStorageEgress,
  reserveExpectedStorageEgress,
} from "./expected-egress";
import type { StorageDestinationMetadata } from "./registry";

function fakeFirestore() {
  const docs = new Map<string, Record<string, unknown>>();
  const fs = {
    async getDoc(path: string) { return docs.get(path) ?? null; },
    async setDoc(path: string, fields: Record<string, unknown>) { docs.set(path, fields); },
    docName(path: string) { return "projects/test/databases/(default)/documents/" + path; },
    async transact(paths: string[], callback: (values: Array<Record<string, unknown> | null>) => unknown) {
      const result = await callback(paths.map(path => docs.get(path) ?? null)) as {
        result: unknown; writes: Array<Record<string, unknown>>;
      };
      for (const write of result.writes) {
        const update = write["update"] as { name: string; fields: Record<string, never> };
        const path = update.name.split("/documents/").pop()!;
        if ((write["currentDocument"] as { exists?: boolean } | undefined)?.exists === false && docs.has(path)) {
          throw new ApiError(409, "CONFLICT", "Already exists.");
        }
        const fields = decodeFields(update.fields as never);
        const mask = write["updateMask"] as { fieldPaths?: string[] } | undefined;
        if (mask?.fieldPaths) {
          const current = docs.get(path) ?? {};
          for (const key of mask.fieldPaths) current[key] = fields[key];
          docs.set(path, current);
        } else docs.set(path, fields);
      }
      return result.result;
    },
  };
  return { fs: fs as unknown as Firestore, docs };
}

const metadata = {
  destinationId: "b2-egress-01", accountGroup: "b2:egress-account",
  freeEgressBudgetBytes: 100, dailyEgressCapBytes: 100,
  paidEgressEnabled: false,
} as StorageDestinationMetadata;

describe("expected playback egress", () => {
  it("estimates a bounded first playback window and a conservative asset fallback", () => {
    expect(estimatePlaybackProgressBytes(1_500_000, 120)).toBe(24_750_000);
    expect(estimateExpectedPlaybackBytes({ streamBytes: 100_000_000 })).toBe(110_000_000);
    expect(estimateExpectedPlaybackBytes({})).toBe(1_485_000_000);
  });

  it("warns at 70%, throttles new sessions at 85%, and blocks at 95%", async () => {
    const { fs, docs } = fakeFirestore();
    const first = await reserveExpectedStorageEgress(fs, metadata, "egress-session-01", 70);
    expect(first.level).toBe("warn");
    expect(first.qualityCap).toBeNull();
    const second = await reserveExpectedStorageEgress(fs, metadata, "egress-session-02", 15);
    expect(second.level).toBe("throttle");
    expect(second.qualityCap).toBe(480);
    await expect(reserveExpectedStorageEgress(fs, metadata, "egress-session-03", 10))
      .rejects.toMatchObject({ code: "STORAGE_EGRESS_LIMIT_REACHED" });
    expect([...docs.values()].some(value => value["reasonCode"] === "STORAGE_EGRESS_BLOCKED")).toBe(true);
  });

  it("uses the monthly budget as the daily ceiling when no provider daily cap exists", async () => {
    const { fs } = fakeFirestore();
    const monthlyOnly = {
      ...metadata,
      dailyEgressCapBytes: null,
      freeEgressBudgetBytes: 100,
      accountGroup: "lovable:monthly-only",
      destinationId: "lov-monthly-only",
    } as StorageDestinationMetadata;
    const result = await reserveExpectedStorageEgress(fs, monthlyOnly, "egress-monthly-01", 70);
    expect(result.level).toBe("warn");
    expect(result.qualityCap).toBeNull();
  });

  it("rejects different monthly or daily budgets inside one shared account group", async () => {
    const { fs } = fakeFirestore();
    await reserveExpectedStorageEgress(fs, metadata, "egress-budget-01", 10);
    await expect(reserveExpectedStorageEgress(fs, {
      ...metadata,
      freeEgressBudgetBytes: 200,
    } as StorageDestinationMetadata, "egress-budget-02", 10))
      .rejects.toMatchObject({ code: "EGRESS_ACCOUNT_CONFIGURATION_MISMATCH" });
  });

  it("tracks heartbeat progress in the reserved window and adds extra expected bytes after it", async () => {
    const { fs, docs } = fakeFirestore();
    await reserveExpectedStorageEgress(fs, metadata, "egress-progress-01", 20);
    await recordExpectedStorageEgressProgress(fs, "egress-progress-01", 1, 10);
    const statePath = "storageEgressState/b2%3Aegress-account";
    expect(docs.get(statePath)?.["monthExpectedBytes"]).toBe(20);
    await recordExpectedStorageEgressProgress(fs, "egress-progress-01", 2, 20);
    expect(docs.get(statePath)?.["monthExpectedBytes"]).toBe(30);
    expect(docs.get(statePath)?.["monthConsumedBytes"]).toBe(30);
    expect(docs.get(statePath)?.["monthReservedBytes"]).toBe(0);
  });

  it("releases unused grant bytes when a session ends", async () => {
    const { fs, docs } = fakeFirestore();
    await reserveExpectedStorageEgress(fs, metadata, "egress-release-01", 20);
    await releaseExpectedStorageEgress(fs, "egress-release-01");
    const state = docs.get("storageEgressState/b2%3Aegress-account");
    expect(state?.["monthExpectedBytes"]).toBe(0);
    expect(state?.["monthReservedBytes"]).toBe(0);
  });
});
