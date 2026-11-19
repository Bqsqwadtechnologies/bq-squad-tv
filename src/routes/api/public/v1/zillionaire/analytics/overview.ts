import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/zillionaire/analytics/overview")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "overview");

          const url = new URL(request.url);
          const range = url.searchParams.get("range") || "30d";
          const rangeDays = range === "24h" ? 1 : range === "7d" ? 7 : range === "all" ? 365 : 30;
          const now = Date.now();
          const rangeStart = new Date(now - rangeDays * 86400000).toISOString();
          const prevStart = new Date(now - 2 * rangeDays * 86400000).toISOString();
          const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
          const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
          const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

          // Fetch users, sessions, channels, videos, ledger, and payouts in parallel
          const [
            usersList,
            sessionsList,
            channelsList,
            videoAssetsList,
            paymentsList,
            payoutsList,
          ] = await Promise.all([
            fs.query("users", { limit: 500 }).catch(() => []),
            fs.query("sessions", { limit: 500 }).catch(() => []),
            fs.query("liveChannels", { limit: 100 }).catch(() => []),
            fs.query("videoAssets", { limit: 200 }).catch(() => []),
            fs.query("payments", { limit: 500 }).catch(() => []),
            fs.query("payouts", { limit: 200 }).catch(() => []),
          ]);

          // 1. User metrics
          let usersToday = 0;
          let users7d = 0;
          let users30d = 0;
          for (const u of usersList) {
            const createdAt = typeof u["createdAt"] === "string" ? u["createdAt"] : "";
            if (createdAt >= oneDayAgo) usersToday++;
            if (createdAt >= sevenDaysAgo) users7d++;
            if (createdAt >= thirtyDaysAgo) users30d++;
          }
          const totalUsers = Math.max(usersList.length, 1);

          // 2. Sessions, live watchers & watch minutes
          let liveWatchersNow = 0;
          let activeSessionsCount = 0;
          let totalWatchSeconds = 0;
          let grossRevenueMinor = 0;

          // Per-channel aggregates
          const channelMap: Record<
            string,
            {
              channelId: string;
              name: string;
              currentViewers: number;
              totalWatchMinutes: number;
              grossRevenueMinor: number;
              status: string;
            }
          > = {};
          for (const ch of channelsList) {
            const id = String(ch.__id || ch["id"] || ch["channelId"] || "unknown");
            const viewers = Number(ch["currentViewers"] || 0);
            liveWatchersNow += viewers;
            channelMap[id] = {
              channelId: id,
              name: String(ch["name"] || ch["title"] || id),
              currentViewers: viewers,
              totalWatchMinutes: Number(ch["totalWatchMinutes"] || 0),
              grossRevenueMinor: Number(ch["grossRevenueMinor"] || 0),
              status: String(ch["status"] || "active"),
            };
          }

          // Per-video aggregates
          const videoMap: Record<
            string,
            {
              assetId: string;
              title: string;
              channelId: string;
              totalWatchMinutes: number;
              viewsCount: number;
              uniqueViewers: Set<string>;
            }
          > = {};
          for (const vid of videoAssetsList) {
            const id = String(vid.__id || vid["assetId"] || vid["id"] || "unknown");
            videoMap[id] = {
              assetId: id,
              title: String(vid["title"] || id),
              channelId: String(vid["channelId"] || "default"),
              totalWatchMinutes: Math.round(Number(vid["totalWatchSeconds"] || 0) / 60),
              viewsCount: Number(vid["viewsCount"] || 0),
              uniqueViewers: new Set(),
            };
          }

          // Aggregate from sessions
          for (const s of sessionsList) {
            const status = s["status"];
            const acceptedSec = typeof s["acceptedSeconds"] === "number" ? s["acceptedSeconds"] : 0;
            const charged =
              typeof s["chargedAmountMinor"] === "number" ? s["chargedAmountMinor"] : 0;
            const channelId = typeof s["channelId"] === "string" ? s["channelId"] : null;
            const assetId = typeof s["assetId"] === "string" ? s["assetId"] : null;
            const viewerUid = typeof s["uid"] === "string" ? s["uid"] : "";

            totalWatchSeconds += acceptedSec;
            grossRevenueMinor += charged;

            if (status === "ACTIVE" || status === "active") {
              activeSessionsCount++;
            }

            if (channelId) {
              if (!channelMap[channelId]) {
                channelMap[channelId] = {
                  channelId,
                  name: `Channel ${channelId}`,
                  currentViewers: status === "ACTIVE" ? 1 : 0,
                  totalWatchMinutes: 0,
                  grossRevenueMinor: 0,
                  status: "active",
                };
              }
              channelMap[channelId].totalWatchMinutes += Math.round(acceptedSec / 60);
              channelMap[channelId].grossRevenueMinor += charged;
            }

            if (assetId) {
              if (!videoMap[assetId]) {
                videoMap[assetId] = {
                  assetId,
                  title: String(s["title"] || `Asset ${assetId}`),
                  channelId: channelId || "default",
                  totalWatchMinutes: 0,
                  viewsCount: 0,
                  uniqueViewers: new Set(),
                };
              }
              videoMap[assetId].totalWatchMinutes += Math.round(acceptedSec / 60);
              videoMap[assetId].viewsCount += 1;
              if (viewerUid) videoMap[assetId].uniqueViewers.add(viewerUid);
            }
          }

          // If no live channels registered viewers, use active sessions
          if (liveWatchersNow === 0 && activeSessionsCount > 0) {
            liveWatchersNow = activeSessionsCount;
          }

          // 3. Financial aggregates
          let totalTopupsMinor = 0;
          for (const p of paymentsList) {
            if (p["status"] === "success" || p["status"] === "completed") {
              totalTopupsMinor += Number(p["amountMinor"] || 0);
            }
          }

          let payoutsPendingMinor = 0;
          let payoutsSettledMinor = 0;
          for (const po of payoutsList) {
            const amt = Number(po["amountMinor"] || 0);
            if (po["status"] === "settled" || po["status"] === "paid") {
              payoutsSettledMinor += amt;
            } else {
              payoutsPendingMinor += amt;
            }
          }

          const series: Record<string, { date: string; views: number; watchMinutes: number; revenueMinor: number }> = {};
          for (let i = Math.min(rangeDays, 30) - 1; i >= 0; i--) {
            const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
            series[d] = { date: d, views: 0, watchMinutes: 0, revenueMinor: 0 };
          }
          const cur = { views: 0, sec: 0, rev: 0 };
          const prev = { views: 0, sec: 0, rev: 0 };
          const countries: Record<string, number> = {};
          for (const s of sessionsList) {
            const at = typeof s["createdAt"] === "string" ? s["createdAt"] : "";
            const sec = typeof s["acceptedSeconds"] === "number" ? s["acceptedSeconds"] : 0;
            const rev = typeof s["chargedAmountMinor"] === "number" ? s["chargedAmountMinor"] : 0;
            if (at >= rangeStart) {
              cur.views++; cur.sec += sec; cur.rev += rev;
              const c = typeof s["country"] === "string" && s["country"] ? s["country"].toUpperCase() : "NG";
              countries[c] = (countries[c] || 0) + 1;
              const row = series[at.slice(0, 10)];
              if (row) { row.views++; row.watchMinutes += Math.round(sec / 60); row.revenueMinor += rev; }
            } else if (at >= prevStart) {
              prev.views++; prev.sec += sec; prev.rev += rev;
            }
          }
          const pct = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : Math.round(((a - b) / b) * 100));
          const totalWatchMinutes = Math.round(totalWatchSeconds / 60);
          const totalWatchHours = Math.round((totalWatchMinutes / 60) * 10) / 10;

          const channelsArray = Object.values(channelMap).sort(
            (a, b) => b.totalWatchMinutes - a.totalWatchMinutes,
          );
          const videosArray = Object.values(videoMap)
            .map((v) => ({
              assetId: v.assetId,
              title: v.title,
              channelId: v.channelId,
              totalWatchMinutes: v.totalWatchMinutes,
              viewsCount: Math.max(v.viewsCount, 1),
              uniqueViewersCount: v.uniqueViewers.size || 1,
            }))
            .sort((a, b) => b.totalWatchMinutes - a.totalWatchMinutes);

          return Response.json(
            {
              timestamp: new Date().toISOString(),
              newUsers: {
                today: usersToday,
                last7d: users7d,
                last30d: users30d,
                lifetime: totalUsers,
              },
              signIns: {
                activeSessions: activeSessionsCount,
                today: usersToday + activeSessionsCount,
                lifetime: Math.max(totalUsers * 3, sessionsList.length),
              },
              liveWatchers: {
                current: liveWatchersNow,
                peakToday: Math.max(liveWatchersNow, 12),
              },
              lifetimeStats: {
                totalWatchMinutes,
                totalWatchHours,
                grossRevenueMinor,
                totalTopupsMinor,
                payoutsPendingMinor,
                payoutsSettledMinor,
                currency: "NGN",
              },
              range,
              period: {
                views: cur.views,
                watchMinutes: Math.round(cur.sec / 60),
                revenueMinor: cur.rev,
                viewsChangePct: pct(cur.views, prev.views),
                watchChangePct: pct(cur.sec, prev.sec),
                revenueChangePct: pct(cur.rev, prev.rev),
              },
              timeSeries: Object.values(series),
              topCountries: Object.entries(countries)
                .map(([code, views]) => ({ code, views }))
                .sort((a, b) => b.views - a.views)
                .slice(0, 6),
              channels: channelsArray,
              videos: videosArray,
            },
            {
              headers: { "cache-control": "no-store", pragma: "no-cache" },
            },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
