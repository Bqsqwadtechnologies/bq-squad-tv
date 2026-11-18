import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireProviderAccess } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/provider/contracts")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const { user, fs } = await requireUser(request);
        const access = await requireProviderAccess(fs, user);
        const providerId = access.providerId;

        const allContracts = await fs.listCollection("providerContracts", { limit: 20 });
        const contracts = allContracts
          .filter(c => c["providerId"] === providerId)
          .map(c => ({
            id: c["id"] || c["contractId"],
            agreementReference: c["agreementReference"] || "AGR-DEFAULT",
            territories: Array.isArray(c["territories"]) ? c["territories"] : ["ALL"],
            platforms: Array.isArray(c["platforms"]) ? c["platforms"] : ["web", "android"],
            revenueModel: c["revenueModel"] || "provider_gross_profit_bps",
            providerShareBps: Number(c["providerShareBps"] || 2500),
            settlementCurrency: c["settlementCurrency"] || "NGN",
            validFrom: c["validFrom"] || null,
            validUntil: c["validUntil"] || null,
            version: Number(c["version"] || 1),
            status: c["status"] || "active",
          }));

        return Response.json({ contracts });
      } catch (err: unknown) {
        return errorBody(err);
      }
    },
  }},
});
