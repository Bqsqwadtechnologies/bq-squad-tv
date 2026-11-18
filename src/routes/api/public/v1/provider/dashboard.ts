import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireProviderAccess } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/provider/dashboard")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const { user, fs } = await requireUser(request);
        const access = await requireProviderAccess(fs, user);
        const providerId = access.providerId;

        // Fetch provider document and channels
        const [providerDoc, channels] = await Promise.all([
          fs.getDoc(`providers/${providerId}`),
          fs.listCollection(`liveChannels`, { limit: 100 }),
        ]);

        const providerChannels = channels.filter(c => c["providerId"] === providerId);
        const activeChannels = providerChannels.filter(c => c["status"] === "published").length;

        // Calculate aggregated estimates from usageBlocks and providerLedger
        // In integer minor units
        const providerShareBps = Number(providerDoc?.["providerShareBps"] || 2500);
        const settlementCurrency = String(providerDoc?.["settlementCurrency"] || "NGN");

        const estimatedMinutes = providerChannels.reduce((sum, c) => sum + Number(c["totalWatchMinutes"] || 0), 0);
        const estimatedRevenueMinor = providerChannels.reduce((sum, c) => sum + Number(c["grossRevenueMinor"] || 0), 0);
        const allocatedDeductibleCostsMinor = Math.floor(estimatedRevenueMinor * 0.15); // e.g. payment processing & infrastructure
        const grossProfitMinor = Math.max(0, estimatedRevenueMinor - allocatedDeductibleCostsMinor);
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
            estimatedViewers: providerChannels.reduce((sum, c) => sum + Number(c["currentViewers"] || 0), 0),
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
  }},
});
