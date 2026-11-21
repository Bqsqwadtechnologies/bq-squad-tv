import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  ApiError,
  Firestore,
  encodeFields,
  type FirestoreWrite,
} from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { getPayoutRules, isDualApprovalRequired, isStepUpRequired } from "@/lib/server/payouts/rules";
import { requireStepUp } from "@/lib/server/zillionaire-access";

const schema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().min(3).max(1000),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/payouts/$payoutId/review")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const actor = await requireUser(request);
          const payoutId = params.payoutId;
          if (!/^po_[a-f0-9]{64}$/.test(payoutId))
            throw new ApiError(400, "PAYOUT_ID_INVALID", "The payout identifier is invalid.");
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "payouts");

          const payoutPath = "payouts/" + payoutId;
          const initial = await fs.getDoc(payoutPath);
          if (!initial || typeof initial["uid"] !== "string")
            throw new ApiError(404, "PAYOUT_NOT_FOUND", "The payout request was not found.");
          const uid = initial["uid"] as string;
          const currency = typeof initial["currency"] === "string" ? initial["currency"] : "USD";
          const amount = typeof initial["amountMinor"] === "number" ? initial["amountMinor"] : 0;

          // Check rules for step-up and dual-approval
          const rules = await getPayoutRules(fs);
          if (isStepUpRequired(rules, currency, amount)) {
            await requireStepUp(request, actor.uid, "payout_review");
          }

          const dualApprovalNeeded = isDualApprovalRequired(rules, currency, amount);
          const producerPath = "producers/" + uid;
          const auditPath = "auditLog/" + crypto.randomUUID();
          const now = new Date().toISOString();

          const result = await fs.transact(
            [payoutPath, producerPath, auditPath],
            ([payout, producer, audit]) => {
              if (!payout)
                throw new ApiError(404, "PAYOUT_NOT_FOUND", "The payout request was not found.");
              if (!producer)
                throw new ApiError(
                  503,
                  "PRODUCER_ACCOUNT_MISSING",
                  "The producer account is unavailable.",
                );
              if (audit)
                throw new ApiError(
                  409,
                  "AUDIT_ID_CONFLICT",
                  "Could not record this payout review.",
                );

              const currentStatus = payout["status"];
              const isFirstStage = currentStatus === "REQUESTED";
              const isSecondStage = currentStatus === "PENDING_SECOND_APPROVAL";

              if (payout["uid"] !== uid || (!isFirstStage && !isSecondStage)) {
                throw new ApiError(
                  409,
                  "PAYOUT_NOT_REVIEWABLE",
                  "Only requested or pending second-approval payouts can be reviewed.",
                );
              }

              if (!/^[A-Z]{3}$/.test(currency) || !Number.isSafeInteger(amount) || amount < 1) {
                throw new ApiError(409, "PAYOUT_RECORD_INVALID", "The payout record is invalid.");
              }

              let nextStatus: string;
              const payoutUpdateFields: Record<string, unknown> = {
                updatedAt: now,
              };

              if (body.decision === "APPROVE") {
                if (dualApprovalNeeded && isFirstStage) {
                  // Move to PENDING_SECOND_APPROVAL
                  nextStatus = "PENDING_SECOND_APPROVAL";
                  payoutUpdateFields["status"] = nextStatus;
                  payoutUpdateFields["firstReviewerUid"] = actor.uid;
                  payoutUpdateFields["firstReviewedAt"] = now;
                  payoutUpdateFields["firstReviewReason"] = body.reason;
                } else if (dualApprovalNeeded && isSecondStage) {
                  // Second reviewer must be different
                  if (payout["firstReviewerUid"] === actor.uid) {
                    throw new ApiError(
                      403,
                      "DUAL_APPROVAL_SAME_REVIEWER",
                      "Dual approval requires a second, different reviewer to authorize high-value payouts.",
                    );
                  }
                  nextStatus = "APPROVED";
                  payoutUpdateFields["status"] = nextStatus;
                  payoutUpdateFields["secondReviewerUid"] = actor.uid;
                  payoutUpdateFields["secondReviewedAt"] = now;
                  payoutUpdateFields["secondReviewReason"] = body.reason;
                  payoutUpdateFields["reviewedAt"] = now;
                  payoutUpdateFields["reviewedBy"] = actor.uid;
                  payoutUpdateFields["reviewReason"] = body.reason;
                } else {
                  // Standard single approval
                  nextStatus = "APPROVED";
                  payoutUpdateFields["status"] = nextStatus;
                  payoutUpdateFields["reviewedAt"] = now;
                  payoutUpdateFields["reviewedBy"] = actor.uid;
                  payoutUpdateFields["reviewReason"] = body.reason;
                }
              } else {
                // REJECT decision
                nextStatus = "REJECTED";
                payoutUpdateFields["status"] = nextStatus;
                payoutUpdateFields["rejectedBy"] = actor.uid;
                payoutUpdateFields["rejectedAt"] = now;
                payoutUpdateFields["rejectionReason"] = body.reason;
              }

              const writes = [
                {
                  update: {
                    name: fs.docName(payoutPath),
                    fields: encodeFields(payoutUpdateFields),
                  },
                  updateMask: {
                    fieldPaths: Object.keys(payoutUpdateFields),
                  },
                },
                {
                  update: {
                    name: fs.docName(auditPath),
                    fields: encodeFields({
                      actorUid: actor.uid,
                      action:
                        body.decision === "APPROVE"
                          ? nextStatus === "PENDING_SECOND_APPROVAL"
                            ? "payout.first_approval"
                            : "payout.approved"
                          : "payout.rejected",
                      targetType: "payout",
                      targetId: payoutId,
                      reason: body.reason,
                      metadata: {
                        uid,
                        amountMinor: amount,
                        currency,
                        nextStatus,
                        dualApprovalNeeded,
                      },
                      createdAt: now,
                    }),
                  },
                  currentDocument: { exists: false },
                },
              ] as FirestoreWrite[];

              // Release funds on reject
              if (body.decision === "REJECT") {
                const balances =
                  producer["earningsBalanceByCurrency"] &&
                  typeof producer["earningsBalanceByCurrency"] === "object"
                    ? (producer["earningsBalanceByCurrency"] as Record<string, unknown>)
                    : {};
                const reserved =
                  producer["payoutReservedByCurrency"] &&
                  typeof producer["payoutReservedByCurrency"] === "object"
                    ? (producer["payoutReservedByCurrency"] as Record<string, unknown>)
                    : {};
                const nextBalances = {
                  ...balances,
                  [currency]:
                    (typeof balances[currency] === "number" ? (balances[currency] as number) : 0) +
                    amount,
                };
                const nextReserved = {
                  ...reserved,
                  [currency]: Math.max(
                    0,
                    (typeof reserved[currency] === "number" ? (reserved[currency] as number) : 0) -
                      amount,
                  ),
                };
                const fields: Record<string, unknown> = {
                  earningsBalanceByCurrency: nextBalances,
                  payoutReservedByCurrency: nextReserved,
                  updatedAt: now,
                  ...(currency === "NGN" ? { earningsBalanceMinor: nextBalances["NGN"] } : {}),
                };
                writes.push({
                  update: { name: fs.docName(producerPath), fields: encodeFields(fields) },
                  updateMask: { fieldPaths: Object.keys(fields) },
                });
              }

              return { result: { payoutId, status: nextStatus }, writes };
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
