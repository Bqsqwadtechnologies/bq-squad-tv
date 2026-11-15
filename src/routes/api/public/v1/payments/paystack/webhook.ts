import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";
import { creditPaystackPayment, fetchPaystackVerification, verifyPaystackSignature } from "@/lib/server/paystack";

export const Route = createFileRoute("/api/public/v1/payments/paystack/webhook")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const rawBody = await request.text();
      await verifyPaystackSignature(rawBody, request.headers.get("x-paystack-signature"));
      const event = JSON.parse(rawBody) as { event?: string; data?: { reference?: string } };
      if (event.event !== "charge.success" || !event.data?.reference) {
        return Response.json({ received: true });
      }
      const reference = event.data.reference;
      const fs = await Firestore.create();
      const payment = await fs.getDoc("payments/paystack_" + reference);
      if (!payment || payment["provider"] !== "paystack" || typeof payment["uid"] !== "string") {
        return Response.json({ received: true });
      }
      const currency = typeof payment["currency"] === "string" ? payment["currency"] as string : "NGN";
      const verified = await fetchPaystackVerification(reference);
      const metadata = verified["metadata"] as Record<string, unknown> | undefined;
      if (verified["status"] !== "success" || verified["currency"] !== currency ||
          verified["amount"] !== payment["amountMinor"] || metadata?.["uid"] !== payment["uid"]) {
        return Response.json({ received: true });
      }
      await creditPaystackPayment(fs, {
        reference, uid: payment["uid"], amountMinor: payment["amountMinor"] as number,
        creditMinor: payment["creditMinor"] as number,
        email: typeof payment["email"] === "string" ? payment["email"] : null, currency,
      });
      return Response.json({ received: true });
    } catch (error) { return errorBody(error); }
  } } },
});
