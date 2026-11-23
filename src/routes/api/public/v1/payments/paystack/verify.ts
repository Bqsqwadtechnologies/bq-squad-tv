import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { creditPaystackPayment, fetchPaystackVerification } from "@/lib/server/paystack";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { recordRiskSignal } from "@/lib/server/risk-engine";
import { activateProducerBlueTickPayment } from "@/lib/server/producer-blue-verification";

const schema = z.object({ reference: z.string().min(8).max(100) });

export const Route = createFileRoute("/api/public/v1/payments/paystack/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const { reference } = await parseBody(request, schema);
          const fs = await Firestore.create();
          await enforceRateLimit(fs, "paystack-verify:" + user.uid, {
            limit: 10,
            windowMs: 60_000,
          });
          const payment = await fs.getDoc("payments/paystack_" + reference);
          if (!payment || payment["uid"] !== user.uid || payment["provider"] !== "paystack") {
            throw new ApiError(404, "PAYMENT_NOT_FOUND", "This payment could not be found.");
          }
          const currency =
            typeof payment["currency"] === "string" ? (payment["currency"] as string) : ((payment["walletCurrency"] as string) || "USD");
          const verified = await fetchPaystackVerification(reference);
          const metadata = verified["metadata"] as Record<string, unknown> | undefined;
          if (
            verified["status"] !== "success" ||
            verified["currency"] !== currency ||
            verified["amount"] !== payment["amountMinor"] ||
            metadata?.["uid"] !== user.uid ||
            (payment["paymentType"] === "producer_blue_tick" && metadata?.["paymentType"] !== "producer_blue_tick")
          ) {
            await recordRiskSignal(fs, user.uid, "failed_payment");
            throw new ApiError(402, "PAYMENT_NOT_CONFIRMED", "The payment has not been confirmed.");
          }
          if (payment["paymentType"] === "producer_blue_tick") {
            const activation = await activateProducerBlueTickPayment(fs, {
              reference,
              uid: user.uid,
              amountMinor: payment["amountMinor"] as number,
              currency,
            });
            return Response.json({ ...activation, blueVerified: true, currency });
          }
          const result = await creditPaystackPayment(fs, {
            reference,
            uid: user.uid,
            amountMinor: payment["amountMinor"] as number,
            creditMinor: payment["creditMinor"] as number,
            email: user.email,
            currency,
          });
          return Response.json({ ...result, currency });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
