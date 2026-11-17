import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { minorUnitDigits } from "@/lib/server/currency";
import { currencySymbol, formatMinorCurrency } from "@/lib/server/currency-format";

export const Route = createFileRoute("/api/public/v1/wallet/history")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const fs = await Firestore.create();
        const payments = await fs.query("payments", {
          filters: [{ field: "uid", op: "EQUAL", value: user.uid }],
          orderByField: "createdAt",
          descending: true,
          limit: 50,
        });
        return Response.json({
          items: payments.map(payment => {
            const currency = typeof payment["currency"] === "string" ? payment["currency"] as string : "NGN";
            const amountMinor = typeof payment["amountMinor"] === "number" && Number.isSafeInteger(payment["amountMinor"]) ? payment["amountMinor"] as number : 0;
            const creditMinor = typeof payment["creditMinor"] === "number" && Number.isSafeInteger(payment["creditMinor"]) ? payment["creditMinor"] as number : 0;
            return {
              id: payment.__id,
              provider: payment["provider"] === "google_play" ? "Google Play" : "Paystack",
              status: typeof payment["status"] === "string" ? payment["status"] : "unknown",
              amountMinor,
              formattedAmount: formatMinorCurrency(amountMinor, currency),
              creditMinor,
              formattedCredit: formatMinorCurrency(creditMinor, currency),
              currencyCode: currency,
              minorUnitDigits: minorUnitDigits(currency),
              symbol: currencySymbol(currency),
              createdAt: typeof payment["createdAt"] === "string" ? payment["createdAt"] : null,
              creditedAt: typeof payment["creditedAt"] === "string" ? payment["creditedAt"] : null,
            };
          }),
        }, { headers: { "cache-control": "private, no-store" } });
      } catch (error) {
        return errorBody(error);
      }
    },
  } },
});
