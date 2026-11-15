import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getWallet, parseBody, requireUser } from "@/lib/server/api";
import { getPricingConfig } from "@/lib/server/pricing";
import { consumeGooglePlayProduct } from "@/lib/server/google-play";
import { creditGooglePlayPurchase, getGooglePlayProducts, googlePlayAccountId, verifyGooglePlayProduct } from "@/lib/server/google-play";
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
      if (!user.emailVerified) throw new ApiError(403, "EMAIL_VERIFICATION_REQUIRED", "Verify your email before purchasing wallet credits.");
      const body = await parseBody(request, schema);
      const packageName = process.env["GOOGLE_PLAY_PACKAGE_NAME"] || "com.bqsqwad.tv";
      if (packageName !== body.packageName) throw new ApiError(400, "PLAY_PACKAGE_MISMATCH", "The Android package name does not match this app.");
      const fs = await Firestore.create();
      await enforceRateLimit(fs, "play-verify:" + user.uid, { limit: 10, windowMs: 60_000 });
      const wallet = await getWallet(fs, user.uid);
      const currency = wallet.currency;
      const config = await getPricingConfig(fs);
      const product = getGooglePlayProducts(config, currency).find(item => item.productId === body.productId);
      if (!product) throw new ApiError(400, "PLAY_PRODUCT_UNAVAILABLE", "This Google Play product is not configured.");
      const verified = await verifyGooglePlayProduct({
        packageName,
        productId: body.productId,
        purchaseToken: body.purchaseToken,
        obfuscatedAccountId: await googlePlayAccountId(user.uid),
      });
      const verifiedOrderId = typeof verified["orderId"] === "string" ? verified["orderId"] : null;
      if (body.orderId && verifiedOrderId && body.orderId !== verifiedOrderId) {
        throw new ApiError(402, "PLAY_ORDER_MISMATCH", "The Google Play order does not match the submitted purchase.");
      }
      const result = await creditGooglePlayPurchase(fs, {
        uid: user.uid, productId: body.productId, purchaseToken: body.purchaseToken,
        orderId: verifiedOrderId, creditMinor: product.creditMinor, currency,
      });
      // Wallet top-ups are consumable products. Consume only after the
      // idempotent wallet/ledger transaction succeeds; retries can finish this
      // step without crediting the same purchase twice.
      if (verified["consumptionState"] !== 1) {
        await consumeGooglePlayProduct({
          packageName,
          productId: body.productId,
          purchaseToken: body.purchaseToken,
        });
      }
      return Response.json({
        ...result,
        processed: true,
        currency,
        message: result.credited ? "Wallet credited." : "This purchase was already processed.",
      });
    } catch (error) { return errorBody(error); }
  } } },
});
