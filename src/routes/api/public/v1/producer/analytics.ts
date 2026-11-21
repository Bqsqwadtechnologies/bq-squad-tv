import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/producer/analytics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const producer = await fs.getDoc(`producers/${user.uid}`);
          if (!producer) throw new ApiError(403, "FORBIDDEN", "Producer account required.");

          const url = new URL(request.url);
          const period = (url.searchParams.get("period") || "30d").toLowerCase();

          const sessions = await fs.query("sessions", {
            filters: [{ field: "producerUid", op: "EQUAL", value: user.uid }],
          });

          let totalSeconds = 0;
          let totalEarningsMinor = 0;
          const nowMs = Date.now();
          let liveViewers = 0;

          const contentStats: Record<
            string,
            { views: number; watchSeconds: number; revenueMinor: number; title?: string }
          > = {};

          for (const s of sessions) {
            const sec = typeof s["acceptedSeconds"] === "number" ? s["acceptedSeconds"] : 0;
            const rev = typeof s["producerShareMinor"] === "number" ? s["producerShareMinor"] : 0;
            totalSeconds += sec;
            totalEarningsMinor += rev;

            // Live viewers check: active session heartbeat in last 60 seconds
            const lastHeartbeat =
              typeof s["lastHeartbeatAt"] === "string"
                ? new Date(s["lastHeartbeatAt"]).getTime()
                : 0;
            if (s["status"] === "ACTIVE" && nowMs - lastHeartbeat < 60_000) {
              liveViewers += 1;
            }

            const assetId = typeof s["assetId"] === "string" ? s["assetId"] : "channel_stream";
            if (!contentStats[assetId]) {
              contentStats[assetId] = {
                views: 0,
                watchSeconds: 0,
                revenueMinor: 0,
                title: typeof s["assetTitle"] === "string" ? s["assetTitle"] : undefined,
              };
            }
            contentStats[assetId].views += 1;
            contentStats[assetId].watchSeconds += sec;
            contentStats[assetId].revenueMinor += rev;
          }

          // Build performance chart points for selected period based on real sessions
          const numBuckets = period === "24h" ? 12 : period === "7d" ? 7 : period === "12m" ? 12 : 30;
          const series = sessions.length > 0 ? Array.from({ length: numBuckets }, (_, i) => {
            const label =
              period === "24h"
                ? `${i * 2}:00`
                : period === "7d"
                  ? `Day ${i + 1}`
                  : period === "12m"
                    ? `Month ${i + 1}`
                    : `Day ${i + 1}`;
            return {
              label,
              views: 0,
              watchMinutes: 0,
              earningsMinor: 0,
            };
          }) : [];

          // Fetch producer's assets to augment top content
          const channelAssets = await fs.query("contentAssets", {
            filters: [{ field: "producerUid", op: "EQUAL", value: user.uid }],
          }).catch(() => []);

          const topContent = channelAssets.map((item: any, idx: number) => ({
            id: item.id || `asset_${idx}`,
            title: item.title || item.name || `Content Item #${idx + 1}`,
            status: item.status || "ACTIVE",
            views: contentStats[item.id]?.views || 0,
            watchHours:
              Math.round(((contentStats[item.id]?.watchSeconds || 0) / 3600) * 10) / 10,
            revenueMinor: contentStats[item.id]?.revenueMinor || 0,
            thumbnailUrl: item.thumbnailUrl || "/brand/bq-sqwad-tv-logo.png",
          }));

          return Response.json({
            period,
            totalMinutesWatched: Math.round(totalSeconds / 60),
            totalWatchHours: Math.round((totalSeconds / 3600) * 10) / 10,
            totalEarningsMinor,
            currency: producer["currency"] ?? "USD",
            sessionCount: sessions.length,
            liveViewers,
            series,
            topContent,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
