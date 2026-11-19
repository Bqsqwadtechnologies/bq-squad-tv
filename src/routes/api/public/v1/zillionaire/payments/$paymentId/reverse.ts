import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

const schema = z.object({ reason: z.string().trim().min(3).max(1000) });

export const Route = createFileRoute("/api/public/v1/zillionaire/payments/$paymentId/reverse")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const actor = await requireUser(request);
          const paymentId = params.paymentId;
          if (!/^(paystack_[A-Za-z0-9_-]{8,100}|googleplay_[a-f0-9]{64})$/.test(paymentId)) {
            throw new ApiError(400, "PAYMENT_ID_INVALID", "The payment identifier is invalid.");
          }
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "payments");
          const paymentPath = "payments/" + paymentId;
          const initial = await fs.getDoc(paymentPath);
          if (!initial || typeof initial["uid"] !== "string")
            throw new ApiError(404, "PAYMENT_NOT_FOUND", "The payment was not found.");
          const uid = initial["uid"] as string;
          const walletPath = "wallets/" + uid;
          const ledgerPath = "ledger/reversal_" + paymentId;
          const auditPath = "auditLog/" + crypto.randomUUID();
          const now = new Date().toISOString();
          const result = await fs.transact<{
            reversed: boolean;
            alreadyReversed?: boolean;
            amountMinor?: number;
            currency?: string;
            balanceMinor?: number;
          }>(
            [paymentPath, walletPath, ledgerPath, auditPath],
            ([payment, wallet, ledger, audit]) => {
              if (!payment || payment["uid"] !== uid)
                throw new ApiError(404, "PAYMENT_NOT_FOUND", "The payment was not found.");
              if (!wallet)
                throw new ApiError(
                  409,
                  "WALLET_NOT_FOUND",
                  "The credited wallet could not be found.",
                );
              if (ledger) {
                if (ledger["uid"] !== uid || ledger["paymentId"] !== paymentId)
                  throw new ApiError(
                    409,
                    "REVERSAL_LEDGER_MISMATCH",
                    "The reversal record does not match this payment.",
                  );
                return { result: { reversed: false, alreadyReversed: true }, writes: [] };
              }
              if (audit)
                throw new ApiError(
                  409,
                  "AUDIT_ID_CONFLICT",
                  "Could not record this payment reversal.",
                );
              if (payment["status"] !== "credited")
                throw new ApiError(
                  409,
                  "PAYMENT_NOT_REVERSIBLE",
                  "Only credited payments can be reversed.",
                );
              const amount = payment["creditMinor"];
              const currency =
                typeof payment["currency"] === "string" ? (payment["currency"] as string) : "NGN";
              const balance =
                typeof wallet["balanceMinor"] === "number" &&
                Number.isSafeInteger(wallet["balanceMinor"])
                  ? (wallet["balanceMinor"] as number)
                  : 0;
              const walletCurrency =
                typeof wallet["currency"] === "string" ? (wallet["currency"] as string) : "NGN";
              if (walletCurrency !== currency)
                throw new ApiError(
                  409,
                  "WALLET_CURRENCY_MISMATCH",
                  "The payment and wallet currencies do not match.",
                );
              if (
                typeof amount !== "number" ||
                !Number.isSafeInteger(amount) ||
                amount < 1 ||
                balance < amount
              ) {
                throw new ApiError(
                  409,
                  "REVERSAL_BALANCE_INSUFFICIENT",
                  "The wallet no longer contains the full credited amount, so this reversal cannot be completed safely.",
                );
              }
              return {
                result: {
                  reversed: true,
                  amountMinor: amount,
                  currency,
                  balanceMinor: balance - amount,
                },
                writes: [
                  {
                    update: {
                      name: fs.docName(paymentPath),
                      fields: encodeFields({
                        status: "reversed",
                        reversedAt: now,
                        reversedBy: actor.uid,
                        reversalReason: body.reason,
                      }),
                    },
                    updateMask: {
                      fieldPaths: ["status", "reversedAt", "reversedBy", "reversalReason"],
                    },
                  },
                  {
                    update: {
                      name: fs.docName(walletPath),
                      fields: encodeFields({ balanceMinor: balance - amount, updatedAt: now }),
                    },
                    updateMask: { fieldPaths: ["balanceMinor", "updatedAt"] },
                  },
                  {
                    update: {
                      name: fs.docName(ledgerPath),
                      fields: encodeFields({
                        uid,
                        kind: "wallet_reversal",
                        description: "Wallet top-up reversed",
                        amountMinor: -amount,
                        currency,
                        paymentId,
                        reason: body.reason,
                        createdAt: now,
                      }),
                    },
                    currentDocument: { exists: false },
                  },
                  {
                    update: {
                      name: fs.docName(auditPath),
                      fields: encodeFields({
                        actorUid: actor.uid,
                        action: "payment.wallet_credit_reversed",
                        targetType: "payment",
                        targetId: paymentId,
                        reason: body.reason,
                        metadata: { uid, amountMinor: amount, currency },
                        createdAt: now,
                      }),
                    },
                    currentDocument: { exists: false },
                  },
                ],
              };
            },
          );
          return Response.json(result);
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
