import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser, parseBody } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

export interface ShelfDefinition {
  id: string;
  name: string;
  title: string;
  description: string;
  type: "trending" | "new_releases" | "for_you" | "custom";
  assetIds: string[];
  pinnedAssetIds: string[];
  enabled: boolean;
  order: number;
  updatedAt: string;
}

export interface FeaturedHero {
  id: string;
  assetId: string;
  title: string;
  headline: string;
  tagline: string;
  ctaText: string;
  ctaUrl: string;
  bannerUrl: string;
  badgeText: string;
  rank: number;
  startDate: string | null;
  endDate: string | null;
  status: "ACTIVE" | "SCHEDULED" | "PAUSED";
  updatedAt: string;
}

export interface MovieCurationOverride {
  assetId: string;
  pinRank?: number | undefined;
  tags?: string[] | undefined;
  categories?: string[] | undefined;
  similarTitleIds?: string[] | undefined;
  regionAvailability?: {
    mode: "GLOBAL" | "WHITELIST" | "BLACKLIST";
    countries: string[];
    availableFrom: string | null;
    availableTo: string | null;
  } | undefined;
  pricingOverride?: {
    pricePerMinute: number | null;
    freePreviewMinutes: number;
    currency: string;
  } | undefined;
  updatedAt: string;
}

const shelfSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  title: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  type: z.enum(["trending", "new_releases", "for_you", "custom"]),
  assetIds: z.array(z.string()).default([]),
  pinnedAssetIds: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  order: z.number().int().default(0),
});

const heroSchema = z.object({
  id: z.string().optional(),
  assetId: z.string().min(1),
  title: z.string().min(1).max(150),
  headline: z.string().min(1).max(150),
  tagline: z.string().max(300).default(""),
  ctaText: z.string().max(50).default("Watch Now"),
  ctaUrl: z.string().max(500).default("/"),
  bannerUrl: z.string().url().or(z.literal("")).default(""),
  badgeText: z.string().max(50).default("Featured"),
  rank: z.number().int().default(1),
  startDate: z.string().nullable().default(null),
  endDate: z.string().nullable().default(null),
  status: z.enum(["ACTIVE", "SCHEDULED", "PAUSED"]).default("ACTIVE"),
});

const curationOverrideSchema = z.object({
  assetId: z.string().min(1),
  pinRank: z.number().int().min(0).max(1000).optional(),
  tags: z.array(z.string().trim()).optional(),
  categories: z.array(z.string().trim()).optional(),
  similarTitleIds: z.array(z.string()).optional(),
  regionAvailability: z.object({
    mode: z.enum(["GLOBAL", "WHITELIST", "BLACKLIST"]),
    countries: z.array(z.string().trim().length(2)).default([]),
    availableFrom: z.string().nullable().default(null),
    availableTo: z.string().nullable().default(null),
  }).optional(),
  pricingOverride: z.object({
    pricePerMinute: z.number().min(0).nullable().default(null),
    freePreviewMinutes: z.number().int().min(0).max(120).default(0),
    currency: z.string().default("NGN"),
  }).optional(),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("SAVE_SHELVES"),
    shelves: z.array(shelfSchema),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("SAVE_HERO_ROTATION"),
    heroes: z.array(heroSchema),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("SET_MOVIE_CURATION"),
    override: curationOverrideSchema,
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("DELETE_HERO"),
    heroId: z.string().min(1),
    reason: z.string().trim().min(3).max(1000),
  }),
]);

const DEFAULT_SHELVES: ShelfDefinition[] = [
  {
    id: "shelf_trending",
    name: "Trending Now",
    title: "Trending Movies & Premieres",
    description: "Real-time high engagement and most-watched titles across the platform.",
    type: "trending",
    assetIds: [],
    pinnedAssetIds: [],
    enabled: true,
    order: 1,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "shelf_new_releases",
    name: "New Releases",
    title: "Fresh From The Box Office",
    description: "Recently ingested and launched feature films.",
    type: "new_releases",
    assetIds: [],
    pinnedAssetIds: [],
    enabled: true,
    order: 2,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "shelf_for_you",
    name: "For You",
    title: "Recommended For Your Taste",
    description: "Personalized curated mix weighted by viewer affinity.",
    type: "for_you",
    assetIds: [],
    pinnedAssetIds: [],
    enabled: true,
    order: 3,
    updatedAt: new Date().toISOString(),
  },
];

export const Route = createFileRoute("/api/public/v1/zillionaire/movies/curation/")({
  server: {
    handlers: {
      GET: async (event) => {
        try {
          const user = await requireUser(event.request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "content");

          // 1. Fetch Shelves
          const shelvesDoc = await fs.getDoc("curation/shelves");
          let shelves: ShelfDefinition[] = DEFAULT_SHELVES;
          const shelfItems = shelvesDoc ? (shelvesDoc["items"] || (shelvesDoc["data"] as any)?.items) : null;
          if (Array.isArray(shelfItems)) {
            shelves = shelfItems as ShelfDefinition[];
          }

          // 2. Fetch Featured Hero items
          const heroesDoc = await fs.getDoc("curation/hero_rotation");
          let heroes: FeaturedHero[] = [];
          const heroItems = heroesDoc ? (heroesDoc["items"] || (heroesDoc["data"] as any)?.items) : null;
          if (Array.isArray(heroItems)) {
            heroes = heroItems as FeaturedHero[];
          }

          // 3. Fetch Movie Overrides
          const overridesSnap = typeof (fs as any).list === "function"
            ? (await (fs as any).list("movie_curation_overrides")).map((r: any) => ({ ...(r.data || {}), __id: r.id, id: r.id }))
            : typeof (fs as any).query === "function"
            ? await fs.query("movie_curation_overrides")
            : [];
          const overrides: Record<string, MovieCurationOverride> = {};
          for (const item of overridesSnap) {
            const key = String((item as any).__id || (item as any).id || "");
            if (key) {
              overrides[key] = item as unknown as MovieCurationOverride;
            }
          }

          return new Response(
            JSON.stringify({
              success: true,
              shelves,
              heroes,
              overrides,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (err) {
          const { status, body } = errorBody(err);
          return new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        }
      },

      POST: async (event) => {
        try {
          const user = await requireUser(event.request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "content");
          const body = await parseBody(event.request, actionSchema);

          if (body.action === "SAVE_SHELVES") {
            const now = new Date().toISOString();
            const sanitizedShelves = body.shelves.map((s, idx) => ({
              ...s,
              order: idx + 1,
              updatedAt: now,
            }));

            await fs.setDoc("curation/shelves", {
              items: sanitizedShelves,
              updatedAt: now,
              updatedBy: user.uid,
            });

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "MOVIES_CURATION_UPDATE_SHELVES",
              targetType: "curation",
              targetId: "shelves",
              reason: body.reason,
              metadata: {
                shelfCount: sanitizedShelves.length,
                shelfNames: sanitizedShelves.map((s) => s.name),
              },
            });

            return new Response(
              JSON.stringify({ success: true, shelves: sanitizedShelves }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          if (body.action === "SAVE_HERO_ROTATION") {
            const now = new Date().toISOString();
            const sanitizedHeroes: FeaturedHero[] = body.heroes.map((h, idx) => ({
              id: h.id || `hero_${Date.now()}_${idx}`,
              assetId: h.assetId,
              title: h.title,
              headline: h.headline,
              tagline: h.tagline,
              ctaText: h.ctaText,
              ctaUrl: h.ctaUrl,
              bannerUrl: h.bannerUrl,
              badgeText: h.badgeText,
              rank: idx + 1,
              startDate: h.startDate,
              endDate: h.endDate,
              status: h.status,
              updatedAt: now,
            }));

            await fs.setDoc("curation/hero_rotation", {
              items: sanitizedHeroes,
              updatedAt: now,
              updatedBy: user.uid,
            });

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "MOVIES_CURATION_UPDATE_HERO_ROTATION",
              targetType: "curation",
              targetId: "hero_rotation",
              reason: body.reason,
              metadata: {
                heroCount: sanitizedHeroes.length,
                heroTitles: sanitizedHeroes.map((h) => h.title),
              },
            });

            return new Response(
              JSON.stringify({ success: true, heroes: sanitizedHeroes }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          if (body.action === "DELETE_HERO") {
            const heroesDoc = await fs.getDoc("curation/hero_rotation");
            let items: FeaturedHero[] = [];
            const heroItems = heroesDoc ? (heroesDoc["items"] || (heroesDoc["data"] as any)?.items) : null;
            if (Array.isArray(heroItems)) {
              items = heroItems as FeaturedHero[];
            }

            const updatedItems = items.filter((h) => h.id !== body.heroId);
            const now = new Date().toISOString();
            await fs.setDoc("curation/hero_rotation", {
              items: updatedItems,
              updatedAt: now,
              updatedBy: user.uid,
            });

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "MOVIES_CURATION_DELETE_HERO",
              targetType: "curation",
              targetId: `hero_rotation/${body.heroId}`,
              reason: body.reason,
              metadata: { heroId: body.heroId },
            });

            return new Response(
              JSON.stringify({ success: true, heroes: updatedItems }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          if (body.action === "SET_MOVIE_CURATION") {
            const { assetId, ...overrides } = body.override;
            const now = new Date().toISOString();
            const record: MovieCurationOverride = {
              assetId,
              ...overrides,
              updatedAt: now,
            };

            await fs.setDoc(`movie_curation_overrides/${assetId}`, record as unknown as Record<string, unknown>, { merge: true });

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "MOVIES_CURATION_SET_ASSET_OVERRIDE",
              targetType: "movie_curation_overrides",
              targetId: assetId,
              reason: body.reason,
              metadata: {
                assetId,
                hasPricing: Boolean(overrides.pricingOverride),
                hasRegions: Boolean(overrides.regionAvailability),
                hasSimilarTitles: Boolean(overrides.similarTitleIds?.length),
                pinRank: overrides.pinRank,
              },
            });

            return new Response(
              JSON.stringify({ success: true, override: record }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          throw new ApiError(400, "INVALID_ACTION", "Unrecognized curation action.");
        } catch (err) {
          const { status, body } = errorBody(err);
          return new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
