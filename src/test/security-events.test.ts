import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Route as EventsRoute } from "@/routes/api/public/v1/zillionaire/security/events";
import { Route as LookupActorRoute } from "@/routes/api/public/v1/zillionaire/security/lookup-actor";
import {
  hmacSha256Hex,
  getAuditHashKey,
  type AccessDenialEvent,
} from "@/lib/server/access-denials";
import { Firestore, decodeFields, type FirestoreValue } from "@/lib/server/firebase-admin";
import * as apiModule from "@/lib/server/api";

function createMemoryFirestore(): {
  fs: Firestore;
  storedDocs: Record<string, Record<string, unknown>>;
  queries: Array<{ collectionId: string; options: unknown }>;
} {
  const storedDocs: Record<string, Record<string, unknown>> = {};
  const queries: Array<{ collectionId: string; options: unknown }> = [];

  const fs = {
    docName: (path: string) => `projects/test-project/databases/(default)/documents/${path}`,
    getDoc: vi.fn(async (path: string) => {
      return storedDocs[path] ? { ...storedDocs[path] } : null;
    }),
    setDoc: vi.fn(async (path: string, fields: Record<string, unknown>) => {
      storedDocs[path] = { ...fields };
    }),
    patchDoc: vi.fn(async (path: string, fields: Record<string, unknown>) => {
      storedDocs[path] = { ...(storedDocs[path] || {}), ...fields };
    }),
    commit: vi.fn(async () => undefined),
    transact: vi.fn(
      async (
        paths: string[],
        fn: (
          docs: unknown[],
        ) =>
          | Promise<{ writes: Array<{ update?: { name: string; fields: unknown } }> }>
          | { writes: Array<{ update?: { name: string; fields: unknown } }> },
      ) => {
        const docs = paths.map((p) => storedDocs[p] || null);
        const res = await fn(docs);
        if (res && res.writes) {
          for (const w of res.writes) {
            if (w.update) {
              const name = w.update.name;
              const prefix = "projects/test-project/databases/(default)/documents/";
              const relPath = name.startsWith(prefix) ? name.slice(prefix.length) : name;
              // Decode simple fields representation
              storedDocs[relPath] = decodeFields(w.update.fields as Record<string, FirestoreValue>);
            }
          }
        }
        return res;
      },
    ),
    query: vi.fn(async (collectionId: string, options?: unknown) => {
      queries.push({ collectionId, options });
      const prefix = `${collectionId}/`;
      return Object.entries(storedDocs)
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, v]) => ({
          __id: k.slice(prefix.length),
          ...v,
        }));
    }),
  } as unknown as Firestore;

  return { fs, storedDocs, queries };
}

describe("Batch 10: Security Events & Hashed Actor Lookup", () => {
  const originalEnv = { ...process.env };
  const fixedDate = new Date("2026-11-18T14:30:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    process.env["AUDIT_HASH_KEY"] = "test-audit-hmac-secret-key-32bytes!";
    process.env["ZILLIONAIRE_EMAIL"] = "owner@zillionaire.tv";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("GET /api/public/v1/zillionaire/security/events", () => {
    it("rejects request if caller lacks security module access", async () => {
      const { fs, storedDocs } = createMemoryFirestore();
      storedDocs["users/operator-1"] = {
        email: "operator@example.com",
        zillionaireModules: ["pricing"], // lacks "security"
      };

      vi.spyOn(Firestore, "create").mockResolvedValue(fs);
      vi.spyOn(apiModule, "requireUser").mockResolvedValue({
        uid: "operator-1",
        email: "operator@example.com",
        emailVerified: true,
        authTime: Math.floor(Date.now() / 1000),
        issuedAt: Math.floor(Date.now() / 1000),
        customClaims: {},
      });

      const req = new Request("https://tv.bqsqwad.com/api/public/v1/zillionaire/security/events", {
        method: "GET",
      });

      // Call route handler
      const handler = (
        EventsRoute.options.server as unknown as {
          handlers: { GET: (ctx: { request: Request }) => Promise<Response> };
        }
      ).handlers.GET;
      const res = await handler({ request: req });
      expect(res.status).toBe(403);
      const json = (await res.json()) as { code: string };
      expect(json.code).toBe("ZILLIONAIRE_SCOPE_REQUIRED");
    });

    it("returns events and aggregated hourly counts for authorized caller", async () => {
      const { fs, storedDocs } = createMemoryFirestore();
      storedDocs["users/operator-sec"] = {
        email: "sec@example.com",
        zillionaireModules: ["security"],
      };

      // Populate some access denial events
      const event1: AccessDenialEvent = {
        id: "denial-1",
        time: "2026-11-18T14:10:00.000Z",
        actorHash: "hash1111111111111111111111111111111111111111111111111111111111111111",
        actorRoleClass: "viewer",
        routePattern: "/api/public/v1/zillionaire/overview",
        method: "GET",
        requiredRole: "admin",
        resourceKind: "admin_module",
        targetHash: null,
        reasonCode: "CROSS_ROLE_DENIED",
        coarseNetworkHash: "coarse1111",
        platformClass: "web",
        expiresAt: "2027-02-16T14:10:00.000Z",
      };

      const event2: AccessDenialEvent = {
        id: "denial-2",
        time: "2026-11-18T14:25:00.000Z",
        actorHash: "hash2222222222222222222222222222222222222222222222222222222222222222",
        actorRoleClass: "producer",
        routePattern: "/api/public/v1/zillionaire/pricing",
        method: "POST",
        requiredRole: "admin",
        resourceKind: "pricing",
        targetHash: null,
        reasonCode: "MISSING_MODULE",
        coarseNetworkHash: "coarse2222",
        platformClass: "android",
        expiresAt: "2027-02-16T14:25:00.000Z",
      };

      const event3: AccessDenialEvent = {
        id: "denial-3",
        time: "2026-11-18T10:00:00.000Z",
        actorHash: "hash3333333333333333333333333333333333333333333333333333333333333333",
        actorRoleClass: "provider",
        targetHash: null,
        routePattern: "/api/public/v1/provider/disputes",

        method: "GET",
        requiredRole: "provider:prov_target",
        resourceKind: "provider_dispute",
        reasonCode: "CROSS_TENANT_DENIED",
        coarseNetworkHash: "coarse3333",
        platformClass: "ios",
        expiresAt: "2027-02-16T10:00:00.000Z",
      };

      storedDocs["accessDenials/denial-1"] = { ...event1 };
      storedDocs["accessDenials/denial-2"] = { ...event2 };
      storedDocs["accessDenials/denial-3"] = { ...event3 };

      vi.spyOn(Firestore, "create").mockResolvedValue(fs);
      vi.spyOn(apiModule, "requireUser").mockResolvedValue({
        uid: "operator-sec",
        email: "sec@example.com",
        emailVerified: true,
        authTime: Math.floor(Date.now() / 1000),
        issuedAt: Math.floor(Date.now() / 1000),
        customClaims: {},
      });

      // 1. Query all without extra filter
      const reqAll = new Request(
        "https://tv.bqsqwad.com/api/public/v1/zillionaire/security/events?timeRange=all",
        {
          method: "GET",
        },
      );
      const handler = (
        EventsRoute.options.server as unknown as {
          handlers: { GET: (ctx: { request: Request }) => Promise<Response> };
        }
      ).handlers.GET;
      const resAll = await handler({ request: reqAll });
      expect(resAll.status).toBe(200);
      const dataAll = (await resAll.json()) as {
        events: AccessDenialEvent[];
        hourlyCounts: Array<{ hour: string; count: number }>;
        total: number;
      };

      expect(dataAll.total).toBe(3);
      expect(dataAll.events.length).toBe(3);
      // Hourly counts should group 2 events into 2026-11-18T14 and 1 event into 2026-11-18T10
      expect(dataAll.hourlyCounts).toEqual([
        { hour: "2026-11-18T14", count: 2 },
        { hour: "2026-11-18T10", count: 1 },
      ]);

      // 2. Filter by reason = "CROSS_ROLE_DENIED"
      const reqReason = new Request(
        "https://tv.bqsqwad.com/api/public/v1/zillionaire/security/events?timeRange=all&reason=CROSS_ROLE_DENIED",
        {
          method: "GET",
        },
      );
      const resReason = await handler({ request: reqReason });
      const dataReason = (await resReason.json()) as { events: AccessDenialEvent[]; total: number };
      expect(dataReason.total).toBe(1);
      expect(dataReason.events[0]?.id).toBe("denial-1");

      // 3. Filter by role = "producer"
      const reqRole = new Request(
        "https://tv.bqsqwad.com/api/public/v1/zillionaire/security/events?timeRange=all&role=producer",
        {
          method: "GET",
        },
      );
      const resRole = await handler({ request: reqRole });
      const dataRole = (await resRole.json()) as { events: AccessDenialEvent[]; total: number };
      expect(dataRole.total).toBe(1);
      expect(dataRole.events[0]?.id).toBe("denial-2");

      // 4. Filter by platform = "ios"
      const reqPlatform = new Request(
        "https://tv.bqsqwad.com/api/public/v1/zillionaire/security/events?timeRange=all&platform=ios",
        {
          method: "GET",
        },
      );
      const resPlatform = await handler({ request: reqPlatform });
      const dataPlatform = (await resPlatform.json()) as {
        events: AccessDenialEvent[];
        total: number;
      };
      expect(dataPlatform.total).toBe(1);
      expect(dataPlatform.events[0]?.id).toBe("denial-3");

      // 5. Filter by routePattern substring = "pricing"
      const reqRoute = new Request(
        "https://tv.bqsqwad.com/api/public/v1/zillionaire/security/events?timeRange=all&routePattern=pricing",
        {
          method: "GET",
        },
      );
      const resRoute = await handler({ request: reqRoute });
      const dataRoute = (await resRoute.json()) as { events: AccessDenialEvent[]; total: number };
      expect(dataRoute.total).toBe(1);
      expect(dataRoute.events[0]?.id).toBe("denial-2");
    });
  });

  describe("POST /api/public/v1/zillionaire/security/lookup-actor", () => {
    it("strictly requires Zillionaire owner and rejects delegated operators", async () => {
      const { fs, storedDocs } = createMemoryFirestore();
      storedDocs["users/operator-sec"] = {
        email: "sec@example.com",
        zillionaireModules: ["security"],
      };

      vi.spyOn(Firestore, "create").mockResolvedValue(fs);
      vi.spyOn(apiModule, "requireUser").mockResolvedValue({
        uid: "operator-sec",
        email: "sec@example.com",
        emailVerified: true,
        authTime: Math.floor(Date.now() / 1000),
        issuedAt: Math.floor(Date.now() / 1000),
        customClaims: {},
      });

      const req = new Request(
        "https://tv.bqsqwad.com/api/public/v1/zillionaire/security/lookup-actor",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            actorHash: "a".repeat(64),
            reason: "Investigating security issue",
            stepUpConfirmed: true,
          }),
        },
      );

      const handler = (
        LookupActorRoute.options.server as unknown as {
          handlers: { POST: (ctx: { request: Request }) => Promise<Response> };
        }
      ).handlers.POST;
      const res = await handler({ request: req });
      expect(res.status).toBe(403);
      const json = (await res.json()) as { code: string };
      expect(json.code).toBe("OWNER_ONLY");
    });

    it("rejects owner if step-up confirmation is false or omitted", async () => {
      const { fs, storedDocs } = createMemoryFirestore();
      storedDocs["users/owner-uid"] = {
        email: "owner@zillionaire.tv",
        zillionaireModules: ["security"],
      };

      vi.spyOn(Firestore, "create").mockResolvedValue(fs);
      vi.spyOn(apiModule, "requireUser").mockResolvedValue({
        uid: "owner-uid",
        email: "owner@zillionaire.tv",
        emailVerified: true,
        authTime: Math.floor(Date.now() / 1000),
        issuedAt: Math.floor(Date.now() / 1000),
        customClaims: {},
      });

      const req = new Request(
        "https://tv.bqsqwad.com/api/public/v1/zillionaire/security/lookup-actor",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            actorHash: "a".repeat(64),
            reason: "Investigating security issue",
            stepUpConfirmed: false,
          }),
        },
      );

      const handler = (
        LookupActorRoute.options.server as unknown as {
          handlers: { POST: (ctx: { request: Request }) => Promise<Response> };
        }
      ).handlers.POST;
      const res = await handler({ request: req });
      expect(res.status).toBe(403);
      const json = (await res.json()) as { code: string };
      expect(json.code).toBe("STEP_UP_REQUIRED");
    });

    it("rejects reason shorter than 3 characters", async () => {
      const { fs, storedDocs } = createMemoryFirestore();
      storedDocs["users/owner-uid"] = {
        email: "owner@zillionaire.tv",
        zillionaireModules: ["security"],
      };

      vi.spyOn(Firestore, "create").mockResolvedValue(fs);
      vi.spyOn(apiModule, "requireUser").mockResolvedValue({
        uid: "owner-uid",
        email: "owner@zillionaire.tv",
        emailVerified: true,
        authTime: Math.floor(Date.now() / 1000),
        issuedAt: Math.floor(Date.now() / 1000),
        customClaims: {},
      });

      const req = new Request(
        "https://tv.bqsqwad.com/api/public/v1/zillionaire/security/lookup-actor",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            actorHash: "a".repeat(64),
            reason: "no",
            stepUpConfirmed: true,
          }),
        },
      );

      const handler = (
        LookupActorRoute.options.server as unknown as {
          handlers: { POST: (ctx: { request: Request }) => Promise<Response> };
        }
      ).handlers.POST;
      const res = await handler({ request: req });
      expect(res.status).toBe(400);
    });

    it("resolves matching user identity and records chained tamper-evident audit entry", async () => {
      const { fs, storedDocs } = createMemoryFirestore();
      const targetUid = "usr_suspect_12345678";
      const targetEmail = "suspect@example.com";

      // Seed target user
      storedDocs[`users/${targetUid}`] = {
        email: targetEmail,
        roleTags: ["viewer"],
        createdAt: "2026-10-01T12:00:00.000Z",
      };

      // Seed owner user
      storedDocs["users/owner-uid"] = {
        email: "owner@zillionaire.tv",
        zillionaireModules: ["security"],
      };

      // Calculate expected actor hash for target user
      const key = getAuditHashKey();
      const targetActorHash = await hmacSha256Hex(key, "uid:" + targetUid);

      vi.spyOn(Firestore, "create").mockResolvedValue(fs);
      vi.spyOn(apiModule, "requireUser").mockResolvedValue({
        uid: "owner-uid",
        email: "owner@zillionaire.tv",
        emailVerified: true,
        authTime: Math.floor(Date.now() / 1000),
        issuedAt: Math.floor(Date.now() / 1000),
        customClaims: {},
      });

      const req = new Request(
        "https://tv.bqsqwad.com/api/public/v1/zillionaire/security/lookup-actor",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            actorHash: targetActorHash,
            reason: "Investigating unauthorized probing of admin APIs",
            stepUpConfirmed: true,
          }),
        },
      );

      const handler = (
        LookupActorRoute.options.server as unknown as {
          handlers: { POST: (ctx: { request: Request }) => Promise<Response> };
        }
      ).handlers.POST;
      const res = await handler({ request: req });
      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        found: boolean;
        account?: { uid: string; email: string; roleTags: string[] };
        actorHash: string;
      };

      expect(data.found).toBe(true);
      expect(data.account).toBeDefined();
      expect(data.account?.uid).toBe(targetUid);
      expect(data.account?.email).toBe(targetEmail);
      expect(data.account?.roleTags).toEqual(["viewer"]);

      // Verify that audit log entry was written
      const auditLogKeys = Object.keys(storedDocs).filter((k) => k.startsWith("auditLog/"));
      expect(auditLogKeys.length).toBe(1);
      const auditEntry = storedDocs[auditLogKeys[0]!]!;
      expect(auditEntry["action"]).toBe("security.actor_lookup");
      expect(auditEntry["actorUid"]).toBe("owner-uid");
      expect(auditEntry["targetId"]).toBe(targetUid);
      expect(auditEntry["reason"]).toBe("Investigating unauthorized probing of admin APIs");
      expect((auditEntry["metadata"] as Record<string, unknown>)?.["actorHash"]).toBe(
        targetActorHash,
      );
      expect((auditEntry["metadata"] as Record<string, unknown>)?.["resolved"]).toBe(true);

      // Verify auditChain/head was updated
      expect(storedDocs["auditChain/head"]).toBeDefined();
    });

    it("returns found: false when actor hash does not match, while still recording audit log", async () => {
      const { fs, storedDocs } = createMemoryFirestore();
      storedDocs["users/owner-uid"] = {
        email: "owner@zillionaire.tv",
        zillionaireModules: ["security"],
      };

      const unknownHash = "f".repeat(64);

      vi.spyOn(Firestore, "create").mockResolvedValue(fs);
      vi.spyOn(apiModule, "requireUser").mockResolvedValue({
        uid: "owner-uid",
        email: "owner@zillionaire.tv",
        emailVerified: true,
        authTime: Math.floor(Date.now() / 1000),
        issuedAt: Math.floor(Date.now() / 1000),
        customClaims: {},
      });

      const req = new Request(
        "https://tv.bqsqwad.com/api/public/v1/zillionaire/security/lookup-actor",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            actorHash: unknownHash,
            reason: "Checking unidentified actor hash",
            stepUpConfirmed: true,
          }),
        },
      );

      const handler = (
        LookupActorRoute.options.server as unknown as {
          handlers: { POST: (ctx: { request: Request }) => Promise<Response> };
        }
      ).handlers.POST;
      const res = await handler({ request: req });
      expect(res.status).toBe(200);

      const data = (await res.json()) as { found: boolean; account?: unknown };
      expect(data.found).toBe(false);
      expect(data.account).toBeUndefined();

      // Audit log must still record the lookup attempt
      const auditLogKeys = Object.keys(storedDocs).filter((k) => k.startsWith("auditLog/"));
      expect(auditLogKeys.length).toBe(1);
      const auditEntry = storedDocs[auditLogKeys[0]!]!;
      expect(auditEntry["action"]).toBe("security.actor_lookup");
      expect(auditEntry["targetId"]).toBe("unresolved");
      expect((auditEntry["metadata"] as Record<string, unknown>)?.["resolved"]).toBe(false);
    });
  });
});
