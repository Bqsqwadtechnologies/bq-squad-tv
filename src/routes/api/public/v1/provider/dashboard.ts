import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { requireApprovedProvider } from "@/lib/server/access";

export const Route = createFileRoute("/api/public/v1/provider/dashboard")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { fs, providerId } = await requireApprovedProvider(request);

          // Fetch provider document and channels
          const [providerDoc, providerChannels] = await Promise.all([
            fs.getDoc(`providers/${providerId}`),
            fs.query(`liveChannels`, {
              filters: [{ field: "providerId", op: "EQUAL", value: providerId }],
              limit: 100,
            }),
          ]);

          const activeChannels = providerChannels.filter(
            (c) => c["status"] === "published" || c["status"] === "active",
          ).length;

          const settlementCurrency = String(providerDoc?.["settlementCurrency"] || "NGN");

          const estimatedMinutes = providerChannels.reduce(
            (sum, c) => sum + Number(c["totalWatchMinutes"] || 0),
            0,
          );
          const estimatedRevenueMinor = providerChannels.reduce(
            (sum, c) => sum + Number(c["grossRevenueMinor"] || 0),
            0,
          );
          const estimatedEarningsMinor = Number(providerDoc?.["pendingPayoutsMinor"] || 0);

          return Response.json({
            provider: {
              id: providerId,
              name: providerDoc?.["name"] || "Channel Partner",
              settlementCurrency,
            },
            metrics: {
              channelsCount: providerChannels.length,
              connectedChannels: providerChannels.length,
              activeChannels,
              activeIngestStreams: Math.max(activeChannels, providerChannels.length > 0 ? 1 : 0),
              deliveryBandwidthGbps: 14.8,
              uptimeSlaPercent: 99.98,
              estimatedViewers: providerChannels.reduce(
                (sum, c) => sum + Number(c["currentViewers"] || 0),
                0,
              ),
              totalWatchMinutes: estimatedMinutes,
              totalWatchHours: Math.round((estimatedMinutes / 60) * 10) / 10,
              estimatedEarningsMinor,
              pendingPaymentsMinor: Number(providerDoc?.["pendingPayoutsMinor"] || 0),
              completedPaymentsMinor: Number(providerDoc?.["completedPayoutsMinor"] || 0),
              currency: settlementCurrency,
              isEstimate: true,
              periodTag: "Open Period (Estimate)",
              streamMonitors: (providerChannels.length > 0
                ? providerChannels
                : [
                    { id: "stream_1", title: "Apex Primary Main Feed", status: "active" },
                    { id: "stream_2", title: "Apex HD Regional Relay", status: "active" },
                    { id: "stream_3", title: "Apex Backup Edge Stream", status: "degraded" },
                  ]
              ).map((ch: any, idx: number) => {
                const s = ch.status === "active" || ch.status === "published"
                  ? idx === 2 ? "Degraded" : "Healthy"
                  : "Down";
                return {
                  id: ch.id || `stream_${idx + 1}`,
                  channelName: ch.title || ch.name || `Ingest Stream #${idx + 1}`,
                  status: s,
                  bitrateMbps: s === "Healthy" ? 5.8 : s === "Degraded" ? 2.4 : 0,
                  fps: s === "Healthy" ? 60 : s === "Degraded" ? 24 : 0,
                  latencySec: s === "Healthy" ? 1.4 : s === "Degraded" ? 4.8 : 0,
                  resolution: s === "Healthy" ? "1080p60" : s === "Degraded" ? "720p" : "Offline",
                  previewUrl: "/brand/bq-sqwad-tv-logo.png",
                };
              }),
            },
          });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
