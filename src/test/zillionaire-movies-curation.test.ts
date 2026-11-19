import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Route as MoviesCurationRoute } from "@/routes/api/public/v1/zillionaire/movies/curation/index";
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

describe("Zillionaire Movies Library Curation API", () => {
  let memory: ReturnType<typeof createMemoryFirestore>;

  beforeEach(() => {
    memory = createMemoryFirestore();
    vi.spyOn(Firestore, "create").mockResolvedValue(memory.fs as any);
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "curator-1",
      email: "curator@bqsqwad.tv",
      roles: ["admin"],
    } as any);
    vi.spyOn(rolesModule, "requireZillionaireModule").mockResolvedValue(true as any);
    vi.spyOn(auditModule, "writeAuditLog").mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. fetches initial shelves, hero rotation, and overrides", async () => {
    const getHandler = (MoviesCurationRoute as any).options.server.handlers.GET;
    const fakeEvent = {
      request: new Request("https://example.com/api/public/v1/zillionaire/movies/curation", {
        method: "GET",
      }),
    };

    const res = await getHandler(fakeEvent);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.shelves)).toBe(true);
    expect(body.shelves.length).toBeGreaterThanOrEqual(3);
    expect(body.shelves[0].id).toBe("shelf_trending");
  });

  it("2. saves custom shelves with pinned assets and audit logging", async () => {
    const postHandler = (MoviesCurationRoute as any).options.server.handlers.POST;
    const fakeEvent = {
      request: new Request("https://example.com/api/public/v1/zillionaire/movies/curation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SAVE_SHELVES",
          shelves: [
            {
              id: "shelf_trending",
              name: "Trending Now",
              title: "Trending Movies",
              description: "High viewership",
              type: "trending",
              assetIds: ["mv_1", "mv_2"],
              pinnedAssetIds: ["mv_1"],
              enabled: true,
              order: 1,
            },
            {
              id: "shelf_action",
              name: "Nollywood Action Blockbusters",
              title: "High Octane Action",
              description: "Curated action hits",
              type: "custom",
              assetIds: ["mv_3"],
              pinnedAssetIds: [],
              enabled: true,
              order: 2,
            },
          ],
          reason: "Updated home shelves curation for holiday season",
        }),
      }),
    };

    const res = await postHandler(fakeEvent);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.shelves.length).toBe(2);
    expect(body.shelves[0].pinnedAssetIds).toEqual(["mv_1"]);

    expect(memory.storedDocs["curation/shelves"]).toBeDefined();
    expect(auditModule.writeAuditLog).toHaveBeenCalled();
  });

  it("3. saves featured hero carousel rotation with scheduled dates", async () => {
    const postHandler = (MoviesCurationRoute as any).options.server.handlers.POST;
    const fakeEvent = {
      request: new Request("https://example.com/api/public/v1/zillionaire/movies/curation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SAVE_HERO_ROTATION",
          heroes: [
            {
              assetId: "mv_prestige_1",
              title: "The King's Ransom",
              headline: "Stream the #1 Movie in West Africa",
              tagline: "An empire on the brink of betrayal.",
              ctaText: "Watch Premiere",
              ctaUrl: "/content/mv_prestige_1",
              bannerUrl: "https://example.com/banners/prestige.jpg",
              badgeText: "Exclusive Premiere",
              startDate: "2026-05-01T00:00:00Z",
              endDate: "2026-05-15T23:59:59Z",
              status: "ACTIVE",
            },
          ],
          reason: "New hero banner launch",
        }),
      }),
    };

    const res = await postHandler(fakeEvent);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.heroes.length).toBe(1);
    expect(body.heroes[0].headline).toBe("Stream the #1 Movie in West Africa");
    expect(body.heroes[0].rank).toBe(1);
  });

  it("4. sets movie curation overrides: pin rank, similar titles, region availability, and price override", async () => {
    const postHandler = (MoviesCurationRoute as any).options.server.handlers.POST;
    const fakeEvent = {
      request: new Request("https://example.com/api/public/v1/zillionaire/movies/curation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SET_MOVIE_CURATION",
          override: {
            assetId: "mv_special_42",
            pinRank: 10,
            tags: ["Blockbuster", "Crime", "Nollywood"],
            similarTitleIds: ["mv_1", "mv_2"],
            regionAvailability: {
              mode: "WHITELIST",
              countries: ["NG", "GH", "KE"],
              availableFrom: "2026-04-01T00:00:00Z",
              availableTo: "2026-12-31T23:59:59Z",
            },
            pricingOverride: {
              pricePerMinute: 2.5,
              freePreviewMinutes: 5,
              currency: "NGN",
            },
          },
          reason: "Set regional geo-fence and premium price per minute",
        }),
      }),
    };

    const res = await postHandler(fakeEvent);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.override.assetId).toBe("mv_special_42");
    expect(body.override.pricingOverride.pricePerMinute).toBe(2.5);
    expect(body.override.pricingOverride.freePreviewMinutes).toBe(5);
    expect(body.override.regionAvailability.countries).toEqual(["NG", "GH", "KE"]);

    expect(memory.storedDocs["movie_curation_overrides/mv_special_42"]).toBeDefined();
  });

  it("5. rejects unauthorized callers without content module", async () => {
    vi.spyOn(rolesModule, "requireZillionaireModule").mockRejectedValue(
      new ApiError(403, "FORBIDDEN", "Forbidden"),
    );

    const postHandler = (MoviesCurationRoute as any).options.server.handlers.POST;
    const fakeEvent = {
      request: new Request("https://example.com/api/public/v1/zillionaire/movies/curation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SAVE_SHELVES",
          shelves: [],
          reason: "Unauthorized attempt",
        }),
      }),
    };

    const res = await postHandler(fakeEvent);
    expect(res.status).toBe(403);
  });
});
