import { describe, expect, it } from "vitest";
import { ApiError } from "../firebase-admin";
import {
  accumulateStorageUsage,
  checkStorageProviderHealth,
  readStorageUsagePage,
  isStorageQuotaOrRateLimit,
  storageFailureCode,
  storageFailureMessage,
  markStorageDestinationDegraded,
} from "./maintenance";

describe("storage maintenance accounting", () => {
  it("sums paginated object sizes without treating unknown data as zero", () => {
    expect(accumulateStorageUsage(100, 2, [
      { key: "one.ts", sizeBytes: 300 },
      { key: "two.ts", sizeBytes: 400 },
    ])).toEqual({ usageBytes: 800, objectCount: 4 });
  });

  it("rejects invalid sizes and counter overflow", () => {
    expect(() => accumulateStorageUsage(0, 0, [{ key: "bad", sizeBytes: -1 }])).toThrow();
    expect(() => accumulateStorageUsage(Number.MAX_SAFE_INTEGER, 0, [
      { key: "overflow", sizeBytes: 1 },
    ])).toThrow();
  });

  it("runs health and paginated usage through a fake provider adapter", async () => {
    const calls: string[] = [];
    const fakeAdapter = {
      async healthCheck() {
        calls.push("health");
        return { healthy: true as const };
      },
      async listObjects(_prefix: string, cursor: string | null) {
        calls.push(cursor ?? "first-page");
        return cursor === null
          ? { objects: [{ key: "one.ts", sizeBytes: 10 }], nextCursor: "page-2" }
          : { objects: [{ key: "two.ts", sizeBytes: 20 }], nextCursor: null };
      },
    };
    expect(await checkStorageProviderHealth(fakeAdapter)).toEqual({ healthy: true });
    const first = await readStorageUsagePage(fakeAdapter, null, 0, 0);
    const second = await readStorageUsagePage(fakeAdapter, first.nextCursor, first.usageBytes, first.objectCount);
    expect(first).toEqual({ usageBytes: 10, objectCount: 1, nextCursor: "page-2" });
    expect(second).toEqual({ usageBytes: 30, objectCount: 2, nextCursor: null });
    expect(calls).toEqual(["health", "first-page", "page-2"]);
  });

  it("marks only quota, payment-required and rate-limit errors for the 24-hour degraded state", () => {
    expect(isStorageQuotaOrRateLimit("STORAGE_PROVIDER_QUOTA")).toBe(true);
    expect(isStorageQuotaOrRateLimit("STORAGE_PROVIDER_PAYMENT_REQUIRED")).toBe(true);
    expect(isStorageQuotaOrRateLimit("STORAGE_PROVIDER_RATE_LIMITED")).toBe(true);
    expect(isStorageQuotaOrRateLimit("STORAGE_PROVIDER_UNAVAILABLE")).toBe(false);
  });

  it("marks quota failures degraded for 24 hours and creates an owner alert", async () => {
    const patches: Array<{ path: string; fields: Record<string, unknown> }> = [];
    const alerts: Array<{ path: string; fields: Record<string, unknown> }> = [];
    const fakeFs = {
      async getDoc(path: string) {
        return path === "storageDestinations/lov-001" ? { accountGroup: "lovable:project" } : null;
      },
      async patchDoc(path: string, fields: Record<string, unknown>) { patches.push({ path, fields }); },
      async setDoc(path: string, fields: Record<string, unknown>) { alerts.push({ path, fields }); },
    };
    const marked = await markStorageDestinationDegraded(
      fakeFs as never,
      "lov-001",
      new ApiError(429, "STORAGE_PROVIDER_QUOTA", "private provider response"),
    );
    expect(marked).toBe(true);
    expect(patches[0]?.fields["healthStatus"]).toBe("degraded");
    expect(patches[0]?.fields["lastErrorCode"]).toBe("STORAGE_PROVIDER_QUOTA");
    const until = Date.parse(String(patches[0]?.fields["degradedUntil"]));
    expect(until - Date.now()).toBeGreaterThan(23 * 60 * 60_000);
    expect(until - Date.now()).toBeLessThanOrEqual(24 * 60 * 60_000);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.fields["message"]).not.toContain("private provider response");
  });

  it("uses safe error wording and does not surface provider response text", () => {
    const error = new ApiError(429, "STORAGE_PROVIDER_RATE_LIMITED", "raw secret key must not be returned");
    const code = storageFailureCode(error);
    expect(code).toBe("STORAGE_PROVIDER_RATE_LIMITED");
    expect(storageFailureMessage(code)).toBe("The storage provider temporarily limited requests.");
    expect(storageFailureMessage(code)).not.toContain("raw secret key");
  });
});


describe("fake provider maintenance adapter", () => {
  it("reconciles a multi-page bucket listing and sums every object once", async () => {
    const pages = [
      { objects: [{ key: "a.mp4", sizeBytes: 100 }, { key: "b.mp4", sizeBytes: 200 }], nextCursor: "page-2" },
      { objects: [{ key: "c.m3u8", sizeBytes: 50 }], nextCursor: "page-3" },
      { objects: [{ key: "d.ts", sizeBytes: 150 }], nextCursor: null },
    ];
    const calls: Array<string | null> = [];
    const adapter = {
      async listObjects(_prefix: string, cursor: string | null) {
        calls.push(cursor);
        const index = cursor === null ? 0 : cursor === "page-2" ? 1 : 2;
        return pages[index]!;
      },
    };
    const { reconcileStorageUsage } = await import("./maintenance");
    await expect(reconcileStorageUsage(adapter)).resolves.toEqual({ usageBytes: 500, objectCount: 4 });
    expect(calls).toEqual([null, "page-2", "page-3"]);
  });

  it("rejects a repeated provider cursor instead of looping forever", async () => {
    const adapter = {
      async listObjects() {
        return { objects: [{ key: "a.ts", sizeBytes: 1 }], nextCursor: "same" };
      },
    };
    const { reconcileStorageUsage } = await import("./maintenance");
    await expect(reconcileStorageUsage(adapter)).rejects.toMatchObject({ code: "STORAGE_LISTING_CURSOR_STALLED" });
  });
});
