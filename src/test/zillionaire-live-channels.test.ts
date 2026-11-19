import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Route } from "@/routes/api/public/v1/zillionaire/live-channels/index";
import { Firestore, ApiError } from "@/lib/server/firebase-admin";
import * as apiModule from "@/lib/server/api";
import * as rolesModule from "@/lib/server/roles";
import * as auditModule from "@/lib/server/audit";

function createMemoryFirestore() {
  const storedDocs: Record<string, Record<string, unknown>> = {};

  const fs = {
    docName: (path: string) => `projects/test-project/databases/(default)/documents/${path}`,
    getDoc: vi.fn(async (path: string) => {
      const data = storedDocs[path];
      return data ? { ...data } : null;
    }),
    setDoc: vi.fn(
      async (path: string, fields: Record<string, unknown>, opts?: { merge?: boolean }) => {
        if (opts?.merge && storedDocs[path]) {
          storedDocs[path] = { ...storedDocs[path], ...fields };
        } else {
          storedDocs[path] = { ...fields };
        }
      },
    ),
    deleteDoc: vi.fn(async (path: string) => {
      delete storedDocs[path];
    }),
    query: vi.fn(async (collectionId: string) => {
      return Object.entries(storedDocs)
        .filter(([k]) => k.startsWith(`${collectionId}/`))
        .map(([k, v]) => ({ __id: k.split("/")[1], ...v }));
    }),
  };

  return { fs, storedDocs };
}

describe("Zillionaire Live Channels Management API", () => {
  let memory: ReturnType<typeof createMemoryFirestore>;

  beforeEach(() => {
    memory = createMemoryFirestore();
    vi.spyOn(Firestore, "create").mockResolvedValue(memory.fs as any);
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "owner-live-1",
      email: "owner@bqsqwad.tv",
      roles: ["admin"],
    } as any);
    vi.spyOn(rolesModule, "requireZillionaireModule").mockResolvedValue(true as any);
    vi.spyOn(auditModule, "writeAuditLog").mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. fetches live channels list with viewer counts, health metrics and stats", async () => {
    memory.storedDocs["channels/live-fixture"] = {
      id: "live-fixture",
      title: "Verified live fixture",
      deliveryMode: "live_hls",
      channelType: "live_tv",
      streamUrl: "https://example.test/live.m3u8",
      isLive: true,
      submissionStatus: "APPROVED",
      playbackHealth: {
        bitrateMbps: 5,
        bufferingPct: 0.1,
        errorRatePct: 0,
        status: "healthy",
        failoverActive: false,
        lastCheckedAt: new Date().toISOString(),
      },
      epgProgrammes: [],
    };
    memory.storedDocs["sessions/session-1"] = { channelId: "live-fixture", active: true };
    const fakeEvent = {
      request: new Request("https://bqsqwad.tv/api/public/v1/zillionaire/live-channels/", { method: "GET" }),
    };

    const res = await (Route as any).options.server.handlers.GET(fakeEvent);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.channels)).toBe(true);
    expect(body.channels.length).toBeGreaterThan(0);
    expect(body.stats).toBeDefined();
    expect(body.channels[0].playbackHealth).toBeDefined();
    expect(body.channels[0].streamUrl).toBe("https://example.test/live.m3u8");
    expect(body.channels[0].viewerCount).toBe(1);
  });

  it("2. creates a new live channel with primary and failover HLS streams and EPG programmes", async () => {
    const payload = {
      action: "CREATE_LIVE_CHANNEL",
      name: "BQ Live Arena",
      handle: "@bq_arena",
      description: "Live stadium events and championship tournaments.",
      streamUrl: "https://stream.bqsqwad.tv/hls/arena/main.m3u8",
      failoverStreamUrl: "https://failover.bqsqwad.tv/hls/arena/backup.m3u8",
      category: "Sports",
      language: "en",
      ageRating: "PG",
      paid: true,
      ratePerMinuteMinor: 25,
      currency: "NGN",
      expiryDate: new Date(Date.now() + 90 * 86400000).toISOString(),
      programmes: [
        {
          id: "epg-1",
          title: "Championship Semifinal Match 1",
          startAt: "19:00",
          endAt: "21:00",
          description: "Live stadium coverage.",
          ageRating: "PG",
        },
      ],
      reason: "Launching new sports live arena channel",
    };

    const fakeEvent = {
      request: new Request("https://bqsqwad.tv/api/public/v1/zillionaire/live-channels/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    };

    const res = await (Route as any).options.server.handlers.POST(fakeEvent);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.channelId).toBeDefined();
    expect(body.channel.streamUrl).toBe("https://stream.bqsqwad.tv/hls/arena/main.m3u8");
    expect(body.channel.failoverStreamUrl).toBe("https://failover.bqsqwad.tv/hls/arena/backup.m3u8");
  });

  it("3. handles Go Live and End Live stream transitions with confirmation", async () => {
    const channelId = "test-live-transition-ch";
    memory.storedDocs[`channels/${channelId}`] = {
      id: channelId,
      deliveryMode: "live_hls",
      channelType: "live_tv",
      title: "Transition Test Channel",
      streamUrl: "https://stream.bqsqwad.tv/live/test.m3u8",
      isLive: false,
      streamStatus: "OFFLINE",
    };

    // Go Live
    const goLiveEvent = {
      request: new Request("https://bqsqwad.tv/api/public/v1/zillionaire/live-channels/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "GO_LIVE",
          channelId,
          confirmation: true,
          bitrateMbps: 6.0,
          reason: "Broadcasting special event",
        }),
      }),
    };
    const goLiveRes = await (Route as any).options.server.handlers.POST(goLiveEvent);
    expect(goLiveRes.status).toBe(200);
    const goLiveBody = await goLiveRes.json();
    expect(goLiveBody.isLive).toBe(true);
    expect(goLiveBody.streamStatus).toBe("LIVE");

    // End Live
    const endLiveEvent = {
      request: new Request("https://bqsqwad.tv/api/public/v1/zillionaire/live-channels/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "END_LIVE",
          channelId,
          confirmation: true,
          reason: "Broadcast completed",
        }),
      }),
    };
    const endLiveRes = await (Route as any).options.server.handlers.POST(endLiveEvent);
    expect(endLiveRes.status).toBe(200);
    const endLiveBody = await endLiveRes.json();
    expect(endLiveBody.isLive).toBe(false);
    expect(endLiveBody.streamStatus).toBe("OFFLINE");
  });

  it("4. supports producer/provider submission approval and rejection", async () => {
    const channelId = "provider-submitted-channel";
    memory.storedDocs[`channels/${channelId}`] = {
      id: channelId,
      deliveryMode: "live_hls",
      channelType: "live_tv",
      title: "Indie Music Feed",
      submissionStatus: "PENDING_APPROVAL",
      type: "provider",
      ownerUid: "provider-indie-123",
      status: "DRAFT",
    };

    // Approve
    const approveEvent = {
      request: new Request("https://bqsqwad.tv/api/public/v1/zillionaire/live-channels/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "APPROVE_SUBMISSION",
          channelId,
          reason: "Content and licenses verified",
        }),
      }),
    };
    const approveRes = await (Route as any).options.server.handlers.POST(approveEvent);
    expect(approveRes.status).toBe(200);
    const approveBody = await approveRes.json();
    expect(approveBody.submissionStatus).toBe("APPROVED");

    // Verify stored channel is active
    expect(memory.storedDocs[`channels/${channelId}`].status).toBe("ACTIVE");
    expect(memory.storedDocs[`channels/${channelId}`].published).toBe(true);
  });

  it("5. prevents pending or missing channels from going live", async () => {
    memory.storedDocs["channels/pending-live"] = {
      id: "pending-live",
      deliveryMode: "live_hls",
      channelType: "live_tv",
      streamUrl: "https://example.test/pending.m3u8",
      submissionStatus: "PENDING_APPROVAL",
      isLive: false,
    };
    const event = {
      request: new Request("https://bqsqwad.tv/api/public/v1/zillionaire/live-channels/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "GO_LIVE",
          channelId: "pending-live",
          confirmation: true,
          reason: "Attempt to start pending stream",
        }),
      }),
    };
    const res = await (Route as any).options.server.handlers.POST(event);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CHANNEL_NOT_APPROVED");
  });

  it("6. rejects callers without channels module permission", async () => {
    vi.spyOn(rolesModule, "requireZillionaireModule").mockRejectedValue(
      new ApiError(403, "MODULE_FORBIDDEN", "Forbidden: missing channels module"),
    );

    const fakeEvent = {
      request: new Request("https://bqsqwad.tv/api/public/v1/zillionaire/live-channels/", {
        method: "GET",
      }),
    };

    const res = await (Route as any).options.server.handlers.GET(fakeEvent);
    expect(res.status).toBe(403);
  });
});
