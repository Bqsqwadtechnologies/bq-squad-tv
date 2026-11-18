import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireProviderAccess } from "@/lib/server/roles";
import { ApiError } from "@/lib/server/firebase-admin";

export const Route = createFileRoute("/api/public/v1/provider/statements")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const { user, fs } = await requireUser(request);
        const access = await requireProviderAccess(fs, user);
        const providerId = access.providerId;

        const url = new URL(request.url);
        const statementId = url.searchParams.get("statementId");

        if (statementId) {
          const doc = await fs.getDoc(`providerStatements/${statementId}`);
          if (!doc) {
            throw new ApiError(404, "STATEMENT_NOT_FOUND", "Statement not found.");
          }
          if (doc["providerId"] !== providerId && !access.isZillionaireOwner) {
            throw new ApiError(403, "PROVIDER_ISOLATION_VIOLATION", "Access denied to statement belonging to another provider.");
          }
          return Response.json({
            statement: {
              id: doc["id"] || doc["statementId"] || statementId,
              period: doc["period"] || "Current Month",
              status: doc["status"] || "open",
              currency: doc["currency"] || "NGN",
              grossRevenueMinor: Number(doc["grossRevenueMinor"] || 0),
              deductibleCosts: {
                cdnDeliveryMinor: Number(doc["cdnDeliveryMinor"] || 0),
                paymentProcessingMinor: Number(doc["paymentProcessingMinor"] || 0),
                providerFeesMinor: Number(doc["providerFeesMinor"] || 0),
                playbackInfrastructureMinor: Number(doc["playbackInfrastructureMinor"] || 0),
                totalDeductibleMinor: Number(doc["totalDeductibleMinor"] || 0),
              },
              grossProfitMinor: Number(doc["grossProfitMinor"] || 0),
              providerShareBps: Number(doc["providerShareBps"] || 2500),
              providerEarningsMinor: Number(doc["providerEarningsMinor"] || 0),
              platformShareMinor: Number(doc["platformShareMinor"] || 0),
              paymentReference: doc["paymentReference"] || null,
              paidAt: doc["paidAt"] || null,
              statementHash: doc["statementHash"] || "pending-close",
              isEstimate: doc["status"] === "open",
            },
          });
        }

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
