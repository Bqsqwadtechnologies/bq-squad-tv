import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { creditPaystackPayment, fetchPaystackVerification } from "@/lib/server/paystack";

const schema = z.object({ reference: z.string().min(8).max(100) });

export const Route = createFileRoute("/api/public/v1/payments/paystack/verify")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const user = await requireUser(request);
      const { reference } = await parseBody(request, schema);
      const fs = await Firestore.create();
      const payment = await fs.getDoc("payments/paystack_" + reference);
      if (!payment || payment["uid"] !== user.uid || payment["provider"] !== "paystack") {
        throw new ApiError(404, "PAYMENT_NOT_FOUND", "This payment could not be found.");
      }
      const verified = await fetchPaystackVerification(reference);
      if (verified["status"] !== "success" || verified["currency"] !== "NGN" ||
          verified["amount"] !== payment["amountMinor"] ||
          (verified["metadata"] as Record<string, unknown> | undefined)?.["uid"] !== user.uid) {
        throw new ApiError(402, "PAYMENT_NOT_CONFIRMED", "The payment has not been confirmed.");
      }
      const result = await creditPaystackPayment(fs, {
        reference, uid: user.uid, amountMinor: payment["amountMinor"] as number,
        creditMinor: payment["creditMinor"] as number, email: user.email,
      });
      return Response.json({ ...result, currency: "NGN" });
    } catch (error) { return errorBody(error); }
  } } },
});
