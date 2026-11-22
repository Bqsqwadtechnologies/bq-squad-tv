import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getUserProfile, requireUser } from "@/lib/server/api";
import { toChannelSummary, visibleChannels } from "./-shared";
import {
  calculateLiveTrendingScore,
  calculateVodTrendingScore,
  getHeroBannerSlots,
  getHomeRailsConfig,
  getTrendingConfig,
  mergeTrendingWithPromotions,
  type PromotionRecord,
  type TrendingItem,
} from "@/lib/server/trending";

export const Route = createFileRoute("/api/public/v1/catalog/home")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const profile = await getUserProfile(fs, user.uid);
          const viewerCountry = request.headers.get("cf-ipcountry")?.trim().toUpperCase() ?? "";

          const [rawChannels, featuredAssets, promotions, trendingConfig, homeRails, heroSlots] =
            await Promise.all([
              fs.query("channels", {
                filters: [{ field: "published", op: "EQUAL", value: true }],
                limit: 200,
              }).catch(() => []),
              fs.query("contentAssets", {
                filters: [
                  { field: "featured", op: "EQUAL", value: true },
                  { field: "status", op: "EQUAL", value: "ready" },
                  { field: "contentStatus", op: "EQUAL", value: "published" },
                ],
                orderByField: "featureRank",
                limit: 50,
              }).catch(() => []),
              fs.query("trendingPromotions", {
                filters: [{ field: "status", op: "EQUAL", value: "ACTIVE" }],
                limit: 50,
              }).catch(() => []),
              getTrendingConfig(fs),
              getHomeRailsConfig(fs),
              getHeroBannerSlots(fs, {
                country: viewerCountry,
                audience: profile.adultEligible ? "all" : "kids",
              }),
            ]);

          const channels = visibleChannels(rawChannels, profile.adultEligible);
          const summaries = channels.map(toChannelSummary);
          const visibleChannelIds = new Set(channels.map((channel) => channel.__id));

          // 1. Organic scored trending calculation
          const organicItems: TrendingItem[] = [];
          for (const ch of channels) {
            const currentViewers = Number(ch["currentViewers"] || 0);
            const totalWatchMinutes = Number(ch["totalWatchMinutes"] || 0);
            const score = calculateLiveTrendingScore(
              {
                currentViewers,
                watchMinutesPastHour: Math.round(totalWatchMinutes * 0.2),
              },
              trendingConfig,
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
              isLive: ch["isLive"] === true,
              ...(ch["ratePerMinuteMinor"]
                ? { pricePerMinute: (Number(ch["ratePerMinuteMinor"]) / 100).toFixed(2) }
                : {}),
            });
          }

          for (const asset of featuredAssets) {
            if (
              typeof asset["channelId"] === "string" &&
              visibleChannelIds.has(asset["channelId"] as string)
            ) {
              const watchMinutes = Number(asset["watchMinutes"] || 0);
              const uniqueViewers = Number(asset["uniqueViewers"] || 0);
              const score = calculateVodTrendingScore(
                {
                  watchMinutesPast24h: watchMinutes,
                  uniqueViewersPast24h: uniqueViewers,
                  completionRate: Number(asset["completionRate"] || 0.6),
                },
                trendingConfig,
              );
              organicItems.push({
                id: asset.__id,
                targetType: "movie",
                title: typeof asset["title"] === "string" ? asset["title"] : "Untitled",
                category: typeof asset["category"] === "string" ? asset["category"] : "Movie",
                posterUrl: typeof asset["posterUrl"] === "string" ? asset["posterUrl"] : null,
                channelId: asset["channelId"] as string,
                score,
                rank: 0,
                viewerCount: uniqueViewers,
                isLive: false,
              });
            }
          }

          const typedPromotions = promotions as unknown as PromotionRecord[];
          const computedTrending = mergeTrendingWithPromotions(
            organicItems,
            typedPromotions,
            trendingConfig,
          );

          const featuredContent = featuredAssets
            .filter(
              (asset) =>
                typeof asset["channelId"] === "string" &&
                visibleChannelIds.has(asset["channelId"] as string),
            )
            .sort((left, right) => {
              const leftRank =
                typeof left["featureRank"] === "number" ? (left["featureRank"] as number) : 10_000;
              const rightRank =
                typeof right["featureRank"] === "number"
                  ? (right["featureRank"] as number)
                  : 10_000;
              return leftRank - rightRank;
            })
            .map((asset) => {
              const channelId = asset["channelId"] as string;
              const channel = channels.find((item) => item.__id === channelId);
              return {
                id: asset.__id,
                channelId,
                channelTitle: typeof channel?.["title"] === "string" ? channel["title"] : "Channel",
                title: typeof asset["title"] === "string" ? asset["title"] : "Untitled",
                category: typeof asset["category"] === "string" ? asset["category"] : "Movie",
                genre:
                  typeof asset["genre"] === "string"
                    ? asset["genre"]
                    : Array.isArray(asset["genres"])
                      ? asset["genres"]
                          .filter((value): value is string => typeof value === "string")
                          .join(", ")
                      : "",
                posterUrl: typeof asset["posterUrl"] === "string" ? asset["posterUrl"] : null,
                averageStars: typeof asset["averageStars"] === "number" ? asset["averageStars"] : 0,
                ratingCount: typeof asset["ratingCount"] === "number" ? asset["ratingCount"] : 0,
                featureRank:
                  typeof asset["featureRank"] === "number" ? asset["featureRank"] : 10_000,
              };
            });

          const now = Date.now();
          const inTwoHours = now + 2 * 60 * 60 * 1000;

          return Response.json({
            heroSlots,
            rails: homeRails.filter((r) => r.enabled),
            liveNow: summaries.filter((channel) => channel.isLive),
            startingSoon: channels
              .filter((channel) => {
                const startsAt =
                  typeof channel["nextProgrammeStartsAt"] === "string"
                    ? Date.parse(channel["nextProgrammeStartsAt"] as string)
                    : null;
                return startsAt !== null && startsAt > now && startsAt <= inTwoHours;
              })
              .map(toChannelSummary),
            channels: summaries,
            replays: channels
              .filter((channel) => channel["hasReplays"] === true)
              .map(toChannelSummary),
            continueWatching: [],
            trending: computedTrending,
            featuredContent,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
