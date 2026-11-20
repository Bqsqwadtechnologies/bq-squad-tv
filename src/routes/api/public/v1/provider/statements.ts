import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { requireProvider } from "@/lib/server/access";
import { ApiError } from "@/lib/server/firebase-admin";

export const Route = createFileRoute("/api/public/v1/provider/statements")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { fs, access, providerId } = await requireProvider(request);

          const url = new URL(request.url);
          const statementId = url.searchParams.get("statementId");

          if (statementId) {
            const doc = await fs.getDoc(`providerStatements/${statementId}`);
            if (!doc) {
              throw new ApiError(404, "STATEMENT_NOT_FOUND", "Statement not found.");
            }
            if (doc["providerId"] !== providerId && !access.isZillionaireOwner) {
              throw new ApiError(
                403,
                "PROVIDER_ISOLATION_VIOLATION",
                "Access denied to statement belonging to another provider.",
              );
            }
            return Response.json({
              statement: {
                id: doc["id"] || doc["statementId"] || statementId,
                period: doc["period"] || "Current Month",
                status: doc["status"] || "open",
                currency: doc["currency"] || "NGN",
                deductibleCosts: {
                  cdnDeliveryMinor: Number(doc["cdnDeliveryMinor"] || 0),
                  paymentProcessingMinor: Number(doc["paymentProcessingMinor"] || 0),
                  providerFeesMinor: Number(doc["providerFeesMinor"] || 0),
                  playbackInfrastructureMinor: Number(doc["playbackInfrastructureMinor"] || 0),
                  totalDeductibleMinor: Number(doc["totalDeductibleMinor"] || 0),
                },
                providerEarningsMinor: Number(doc["providerEarningsMinor"] || 0),
                paymentReference: doc["paymentReference"] || null,
                paidAt: doc["paidAt"] || null,
                statementHash: doc["statementHash"] || "pending-close",
                isEstimate: doc["status"] === "open",
              },
            });
          }

          const statementDocs = await fs.query("providerStatements", {
            filters: [{ field: "providerId", op: "EQUAL", value: providerId }],
            limit: 50,
          });

          const statements = statementDocs.map((s) => ({
            id: s.__id || s["statementId"] || s["id"],
            period: s["period"] || "Current Month",
            status: s["status"] || "open",
            currency: s["currency"] || "NGN",
            deductibleCosts: {
              cdnDeliveryMinor: Number(s["cdnDeliveryMinor"] || 0),
              paymentProcessingMinor: Number(s["paymentProcessingMinor"] || 0),
              providerFeesMinor: Number(s["providerFeesMinor"] || 0),
              playbackInfrastructureMinor: Number(s["playbackInfrastructureMinor"] || 0),
              totalDeductibleMinor: Number(s["totalDeductibleMinor"] || 0),
            },
            providerEarningsMinor: Number(s["providerEarningsMinor"] || 0),
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
    },
  },
});
