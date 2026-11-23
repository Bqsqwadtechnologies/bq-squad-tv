import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { requireApprovedProvider } from "@/lib/server/access";
import { ensurePublicId } from "@/lib/server/universal-ids";

export const Route = createFileRoute("/api/public/v1/provider/dashboard")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { fs, providerId, user } = await requireApprovedProvider(request);

          // Ensure provider public ID (BQ-C-xxxxxxxxxx)
          const publicId = await ensurePublicId(fs, providerId, "provider");

          // Fetch provider document and assigned channels
          const [providerDoc, providerChannels, platformChannels] = await Promise.all([
            fs.getDoc(`providers/${providerId}`),
            fs.query(`channels`, {
              filters: [{ field: "providerId", op: "EQUAL", value: providerId }],
              limit: 100,
            }),
            user.email
              ? fs.query(`channels`, {
                  filters: [{ field: "partnerEmail", op: "EQUAL", value: user.email }],
                  limit: 100,
                })
              : Promise.resolve([]),
          ]);

          // Combine channels and deduplicate
          const channelMap = new Map<string, any>();
          for (const ch of [...providerChannels, ...platformChannels]) {
            const id = ch["channelId"] || ch.__id || ch["id"];
            if (typeof id === "string" && id) channelMap.set(id, ch);
          }
          const allAssignedChannels = Array.from(channelMap.values());

          const activeChannels = allAssignedChannels.filter(
            (c) => c["status"] === "ACTIVE" || c["published"] === true,
          ).length;

          const settlementCurrency = String(providerDoc?.["settlementCurrency"] || "NGN");

          const totalWatchMinutes = allAssignedChannels.reduce(
            (sum, c) => sum + Number(c["totalWatchMinutes"] || 0),
            0,
          );
          const estimatedEarningsMinor = Number(providerDoc?.["pendingPayoutsMinor"] || 0);

          // Rule N25: Truthful stream monitors derived only from actual assigned channels
          const streamMonitors = allAssignedChannels.map((ch: any) => {
            const healthStatus = ["Healthy", "Degraded", "Down"].includes(String(ch.healthStatus))
              ? String(ch.healthStatus)
              : "Unknown";
            const numberOrNull = (value: unknown) =>
              typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
            return {
              id: ch.channelId || ch.id || ch.__id,
              channelName: ch.title || "Assigned Channel",
              status: healthStatus,
              bitrateMbps: numberOrNull(ch.bitrateMbps),
              fps: numberOrNull(ch.fps),
              latencySec: numberOrNull(ch.latencySec),
              resolution: typeof ch.resolution === "string" ? ch.resolution : null,
              previewUrl: typeof ch.logoUrl === "string" ? ch.logoUrl : null,
            };
          });

          return Response.json({
            provider: {
              id: providerId,
              publicId,
              name: providerDoc?.["name"] || providerDoc?.["companyName"] || "Channel Partner",
              settlementCurrency,
            },
            metrics: {
              channelsCount: allAssignedChannels.length,
              connectedChannels: allAssignedChannels.filter((c) => c["connectionStatus"] === "connected").length,
              activeChannels,
              activeIngestStreams: allAssignedChannels.filter((c) => c["isLive"] === true).length,
              // Truthful metrics: no fake 99.98% or hardcoded 14.8 Gbps
              totalWatchMinutes,
              totalWatchHours: Math.round((totalWatchMinutes / 60) * 10) / 10,
              estimatedEarningsMinor,
              pendingPaymentsMinor: Number(providerDoc?.["pendingPayoutsMinor"] || 0),
              completedPaymentsMinor: Number(providerDoc?.["completedPayoutsMinor"] || 0),
              currency: settlementCurrency,
              isEstimate: true,
              periodTag: "Open Period",
              streamMonitors,
            },
          });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
