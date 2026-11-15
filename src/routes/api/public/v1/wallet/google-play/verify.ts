import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { getPricingConfig } from "@/lib/server/pricing";
import { creditGooglePlayPurchase, getGooglePlayProducts, verifyGooglePlayProduct } from "@/lib/server/google-play";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const schema = z.object({
  productId: z.string().min(1).max(150),
  purchaseToken: z.string().min(20).max(4096),
  orderId: z.string().max(150).nullable().optional(),
  packageName: z.string().max(150).default("com.bqsqwad.tv"),
});

export const Route = createFileRoute("/api/public/v1/wallet/google-play/verify")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const user = await requireUser(request);
      const body = await parseBody(request, schema);
      const packageName = process.env["GOOGLE_PLAY_PACKAGE_NAME"] || "com.bqsqwad.tv";
      if (packageName !== body.packageName) throw new ApiError(400, "PLAY_PACKAGE_MISMATCH", "The Android package name does not match this app.");
      const fs = await Firestore.create();
      await enforceRateLimit(fs, "play-verify:" + user.uid, { limit: 10, windowMs: 60_000 });
      const config = await getPricingConfig(fs);
      const product = getGooglePlayProducts(config).find(item => item.productId === body.productId);
      if (!product) throw new ApiError(400, "PLAY_PRODUCT_UNAVAILABLE", "This Google Play product is not configured.");
      const verified = await verifyGooglePlayProduct({
        packageName, productId: body.productId, purchaseToken: body.purchaseToken,
      });
      const verifiedOrderId = typeof verified["orderId"] === "string" ? verified["orderId"] : null;
      if (body.orderId && verifiedOrderId && body.orderId !== verifiedOrderId) {
        throw new ApiError(402, "PLAY_ORDER_MISMATCH", "The Google Play order does not match the submitted purchase.");
      }
      const result = await creditGooglePlayPurchase(fs, {
        uid: user.uid, productId: body.productId, purchaseToken: body.purchaseToken,
        orderId: verifiedOrderId, creditMinor: product.creditMinor,
      });
      return Response.json({ ...result, currency: "NGN", message: result.credited ? "Wallet credited." : "This purchase was already processed." });
    } catch (error) { return errorBody(error); }
  } } },
});
