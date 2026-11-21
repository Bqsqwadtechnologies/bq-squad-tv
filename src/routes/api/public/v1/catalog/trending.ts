import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import {
  calculateLiveTrendingScore,
  calculateVodTrendingScore,
  getTrendingConfig,
  mergeTrendingWithPromotions,
  type PromotionRecord,
  type TrendingItem,
} from "@/lib/server/trending";

export const Route = createFileRoute("/api/public/v1/catalog/trending")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const config = await getTrendingConfig(fs);

          const [channels, assets, promotions] = await Promise.all([
            fs.query("channels", {
              filters: [{ field: "published", op: "EQUAL", value: true }],
              limit: 100,
            }).catch(() => []),
            fs.query("contentAssets", {
              filters: [
                { field: "status", op: "EQUAL", value: "ready" },
                { field: "contentStatus", op: "EQUAL", value: "published" },
              ],
              limit: 100,
            }).catch(() => []),
            fs.query("trendingPromotions", {
              filters: [{ field: "status", op: "EQUAL", value: "ACTIVE" }],
              limit: 50,
            }).catch(() => []),
          ]);

          const organicItems: TrendingItem[] = [];

          // 1. Process Live Channels
          for (const ch of channels) {
            const currentViewers = Number(ch["currentViewers"] || 0);
            const totalWatchMinutes = Number(ch["totalWatchMinutes"] || 0);
            const score = calculateLiveTrendingScore(
              {
                currentViewers,
                watchMinutesPastHour: Math.round(totalWatchMinutes * 0.2), // last 60m slice
              },
              config,
            );

            organicItems.push({
              id: ch.__id,
              targetType: "channel",
              title: typeof ch["title"] === "string" ? ch["title"] : "Channel",
              category: typeof ch["category"] === "string" ? ch["category"] : "Live TV",
              posterUrl: typeof ch["logoUrl"] === "string" ? ch["logoUrl"] : null,
              channelId: ch.__id,
              score,
              rank: 0,
              viewerCount: currentViewers,
              isLive: Boolean(ch["isLive"] ?? true),
              ...(ch["ratePerMinuteMinor"] ? { pricePerMinute: (Number(ch["ratePerMinuteMinor"]) / 100).toFixed(2) } : {}),
            });
          }

          // 2. Process VOD content assets
          for (const a of assets) {
            const watchMinutes = Number(a["watchMinutes"] || 0);
            const uniqueViewers = Number(a["uniqueViewers"] || 0);
            const completionRate = Number(a["completionRate"] || 0.6);
            const score = calculateVodTrendingScore(
              {
                watchMinutesPast24h: watchMinutes,
                uniqueViewersPast24h: uniqueViewers,
                completionRate,
              },
              config,
            );

            organicItems.push({
              id: a.__id,
              targetType: "movie",
              title: typeof a["title"] === "string" ? a["title"] : "Untitled",
              category: typeof a["category"] === "string" ? a["category"] : "Movie",
              posterUrl: typeof a["posterUrl"] === "string" ? a["posterUrl"] : null,
              ...(typeof a["channelId"] === "string" ? { channelId: a["channelId"] } : {}),
              score,
              rank: 0,
              viewerCount: uniqueViewers,
              isLive: false,
            });
          }

          const typedPromotions = promotions as unknown as PromotionRecord[];
          const trendingRail = mergeTrendingWithPromotions(organicItems, typedPromotions, config);

          return Response.json({
            trending: trendingRail,
            total: trendingRail.length,
            refreshedAt: new Date().toISOString(),
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
