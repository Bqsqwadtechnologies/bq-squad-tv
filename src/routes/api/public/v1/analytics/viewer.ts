import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { requireViewer } from "@/lib/server/access";

export const Route = createFileRoute("/api/public/v1/analytics/viewer")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { user, fs } = await requireViewer(request);

          const sessions = await fs.query("sessions", {
            filters: [{ field: "uid", op: "EQUAL", value: user.uid }],
            orderByField: "startedAt",
            descending: true,
            limit: 200,
          }).catch(() => []);

          let totalSeconds = 0;
          let totalSpentMinor = 0;

          const channelBreakdown: Record<string, { channelId: string; title: string; minutesWatched: number; lastWatchedAt: string }> = {};
          const videoBreakdown: Record<string, { assetId: string; title: string; minutesWatched: number; lastWatchedAt: string }> = {};
          const recentHistory: Array<{ id: string; title: string; channelId?: string; minutes: number; watchedAt: string }> = [];

          for (const s of sessions) {
            const sec = typeof s["acceptedSeconds"] === "number" ? s["acceptedSeconds"] : 0;
            const spent = typeof s["chargedAmountMinor"] === "number" ? s["chargedAmountMinor"] : 0;
            const channelId = typeof s["channelId"] === "string" ? s["channelId"] : null;
            const assetId = typeof s["assetId"] === "string" ? s["assetId"] : null;
            const title = String(s["title"] || s["channelTitle"] || assetId || channelId || "Video Stream");
            const watchedAt = String(s["startedAt"] || s["createdAt"] || new Date().toISOString());

            totalSeconds += sec;
            totalSpentMinor += spent;

            const minutes = Math.round(sec / 60);

            if (channelId) {
              if (!channelBreakdown[channelId]) {
                channelBreakdown[channelId] = {
                  channelId,
                  title: String(s["channelTitle"] || `Channel ${channelId}`),
                  minutesWatched: 0,
                  lastWatchedAt: watchedAt,
                };
              }
              channelBreakdown[channelId].minutesWatched += minutes;
            }

            if (assetId) {
              if (!videoBreakdown[assetId]) {
                videoBreakdown[assetId] = {
                  assetId,
                  title,
                  minutesWatched: 0,
                  lastWatchedAt: watchedAt,
                };
              }
              videoBreakdown[assetId].minutesWatched += minutes;
            }

            if (recentHistory.length < 20 && minutes > 0) {
              recentHistory.push({
                id: s.__id || String(s["sessionId"] || Math.random()),
                title,
                channelId: channelId || undefined,
                minutes,
                watchedAt,
              });
            }
          }

          const totalMinutesWatched = Math.round(totalSeconds / 60);
          const totalHoursWatched = Math.round((totalMinutesWatched / 60) * 10) / 10;

          return Response.json({
            summary: {
              totalMinutesWatched,
              totalHoursWatched,
              totalSessionsCount: sessions.length,
              totalSpentMinor,
            },
            channels: Object.values(channelBreakdown).sort((a, b) => b.minutesWatched - a.minutesWatched),
            videos: Object.values(videoBreakdown).sort((a, b) => b.minutesWatched - a.minutesWatched),
            recentHistory,
          }, {
            headers: { "cache-control": "no-store", pragma: "no-cache" },
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
