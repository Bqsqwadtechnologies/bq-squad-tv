import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireProviderAccess } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/provider/statements")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const { user, fs } = await requireUser(request);
        const access = await requireProviderAccess(fs, user);
        const providerId = access.providerId;

        const allStatements = await fs.listCollection("providerStatements", { limit: 50 });
        const statements = allStatements
          .filter(s => s["providerId"] === providerId)
          .map(s => ({
            id: s["id"] || s["statementId"],
            period: s["period"] || "Current Month",
            status: s["status"] || "open", // open, closed, approved, paid
            currency: s["currency"] || "NGN",
            grossRevenueMinor: Number(s["grossRevenueMinor"] || 0),
            deductibleCosts: {
              cdnDeliveryMinor: Number(s["cdnDeliveryMinor"] || 0),
              paymentProcessingMinor: Number(s["paymentProcessingMinor"] || 0),
              providerFeesMinor: Number(s["providerFeesMinor"] || 0),
              playbackInfrastructureMinor: Number(s["playbackInfrastructureMinor"] || 0),
              totalDeductibleMinor: Number(s["totalDeductibleMinor"] || 0),
            },
            grossProfitMinor: Number(s["grossProfitMinor"] || 0),
            providerShareBps: Number(s["providerShareBps"] || 2500),
            providerEarningsMinor: Number(s["providerEarningsMinor"] || 0),
            platformShareMinor: Number(s["platformShareMinor"] || 0),
            paymentReference: s["paymentReference"] || null,
            paidAt: s["paidAt"] || null,
            statementHash: s["statementHash"] || "pending-close",
            isEstimate: s["status"] === "open",
          }));

        return Response.json({ statements });
      } catch (err: unknown) {
        return errorBody(err);
      }
    },
  }},
});
