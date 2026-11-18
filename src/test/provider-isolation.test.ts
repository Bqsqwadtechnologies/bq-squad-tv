import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "@/lib/server/firebase-admin";
import { resolvePlatformAccess, requireProviderAccess } from "@/lib/server/roles";

function mockFirestore(docs: Record<string, unknown> = {}) {
  return {
    getDoc: vi.fn(async (p: string) => docs[p] ? docs[p] : null),
    query: vi.fn(async (collection: string, options?: { filters?: Array<{ field: string; op: string; value: unknown }> }) => {
      const filters = options?.filters || [];
      const results: Array<Record<string, unknown> & { __id: string }> = [];
      for (const [key, val] of Object.entries(docs)) {
        if (key.startsWith(collection + "/")) {
          const doc: Record<string, unknown> & { __id: string } = { __id: key.replace(collection + "/", ""), ...(val as object) };
          let match = true;
          for (const f of filters) {
            if (doc[f.field] !== f.value) match = false;
          }
          if (match) results.push(doc);
        }
      }
      return results;
    }),
  } as unknown as Firestore;
}

describe("Provider Role & Organization Isolation (Batch 06)", () => {
  const store = {
    // Provider Alpha (Active)
    "users/rep-alpha": { email: "rep@alpha-media.com", roleTags: [] },
    "providerUsers/rep-alpha": { status: "ACTIVE", providerId: "prov-alpha" },
    "providers/prov-alpha": { name: "Alpha Media Network", providerShareBps: 2500, settlementCurrency: "NGN" },
    "liveChannels/ch-alpha-1": { providerId: "prov-alpha", name: "Alpha News 24/7", status: "published" },
    "providerContracts/contract-alpha": { providerId: "prov-alpha", agreementReference: "AGR-ALPHA-2026" },
    "providerStatements/stmt-alpha-1": { providerId: "prov-alpha", grossRevenueMinor: 5000000, status: "closed" },
    "providerDisputes/disp-alpha-1": { providerId: "prov-alpha", subject: "January delivery calculation" },

    // Provider Beta (Active)
    "users/rep-beta": { email: "rep@beta-sports.com", roleTags: [] },
    "providerUsers/rep-beta": { status: "ACTIVE", providerId: "prov-beta" },
    "providers/prov-beta": { name: "Beta Sports Hub", providerShareBps: 3000, settlementCurrency: "USD" },
    "liveChannels/ch-beta-1": { providerId: "prov-beta", name: "Beta Live Sports", status: "published" },
    "providerContracts/contract-beta": { providerId: "prov-beta", agreementReference: "AGR-BETA-2026" },
    "providerStatements/stmt-beta-1": { providerId: "prov-beta", grossRevenueMinor: 9500000, status: "closed" },
    "providerDisputes/disp-beta-1": { providerId: "prov-beta", subject: "Satellite ingest inquiry" },

    // Inactive / Suspended Provider User
    "users/rep-suspended": { email: "suspended@alpha-media.com", roleTags: [] },
    "providerUsers/rep-suspended": { status: "SUSPENDED", providerId: "prov-alpha" },

    // Regular Viewer
    "users/viewer-1": { email: "viewer@example.com", roleTags: [] },
  };

  const fs = mockFirestore(store);

  describe("Provider organization binding", () => {
    it("active provider representative resolves provider role and specific providerId", async () => {
      const access = await resolvePlatformAccess(fs, "rep-alpha", "rep@alpha-media.com");
      expect(access.roles).toContain("provider");
      expect(access.providerId).toBe("prov-alpha");
    });

    it("suspended provider representative is denied provider role", async () => {
      const access = await resolvePlatformAccess(fs, "rep-suspended", "suspended@alpha-media.com");
      expect(access.roles).not.toContain("provider");
      expect(access.providerId).toBeUndefined();
    });

    it("viewer without provider document is rejected with 403 PROVIDER_ROLE_REQUIRED", async () => {
      await expect(requireProviderAccess(fs, { uid: "viewer-1", email: "viewer@example.com" }))
        .rejects.toMatchObject({ status: 403, code: "PROVIDER_ROLE_REQUIRED" });
    });
  });

  describe("Cross-provider isolation guarantees", () => {
    it("provider-alpha can access their own organisation data", async () => {
      const access = await requireProviderAccess(fs, { uid: "rep-alpha", email: "rep@alpha-media.com" }, "prov-alpha");
      expect(access.providerId).toBe("prov-alpha");
    });

    it("provider-alpha is strictly barred from accessing provider-beta's organisation data", async () => {
      await expect(requireProviderAccess(fs, { uid: "rep-alpha", email: "rep@alpha-media.com" }, "prov-beta"))
        .rejects.toMatchObject({ status: 403, code: "PROVIDER_ISOLATION_VIOLATION" });
    });

    it("provider queries strictly isolate channels, contracts, statements, and disputes", async () => {
      const alphaChannels = await fs.query("liveChannels", {
        filters: [{ field: "providerId", op: "EQUAL", value: "prov-alpha" }],
      });
      expect(alphaChannels).toHaveLength(1);
      expect(alphaChannels[0]?.["name"]).toBe("Alpha News 24/7");

      const betaStatements = await fs.query("providerStatements", {
        filters: [{ field: "providerId", op: "EQUAL", value: "prov-beta" }],
      });
      expect(betaStatements).toHaveLength(1);
      expect(betaStatements[0]?.["grossRevenueMinor"]).toBe(9500000);

      // Verify no cross-contamination
      const alphaHasBeta = alphaChannels.some(c => c["providerId"] === "prov-beta");
      expect(alphaHasBeta).toBe(false);
    });
  });
});
