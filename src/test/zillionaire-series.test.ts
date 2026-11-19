import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Route as SeriesRoute } from "@/routes/api/public/v1/zillionaire/series/index";
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
      return {
        exists: Boolean(data),
        data: data ? { ...data } : null,
      };
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
    list: vi.fn(async (collectionId: string) => {
      return Object.entries(storedDocs)
        .filter(([k]) => k.startsWith(`${collectionId}/`))
        .map(([k, v]) => ({ id: k.split("/")[1], data: v }));
    }),
  };

  return { fs, storedDocs };
}

describe("Zillionaire Series and Episodes Pipeline API", () => {
  let memory: ReturnType<typeof createMemoryFirestore>;

  beforeEach(() => {
    memory = createMemoryFirestore();
    vi.spyOn(Firestore, "create").mockResolvedValue(memory.fs as any);
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "owner-1",
      email: "owner@bqsqwad.tv",
      roles: ["admin"],
    } as any);
    vi.spyOn(rolesModule, "requireZillionaireModule").mockResolvedValue(true as any);
    vi.spyOn(auditModule, "writeAuditLog").mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. creates a new series with metadata, cast, crew, and audit log", async () => {
    const postHandler = (SeriesRoute as any).options.server.handlers.POST;
    const fakeEvent = {
      request: new Request("https://example.com/api/public/v1/zillionaire/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE_SERIES",
          title: "Lagos Underground",
          description: "A gritty high-stakes crime drama",
          channelId: "ch_drama",
          genre: "Crime",
          ageRating: "16+",
          cast: [{ name: "Actor A", role: "Protagonist" }],
          crew: [{ name: "Director B", role: "Director" }],
          status: "DRAFT",
          reason: "New flagship episodic commission",
        }),
      }),
    };

    const res = await postHandler(fakeEvent);
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.series.title).toBe("Lagos Underground");
    expect(body.series.genre).toBe("Crime");
    expect(body.series.ageRating).toBe("16+");

    // Verify stored in memory
    const keys = Object.keys(memory.storedDocs);
    expect(keys.length).toBe(1);
    expect(keys[0]).toContain("series/");
  });

  it("2. adds a season to a series", async () => {
    const postHandler = (SeriesRoute as any).options.server.handlers.POST;

    // Create series first
    memory.storedDocs["series/s1"] = {
      id: "s1",
      title: "Lagos Underground",
      seasons: [],
    };

    const fakeEvent = {
      request: new Request("https://example.com/api/public/v1/zillionaire/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE_SEASON",
          seriesId: "s1",
          seasonNumber: 1,
          title: "Season One: The Genesis",
          reason: "Adding premiere season",
        }),
      }),
    };

    const res = await postHandler(fakeEvent);
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.season.seasonNumber).toBe(1);
    expect(body.season.title).toBe("Season One: The Genesis");

    const updated = memory.storedDocs["series/s1"];
    expect((updated.seasons as any[]).length).toBe(1);
  });

  it("3. creates an episode with skip-intro, next-episode offset, and age rating override", async () => {
    const postHandler = (SeriesRoute as any).options.server.handlers.POST;

    memory.storedDocs["series/s1"] = {
      id: "s1",
      title: "Lagos Underground",
      seasons: [
        {
          id: "sn1",
          seriesId: "s1",
          seasonNumber: 1,
          title: "Season 1",
          episodes: [],
        },
      ],
    };

    const fakeEvent = {
      request: new Request("https://example.com/api/public/v1/zillionaire/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE_EPISODE",
          seriesId: "s1",
          seasonId: "sn1",
          episodeNumber: 1,
          title: "Pilot: The Crossroads",
          durationMinutes: 52,
          skipIntroSeconds: 65,
          nextEpisodeOffsetSeconds: 40,
          ageRatingOverride: "18+",
          status: "READY",
          reason: "Ingesting episode 1",
        }),
      }),
    };

    const res = await postHandler(fakeEvent);
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.episode.title).toBe("Pilot: The Crossroads");
    expect(body.episode.skipIntroSeconds).toBe(65);
    expect(body.episode.nextEpisodeOffsetSeconds).toBe(40);
    expect(body.episode.ageRatingOverride).toBe("18+");
  });

  it("4. bulk auto-numbers episodes and reorders them", async () => {
    const postHandler = (SeriesRoute as any).options.server.handlers.POST;

    memory.storedDocs["series/s1"] = {
      id: "s1",
      title: "Lagos Underground",
      seasons: [
        {
          id: "sn1",
          seriesId: "s1",
          seasonNumber: 1,
          title: "Season 1",
          episodes: [],
        },
      ],
    };

    // Bulk create 3 episodes
    const bulkEvent = {
      request: new Request("https://example.com/api/public/v1/zillionaire/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "BULK_CREATE_EPISODES",
          seriesId: "s1",
          seasonId: "sn1",
          startNumber: 1,
          episodes: [
            { title: "Episode 1" },
            { title: "Episode 2" },
            { title: "Episode 3" },
          ],
          reason: "Bulk import",
        }),
      }),
    };

    const bulkRes = await postHandler(bulkEvent);
    expect(bulkRes.status).toBe(200);
    const bulkBody = await bulkRes.json();
    expect(bulkBody.count).toBe(3);

    const epIds = bulkBody.episodes.map((e: any) => e.id);
    // Reverse order
    const reorderEvent = {
      request: new Request("https://example.com/api/public/v1/zillionaire/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REORDER_EPISODES",
          seriesId: "s1",
          seasonId: "sn1",
          episodeOrder: [epIds[2], epIds[1], epIds[0]],
          reason: "Adjust chronology",
        }),
      }),
    };

    const reorderRes = await postHandler(reorderEvent);
    expect(reorderRes.status).toBe(200);
    const reorderBody = await reorderRes.json();
    expect(reorderBody.episodes[0].id).toBe(epIds[2]);
    expect(reorderBody.episodes[0].episodeNumber).toBe(1);
    expect(reorderBody.episodes[2].id).toBe(epIds[0]);
    expect(reorderBody.episodes[2].episodeNumber).toBe(3);
  });

  it("5. rejects callers without content module permission", async () => {
    vi.spyOn(rolesModule, "requireZillionaireModule").mockRejectedValue(
      new ApiError(403, "MODULE_FORBIDDEN", "Forbidden"),
    );

    const postHandler = (SeriesRoute as any).options.server.handlers.POST;
    const fakeEvent = {
      request: new Request("https://example.com/api/public/v1/zillionaire/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE_SERIES",
          title: "Unauthorized Show",
          description: "Desc",
          channelId: "ch1",
          reason: "Unauthorized attempt",
        }),
      }),
    };

    const res = await postHandler(fakeEvent);
    
    expect(res.status).toBe(403);
  });
});
