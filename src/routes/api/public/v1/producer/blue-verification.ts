import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireApprovedKyc } from "@/lib/server/access";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSupportedPaystackCurrency } from "@/lib/server/currency";

export const Route = createFileRoute("/api/public/v1/producer/blue-verification")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const [config, producer] = await Promise.all([
            fs.getDoc("config/producerBlueTick"),
            fs.getDoc("producers/" + user.uid),
          ]);
          const expiresAt = typeof producer?.["publicVerificationUntil"] === "string"
            ? producer["publicVerificationUntil"] as string
            : null;
          const active = producer?.["publicVerificationStatus"] === "ACTIVE" &&
            Boolean(expiresAt) && Date.parse(expiresAt!) > Date.now();
          return Response.json({
            enabled: config?.["enabled"] === true,
            monthlyPriceMinor: Number(config?.["monthlyPriceMinor"]) || 0,
            currency: typeof config?.["currency"] === "string" ? config["currency"] : "NGN",
            verificationStatus: producer?.["verificationStatus"] || "NOT_SUBMITTED",
            blueVerified: active,
            expiresAt,
          }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          if (!user.emailVerified || !user.email) {
            throw new ApiError(403, "EMAIL_VERIFICATION_REQUIRED", "Verify your email before purchasing public verification.");
          }
          const fs = await Firestore.create();
          await enforceRateLimit(fs, "producer-blue-tick:" + user.uid, { limit: 3, windowMs: 60 * 60_000 });
          const [config, producer] = await Promise.all([
            fs.getDoc("config/producerBlueTick"),
            fs.getDoc("producers/" + user.uid),
          ]);
          if (!config || config["enabled"] !== true || !Number.isSafeInteger(config["monthlyPriceMinor"]) || Number(config["monthlyPriceMinor"]) < 1) {
            throw new ApiError(503, "BLUE_TICK_NOT_AVAILABLE", "Public producer verification is not currently available for purchase.");
          }
          if (!producer || producer["verificationStatus"] !== "APPROVED") {
            throw new ApiError(403, "PRODUCER_KYC_REQUIRED", "Your producer identity must be approved before you can purchase the public blue tick.");
          }
          const currency = String(config["currency"] || "NGN").toUpperCase();
          const amountMinor = Number(config["monthlyPriceMinor"]);
          if (!isSupportedPaystackCurrency(currency)) {
            throw new ApiError(400, "BLUE_TICK_CURRENCY_UNSUPPORTED", "The configured verification currency is not supported by Paystack.");
          }
          const secret = process.env["PAYSTACK_SECRET_KEY"];
          if (!secret) throw new ApiError(503, "PAYSTACK_NOT_CONFIGURED", "Website payments are not configured.");
          const reference = "BQTV_BLUE_" + crypto.randomUUID().replace(/-/g, "");
          const paymentPath = "payments/paystack_" + reference;
          await fs.setDoc(paymentPath, {
            uid: user.uid,
            email: user.email,
            reference,
            paymentType: "producer_blue_tick",
            amountMinor,
            currency,
            provider: "paystack",
            status: "initializing",
            createdAt: new Date().toISOString(),
          }, { mustNotExist: true });

          const callbackUrl = process.env["PAYSTACK_CALLBACK_URL"] || new URL("/producer/profile?blueTick=verify", request.url).toString();
          const response = await fetch("https://api.paystack.co/transaction/initialize", {
            method: "POST",
            headers: { authorization: "Bearer " + secret, "content-type": "application/json" },
            body: JSON.stringify({
              email: user.email,
              amount: amountMinor,
              currency,
              reference,
              callback_url: callbackUrl,
              metadata: {
                uid: user.uid,
                paymentType: "producer_blue_tick",
                plan: "monthly",
                platform: "website",
              },
            }),
          });
          const result = await response.json() as {
            status?: boolean;
            message?: string;
            data?: { authorization_url?: string; reference?: string };
          };
          if (!response.ok || result.status !== true || !result.data?.authorization_url) {
            await fs.patchDoc(paymentPath, { status: "initialize_failed", updatedAt: new Date().toISOString() }).catch(() => undefined);
            throw new ApiError(502, "BLUE_TICK_CHECKOUT_FAILED", "The payment provider could not start public verification checkout. Please try again.");
          }
          await fs.patchDoc(paymentPath, { status: "pending", updatedAt: new Date().toISOString() });
          return Response.json({
            authorizationUrl: result.data.authorization_url,
            reference,
            amountMinor,
            currency,
            plan: "monthly",
          }, { status: 201, headers: { "cache-control": "no-store" } });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
