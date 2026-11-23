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

          const nowMs = Date.now();
          const periodDays = period === "24h" ? 1 : period === "7d" ? 7 : period === "12m" ? 365 : 30;
          const periodStartMs = nowMs - periodDays * 24 * 60 * 60 * 1000;
          const bucketCount = period === "24h" ? 12 : period === "7d" ? 7 : period === "12m" ? 12 : 30;
          const bucketWidthMs = period === "24h"
            ? 2 * 60 * 60 * 1000
            : period === "12m"
              ? 365 * 24 * 60 * 60 * 1000 / 12
              : 24 * 60 * 60 * 1000;

          let totalSeconds = 0;
          let totalEarningsMinor = 0;
          let liveViewers = 0;
          let periodSessionCount = 0;

          const contentStats: Record<
            string,
            { views: number; watchSeconds: number; revenueMinor: number; title?: string }
          > = {};
          const series = Array.from({ length: bucketCount }, (_, i) => {
            const date = new Date(periodStartMs + (i + 0.5) * bucketWidthMs);
            const label = period === "24h"
              ? String((i * 2) % 24).padStart(2, "0") + ":00"
              : period === "7d"
                ? date.toLocaleDateString("en", { weekday: "short" })
                : period === "12m"
                  ? date.toLocaleDateString("en", { month: "short" })
                  : String(i + 1);
            return { label, views: 0, watchMinutes: 0, earningsMinor: 0 };
          });

          for (const session of sessions) {
            // Producer audience analytics are for on-demand assets, not channel streams.
            const assetId = typeof session["assetId"] === "string" ? session["assetId"] : "";
            if (!assetId) continue;

            const lastHeartbeat =
              typeof session["lastHeartbeatAt"] === "string"
                ? Date.parse(session["lastHeartbeatAt"])
                : 0;
            if (
              session["status"] === "ACTIVE" &&
              Number.isFinite(lastHeartbeat) &&
              nowMs - lastHeartbeat >= 0 &&
              nowMs - lastHeartbeat < 60_000
            ) {
              liveViewers += 1;
            }

            const startedAt = [
              session["startedAt"],
              session["createdAt"],
              session["startedAtIso"],
            ].find((value) => typeof value === "string" && Number.isFinite(Date.parse(value)));
            const startedAtMs = typeof startedAt === "string" ? Date.parse(startedAt) : NaN;
            if (!Number.isFinite(startedAtMs) || startedAtMs < periodStartMs || startedAtMs > nowMs) {
              continue;
            }

            const sec = typeof session["acceptedSeconds"] === "number" ? Math.max(0, session["acceptedSeconds"]) : 0;
            const rev = typeof session["producerShareMinor"] === "number" ? Math.max(0, session["producerShareMinor"]) : 0;
            totalSeconds += sec;
            totalEarningsMinor += rev;
            periodSessionCount += 1;

            const bucketIndex = Math.min(
              bucketCount - 1,
              Math.max(0, Math.floor((startedAtMs - periodStartMs) / bucketWidthMs)),
            );
            const point = series[bucketIndex];
            if (point) {
              point.views += 1;
              point.watchMinutes += Math.round((sec / 60) * 10) / 10;
              point.earningsMinor += rev;
            }

            if (!contentStats[assetId]) {
              contentStats[assetId] = {
                views: 0,
                watchSeconds: 0,
                revenueMinor: 0,
                ...(typeof session["assetTitle"] === "string" ? { title: session["assetTitle"] } : {}),
              };
            }
            const stats = contentStats[assetId];
            if (stats) {
              stats.views += 1;
              stats.watchSeconds += sec;
              stats.revenueMinor += rev;
            }
          }

          // Fetch producer's assets to augment top content
          const [ownedAssets, producerAssets] = await Promise.all([
            fs.query("contentAssets", {
              filters: [{ field: "ownerUid", op: "EQUAL", value: user.uid }],
            }).catch(() => []),
            fs.query("contentAssets", {
              filters: [{ field: "producerUid", op: "EQUAL", value: user.uid }],
            }).catch(() => []),
          ]);
          const assetsById = new Map<string, Record<string, unknown>>();
          for (const item of [...ownedAssets, ...producerAssets]) {
            const id = String(item["assetId"] || item["id"] || item.__id || "");
            if (id) assetsById.set(id, item);
          }

          const topContent = Array.from(assetsById.entries()).map(([id, item]) => ({
            id,
            title: String(item["title"] || item["name"] || "Untitled content"),
            status: String(item["status"] || "ACTIVE"),
            views: contentStats[id]?.views || 0,
            watchHours:
              Math.round(((contentStats[id]?.watchSeconds || 0) / 3600) * 10) / 10,
            revenueMinor: contentStats[id]?.revenueMinor || 0,
            thumbnailUrl: typeof item["thumbnailUrl"] === "string" ? item["thumbnailUrl"] : "/brand/bq-sqwad-tv-logo.png",
          }));

          return Response.json({
            period,
            totalMinutesWatched: Math.round(totalSeconds / 60),
            totalWatchHours: Math.round((totalSeconds / 3600) * 10) / 10,
            totalEarningsMinor,
            currency: producer["currency"] ?? "USD",
            sessionCount: periodSessionCount,
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
