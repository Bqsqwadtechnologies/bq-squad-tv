import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { getPricingConfig } from "@/lib/server/pricing";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getPaystackTopup } from "@/lib/server/paystack";

const schema = z.object({ packageId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/) });

async function markPaymentStatus(
  fs: Firestore,
  path: string,
  uid: string,
  status: "pending" | "initialize_failed",
): Promise<void> {
  await fs.transact([path], ([payment]) => {
    if (!payment || payment["uid"] !== uid) {
      throw new ApiError(409, "PAYMENT_RECORD_MISSING", "The payment record could not be updated.");
    }
    // A fast webhook may have credited this transaction before initialize returns.
    // Never let the slower initialize response move a credited payment backwards.
    if (payment["status"] !== "initializing") {
      return { result: undefined, writes: [] };
    }
    const fields = { status, updatedAt: new Date().toISOString() };
    return {
      result: undefined,
      writes: [{
        update: { name: fs.docName(path), fields: encodeFields(fields) },
        updateMask: { fieldPaths: ["status", "updatedAt"] },
      }],
    };
  });
}


export const Route = createFileRoute("/api/public/v1/payments/paystack/initialize")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const user = await requireUser(request);
      if (!user.email) throw new ApiError(400, "EMAIL_REQUIRED", "Add an email address before making a website payment.");
      const { packageId } = await parseBody(request, schema);
      const fs = await Firestore.create();
      await enforceRateLimit(fs, "paystack-init:" + user.uid, { limit: 5, windowMs: 60_000 });
      const pricing = await getPricingConfig(fs);
      const offer = getPaystackTopup(pricing, packageId);
      const reference = "BQTV_" + crypto.randomUUID().replace(/-/g, "");
      const secret = process.env["PAYSTACK_SECRET_KEY"];
      if (!secret) throw new ApiError(503, "PAYSTACK_NOT_CONFIGURED", "Website payments are not configured.");
      await fs.setDoc("payments/paystack_" + reference, {
        uid: user.uid, email: user.email, reference, packageId,
        amountMinor: offer.amountMinor, creditMinor: offer.creditMinor,
        currency: "NGN", provider: "paystack", status: "initializing",
        createdAt: new Date().toISOString(),
      }, { mustNotExist: true });
      const response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { authorization: "Bearer " + secret, "content-type": "application/json" },
        body: JSON.stringify({
          email: user.email, amount: offer.amountMinor, currency: "NGN", reference,
          callback_url: process.env["PAYSTACK_CALLBACK_URL"],
          metadata: { uid: user.uid, packageId, creditMinor: offer.creditMinor, platform: "website" },
        }),
      });
      const result = await response.json() as { status?: boolean; message?: string; data?: { authorization_url?: string; access_code?: string; reference?: string } };
      if (!response.ok || result.status !== true || !result.data?.authorization_url) {
        await markPaymentStatus(fs, "payments/paystack_" + reference, user.uid, "initialize_failed");
        throw new ApiError(502, "PAYSTACK_INITIALIZE_FAILED", "The payment provider could not start checkout.");
      }
      await markPaymentStatus(fs, "payments/paystack_" + reference, user.uid, "pending");
      return Response.json({ authorizationUrl: result.data.authorization_url, reference, amountMinor: offer.amountMinor, currency: "NGN" }, { status: 201 });
    } catch (error) { return errorBody(error); }
  } } },
});
