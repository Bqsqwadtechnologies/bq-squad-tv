import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { requireProvider } from "@/lib/server/access";

export const Route = createFileRoute("/api/public/v1/provider/contracts")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const { fs, providerId } = await requireProvider(request);

        const contractsList = await fs.query("providerContracts", {
          filters: [{ field: "providerId", op: "EQUAL", value: providerId }],
          limit: 20,
        });

        const contracts = contractsList.map(c => ({
          id: c.__id || c["contractId"] || c["id"],
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
