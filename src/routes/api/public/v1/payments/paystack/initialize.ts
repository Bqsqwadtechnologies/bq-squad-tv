import { requireVerifiedViewer } from "@/lib/server/access";
import { evaluatePaymentFraud } from "@/lib/server/abuse-protection";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, getWallet, parseBody, requireUser } from "@/lib/server/api";
import { getPricingConfig } from "@/lib/server/pricing";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getPaystackTopup } from "@/lib/server/paystack";
import { assertRiskStepUp, recordRiskSignal } from "@/lib/server/risk-engine";

const schema = z.object({
  packageId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  // Currency-specific minimum validation is performed by getPaystackTopup.
  // Do not hard-code the NGN ₦200 minor-unit threshold for other currencies.
  customAmountMinor: z.number().int().positive().optional(),
});

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
      writes: [
        {
          update: { name: fs.docName(path), fields: encodeFields(fields) },
          updateMask: { fieldPaths: ["status", "updatedAt"] },
        },
      ],
    };
  });
}

export const Route = createFileRoute("/api/public/v1/payments/paystack/initialize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { user } = await requireVerifiedViewer(request);
          if (!user.emailVerified)
            throw new ApiError(
              403,
              "EMAIL_VERIFICATION_REQUIRED",
              "Verify your email before making a wallet payment.",
            );
          if (!user.email)
            throw new ApiError(
              400,
              "EMAIL_REQUIRED",
              "Add an email address before making a website payment.",
            );
          const { packageId, customAmountMinor } = await parseBody(request, schema);
          const fs = await Firestore.create();
          await enforceRateLimit(fs, "paystack-init:" + user.uid, { limit: 5, windowMs: 60_000 });
          await assertRiskStepUp(fs, user.uid, user.authTime);
          const wallet = await getWallet(fs, user.uid);
          const currency = wallet.currency;
          const pricing = await getPricingConfig(fs);
          let offer: ReturnType<typeof getPaystackTopup>;
          try {
            offer = getPaystackTopup(pricing, packageId, currency, customAmountMinor);
          } catch (error) {
            if (error instanceof ApiError && (
              error.code === "PAYMENT_CURRENCY_UNSUPPORTED" ||
              error.code === "TOPUP_CURRENCY_NOT_CONFIGURED" ||
              error.code === "TOPUP_UNAVAILABLE"
            )) {
              throw new ApiError(
                400,
                "PAYSTACK_CURRENCY_UNAVAILABLE",
                "Paystack cannot process this wallet currency for this account. Please use the BQ SQWAD TV app to top up your wallet.",
              );
            }
            throw error;
          }
          const clientIp =
            request.headers.get("cf-connecting-ip") ||
            request.headers.get("x-real-ip") ||
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            "127.0.0.1";
          const fraudEval = await evaluatePaymentFraud(fs, {
            uid: user.uid,
            amountMinor: offer.amountMinor,
            currency,
            clientIp,
          });
          if (!fraudEval.allowed) {
            throw new ApiError(
              403,
              "PAYMENT_SECURITY_HOLD",
              "Payment held for security review. Please contact support if you believe this is an error.",
            );
          }
          const reference = "BQTV_" + crypto.randomUUID().replace(/-/g, "");
          const secret = process.env["PAYSTACK_SECRET_KEY"];
          if (!secret)
            throw new ApiError(
              503,
              "PAYSTACK_NOT_CONFIGURED",
              "Website payments are not configured.",
            );
          await fs.setDoc(
            "payments/paystack_" + reference,
            {
              uid: user.uid,
              email: user.email,
              reference,
              packageId,
              amountMinor: offer.amountMinor,
              creditMinor: offer.creditMinor,
              currency,
              provider: "paystack",
              status: "initializing",
              createdAt: new Date().toISOString(),
            },
            { mustNotExist: true },
          );
          await recordRiskSignal(fs, user.uid, "topup");
          const response = await fetch("https://api.paystack.co/transaction/initialize", {
            method: "POST",
            headers: { authorization: "Bearer " + secret, "content-type": "application/json" },
            body: JSON.stringify({
              email: user.email,
              amount: offer.amountMinor,
              currency,
              reference,
              callback_url:
                process.env["PAYSTACK_CALLBACK_URL"] || new URL("/wallet", request.url).toString(),
              metadata: {
                uid: user.uid,
                packageId,
                creditMinor: offer.creditMinor,
                platform: "website",
              },
            }),
          });
          const result = (await response.json()) as {
            status?: boolean;
            message?: string;
            data?: { authorization_url?: string; access_code?: string; reference?: string };
          };
          if (!response.ok || result.status !== true || !result.data?.authorization_url) {
            await markPaymentStatus(
              fs,
              "payments/paystack_" + reference,
              user.uid,
              "initialize_failed",
            );
            await recordRiskSignal(fs, user.uid, "failed_payment");
            const providerMessage = typeof result.message === "string" ? result.message : "";
            if (/currency.*(not supported|unsupported|not enabled)|unsupported.*currency/i.test(providerMessage)) {
              throw new ApiError(
                400,
                "PAYSTACK_CURRENCY_UNAVAILABLE",
                "Paystack cannot process this wallet currency for this account. Please use the BQ SQWAD TV app to top up your wallet.",
              );
            }
            throw new ApiError(
              502,
              "PAYSTACK_INITIALIZE_FAILED",
              "The payment provider could not start checkout. Please try again later.",
            );
          }
          await markPaymentStatus(fs, "payments/paystack_" + reference, user.uid, "pending");
          return Response.json(
            {
              authorizationUrl: result.data.authorization_url,
              reference,
              amountMinor: offer.amountMinor,
              currency,
            },
            { status: 201 },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
