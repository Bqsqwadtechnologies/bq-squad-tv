import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  recordAccessDenial,
  normalizeRoutePattern,
  extractCoarseNetworkPrefix,
  detectPlatformClass,
  hmacSha256Hex,
  getAuditHashKey,
  type AccessDenialEvent,
} from "@/lib/server/access-denials";
import { errorBody } from "@/lib/server/api";
import { ApiError, type Firestore } from "@/lib/server/firebase-admin";
import {
  requirePlatformRole,
  requireZillionaireModule,
  requireProviderAccess,
} from "@/lib/server/roles";
import { assertFeatureFlag, type PlatformFlags } from "@/lib/server/flags";

function createMemoryFirestore(): {
  fs: Firestore;
  storedDocs: Record<string, Record<string, unknown>>;
} {
  const storedDocs: Record<string, Record<string, unknown>> = {};

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
  } as unknown as Firestore;

  return { fs, storedDocs };
}

describe("Privacy-Safe Access Denial Audit Events (V3-01 Batch 09)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env["AUDIT_HASH_KEY"] = "test-audit-hmac-secret-key-32bytes!";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("Snapshot test of event shape", () => {
    it("matches the exact frozen shape so field changes require a deliberate edit", async () => {
      const { fs, storedDocs } = createMemoryFirestore();
      const fixedDate = new Date("2026-11-18T10:00:00.000Z");

      const event = await recordAccessDenial(fs, {
        actorUid: "usr_test12345678",
        actorRoleClass: "viewer",
        routePattern: "/api/public/v1/zillionaire/users/:uid",
        method: "GET",
        requiredRole: "admin",
        resourceKind: "user",
        targetId: "usr_target999999",
        reasonCode: "CROSS_ROLE_DENIED",
        clientIp: "192.168.1.55",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        now: fixedDate,
      });

      // Verify exact keys in deterministic order
      const eventKeys = Object.keys(event).sort();
      expect(eventKeys).toEqual([
        "actorHash",
        "actorRoleClass",
        "coarseNetworkHash",
        "expiresAt",
        "id",
        "method",
        "platformClass",
        "reasonCode",
        "requiredRole",
        "resourceKind",
        "routePattern",
        "targetHash",
        "time",
      ]);

      // Snapshot structure validation
      expect({
        actorRoleClass: event.actorRoleClass,
        method: event.method,
        platformClass: event.platformClass,
        reasonCode: event.reasonCode,
        requiredRole: event.requiredRole,
        resourceKind: event.resourceKind,
        routePattern: event.routePattern,
        expiresAt: event.expiresAt,
        time: event.time,
        actorHashLength: event.actorHash.length,
        coarseNetworkHashLength: event.coarseNetworkHash.length,
        targetHashLength: event.targetHash?.length,
      }).toMatchInlineSnapshot(`
        {
          "actorHashLength": 64,
          "actorRoleClass": "viewer",
          "coarseNetworkHashLength": 64,
          "expiresAt": "2027-02-16T10:00:00.000Z",
          "method": "GET",
          "platformClass": "web",
          "reasonCode": "CROSS_ROLE_DENIED",
          "requiredRole": "admin",
          "resourceKind": "user",
          "routePattern": "/api/public/v1/zillionaire/users/:uid",
          "targetHashLength": 64,
          "time": "2026-11-18T10:00:00.000Z",
        }
      `);

      // Verify document was written to Firestore accessDenials/{id}
      expect(storedDocs[`accessDenials/${event.id}`]).toBeDefined();
      expect(storedDocs[`accessDenials/${event.id}`]).toEqual(event);
    });
  });

  describe("Canary test: privacy leak prevention", () => {
    it("never leaks secret tokens, headers, body values, query strings, emails or raw IDs into stored event, logs, or response", async () => {
      const { fs, storedDocs } = createMemoryFirestore();

      // Setup canary values that must NEVER appear anywhere
      const CANARY_TOKEN = "CANARY_TOKEN_secret_val_11111";
      const CANARY_HEADER = "CANARY_HEADER_secret_val_22222";
      const CANARY_COOKIE = "CANARY_COOKIE_session_val_33333";
      const CANARY_QUERY = "CANARY_QUERY_token_val_44444";
      const CANARY_BODY = "CANARY_BODY_password_val_55555";
      const CANARY_TARGET_ID = "CANARY_ID_usr_66666";
      const CANARY_EMAIL = "canary_user_private@secret.example.com";
      const CANARY_IP = "203.0.113.195";

      const allCanaries = [
        CANARY_TOKEN,
        CANARY_HEADER,
        CANARY_COOKIE,
        CANARY_QUERY,
        CANARY_BODY,
        CANARY_TARGET_ID,
        CANARY_EMAIL,
        CANARY_IP,
      ];

      // Spy on console methods to assert no leaks to logs
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const req = new Request(
        `https://tv.bqsqwad.com/api/public/v1/zillionaire/users/${CANARY_TARGET_ID}?auth_token=${CANARY_QUERY}&email=${CANARY_EMAIL}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${CANARY_TOKEN}`,
            "x-custom-secret": CANARY_HEADER,
            cookie: `session=${CANARY_COOKIE}`,
            "x-forwarded-for": `${CANARY_IP}, 10.0.0.1`,
            "user-agent": "Mozilla/5.0 BQ-SQWAD-TV-App",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            secret: CANARY_BODY,
            email: CANARY_EMAIL,
            target: CANARY_TARGET_ID,
          }),
        },
      );

      // Simulate access denial
      const denialError = new ApiError(
        403,
        "CROSS_ROLE_DENIED",
        "This account does not have the required platform role.",
      );
      const response = errorBody(denialError);
      const responseBody = await response.json();

      const event = await recordAccessDenial(fs, {
        request: req,
        actorUid: "usr_attacker_uid_7777",
        actorRoleClass: "viewer",
        requiredRole: "admin",
        resourceKind: "user",
        targetId: CANARY_TARGET_ID,
        reasonCode: "CROSS_ROLE_DENIED",
      });

      // 1. Check stored Firestore event
      const storedEvent = storedDocs[`accessDenials/${event.id}`];
      expect(storedEvent).toBeDefined();
      const storedEventJson = JSON.stringify(storedEvent);

      // 2. Check HTTP error response
      const responseJson = JSON.stringify(responseBody);

      // 3. Check console logs
      const capturedLogs = [
        ...logSpy.mock.calls.flat(),
        ...warnSpy.mock.calls.flat(),
        ...errorSpy.mock.calls.flat(),
      ]
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" ");

      // Verify NONE of the canaries appear in stored event, response, or logs
      for (const canary of allCanaries) {
        expect(storedEventJson).not.toContain(canary);
        expect(responseJson).not.toContain(canary);
        expect(capturedLogs).not.toContain(canary);
      }

      // Assert that routePattern only has normalized token, no query string and no canary ID
      expect(event.routePattern).toBe("/api/public/v1/zillionaire/users/:uid");
      expect(event.routePattern).not.toContain(CANARY_TARGET_ID);
      expect(event.routePattern).not.toContain(CANARY_QUERY);

      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe("Route pattern normalization", () => {
    it("strips dynamic UUIDs, UIDs, and query strings from route paths", () => {
      expect(
        normalizeRoutePattern(
          "/api/public/v1/zillionaire/users/c7f0b5aa-91e8-4c8d-905e-88b907db4101/risk?export=true",
        ),
      ).toBe("/api/public/v1/zillionaire/users/:uid/risk");

      expect(
        normalizeRoutePattern(
          "/api/public/v1/producer/channels/chan_superchannel123/team?secret=abc#section",
        ),
      ).toBe("/api/public/v1/producer/channels/:channelId/team");

      expect(normalizeRoutePattern("/api/public/v1/provider/disputes/disp_9876543210ab")).toBe(
        "/api/public/v1/provider/disputes/:disputeId",
      );

      expect(
        normalizeRoutePattern("/api/public/v1/content-assets/asset_1234567890abcdef/approve"),
      ).toBe("/api/public/v1/content-assets/:assetId/approve");

      expect(normalizeRoutePattern("/admin?tab=security&page=2")).toBe("/admin");
    });

    it("handles root and empty paths safely", () => {
      expect(normalizeRoutePattern("")).toBe("/");
      expect(normalizeRoutePattern("/")).toBe("/");
      expect(normalizeRoutePattern("https://tv.bqsqwad.com/producer?view=all")).toBe("/producer");
    });
  });

  describe("Coarse network prefix hashing", () => {
    it("extracts IPv4 /24 prefix without storing real host IP", () => {
      expect(extractCoarseNetworkPrefix("192.168.1.100")).toBe("192.168.1.0/24");
      expect(extractCoarseNetworkPrefix("192.168.1.100:8080")).toBe("192.168.1.0/24");
      expect(extractCoarseNetworkPrefix("10.50.200.75")).toBe("10.50.200.0/24");
    });

    it("extracts IPv6 /48 prefix without storing real host IP", () => {
      expect(extractCoarseNetworkPrefix("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe(
        "2001:0db8:85a3::/48",
      );
      expect(extractCoarseNetworkPrefix("[2001:db8:abcd:0012::1]:443")).toBe("2001:db8:abcd::/48");
    });

    it("returns unknown for invalid or missing IPs", () => {
      expect(extractCoarseNetworkPrefix(null)).toBe("unknown");
      expect(extractCoarseNetworkPrefix("")).toBe("unknown");
      expect(extractCoarseNetworkPrefix("invalid-ip-string")).toBe("unknown");
    });
  });

  describe("Platform class detection", () => {
    it("correctly identifies android, ios, worker and web", () => {
      expect(detectPlatformClass(undefined, "Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe(
        "android",
      );
      expect(detectPlatformClass(undefined, "CFNetwork/1494.0.7 Darwin/23.4.0")).toBe("ios");
      expect(detectPlatformClass(undefined, "Modal-Worker/2.0 (VideoEngine)")).toBe("worker");
      expect(
        detectPlatformClass(undefined, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"),
      ).toBe("web");
      expect(detectPlatformClass(undefined, "")).toBe("unknown");
    });
  });

  describe("Deduplication and sharded hourly counters", () => {
    it("records sharded hourly counters with 90-day retention TTL", async () => {
      const { fs, storedDocs } = createMemoryFirestore();
      const fixedDate = new Date("2026-11-18T14:30:00.000Z");

      await recordAccessDenial(fs, {
        actorUid: "usr_viewer_001",
        actorRoleClass: "viewer",
        routePattern: "/api/public/v1/zillionaire/overview",
        method: "GET",
        requiredRole: "admin",
        reasonCode: "CROSS_ROLE_DENIED",
        now: fixedDate,
      });

      // Verify sharded counter doc exists
      const counterKeys = Object.keys(storedDocs).filter((k) =>
        k.startsWith("accessDenialCounters/"),
      );
      expect(counterKeys.length).toBe(1);
      const firstCounterKey = counterKeys[0]!;
      const counter = storedDocs[firstCounterKey]!;
      expect(counter["hourBucket"]).toBe("2026-11-18T14");
      expect(counter["count"]).toBe(1);
      expect(counter["expiresAt"]).toBe(new Date("2027-02-16T14:30:00.000Z").toISOString());

      // Verify hourly total doc exists
      const totalKeys = Object.keys(storedDocs).filter((k) =>
        k.startsWith("accessDenialHourlyTotals/"),
      );
      expect(totalKeys.length).toBe(1);
      const firstTotalKey = totalKeys[0]!;
      expect(storedDocs[firstTotalKey]!["count"]).toBe(1);
    });
  });

  describe("Zillionaire alerting on threshold", () => {
    it("creates securityAlerts when one actor exceeds 10 denials within one hour", async () => {
      const { fs, storedDocs } = createMemoryFirestore();
      const fixedDate = new Date("2026-11-18T16:00:00.000Z");
      const actorUid = "usr_spam_prober";

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      // Simulate 10 denials (threshold boundary)
      for (let i = 1; i <= 10; i++) {
        await recordAccessDenial(fs, {
          actorUid,
          actorRoleClass: "viewer",
          routePattern: `/api/public/v1/zillionaire/users/:uid`,
          method: "GET",
          requiredRole: "admin",
          reasonCode: "CROSS_ROLE_DENIED",
          now: fixedDate,
        });
      }

      // At 10 denials: no alert yet
      let alertKeys = Object.keys(storedDocs).filter((k) => k.startsWith("securityAlerts/"));
      expect(alertKeys.length).toBe(0);

      // 11th denial: exceeds threshold!
      await recordAccessDenial(fs, {
        actorUid,
        actorRoleClass: "viewer",
        routePattern: `/api/public/v1/zillionaire/users/:uid`,
        method: "GET",
        requiredRole: "admin",
        reasonCode: "CROSS_ROLE_DENIED",
        now: fixedDate,
      });

      // Verify alert was created
      alertKeys = Object.keys(storedDocs).filter((k) => k.startsWith("securityAlerts/"));
      expect(alertKeys.length).toBe(1);
      const firstAlertKey = alertKeys[0]!;
      const alert = storedDocs[firstAlertKey]!;
      expect(alert["type"]).toBe("EXCESSIVE_ACCESS_DENIALS");
      expect(alert["status"]).toBe("OPEN");
      expect(alert["denialCount"]).toBe(11);
      expect(alert["hourBucket"]).toBe("2026-11-18T16");

      // Verify warning log fired without leaking raw UID
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[SECURITY_ALERT]"));

      warnSpy.mockRestore();
    });
  });

  describe("Integrated denial triggers", () => {
    it("records denial on cross-role failure in requirePlatformRole", async () => {
      const { fs, storedDocs } = createMemoryFirestore();
      // Mock user document
      storedDocs["users/usr_viewer1"] = { roleTags: ["viewer"] };

      await expect(
        requirePlatformRole(fs, { uid: "usr_viewer1", email: "viewer@example.com" }, "producer"),
      ).rejects.toThrow("This account does not have the required platform role.");

      const denials = Object.keys(storedDocs).filter((k) => k.startsWith("accessDenials/"));
      expect(denials.length).toBe(1);
      const firstDenialKey = denials[0]!;
      const denial = storedDocs[firstDenialKey]!;
      expect(denial["reasonCode"]).toBe("CROSS_ROLE_DENIED");
      expect(denial["requiredRole"]).toBe("producer");
    });

    it("records denial on missing module in requireZillionaireModule", async () => {
      const { fs, storedDocs } = createMemoryFirestore();
      storedDocs["users/usr_delegate1"] = { zillionaireModules: ["content"] };

      await expect(
        requireZillionaireModule(
          fs,
          { uid: "usr_delegate1", email: "delegate@example.com" },
          "security",
        ),
      ).rejects.toThrow("Zillionaire module permission 'security' is required for this action.");

      const denials = Object.keys(storedDocs).filter((k) => k.startsWith("accessDenials/"));
      expect(denials.length).toBe(1);
      const firstDenialKey = denials[0]!;
      const denial = storedDocs[firstDenialKey]!;
      expect(denial["reasonCode"]).toBe("MISSING_MODULE");
      expect(denial["requiredRole"]).toBe("module:security");
    });

    it("records denial on cross-tenant violation in requireProviderAccess", async () => {
      const { fs, storedDocs } = createMemoryFirestore();
      storedDocs["users/usr_prov1"] = { roleTags: ["provider"] };
      storedDocs["providerUsers/usr_prov1"] = { status: "ACTIVE", providerId: "prov_alpha" };

      await expect(
        requireProviderAccess(fs, { uid: "usr_prov1", email: "prov@example.com" }, "prov_beta"),
      ).rejects.toThrow(
        "You do not have permission to access resources belonging to another provider.",
      );

      const denials = Object.keys(storedDocs).filter((k) => k.startsWith("accessDenials/"));
      expect(denials.length).toBe(1);
      const firstDenialKey = denials[0]!;
      const denial = storedDocs[firstDenialKey]!;
      expect(denial["reasonCode"]).toBe("CROSS_TENANT_DENIED");
      expect(denial["requiredRole"]).toBe("provider");
      expect(denial["targetHash"]).toMatch(/^[a-f0-9]{64}$/);
      expect(denial["targetHash"]).toBeDefined();
    });

    it("throws FEATURE_FLAG_DISABLED on disabled feature flag assertion", () => {
      expect(() => {
        assertFeatureFlag(
          { maintenanceMode: false, liveTv: false } as unknown as PlatformFlags,
          "liveTv",
        );
      }).toThrow("Feature flag 'liveTv' is currently disabled.");
    });
  });
});
