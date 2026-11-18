import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import type { AccessDenialEvent } from "@/lib/server/access-denials";

export type SecurityEventsResponse = {
  events: AccessDenialEvent[];
  hourlyCounts: Array<{ hour: string; count: number }>;
  total: number;
  filters: {
    timeRange: string;
    reason: string | null;
    role: string | null;
    routePattern: string | null;
    platform: string | null;
  };
};

export const Route = createFileRoute("/api/public/v1/admin/security/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "security");
          await enforceRateLimit(fs, "admin-security-events:" + user.uid, {
            limit: 60,
            windowMs: 60_000,
          });

          const url = new URL(request.url);
          const timeRange = url.searchParams.get("timeRange") || "24h";
          const reasonFilter = url.searchParams.get("reason") || null;
          const roleFilter = url.searchParams.get("role") || null;
          const routePatternFilter = url.searchParams.get("routePattern") || null;
          const platformFilter = url.searchParams.get("platform") || null;
          const rawLimit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
          const limit = Number.isSafeInteger(rawLimit) ? Math.min(200, Math.max(1, rawLimit)) : 50;

          // Calculate time cutoff
          const nowMs = Date.now();
          let cutoffMs = 0;
          if (timeRange === "1h") {
            cutoffMs = nowMs - 60 * 60 * 1000;
          } else if (timeRange === "24h") {
            cutoffMs = nowMs - 24 * 60 * 60 * 1000;
          } else if (timeRange === "7d") {
            cutoffMs = nowMs - 7 * 24 * 60 * 60 * 1000;
          } else if (timeRange === "30d") {
            cutoffMs = nowMs - 30 * 24 * 60 * 60 * 1000;
          }

          // Fetch recent access denial events
          const rows = await fs.query("accessDenials", {
            orderByField: "time",
            descending: true,
            limit: 300,
          });

          // Map and filter events
          const allEvents: AccessDenialEvent[] = [];
          for (const row of rows) {
            const timeStr = typeof row["time"] === "string" ? row["time"] : "";
            const eventTimeMs = Date.parse(timeStr);
            if (cutoffMs > 0 && (!eventTimeMs || eventTimeMs < cutoffMs)) {
              continue;
            }

            const reasonCode =
              typeof row["reasonCode"] === "string" ? row["reasonCode"] : "UNKNOWN";
            if (reasonFilter && reasonFilter !== "ALL" && reasonCode !== reasonFilter) {
              continue;
            }

            const actorRoleClass =
              typeof row["actorRoleClass"] === "string"
                ? (row["actorRoleClass"] as AccessDenialEvent["actorRoleClass"])
                : "anonymous";
            if (roleFilter && roleFilter !== "ALL" && actorRoleClass !== roleFilter) {
              continue;
            }

            const routePattern = typeof row["routePattern"] === "string" ? row["routePattern"] : "";
            if (
              routePatternFilter &&
              !routePattern.toLowerCase().includes(routePatternFilter.toLowerCase().trim())
            ) {
              continue;
            }

            const platformClass =
              typeof row["platformClass"] === "string"
                ? (row["platformClass"] as AccessDenialEvent["platformClass"])
                : "unknown";
            if (platformFilter && platformFilter !== "ALL" && platformClass !== platformFilter) {
              continue;
            }

            allEvents.push({
              id: row.__id || (typeof row["id"] === "string" ? row["id"] : ""),
              time: timeStr,
              actorHash: typeof row["actorHash"] === "string" ? row["actorHash"] : "",
              actorRoleClass,
              routePattern,
              method: typeof row["method"] === "string" ? row["method"] : "GET",
              requiredRole:
                typeof row["requiredRole"] === "string" ? row["requiredRole"] : "unknown",
              resourceKind:
                typeof row["resourceKind"] === "string" ? row["resourceKind"] : "unknown",
              targetHash: typeof row["targetHash"] === "string" ? row["targetHash"] : null,
              reasonCode,
              coarseNetworkHash:
                typeof row["coarseNetworkHash"] === "string" ? row["coarseNetworkHash"] : "",
              platformClass,
              expiresAt: typeof row["expiresAt"] === "string" ? row["expiresAt"] : "",
            });
          }

          // Aggregate hourly counts from the filtered events
          const hourlyMap = new Map<string, number>();
          for (const ev of allEvents) {
            if (ev.time) {
              const hourBucket = ev.time.slice(0, 13); // "YYYY-MM-DDTHH"
              hourlyMap.set(hourBucket, (hourlyMap.get(hourBucket) || 0) + 1);
            }
          }

          const hourlyCounts = Array.from(hourlyMap.entries())
            .map(([hour, count]) => ({ hour, count }))
            .sort((a, b) => b.hour.localeCompare(a.hour));

          const response: SecurityEventsResponse = {
            events: allEvents.slice(0, limit),
            hourlyCounts,
            total: allEvents.length,
            filters: {
              timeRange,
              reason: reasonFilter,
              role: roleFilter,
              routePattern: routePatternFilter,
              platform: platformFilter,
            },
          };

          return Response.json(response, {
            headers: { "cache-control": "no-store" },
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
