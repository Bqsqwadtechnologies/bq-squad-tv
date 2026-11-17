import { describe, expect, it } from "vitest";
import { ApiError } from "../firebase-admin";
import {
  accumulateStorageUsage,
  isStorageQuotaOrRateLimit,
  storageFailureCode,
  storageFailureMessage,
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

  it("marks only quota, payment-required and rate-limit errors for the 24-hour degraded state", () => {
    expect(isStorageQuotaOrRateLimit("STORAGE_PROVIDER_QUOTA")).toBe(true);
    expect(isStorageQuotaOrRateLimit("STORAGE_PROVIDER_PAYMENT_REQUIRED")).toBe(true);
    expect(isStorageQuotaOrRateLimit("STORAGE_PROVIDER_RATE_LIMITED")).toBe(true);
    expect(isStorageQuotaOrRateLimit("STORAGE_PROVIDER_UNAVAILABLE")).toBe(false);
  });

  it("uses safe error wording and does not surface provider response text", () => {
    const error = new ApiError(429, "STORAGE_PROVIDER_RATE_LIMITED", "raw secret key must not be returned");
    const code = storageFailureCode(error);
    expect(code).toBe("STORAGE_PROVIDER_RATE_LIMITED");
    expect(storageFailureMessage(code)).toBe("The storage provider temporarily limited requests.");
    expect(storageFailureMessage(code)).not.toContain("raw secret key");
  });
});
