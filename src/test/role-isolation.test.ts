import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "@/lib/server/firebase-admin";
import {
  requireZillionaireModule,
  requirePlatformRole,
  requireProviderAccess,
  resolvePlatformAccess,
} from "@/lib/server/roles";
import { requireChannelPermission } from "@/lib/server/channel-access";
import { createRoleIsolationStore, type MockDoc } from "@/test/role-isolation-harness";
import { Route as ExportRoute } from "@/routes/api/public/v1/account/export";
import { Route as ProducerAssetsRoute } from "@/routes/api/public/v1/producer/channels/$channelId/assets";
import { Route as ProviderChannelsRoute } from "@/routes/api/public/v1/provider/channels";
import { Route as ProviderContractsRoute } from "@/routes/api/public/v1/provider/contracts";
import { Route as ProviderStatementsRoute } from "@/routes/api/public/v1/provider/statements";
import { Route as ProviderDisputesRoute } from "@/routes/api/public/v1/provider/disputes";
import { Route as NotificationsRoute } from "@/routes/api/public/v1/notifications";
import { Route as NotificationReadRoute } from "@/routes/api/public/v1/notifications/$notificationId/read";
import * as apiModule from "@/lib/server/api";
import { Firestore as FirestoreClass } from "@/lib/server/firebase-admin";

const originalEnv = { ...process.env };

function seedIsolationStore() {
  return createRoleIsolationStore({
    "users/viewer": { email: "viewer@example.test", roleTags: [] },
    "users/producer-a": { email: "producer-a@example.test", roleTags: ["producer"] },
    "producers/producer-a": { planStatus: "ACTIVE", verificationStatus: "APPROVED" },
    "users/producer-b": { email: "producer-b@example.test", roleTags: ["producer"] },
    "producers/producer-b": { planStatus: "ACTIVE", verificationStatus: "APPROVED" },
    "users/provider-a": { email: "provider-a@example.test", roleTags: [] },
    "providerUsers/provider-a": { status: "ACTIVE", providerId: "tenant-a" },
    "users/provider-b": { email: "provider-b@example.test", roleTags: [] },
    "providerUsers/provider-b": { status: "ACTIVE", providerId: "tenant-b" },
    "users/delegate": {
      email: "delegate@example.test",
      roleTags: [],
      zillionaireModules: ["support"],
    },
    "users/delegate-no-module": {
      email: "delegate-no-module@example.test",
      roleTags: [],
      zillionaireModules: ["pricing"],
    },
    "users/owner": { email: "owner@zillionaire.test", roleTags: [] },
    "users/worker": { email: "worker@example.test", roleTags: [] },
    "channels/channel-a": { ownerUid: "producer-a", title: "Producer A channel", published: true },
    "channels/channel-b": { ownerUid: "producer-b", title: "Producer B channel", published: true },
    "channels/channel-a/members/delegate": { role: "uploader", status: "ACTIVE" },
    "liveChannels/live-a": { providerId: "tenant-a", status: "published", title: "Tenant A Live" },
    "liveChannels/live-b": { providerId: "tenant-b", status: "published", title: "Tenant B Live" },
    "providerContracts/contract-a": { providerId: "tenant-a", agreementReference: "A-PRIVATE" },
    "providerContracts/contract-b": { providerId: "tenant-b", agreementReference: "B-PRIVATE" },
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
    "providerDisputes/dispute-a": {
      providerId: "tenant-a",
      subject: "A private dispute",
      messages: [],
    },
    "providerDisputes/dispute-b": {
      providerId: "tenant-b",
      subject: "B private dispute",
      messages: [],
    },
    "users/viewer/notifications/notice-a": {
      title: "Viewer notice",
      body: "Private to viewer",
      createdAt: "2026-01-01",
    },
    "users/provider-a/notifications/notice-provider": {
      title: "Provider notice",
      body: "Private to provider",
      createdAt: "2026-01-02",
    },
    "users/producer-a/notifications/notice-producer": {
      title: "Producer notice",
      body: "Private to producer",
      createdAt: "2026-01-03",
    },
    "users/viewer/wallet": { balanceMinor: 50, currency: "NGN" },
    "wallets/viewer": { balanceMinor: 50, currency: "NGN" },
    "wallets/producer-a": { balanceMinor: 700, currency: "NGN" },
    "ledger/ledger-viewer": { uid: "viewer", amountMinor: -1, createdAt: "2026-01-01" },
    "ledger/ledger-producer-a": { uid: "producer-a", amountMinor: 700, createdAt: "2026-01-02" },
    "payments/payment-viewer": { uid: "viewer", status: "settled", createdAt: "2026-01-01" },
    "payments/payment-producer-a": {
      uid: "producer-a",
      status: "settled",
      createdAt: "2026-01-02",
    },
    "sessions/session-viewer": { uid: "viewer", channelId: "channel-a", startedAt: "2026-01-01" },
    "sessions/session-producer-a": {
      uid: "producer-a",
      channelId: "channel-a",
      startedAt: "2026-01-02",
    },
  });
}

function user(uid: string, email: string, emailVerified = true) {
  return {
    uid,
    email,
    emailVerified,
    authTime: Math.floor(Date.now() / 1000),
    issuedAt: Math.floor(Date.now() / 1000),
    customClaims: {},
  };
}

describe("Batch 12: role-isolation end-to-end boundaries", () => {
  let fs: Firestore;
  let store: Map<string, MockDoc>;

  beforeEach(() => {
    process.env["ZILLIONAIRE_EMAIL"] = "owner@zillionaire.test";
    process.env["AUDIT_HASH_KEY"] = "role-isolation-test-hmac-secret";
    const seeded = seedIsolationStore();
    fs = seeded.fs;
    store = seeded.store;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("resolves viewer, both producers, both providers, delegate, worker and owner to their intended roles", async () => {
    expect(
      (await resolvePlatformAccess(fs, "viewer", "viewer@example.test", {}, true)).roles,
    ).toEqual(["viewer"]);
    expect(
      (await resolvePlatformAccess(fs, "producer-a", "producer-a@example.test", {}, true)).roles,
    ).toContain("producer");
    expect(
      (await resolvePlatformAccess(fs, "producer-b", "producer-b@example.test", {}, true)).roles,
    ).toContain("producer");
    expect(
      (await resolvePlatformAccess(fs, "provider-a", "provider-a@example.test", {}, true))
        .providerId,
    ).toBe("tenant-a");
    expect(
      (await resolvePlatformAccess(fs, "provider-b", "provider-b@example.test", {}, true))
        .providerId,
    ).toBe("tenant-b");
    expect(
      (await resolvePlatformAccess(fs, "delegate", "delegate@example.test", {}, true))
        .zillionaireModules,
    ).toContain("support");
    expect(
      (await resolvePlatformAccess(fs, "worker", "worker@example.test", {}, true)).roles,
    ).toEqual(["viewer"]);
    expect(
      (await resolvePlatformAccess(fs, "owner", "owner@zillionaire.test", {}, true))
        .isZillionaireOwner,
    ).toBe(true);
  });

  it("isolates producer reads, writes and list queries to the owner or active delegated channel member", async () => {
    const producerA = user("producer-a", "producer-a@example.test");
    const own = await requireChannelPermission(fs, "channel-a", "producer-a", "video.upload");
    expect(own.role).toBe("owner");
    expect(
      await fs.query("channels", {
        filters: [{ field: "ownerUid", op: "EQUAL", value: producerA.uid }],
      }),
    ).toEqual([expect.objectContaining({ __id: "channel-a", ownerUid: "producer-a" })]);
    await expect(
      requireChannelPermission(fs, "channel-b", "producer-a", "video.upload"),
    ).rejects.toMatchObject({ status: 403, code: "CHANNEL_ACCESS_REQUIRED" });
    const delegate = await requireChannelPermission(fs, "channel-a", "delegate", "video.upload");
    expect(delegate.role).toBe("uploader");
    await expect(
      requireChannelPermission(fs, "channel-a", "delegate", "schedule.write"),
    ).rejects.toMatchObject({ status: 403, code: "CHANNEL_PERMISSION_REQUIRED" });
    await expect(
      requireChannelPermission(fs, "channel-b", "delegate", "video.upload"),
    ).rejects.toMatchObject({ status: 403, code: "CHANNEL_ACCESS_REQUIRED" });
  });

  it("rejects cross-producer attachment metadata writes and keeps accepted evidence paths in the owner's channel folder", async () => {
    store.set("contentAssets/asset-a", {
      channelId: "channel-a",
      ownerUid: "producer-a",
      status: "uploaded_pending_transcode",
    });
    vi.spyOn(FirestoreClass, "create").mockResolvedValue(fs);
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
    const payload = {
      assetId: "asset-a",
      title: "Cross-tenant attempt",
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
          body: JSON.stringify(payload),
        },
      ),
      params: { channelId: "channel-a" },
    });
    expect(response.status).toBe(403);
    expect(store.get("contentAssets/asset-a")).toMatchObject({
      ownerUid: "producer-a",
      status: "uploaded_pending_transcode",
    });

    vi.mocked(apiModule.requireUser).mockResolvedValue(
      user("producer-a", "producer-a@example.test"),
    );
    const acceptedPayload = {
      ...payload,
      rightsEvidencePath: "producers/producer-a/channel-a/evidence.pdf",
    };
    const accepted = await handler({
      request: new Request(
        "https://tv.bqsqwad.com/api/public/v1/producer/channels/channel-a/assets",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(acceptedPayload),
        },
      ),
      params: { channelId: "channel-a" },
    });
    expect(accepted.status).toBe(201);
    expect(store.get("contentAssets/asset-a")).toMatchObject({
      ownerUid: "producer-a",
      license: { evidencePath: "producers/producer-a/channel-a/evidence.pdf" },
    });
  });

  it("scopes provider route reads and lists across channels, contracts, statements and disputes", async () => {
    vi.spyOn(FirestoreClass, "create").mockResolvedValue(fs);
    vi.spyOn(apiModule, "requireUser").mockResolvedValue(
      user("provider-a", "provider-a@example.test"),
    );
    const getHandler = (route: unknown) =>
      (
        (route as { options: { server: unknown } }).options.server as {
          handlers: { GET: (ctx: { request: Request }) => Promise<Response> };
        }
      ).handlers.GET;
    const routes = [
      ["channels", getHandler(ProviderChannelsRoute)],
      ["contracts", getHandler(ProviderContractsRoute)],
      ["statements", getHandler(ProviderStatementsRoute)],
      ["disputes", getHandler(ProviderDisputesRoute)],
    ] as const;
    const responses = await Promise.all(
      routes.map(([path, handler]) =>
        handler({ request: new Request(`https://tv.bqsqwad.com/api/public/v1/provider/${path}`) }),
      ),
    );
    const [channels, contracts, statements, disputes] = await Promise.all(
      responses.map((r) => r.json()),
    );
    expect(channels.channels.map((item: { id: string }) => item.id)).toEqual(["live-a"]);
    expect(contracts.contracts.map((item: { id: string }) => item.id)).toEqual(["contract-a"]);
    expect(statements.statements.map((item: { id: string }) => item.id)).toEqual(["statement-a"]);
    expect(disputes.disputes.map((item: { id: string }) => item.id)).toEqual(["dispute-a"]);
    for (const response of [channels, contracts, statements, disputes]) {
      const serialized = JSON.stringify(response);
      expect(serialized).not.toContain("tenant-b");
      expect(serialized).not.toContain("contract-b");
      expect(serialized).not.toContain("statement-b");
      expect(serialized).not.toContain("dispute-b");
    }

    const statementHandler = getHandler(ProviderStatementsRoute);
    const crossTenantStatement = await statementHandler({
      request: new Request(
        "https://tv.bqsqwad.com/api/public/v1/provider/statements?statementId=statement-b",
      ),
    });
    expect(crossTenantStatement.status).toBe(403);
    await expect(
      requireProviderAccess(fs, user("provider-a", "provider-a@example.test"), "tenant-b"),
    ).rejects.toMatchObject({ status: 403, code: "PROVIDER_ISOLATION_VIOLATION" });
  });

  it("keeps notifications user-scoped and account exports filtered to the authenticated user", async () => {
    vi.spyOn(FirestoreClass, "create").mockResolvedValue(fs);
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "viewer",
      email: "viewer@example.test",
      emailVerified: true,
      authTime: Math.floor(Date.now() / 1000),
      issuedAt: Math.floor(Date.now() / 1000),
      customClaims: {},
    });
    const notificationList = (
      NotificationsRoute.options.server as {
        handlers: { GET: (ctx: { request: Request }) => Promise<Response> };
      }
    ).handlers.GET;
    const notificationRead = (
      NotificationReadRoute.options.server as {
        handlers: {
          POST: (ctx: {
            request: Request;
            params: { notificationId: string };
          }) => Promise<Response>;
        };
      }
    ).handlers.POST;
    const listed = await notificationList({
      request: new Request("https://tv.bqsqwad.com/api/public/v1/notifications"),
    });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual([expect.objectContaining({ title: "Viewer notice" })]);
    const crossUserRead = await notificationRead({
      request: new Request(
        "https://tv.bqsqwad.com/api/public/v1/notifications/notice-provider/read",
        { method: "POST" },
      ),
      params: { notificationId: "notice-provider" },
    });
    expect(crossUserRead.status).toBe(404);
    expect(store.get("users/provider-a/notifications/notice-provider")?.["read"]).not.toBe(true);
    const ownRead = await notificationRead({
      request: new Request("https://tv.bqsqwad.com/api/public/v1/notifications/notice-a/read", {
        method: "POST",
      }),
      params: { notificationId: "notice-a" },
    });
    expect(ownRead.status).toBe(200);
    expect(store.get("users/viewer/notifications/notice-a")?.["read"]).toBe(true);
    const handler = (
      ExportRoute.options.server as unknown as {
        handlers: { GET: (ctx: { request: Request }) => Promise<Response> };
      }
    ).handlers.GET;
    const response = await handler({
      request: new Request("https://tv.bqsqwad.com/api/public/v1/account/export"),
    });
    expect(response.status).toBe(200);
    const exported = (await response.json()) as Record<string, unknown>;
    expect(exported["ledger"]).toEqual([expect.objectContaining({ uid: "viewer" })]);
    expect(exported["payments"]).toHaveLength(1);
    expect(exported["sessions"]).toEqual([expect.objectContaining({ channelId: "channel-a" })]);
    expect(exported["notifications"]).toEqual([
      expect.objectContaining({ title: "Viewer notice" }),
    ]);
    expect(JSON.stringify(exported)).not.toContain("producer-a");
    expect(JSON.stringify(exported)).not.toContain("provider-a");
  });

  it("denies viewer and unscoped delegate access to protected consoles while allowing module-scoped delegate and owner", async () => {
    await expect(
      requirePlatformRole(fs, user("viewer", "viewer@example.test"), "producer"),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    await expect(
      requireZillionaireModule(
        fs,
        user("delegate-no-module", "delegate-no-module@example.test"),
        "support",
      ),
    ).rejects.toMatchObject({ status: 403, code: "ZILLIONAIRE_SCOPE_REQUIRED" });
    await expect(
      requireZillionaireModule(fs, user("delegate", "delegate@example.test"), "support"),
    ).resolves.toMatchObject({ zillionaireModules: expect.arrayContaining(["support"]) });
    await expect(
      requireZillionaireModule(fs, user("owner", "owner@zillionaire.test"), "security"),
    ).resolves.toMatchObject({ isZillionaireOwner: true });
  });

  it("writes denial records with hashed identities and no raw actor, tenant, route query or request secrets", async () => {
    await expect(
      requireProviderAccess(fs, user("provider-a", "provider-a@example.test"), "tenant-b"),
    ).rejects.toMatchObject({ status: 403 });
    const denials = [...store.entries()]
      .filter(([path]) => path.startsWith("accessDenials/"))
      .map(([, event]) => event);
    expect(denials.length).toBeGreaterThan(0);
    const event = denials[0]!;
    expect(event["actorHash"]).toMatch(/^[a-f0-9]{64}$/);
    expect(event["targetHash"]).toMatch(/^[a-f0-9]{64}$/);
    expect(event["actorHash"]).not.toBe("provider-a");
    expect(event["targetHash"]).not.toBe("tenant-b");
    expect(JSON.stringify(event)).not.toContain("provider-a@example.test");
    expect(JSON.stringify(event)).not.toContain("tenant-b");
    expect(String(event["requiredRole"])).not.toContain("tenant-b");
    expect(String(event["routePattern"])).not.toContain("?");
  });
});
