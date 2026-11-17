import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { minorUnitDigits } from "@/lib/server/currency";
import { currencySymbol, formatMinorCurrency } from "@/lib/server/currency-format";

export const Route = createFileRoute("/api/public/v1/wallet/receipt/$paymentId")({
  server: { handlers: {
    GET: async ({ request, params }) => {
      try {
        const user = await requireUser(request);
        const paymentId = params.paymentId;
        if (!/^(paystack_[A-Za-z0-9_-]{8,100}|googleplay_[a-f0-9]{64})$/.test(paymentId)) {
          throw new ApiError(400, "PAYMENT_ID_INVALID", "The payment identifier is invalid.");
        }
        const fs = await Firestore.create();
        const payment = await fs.getDoc("payments/" + paymentId);
        if (!payment || payment["uid"] !== user.uid) {
          throw new ApiError(404, "PAYMENT_NOT_FOUND", "This payment receipt could not be found.");
        }
        const currency = typeof payment["currency"] === "string" ? payment["currency"] as string : "NGN";
        const amountMinor = typeof payment["amountMinor"] === "number" && Number.isSafeInteger(payment["amountMinor"]) ? payment["amountMinor"] as number : 0;
        const creditMinor = typeof payment["creditMinor"] === "number" && Number.isSafeInteger(payment["creditMinor"]) ? payment["creditMinor"] as number : 0;
        return Response.json({
          receiptNumber: typeof payment["reference"] === "string" ? payment["reference"] : paymentId,
          status: typeof payment["status"] === "string" ? payment["status"] : "unknown",
          provider: payment["provider"] === "google_play" ? "Google Play" : "Paystack",
          amountMinor, formattedAmount: formatMinorCurrency(amountMinor, currency),
          creditMinor, formattedCredit: formatMinorCurrency(creditMinor, currency),
          currencyCode: currency, minorUnitDigits: minorUnitDigits(currency), symbol: currencySymbol(currency),
          createdAt: typeof payment["createdAt"] === "string" ? payment["createdAt"] : null,
          creditedAt: typeof payment["creditedAt"] === "string" ? payment["creditedAt"] : null,
          message: payment["status"] === "credited" ? "Payment received and wallet credited." : "Payment status: " + String(payment["status"] ?? "unknown") + ".",
        }, { headers: { "cache-control": "private, no-store" } });
      } catch (error) {
        return errorBody(error);
      }
    },
  } },
});
