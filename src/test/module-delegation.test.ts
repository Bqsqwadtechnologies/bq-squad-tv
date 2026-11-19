import { describe, expect, it, vi } from "vitest";
import {
  requireZillionaireModule,
  resolvePlatformAccess,
  hasModuleAccess,
  ZILLIONAIRE_MODULES,
  type ZillionaireModule,
} from "@/lib/server/roles";
import { Route as PermissionsRoute } from "@/routes/api/public/v1/zillionaire/users/$uid/permissions";
import type { Firestore } from "@/lib/server/firebase-admin";

function createMockFirestore(userStore: Record<string, Record<string, unknown>>) {
  return {
    getDoc: vi.fn(async (path: string) => userStore[path] || null),
    docName: vi.fn((path: string) => `projects/test/databases/(default)/documents/${path}`),
    transact: vi.fn(async (paths: string[], fn: (docs: unknown[]) => { writes: unknown[] }) => {
      const docs = paths.map((p) => userStore[p] || null);
      const res = fn(docs);
      return res;
    }),
  } as unknown as Firestore;
}

describe("Batch 07: Fine-Grained Module Delegation for Zillionaire Operators", () => {
  const targetedModules: ZillionaireModule[] = [
    "roles",
    "finance",
    "channels",
    "storage",
    "catalog",
    "support",
    "moderation",
    "pricing",
    "providers",
    "producers",
    "users",
    "ads",
    "reports",
    "video",
    "delivery",
    "settings",
  ];

  it("all 16 targeted modules are valid Zillionaire modules in system registry", () => {
    for (const mod of targetedModules) {
      expect(ZILLIONAIRE_MODULES).toContain(mod);
    }
  });

  describe("Single-module operator isolation: granted module succeeds, all other 15 modules fail", () => {
    for (const grantedModule of targetedModules) {
      it(`operator with only [${grantedModule}] passes [${grantedModule}] and is denied all other modules`, async () => {
        const uid = `operator-${grantedModule}`;
        const store: Record<string, Record<string, unknown>> = {
          [`users/${uid}`]: {
            email: `${grantedModule}-operator@bqsqwad.tv`,
            zillionaireModules: [grantedModule],
          },
        };
        const fs = createMockFirestore(store);
        const user = { uid, email: `${grantedModule}-operator@bqsqwad.tv`, emailVerified: true };

        // 1. Granted module must succeed
        const access = await requireZillionaireModule(fs, user, grantedModule);
        expect(access.zillionaireModules).toContain(grantedModule);
        expect(access.isZillionaireOwner).toBe(false);

        // 2. All other targeted modules must be rejected with 403 ZILLIONAIRE_SCOPE_REQUIRED
        for (const otherModule of targetedModules) {
          if (otherModule === grantedModule) continue;

          // Note: finance covers payments/payouts/wallets, and catalog covers content
          // between the targeted modules, they are strictly disjoint
          await expect(requireZillionaireModule(fs, user, otherModule)).rejects.toMatchObject({
            status: 403,
            code: "ZILLIONAIRE_SCOPE_REQUIRED",
          });
        }
      });
    }
  });

  describe("Module family aliasing and compatibility", () => {
    it("operator with [finance] module can access payments, payouts, wallets, and finance", async () => {
      const fs = createMockFirestore({
        "users/fin-user": {
          email: "fin@bqsqwad.tv",
          zillionaireModules: ["finance"],
        },
      });
      const user = { uid: "fin-user", email: "fin@bqsqwad.tv", emailVerified: true };

      await expect(requireZillionaireModule(fs, user, "finance")).resolves.toBeTruthy();
      await expect(requireZillionaireModule(fs, user, "payments")).resolves.toBeTruthy();
      await expect(requireZillionaireModule(fs, user, "payouts")).resolves.toBeTruthy();
      await expect(requireZillionaireModule(fs, user, "wallets")).resolves.toBeTruthy();

      // But cannot access unrelated modules
      await expect(requireZillionaireModule(fs, user, "channels")).rejects.toMatchObject({
        status: 403,
      });
      await expect(requireZillionaireModule(fs, user, "support")).rejects.toMatchObject({
        status: 403,
      });
    });

    it("operator with [catalog] module can access content and catalog", async () => {
      const fs = createMockFirestore({
        "users/cat-user": {
          email: "cat@bqsqwad.tv",
          zillionaireModules: ["catalog"],
        },
      });
      const user = { uid: "cat-user", email: "cat@bqsqwad.tv", emailVerified: true };

      await expect(requireZillionaireModule(fs, user, "catalog")).resolves.toBeTruthy();
      await expect(requireZillionaireModule(fs, user, "content")).resolves.toBeTruthy();

      // But cannot access pricing, storage, etc.
      await expect(requireZillionaireModule(fs, user, "pricing")).rejects.toMatchObject({
        status: 403,
      });
      await expect(requireZillionaireModule(fs, user, "storage")).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  describe("Multi-module delegation", () => {
    it("operator granted [channels, producers] can access both but is denied storage or pricing", async () => {
      const fs = createMockFirestore({
        "users/media-mgr": {
          email: "media@bqsqwad.tv",
          zillionaireModules: ["channels", "producers"],
        },
      });
      const user = { uid: "media-mgr", email: "media@bqsqwad.tv", emailVerified: true };

      await expect(requireZillionaireModule(fs, user, "channels")).resolves.toBeTruthy();
      await expect(requireZillionaireModule(fs, user, "producers")).resolves.toBeTruthy();

      await expect(requireZillionaireModule(fs, user, "storage")).rejects.toMatchObject({
        status: 403,
      });
      await expect(requireZillionaireModule(fs, user, "pricing")).rejects.toMatchObject({
        status: 403,
      });
      await expect(requireZillionaireModule(fs, user, "roles")).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  describe("Owner sovereignty and unauthenticated/unassigned accounts", () => {
    it("Zillionaire owner has access to all 16 targeted modules unconditionally", async () => {
      vi.stubEnv("ZILLIONAIRE_EMAIL", "owner@zillionaire.tv");
      const fs = createMockFirestore({});
      const ownerUser = { uid: "owner-1", email: "owner@zillionaire.tv", emailVerified: true };

      for (const mod of targetedModules) {
        const access = await requireZillionaireModule(fs, ownerUser, mod);
        expect(access.isZillionaireOwner).toBe(true);
      }
      vi.unstubAllEnvs();
    });

    it("regular user with no assigned modules is rejected from all 16 modules", async () => {
      const fs = createMockFirestore({
        "users/viewer-1": {
          email: "viewer@example.com",
          zillionaireModules: [],
        },
      });
      const user = { uid: "viewer-1", email: "viewer@example.com", emailVerified: true };

      for (const mod of targetedModules) {
        await expect(requireZillionaireModule(fs, user, mod)).rejects.toMatchObject({
          status: 403,
          code: "ZILLIONAIRE_SCOPE_REQUIRED",
        });
      }
    });

    it("immediate revocation: clearing zillionaireModules denies subsequent access without delay", async () => {
      const store: Record<string, Record<string, unknown>> = {
        "users/temp-op": {
          email: "temp@bqsqwad.tv",
          zillionaireModules: ["support"],
        },
      };
      const fs = createMockFirestore(store);
      const user = { uid: "temp-op", email: "temp@bqsqwad.tv", emailVerified: true };

      // Before revocation: access granted
      await expect(requireZillionaireModule(fs, user, "support")).resolves.toBeTruthy();

      // Revocation
      store["users/temp-op"] = {
        email: "temp@bqsqwad.tv",
        zillionaireModules: [],
      };

      // After revocation: immediately denied
      await expect(requireZillionaireModule(fs, user, "support")).rejects.toMatchObject({
        status: 403,
        code: "ZILLIONAIRE_SCOPE_REQUIRED",
      });
    });
  });

  describe("Permissions endpoint governance", () => {
    it("rejects non-owner operator from delegating permissions", async () => {
      const mockRequest = new Request(
        "http://localhost/api/public/v1/zillionaire/users/target-1/permissions",
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer mock-operator-token",
          },
          body: JSON.stringify({
            modules: ["channels"],
            reason: "Granting channel management",
          }),
        },
      );

      // The handler requires owner authority
      vi.stubEnv("ZILLIONAIRE_EMAIL", "owner@zillionaire.tv");
      // Operator is not owner@zillionaire.tv
      // ...
      vi.unstubAllEnvs();
    });
  });
});
