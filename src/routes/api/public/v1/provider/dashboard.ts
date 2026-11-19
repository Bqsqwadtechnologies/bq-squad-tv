import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { requireProvider } from "@/lib/server/access";

export const Route = createFileRoute("/api/public/v1/provider/dashboard")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { fs, providerId } = await requireProvider(request);

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

          const providerShareBps = Number(providerDoc?.["providerShareBps"] || 2500);
          const settlementCurrency = String(providerDoc?.["settlementCurrency"] || "NGN");

          const estimatedMinutes = providerChannels.reduce(
            (sum, c) => sum + Number(c["totalWatchMinutes"] || 0),
            0,
          );
          const estimatedRevenueMinor = providerChannels.reduce(
            (sum, c) => sum + Number(c["grossRevenueMinor"] || 0),
            0,
          );
          const allocatedDeductibleCostsMinor = Math.floor(estimatedRevenueMinor * 0.15);
          const grossProfitMinor = Math.max(
            0,
            estimatedRevenueMinor - allocatedDeductibleCostsMinor,
          );
          const estimatedEarningsMinor = Math.floor((grossProfitMinor * providerShareBps) / 10000);

          return Response.json({
            provider: {
              id: providerId,
              name: providerDoc?.["name"] || "Channel Partner",
              settlementCurrency,
              providerShareBps,
            },
            metrics: {
              channelsCount: providerChannels.length,
              activeChannels,
              estimatedViewers: providerChannels.reduce(
                (sum, c) => sum + Number(c["currentViewers"] || 0),
                0,
              ),
              totalWatchMinutes: estimatedMinutes,
              totalWatchHours: Math.round((estimatedMinutes / 60) * 10) / 10,
              estimatedGrossRevenueMinor: estimatedRevenueMinor,
              allocatedDeductibleCostsMinor,
              grossProfitMinor,
              estimatedEarningsMinor,
              pendingPaymentsMinor: Number(providerDoc?.["pendingPayoutsMinor"] || 0),
              completedPaymentsMinor: Number(providerDoc?.["completedPayoutsMinor"] || 0),
              currency: settlementCurrency,
              isEstimate: true,
              periodTag: "Open Period (Estimate)",
            },
          });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
