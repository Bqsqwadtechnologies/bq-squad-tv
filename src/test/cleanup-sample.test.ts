import { describe, expect, it, vi, beforeEach } from "vitest";
import { Route as CleanupRoute } from "@/routes/api/public/v1/zillionaire/cleanup-sample";
import { Route as StorageSeedRoute } from "@/routes/api/public/v1/zillionaire/storage/seed";
import { Firestore, decodeFields, type FirestoreWrite } from "@/lib/server/firebase-admin";
import * as apiModule from "@/lib/server/api";
import * as rolesModule from "@/lib/server/roles";
import { createStepUpToken } from "@/lib/server/zillionaire-access";

function createMemoryFirestore() {
  const storedDocs: Record<string, Record<string, unknown>> = {};
  const deletedDocs: string[] = [];

  const initialCollections: Record<string, Array<Record<string, unknown> & { __id: string }>> = {
    channels: [
      { __id: "demo", name: "Demo Channel", isDemo: true },
      { __id: "ch_real_1", name: "Real News Live", isDemo: false },
      { __id: "test_channel_1", name: "Test Channel", isDemo: false },
      { __id: "test_live_stream_1", name: "Test Live Stream", channelType: "live_tv", streamUrl: "https://example.invalid/test.m3u8", isDemo: false },
    ],
    "channels/test_channel_1/schedule": [
      { __id: "test_program_future", channelId: "test_channel_1", title: "Test Program", startsAt: "2027-01-01T10:00:00.000Z", endsAt: "2027-01-01T11:00:00.000Z", status: "SCHEDULED" },
      { __id: "test_program_upcoming", channelId: "test_channel_1", title: "Test Programme", startsAt: "2027-01-02T10:00:00.000Z", endsAt: "2027-01-02T11:00:00.000Z", status: "UPCOMING" },
    ],
    epgSchedule: [
      { __id: "epg_test_future", title: "Test Program", channelId: "test_channel_1", startTime: "2027-01-01T10:00:00.000Z", endTime: "2027-01-01T11:00:00.000Z" },
      { __id: "epg_test_upcoming", title: "Test Programme", channelId: "test_channel_1", startTime: "2027-01-02T10:00:00.000Z", endTime: "2027-01-02T11:00:00.000Z" },
      { __id: "epg_real", title: "Real Evening Show", channelId: "ch_real_1", startTime: "2027-01-02T11:00:00.000Z", endTime: "2027-01-02T12:00:00.000Z" },
    ],
    contentAssets: [
      { __id: "demo_asset_1", title: "Lagos Nights Sample", uploaderUid: "system_seed", sizeBytes: 10485760 },
      { __id: "asset_real_1", title: "Documentary Master", uploaderUid: "user_authentic", sizeBytes: 20971520 },
      { __id: "test_movie_1", title: "Test Movie", uploaderUid: "user_authentic", sizeBytes: 1024 },
    ],
    series: [
      { __id: "demo_series_1", title: "Abidjan Hustle Season 1", isDemo: true },
      { __id: "series_real_1", title: "Authentic Season 1", isDemo: false },
    ],
    episodes: [
      { __id: "demo_ep_1", title: "Episode 1 Demo", isDemo: true },
    ],
    storageDestinations: [
      { __id: "demo_dest", accountAlias: "Demo B2 Bucket", isDemo: true },
      { __id: "prod_dest", accountAlias: "Primary B2 Bucket", isDemo: false },
    ],
    storageObjects: [
      { __id: "demo_obj_1", path: "sample/trailer.mp4", isDemo: true, sizeBytes: 5242880 },
    ],
  };

  const fs = {
    docName: (path: string) => `projects/test-project/databases/(default)/documents/${path}`,
    getDoc: vi.fn(async (path: string) => {
      if (storedDocs[path]) return storedDocs[path];
      const split = path.lastIndexOf("/");
      const collectionPath = path.slice(0, split);
      const id = path.slice(split + 1);
      return (initialCollections[collectionPath] || []).find((row) => row.__id === id) || null;
    }),
    set: vi.fn(async (path: string, fields: Record<string, unknown>) => {
      storedDocs[path] = { ...fields };
    }),
    setDoc: vi.fn(async (path: string, fields: Record<string, unknown>) => {
      storedDocs[path] = { ...fields };
    }),
    patchDoc: vi.fn(async (path: string, fields: Record<string, unknown>) => {
      storedDocs[path] = { ...(storedDocs[path] || {}), ...fields };
    }),
    transact: vi.fn(async (paths: string[], callback: (docs: Array<Record<string, unknown> | null>) => Promise<{ result: unknown; writes: FirestoreWrite[] }> | { result: unknown; writes: any[] }) => {
      const outcome = await callback(paths.map((path) => {
        if (storedDocs[path]) return storedDocs[path];
        const split = path.lastIndexOf("/");
        const collectionPath = path.slice(0, split);
        const id = path.slice(split + 1);
        return (initialCollections[collectionPath] || []).find((row) => row.__id === id) || null;
      }));
      for (const write of outcome.writes) {
        if ("delete" in write) {
          const deletedPath = String(write.delete).replace("projects/test-project/databases/(default)/documents/", "");
          deletedDocs.push(deletedPath);
          delete storedDocs[deletedPath];
        } else if ("update" in write) {
          const path = String(write.update.name).replace("projects/test-project/databases/(default)/documents/", "");
          storedDocs[path] = { ...(storedDocs[path] || {}), ...decodeFields(write.update.fields) };
        }
      }
      return outcome.result;
    }),
    deleteDoc: vi.fn(async (path: string) => {
      deletedDocs.push(path);
      delete storedDocs[path];
    }),
    query: vi.fn(async (collectionId: string) => {
      return initialCollections[collectionId] || [];
    }),
  } as unknown as Firestore;

  return { fs, storedDocs, deletedDocs, initialCollections };
}

describe("Batch Q2 — Sample Content Cleanup System", () => {
  let memFs: ReturnType<typeof createMemoryFirestore>;

  beforeEach(() => {
    memFs = createMemoryFirestore();
    vi.spyOn(Firestore, "create").mockResolvedValue(memFs.fs);
    process.env["SESSION_SECRET"] = "test-session-secret-at-least-32-chars-long";
  });

  it("POST /api/public/v1/zillionaire/cleanup-sample rejects non-owners", async () => {
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({ uid: "regular_user" } as any);
    vi.spyOn(rolesModule, "requireZillionaireModule").mockResolvedValue({
      isZillionaireOwner: false,
      role: "viewer",
      allowedModules: [],
    } as any);

    const request = new Request("http://localhost/api/public/v1/zillionaire/cleanup-sample", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
    });

    const handler = (CleanupRoute as any).options.server.handlers.POST;
    const response = await handler({ request });
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe("OWNER_ONLY");
  });

  it("POST /api/public/v1/zillionaire/cleanup-sample performs dry-run scan without deleting", async () => {
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({ uid: "owner_user" } as any);
    vi.spyOn(rolesModule, "requireZillionaireModule").mockResolvedValue({
      isZillionaireOwner: true,
      role: "owner",
      allowedModules: ["system"],
    } as any);

    const request = new Request("http://localhost/api/public/v1/zillionaire/cleanup-sample", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
    });

    const handler = (CleanupRoute as any).options.server.handlers.POST;
    const response = await handler({ request });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.dryRun).toBe(true);
    expect(body.totalRecordsFound).toBeGreaterThanOrEqual(5);
    expect(body.channelsFound).toBe(3);
    expect(body.contentAssetsFound).toBe(2);
    expect(body.epgProgrammesFound).toBe(2);
    expect(body.channelProgrammesFound).toBe(2);
    expect(body.seriesFound).toBe(1);
    expect(body.storageDestinationsFound).toBe(1);
    expect(memFs.deletedDocs.length).toBe(0);
  });

  it("POST /api/public/v1/zillionaire/cleanup-sample rejects execution without step-up token", async () => {
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({ uid: "owner_user" } as any);
    vi.spyOn(rolesModule, "requireZillionaireModule").mockResolvedValue({
      isZillionaireOwner: true,
      role: "owner",
      allowedModules: ["system"],
    } as any);

    const request = new Request("http://localhost/api/public/v1/zillionaire/cleanup-sample", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dryRun: false,
        confirmation: "DELETE_SAMPLE_CONTENT",
        reason: "Purging sample fixtures",
      }),
    });

    const handler = (CleanupRoute as any).options.server.handlers.POST;
    const response = await handler({ request });
    expect(response.status).toBe(428);
    const body = await response.json();
    expect(body.code).toBe("STEP_UP_REQUIRED");
  });

  it("POST /api/public/v1/zillionaire/cleanup-sample rejects execution with invalid confirmation text", async () => {
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({ uid: "owner_user" } as any);
    vi.spyOn(rolesModule, "requireZillionaireModule").mockResolvedValue({
      isZillionaireOwner: true,
      role: "owner",
      allowedModules: ["system"],
    } as any);

    const stepUp = createStepUpToken("owner_user", "permanent_delete");

    const request = new Request("http://localhost/api/public/v1/zillionaire/cleanup-sample", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-zillionaire-step-up": stepUp.token,
      },
      body: JSON.stringify({
        dryRun: false,
        confirmation: "WRONG_TEXT",
        reason: "Purging sample fixtures",
      }),
    });

    const handler = (CleanupRoute as any).options.server.handlers.POST;
    const response = await handler({ request });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("INVALID_CONFIRMATION");
  });

  it("POST /api/public/v1/zillionaire/cleanup-sample executes deletion, writes report and audit log", async () => {
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({ uid: "owner_user" } as any);
    vi.spyOn(rolesModule, "requireZillionaireModule").mockResolvedValue({
      isZillionaireOwner: true,
      role: "owner",
      allowedModules: ["system"],
    } as any);

    const stepUp = createStepUpToken("owner_user", "permanent_delete");

    const request = new Request("http://localhost/api/public/v1/zillionaire/cleanup-sample", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-zillionaire-step-up": stepUp.token,
      },
      body: JSON.stringify({
        dryRun: false,
        confirmation: "DELETE_SAMPLE_CONTENT",
        reason: "Production compliance purge of all demo fixtures",
      }),
    });

    const handler = (CleanupRoute as any).options.server.handlers.POST;
    const response = await handler({ request });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.dryRun).toBe(false);
    expect(body.totalRecordsDeleted).toBeGreaterThanOrEqual(5);

    // Verify docs deleted
    expect(memFs.deletedDocs).toContain("channels/demo");
    expect(memFs.deletedDocs).toContain("channels/test_channel_1");
    expect(memFs.deletedDocs).toContain("channels/test_live_stream_1");
    expect(memFs.deletedDocs).toContain("contentAssets/demo_asset_1");
    expect(memFs.deletedDocs).toContain("contentAssets/test_movie_1");
    expect(memFs.deletedDocs).toContain("epgSchedule/epg_test_future");
    expect(memFs.deletedDocs).toContain("epgSchedule/epg_test_upcoming");
    expect(memFs.deletedDocs).toContain("channels/test_channel_1/schedule/test_program_future");
    expect(memFs.deletedDocs).toContain("channels/test_channel_1/schedule/test_program_upcoming");
    expect(memFs.deletedDocs).toContain("series/demo_series_1");
    expect(memFs.deletedDocs).toContain("storageDestinations/demo_dest");

    // Verify report written
    const reportKey = Object.keys(memFs.storedDocs).find((k) => k.startsWith("sampleCleanupReports/"));
    expect(reportKey).toBeDefined();

    // Verify audit log written
    const auditKey = Object.keys(memFs.storedDocs).find((k) => k.startsWith("auditLog/"));
    expect(auditKey).toBeDefined();
    expect((auditKey ? memFs.storedDocs[auditKey]?.["action"] : undefined)).toBe("CLEANUP_SAMPLE_CONTENT");
  });

  it("POST /api/public/v1/zillionaire/storage/seed is locked in production", async () => {
    const prevNodeEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";
    delete process.env["ALLOW_SAMPLE_SEED"];

    try {
      vi.spyOn(apiModule, "requireUser").mockResolvedValue({ uid: "owner_user" } as any);

      const request = new Request("http://localhost/api/public/v1/zillionaire/storage/seed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: "Seed destinations",
          destinations: [
            {
              destinationId: "test_dest",
              providerType: "lovable_storage",
              accountAlias: "Test",
              secretPrefix: "TEST_STORAGE",
              bucketName: "test-bucket",
              region: "auto",
              purpose: "source_media",
              accountGroup: "primary",
              mode: "active",
              replicaOf: null,
              softCapBytes: 1000000,
              accountCapBytes: 2000000,
            },
          ],
        }),
      });

      const handler = (StorageSeedRoute as any).options.server.handlers.POST;
      const response = await handler({ request });
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.code).toBe("SEED_LOCKED_IN_PRODUCTION");
    } finally {
      process.env["NODE_ENV"] = prevNodeEnv;
    }
  });
});
