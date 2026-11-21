import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ManualKycVerifier,
  ExternalKycVerifierAdapter,
  getKycVerifier,
} from "@/lib/server/kyc/verifier";
import { saveKycProfile, getKycProfile } from "@/lib/server/kyc/persistence";
import { Firestore } from "@/lib/server/firebase-admin";

// Create in-memory mock Firestore
function createMockFs() {
  const store = new Map<string, any>();
  return {
    getDoc: vi.fn(async (path: string) => (store.has(path) ? structuredClone(store.get(path)) : null)),
    setDoc: vi.fn(async (path: string, data: any) => {
      store.set(path, structuredClone(data));
    }),
    patchDoc: vi.fn(async (path: string, data: any) => {
      const prev = store.get(path) || {};
      store.set(path, { ...prev, ...structuredClone(data) });
    }),
    transact: vi.fn(async (fn: (txn: any) => Promise<any>) => {
      const txn = {
        get: async (path: string) => (store.has(path) ? structuredClone(store.get(path)) : null),
        set: async (path: string, data: any) => {
          store.set(path, structuredClone(data));
        },
        update: async (path: string, data: any) => {
          const prev = store.get(path) || {};
          store.set(path, { ...prev, ...structuredClone(data) });
        },
      };
      return await fn(txn);
    }),
    _store: store,
  } as unknown as Firestore;
}

describe("Batch C1 — KYC Verification Provider Adapter", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env["KYC_FIELD_ENCRYPTION_KEY"] = "12345678901234567890123456789012";
    process.env["KYC_VAULT_SIGNING_SECRET"] = "signing-secret-at-least-32-bytes-long-12345";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("ManualKycVerifier evaluates documents, face match, liveness and sanctions into manual queue", async () => {
    const verifier = new ManualKycVerifier();
    expect(verifier.name).toBe("manual");

    const result = await verifier.evaluateCase({
      uid: "user_test_manual_1",
      role: "producer",
      fullName: "Jane Doe",
      countryCode: "NG",
      idNumber: "12345678901",
      documentVaultPaths: {
        id_front: "kyc-vault/tenants/ng/id_front_123.pdf",
        selfie_face: "kyc-vault/tenants/ng/selfie_123.jpg",
        liveness_video: "kyc-vault/tenants/ng/liveness_123.mp4",
      },
      dateOfBirth: "1990-01-01",
    });

    expect(result.provider).toBe("manual");
    expect(result.status).toBe("manual_review_required");
    expect(result.fallbackToManual).toBe(false);
    expect(result.manualReviewRequired).toBe(true);
    expect(result.overallScore).toBeGreaterThanOrEqual(50);
    expect(result.checks.documentCheck?.documentAuthentic).toBe(true);
    expect(result.checks.faceMatch?.passed).toBe(true);
    expect(result.checks.liveness?.passed).toBe(true);
    expect(result.checks.sanctionsPep?.passed).toBe(true);
  });

  it("ExternalKycVerifierAdapter falls back gracefully if API key is not configured without blocking", async () => {
    delete process.env["KYC_VERIFIER_API_KEY"];
    const adapter = new ExternalKycVerifierAdapter({ apiKey: "" });

    const result = await adapter.evaluateCase({
      uid: "user_test_ext_unconfigured",
      role: "producer",
      fullName: "John Smith",
      countryCode: "US",
      idNumber: "123-45-6789",
    });

    expect(result.fallbackToManual).toBe(true);
    expect(result.manualReviewRequired).toBe(true);
    expect(result.status).toBe("manual_review_required");
    expect(result.ownerNotice).toBe("automatic check unavailable");
    expect(result.reasons[0]).toContain("API key is not configured");
  });

  it("ExternalKycVerifierAdapter NEVER blocks user when external provider throws network error or times out", async () => {
    const adapter = new ExternalKycVerifierAdapter({
      apiKey: "test_ext_key_xyz",
      endpoint: "https://mock-failing-provider.example.com",
    });

    // Mock fetch throwing network connection drop
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED - Provider host unreachable"));

    const result = await adapter.evaluateCase({
      uid: "user_test_ext_failing",
      role: "provider",
      fullName: "Acme Streaming Corp",
      countryCode: "GB",
      companyRegNumber: "01234567",
    });

    // CRITICAL: verify fallbackToManual is true, and owner notice is "automatic check unavailable"
    expect(result.fallbackToManual).toBe(true);
    expect(result.status).toBe("manual_review_required");
    expect(result.manualReviewRequired).toBe(true);
    expect(result.ownerNotice).toBe("automatic check unavailable");
    expect(result.fallbackReason).toContain("automatic check unavailable");
  });

  it("ExternalKycVerifierAdapter maps successful provider response and preserves owner final decision", async () => {
    const adapter = new ExternalKycVerifierAdapter({
      apiKey: "test_ext_key_xyz",
      endpoint: "https://mock-provider.example.com",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "passed",
        overallScore: 94,
        reasons: ["Document security features verified", "Liveness confirmed"],
        checks: {
          documentCheck: { passed: true, score: 95, documentAuthentic: true, classificationMatch: true },
          faceMatch: { passed: true, score: 92, similarityPercentage: 96 },
          liveness: { passed: true, score: 95, livenessConfidence: 0.98, spoofRisk: "low" },
          sanctionsPep: { passed: true, isPep: false, isSanctioned: false, matches: [] },
        },
      }),
    } as any);

    const result = await adapter.evaluateCase({
      uid: "user_test_ext_success",
      role: "producer",
      fullName: "Alice Wonder",
      countryCode: "CA",
    });

    expect(result.fallbackToManual).toBe(false);
    expect(result.status).toBe("passed");
    expect(result.overallScore).toBe(94);
    expect(result.manualReviewRequired).toBe(true); // Owner retains final decision
    expect(result.checks.documentCheck?.score).toBe(95);
  });

  it("getKycVerifier factory respects feature flag and configuration", () => {
    delete process.env["FEATURE_EXTERNAL_KYC_VERIFIER"];
    delete process.env["KYC_VERIFIER_API_KEY"];

    const defaultVerifier = getKycVerifier();
    expect(defaultVerifier.name).toBe("manual");

    process.env["FEATURE_EXTERNAL_KYC_VERIFIER"] = "true";
    process.env["KYC_VERIFIER_API_KEY"] = "valid-key-1234";

    const externalVerifier = getKycVerifier();
    expect(externalVerifier.name).toBe("external-provider");
  });

  it("persists verifierResult on KycProfile in storage and retrieves it intact", async () => {
    const mockFs = createMockFs();

    const manualResult = await new ManualKycVerifier().evaluateCase({
      uid: "user_test_persistence",
      role: "producer",
      fullName: "Test User",
      countryCode: "NG",
    });

    await saveKycProfile(mockFs, {
      uid: "user_test_persistence",
      role: "producer",
      kycType: "producer_personal",
      kycCountry: "NG",
      legalName: "Test User",
      verifierResult: manualResult,
    });

    const saved = await getKycProfile(mockFs, "user_test_persistence");
    expect(saved).not.toBeNull();
    expect(saved?.verifierResult).toBeDefined();
    expect(saved?.verifierResult?.provider).toBe("manual");
    expect(saved?.verifierResult?.status).toBe("manual_review_required");
    expect(saved?.verifierResult?.manualReviewRequired).toBe(true);
  });
});
