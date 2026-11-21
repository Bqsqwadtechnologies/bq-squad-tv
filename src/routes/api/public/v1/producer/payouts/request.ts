import { getKycRiskSettings } from "@/lib/server/kyc/risk-settings";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requirePlatformRole } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { requireCurrency } from "@/lib/server/currency";
import { getPayoutRules, getMinimumPayoutForCurrency } from "@/lib/server/payouts/rules";

const schema = z.object({
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/),
  idempotencyKey: z.string().uuid(),
});

export const Route = createFileRoute("/api/public/v1/producer/payouts/request")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const currency = requireCurrency(body.currency);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, user, "producer");

          // 1. KYC Approval and Expiry Check
          const kycDoc = await fs.getDoc(`kycProfiles/${user.uid}`);
          if (kycDoc?.["kycStatus"] !== "approved") {
            throw new ApiError(
              403,
              "KYC_NOT_APPROVED",
              "An approved identity verification (KYC) profile is required before requesting payouts.",
            );
          }
          const nowIso = new Date().toISOString();
          const expiresAt = kycDoc?.["expiresAt"] || kycDoc?.["idExpiryDate"];
          if (typeof expiresAt === "string" && expiresAt < nowIso) {
            throw new ApiError(
              403,
              "KYC_EXPIRED",
              "Your identity verification document has expired. Re-verification is required before requesting payouts.",
            );
          }

          if (kycDoc?.["legalHold"] === true) {
            throw new ApiError(
              403,
              "ACCOUNT_ON_LEGAL_HOLD",
              "Payouts are temporarily paused while an active regulatory legal hold is in effect on this account.",
            );
          }

          // 2. Payout Account Status Check
          const payoutProfile = await fs.getDoc(`payoutProfiles/${user.uid}`);
          if (!payoutProfile) {
            throw new ApiError(
              403,
              "PAYOUT_ACCOUNT_REQUIRED",
              "A verified and approved bank payout account is required before requesting payouts.",
            );
          }
          const profileStatus = payoutProfile["status"] || payoutProfile["verificationStatus"];
          if (profileStatus !== "APPROVED") {
            throw new ApiError(
              403,
              "PAYOUT_ACCOUNT_UNDER_REVIEW",
              "Your payout bank account is currently under review or pending verification.",
            );
          }
          if (payoutProfile["payoutsPaused"] === true) {
            throw new ApiError(
              403,
              "PAYOUTS_PAUSED",
              "Payouts are temporarily paused on your payout account.",
            );
          }

          // 3. Tier 1 Cumulative Limit Check (Batch C2)
          const currentTier = typeof kycDoc?.["payoutTier"] === "number" ? kycDoc["payoutTier"] : 1;
          if (currentTier < 2) {
            const riskSettings = await getKycRiskSettings(fs);
            const tier1Limit =
              currency === "NGN"
                ? riskSettings.tier1CumulativeLimitNgnMinor
                : riskSettings.tier1CumulativeLimitUsdMinor;

            // Query existing payouts for cumulative calculation
            const allUserPayouts = await fs.query("payouts", { limit: 500 }).catch(() => []);
            let cumulativePaidMinor = 0;
            for (const p of allUserPayouts) {
              if (p["uid"] === user.uid && p["currency"] === currency && (p["status"] === "PAID" || p["status"] === "APPROVED")) {
                cumulativePaidMinor += (typeof p["amountMinor"] === "number" ? p["amountMinor"] : 0);
              }
            }

            if (cumulativePaidMinor + body.amountMinor > tier1Limit) {
              const limitFormatted =
                currency === "USD"
                  ? `$${(tier1Limit / 100).toLocaleString()}`
                  : currency === "NGN"
                    ? `₦${(tier1Limit / 100).toLocaleString()}`
                    : `${(tier1Limit / 100).toLocaleString()} ${currency}`;

              throw new ApiError(
                403,
                "TIER_LIMIT_EXCEEDED",
                `Cumulative payouts exceed the Tier 1 threshold of ${limitFormatted}. Tier 2 Enhanced KYC (proof of address and source of income) is required to unlock higher payouts.`,
              );
            }
          }

          // 4. Minimum Payout Check per Currency
          const rules = await getPayoutRules(fs);
          const minPayout = getMinimumPayoutForCurrency(rules, currency);
          if (body.amountMinor < minPayout) {
            const minFormatted =
              currency === "USD"
                ? `$${(minPayout / 100).toFixed(2)}`
                : currency === "NGN"
                  ? `₦${(minPayout / 100).toLocaleString()}`
                  : `${(minPayout / 100).toFixed(2)} ${currency}`;
            throw new ApiError(
              400,
              "MINIMUM_PAYOUT_NOT_MET",
              `Minimum payout is ${minFormatted} for ${currency} settlements.`,
            );
          }

          await enforceRateLimit(fs, "producer-payout-request:" + user.uid, {
            limit: 3,
            windowMs: 60 * 60_000,
          });

          const idDigest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(user.uid + ":" + body.idempotencyKey),
          );
          const id = Array.from(new Uint8Array(idDigest), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join("");
          const payoutId = "po_" + id;
          const payoutPath = "payouts/" + payoutId;
          const producerPath = "producers/" + user.uid;
          const ledgerPath = "ledger/" + payoutId;
          const now = new Date().toISOString();

          const result = await fs.transact(
            [producerPath, payoutPath, ledgerPath],
            ([producer, existingPayout, existingLedger]) => {
              if (!producer)
                throw new ApiError(
                  403,
                  "PRODUCER_ACCOUNT_REQUIRED",
                  "A verified producer account is required.",
                );

              // 4. Safety risk flags on producer
              if (producer["payoutHold"] === true || producer["riskFlagOpen"] === true) {
                throw new ApiError(
                  403,
                  "PAYOUT_HELD_RISK",
                  "Payouts are temporarily on hold for this account due to open risk review.",
                );
              }

              if (existingPayout) {
                if (
                  existingPayout["uid"] !== user.uid ||
                  existingPayout["idempotencyKey"] !== body.idempotencyKey
                ) {
                  throw new ApiError(
                    409,
                    "PAYOUT_IDEMPOTENCY_CONFLICT",
                    "This payout request key has already been used.",
                  );
                }
                return {
                  result: {
                    payoutId,
                    status: existingPayout["status"],
                    amountMinor: existingPayout["amountMinor"],
                    currency: existingPayout["currency"],
                    duplicate: true,
                  },
                  writes: [],
                };
              }
              if (existingLedger)
                throw new ApiError(
                  409,
                  "PAYOUT_LEDGER_CONFLICT",
                  "A payout ledger record already exists.",
                );
              const balances =
                producer["earningsBalanceByCurrency"] &&
                typeof producer["earningsBalanceByCurrency"] === "object"
                  ? (producer["earningsBalanceByCurrency"] as Record<string, unknown>)
                  : {};
              const currentBalance =
                typeof balances[currency] === "number"
                  ? (balances[currency] as number)
                  : currency === "NGN" && typeof producer["earningsBalanceMinor"] === "number"
                    ? (producer["earningsBalanceMinor"] as number)
                    : 0;
              if (!Number.isSafeInteger(currentBalance) || currentBalance < body.amountMinor) {
                throw new ApiError(
                  409,
                  "PAYOUT_BALANCE_INSUFFICIENT",
                  "Your available producer earnings are not sufficient for this payout.",
                );
              }
              const nextBalances = { ...balances, [currency]: currentBalance - body.amountMinor };
              const reserved =
                producer["payoutReservedByCurrency"] &&
                typeof producer["payoutReservedByCurrency"] === "object"
                  ? (producer["payoutReservedByCurrency"] as Record<string, unknown>)
                  : {};
              const nextReserved = {
                ...reserved,
                [currency]:
                  (typeof reserved[currency] === "number" ? (reserved[currency] as number) : 0) +
                  body.amountMinor,
              };
              const producerFields: Record<string, unknown> = {
                earningsBalanceByCurrency: nextBalances,
                payoutReservedByCurrency: nextReserved,
                updatedAt: now,
                ...(currency === "NGN" ? { earningsBalanceMinor: nextBalances["NGN"] } : {}),
              };

              // Snapshot payout account snapshot
              const accountSnapshot = {
                beneficiaryName: payoutProfile["beneficiaryName"] || payoutProfile["accountName"] || "",
                bankName: payoutProfile["bankName"] || "",
                accountNumberMasked: payoutProfile["accountNumberMasked"] || "",
                routingCode: payoutProfile["routingCode"] || "",
                swiftBic: payoutProfile["swiftBic"] || "",
                country: payoutProfile["country"] || "",
                currency: payoutProfile["currency"] || currency,
              };

              return {
                result: {
                  payoutId,
                  status: "REQUESTED",
                  amountMinor: body.amountMinor,
                  currency,
                  duplicate: false,
                },
                writes: [
                  {
                    update: {
                      name: fs.docName(producerPath),
                      fields: encodeFields(producerFields),
                    },
                    updateMask: { fieldPaths: Object.keys(producerFields) },
                  },
                  {
                    update: {
                      name: fs.docName(payoutPath),
                      fields: encodeFields({
                        uid: user.uid,
                        amountMinor: body.amountMinor,
                        currency,
                        status: "REQUESTED",
                        idempotencyKey: body.idempotencyKey,
                        payoutAccount: accountSnapshot,
                        createdAt: now,
                        updatedAt: now,
                      }),
                    },
                    currentDocument: { exists: false },
                  },
                  {
                    update: {
                      name: fs.docName(ledgerPath),
                      fields: encodeFields({
                        uid: user.uid,
                        kind: "payout_requested",
                        description: "Producer payout requested",
                        amountMinor: -body.amountMinor,
                        currency,
                        payoutId,
                        createdAt: now,
                      }),
                    },
                    currentDocument: { exists: false },
                  },
                ],
              };
            },
          );
          return Response.json(result, {
            status: result.duplicate ? 200 : 201,
            headers: { "cache-control": "no-store" },
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
