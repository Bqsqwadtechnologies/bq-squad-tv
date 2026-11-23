import { describe, expect, it } from "vitest";
import {
  calculateLiveTrendingScore,
  calculateVodTrendingScore,
  DEFAULT_TRENDING_CONFIG,
  mergeTrendingWithPromotions,
  type PromotionRecord,
  type TrendingConfig,
  type TrendingItem,
} from "@/lib/server/trending";

describe("Trending Scoring Algorithm", () => {
  const config: TrendingConfig = {
    ...DEFAULT_TRENDING_CONFIG,
    weightConcurrent: 0.5,
    weightWatchMinutes: 0.3,
    weightUniqueViewers: 0.2,
    weightCompletion: 0.1,
    weightRecency: 0.1,
    maxPromotedShare: 0.25,
  };

  it("calculates live stream score with logarithmic dampening", () => {
    const score1 = calculateLiveTrendingScore(
      { currentViewers: 100, watchMinutesPastHour: 500 },
      config,
    );
    const score2 = calculateLiveTrendingScore(
      { currentViewers: 1000, watchMinutesPastHour: 5000 },
      config,
    );
    expect(score2).toBeGreaterThan(score1);
    expect(score1).toBeGreaterThan(0);
  });

  it("calculates VOD trending score incorporating completion and recency", () => {
    const scoreHighCompletion = calculateVodTrendingScore(
      { watchMinutesPast24h: 1200, uniqueViewersPast24h: 50, completionRate: 0.85 },
      config,
    );
    const scoreLowCompletion = calculateVodTrendingScore(
      { watchMinutesPast24h: 1200, uniqueViewersPast24h: 50, completionRate: 0.15 },
      config,
    );
    expect(scoreHighCompletion).toBeGreaterThan(scoreLowCompletion);
  });

  it("strictly enforces maximum promoted share in trending rails", () => {
    const organic: TrendingItem[] = Array.from({ length: 8 }, (_, i) => ({
      id: `org_${i + 1}`,
      targetType: "channel",
      title: `Organic Title ${i + 1}`,
      category: "Sports",
      score: 100 - i * 10,
      rank: 0,
      posterUrl: null,
      viewerCount: 0,
    }));

    const now = new Date();
    const activePromotions: PromotionRecord[] = [
      {
        id: "p1",
        targetType: "movie",
        targetId: "m1",
        title: "Sponsored Premiere A",
        category: "Movies",
        posterUrl: null,
        packageId: "pkg_boost_24h",
        status: "ACTIVE",
        startsAt: new Date(now.getTime() - 3600000).toISOString(),
        endsAt: new Date(now.getTime() + 3600000).toISOString(),
        impressions: 0,
        clicks: 0,
        watchMinutesGained: 0,
        createdAt: now.toISOString(),
      },
      {
        id: "p2",
        targetType: "series",
        targetId: "s1",
        title: "Sponsored Premiere B",
        category: "Drama",
        posterUrl: null,
        packageId: "pkg_boost_24h",
        status: "ACTIVE",
        startsAt: new Date(now.getTime() - 3600000).toISOString(),
        endsAt: new Date(now.getTime() + 3600000).toISOString(),
        impressions: 0,
        clicks: 0,
        watchMinutesGained: 0,
        createdAt: now.toISOString(),
      },
      {
        id: "p3",
        targetType: "movie",
        targetId: "m2",
        title: "Sponsored Premiere C",
        category: "Movies",
        posterUrl: null,
        packageId: "pkg_boost_24h",
        status: "ACTIVE",
        startsAt: new Date(now.getTime() - 3600000).toISOString(),
        endsAt: new Date(now.getTime() + 3600000).toISOString(),
        impressions: 0,
        clicks: 0,
        watchMinutesGained: 0,
        createdAt: now.toISOString(),
      },
    ];

    const merged = mergeTrendingWithPromotions(organic, activePromotions, config);

    // With 8 organic items and max 25% promoted share, max promotions = floor(8 * 0.25 / 0.75) = 2
    const promotedCount = merged.filter((item) => item.isPromoted).length;
    expect(promotedCount).toBeLessThanOrEqual(2);

    // Promoted items must have badge and distinct label
    const promotedItems = merged.filter((item) => item.isPromoted);
    for (const p of promotedItems) {
      expect(p.isPromoted).toBe(true);
      expect(p.promotionBadge).toBe("Sponsored");
    }

    // Ranks must be consecutive starting from 1
    merged.forEach((item, index) => {
      expect(item.rank).toBe(index + 1);
    });
  });

  it("excludes expired or pending promotions from the rail", () => {
    const organic: TrendingItem[] = [
      {
        id: "org_1",
        targetType: "channel",
        title: "News Live",
        category: "News",
        score: 50,
        rank: 0,
      posterUrl: null,
      viewerCount: 0,
      },
    ];

    const inactivePromotions: PromotionRecord[] = [
      {
        id: "p_expired",
        targetType: "movie",
        targetId: "m1",
        title: "Old Boost",
        category: "Movies",
        posterUrl: null,
        packageId: "pkg_boost_24h",
        status: "EXPIRED",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-01-02T00:00:00Z",
        impressions: 10,
        clicks: 2,
        watchMinutesGained: 40,
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "p_pending",
        targetType: "movie",
        targetId: "m2",
        title: "Pending Boost",
        category: "Movies",
        posterUrl: null,
        packageId: "pkg_boost_24h",
        status: "PENDING_APPROVAL",
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 100000).toISOString(),
        impressions: 0,
        clicks: 0,
        watchMinutesGained: 0,
        createdAt: new Date().toISOString(),
      },
    ];

    const merged = mergeTrendingWithPromotions(organic, inactivePromotions, config);
    expect(merged.length).toBe(1);
    expect(merged[0]?.id).toBe("org_1");
  });
});
