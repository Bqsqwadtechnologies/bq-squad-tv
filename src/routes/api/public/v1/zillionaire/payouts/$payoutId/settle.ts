import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  ApiError,
  Firestore,
  encodeFields,
  type FirestoreWrite,
} from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { isProtectedZillionaire, requireZillionaireModule } from "@/lib/server/roles";
import { requireStepUp } from "@/lib/server/zillionaire-access";

const schema = z.object({
  action: z.enum(["SETTLE", "PAID", "PARTIAL", "FAIL", "REVERSE"]).default("SETTLE"),
  settlementReference: z.string().trim().min(3).max(150),
  paidAmountMinor: z.number().int().positive().optional(),
  paymentDate: z.string().datetime().optional(),
  reason: z.string().trim().min(3).max(1000),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/payouts/$payoutId/settle")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const actor = await requireUser(request);
          const payoutId = params.payoutId;
          if (!/^po_[a-f0-9]{64}$/.test(payoutId)) {
            throw new ApiError(400, "INVALID_PAYOUT_ID", "Invalid payout id format.");
          }

          requireZillionaireModule(actor, "finance");
          await requireStepUp(request, actor);

          const body = await parseBody(request, schema);
          const action = body.action === "PAID" ? "SETTLE" : body.action;
          const payoutRef = `payouts/${payoutId}`;
          const currentPayout = await Firestore.getDocument(payoutRef);

          if (!currentPayout) {
            throw new ApiError(404, "NOT_FOUND", "Payout record not found.");
          }

          const currentStatus = String(currentPayout.fields?.status || "");
          const currency = String(currentPayout.fields?.currency || "NGN");
          const totalAmountMinor = Number(currentPayout.fields?.amountMinor || 0);
          const producerUid = String(currentPayout.fields?.producerUid || currentPayout.fields?.providerUid || "");
          const targetRole = currentPayout.fields?.producerUid ? "producer" : "provider";
          const targetCol = targetRole === "producer" ? "producers" : "providers";
          const targetDoc = await Firestore.getDocument(`${targetCol}/${producerUid}`);
          const reservedMap = (targetDoc?.fields?.payoutReservedByCurrency || {}) as Record<string, number>;
          const currentReserved = Number(reservedMap[currency] || 0);
          const effectivePaymentDate = body.paymentDate || new Date().toISOString();

          // 1. REVERSE WORKFLOW: Records are never deleted. Create reversal entry.
          if (action === "REVERSE") {
            if (currentStatus !== "SETTLED" && currentStatus !== "PARTIALLY_SETTLED") {
              throw new ApiError(409, "INVALID_STATE", "Only settled or partially settled payouts can be reversed.");
            }

            const reversalId = `rev_${crypto.randomUUID().replace(/-/g, "")}`;
            const reversalWrite: FirestoreWrite = {
              update: {
                name: `payout_reversals/${reversalId}`,
                fields: encodeFields({
                  reversalId,
                  originalPayoutId: payoutId,
                  recipientUid: producerUid,
                  recipientRole: targetRole,
                  currency,
                  amountMinor: totalAmountMinor,
                  originalReference: String(currentPayout.fields?.settlementReference || ""),
                  reversalReference: body.settlementReference,
                  reason: body.reason,
                  reversedByUid: actor.uid,
                  reversedAt: effectivePaymentDate,
                  createdAt: new Date().toISOString(),
                }),
              },
            };

            const payoutUpdate: FirestoreWrite = {
              update: {
                name: payoutRef,
                fields: encodeFields({
                  ...currentPayout.fields,
                  status: "REVERSED",
                  reversalReference: body.settlementReference,
                  reversalReason: body.reason,
                  reversedAt: effectivePaymentDate,
                  reversedByUid: actor.uid,
                  updatedAt: new Date().toISOString(),
                }),
              },
            };

            const auditWrite: FirestoreWrite = {
              update: {
                name: `zillionaire_audit_logs/audit_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
                fields: encodeFields({
                  module: "finance",
                  action: "payout_reversed",
                  payoutId,
                  reversalId,
                  actorUid: actor.uid,
                  actorEmail: actor.email,
                  reference: body.settlementReference,
                  reason: body.reason,
                  timestamp: new Date().toISOString(),
                }),
              },
            };

            await Firestore.commit([reversalWrite, payoutUpdate, auditWrite]);

            return Response.json({
              success: true,
              status: "REVERSED",
              reversalId,
              payoutId,
              timestamp: effectivePaymentDate,
            });
          }

          // 2. FAIL WORKFLOW: Mark payout failed, unreserve balance
          if (action === "FAIL") {
            if (currentStatus === "SETTLED" || currentStatus === "REVERSED") {
              throw new ApiError(409, "INVALID_STATE", "Cannot fail a settled or reversed payout.");
            }

            const newReserved = Math.max(0, currentReserved - totalAmountMinor);
            const partnerUpdate: FirestoreWrite = {
              update: {
                name: `${targetCol}/${producerUid}`,
                fields: encodeFields({
                  ...(targetDoc?.fields || {}),
                  payoutReservedByCurrency: {
                    ...reservedMap,
                    [currency]: newReserved,
                  },
                }),
              },
            };

            const payoutUpdate: FirestoreWrite = {
              update: {
                name: payoutRef,
                fields: encodeFields({
                  ...currentPayout.fields,
                  status: "FAILED",
                  failureReason: body.reason,
                  failedAt: effectivePaymentDate,
                  updatedAt: new Date().toISOString(),
                }),
              },
            };

            const auditWrite: FirestoreWrite = {
              update: {
                name: `zillionaire_audit_logs/audit_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
                fields: encodeFields({
                  module: "finance",
                  action: "payout_failed",
                  payoutId,
                  actorUid: actor.uid,
                  actorEmail: actor.email,
                  reason: body.reason,
                  timestamp: new Date().toISOString(),
                }),
              },
            };

            await Firestore.commit([partnerUpdate, payoutUpdate, auditWrite]);

            return Response.json({
              success: true,
              status: "FAILED",
              payoutId,
              timestamp: effectivePaymentDate,
            });
          }

          // 3. SETTLE / PAID / PARTIAL WORKFLOW
          if (currentStatus !== "APPROVED" && currentStatus !== "PARTIALLY_SETTLED") {
            throw new ApiError(409, "INVALID_STATE", "Payout must be approved before settlement.");
          }

          const paidMinor = body.paidAmountMinor ?? totalAmountMinor;
          if (paidMinor > totalAmountMinor) {
            throw new ApiError(400, "OVERPAYMENT", "Paid amount cannot exceed total payout request amount.");
          }

          const isPartial = paidMinor < totalAmountMinor || action === "PARTIAL";
          const newStatus = isPartial ? "PARTIALLY_SETTLED" : "SETTLED";

          const newReserved = Math.max(0, currentReserved - paidMinor);
          const partnerUpdate: FirestoreWrite = {
            update: {
              name: `${targetCol}/${producerUid}`,
              fields: encodeFields({
                ...(targetDoc?.fields || {}),
                payoutReservedByCurrency: {
                  ...reservedMap,
                  [currency]: newReserved,
                },
              }),
            },
          };

          const receiptId = `rcpt_${payoutId.slice(0, 16)}_${Date.now().toString().slice(-6)}`;
          const payoutUpdate: FirestoreWrite = {
            update: {
              name: payoutRef,
              fields: encodeFields({
                ...currentPayout.fields,
                status: newStatus,
                settlementReference: body.settlementReference,
                settlementReason: body.reason,
                paidAmountMinor: paidMinor,
                totalAmountMinor,
                paymentDate: effectivePaymentDate,
                receiptId,
                settledAt: effectivePaymentDate,
                settledByUid: actor.uid,
                updatedAt: new Date().toISOString(),
              }),
            },
          };

          // In-app notification for payout recipient
          const notifId = `notif_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
          const notifWrite: FirestoreWrite = {
            update: {
              name: `notifications/${notifId}`,
              fields: encodeFields({
                id: notifId,
                recipientUid: producerUid,
                title: isPartial ? "Payout Partially Processed" : "Payout Processed",
                body: `Your payout of ${currency} ${(paidMinor / 100).toLocaleString()} has been disbursed (Ref: ${body.settlementReference}).`,
                type: "PAYOUT_SETTLED",
                metadata: {
                  payoutId,
                  receiptId,
                  reference: body.settlementReference,
                  amountMinor: paidMinor,
                  currency,
                  paymentDate: effectivePaymentDate,
                },
                read: false,
                createdAt: new Date().toISOString(),
              }),
            },
          };

          // Queued Email Notification
          const emailId = `email_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
          const emailWrite: FirestoreWrite = {
            update: {
              name: `emails/${emailId}`,
              fields: encodeFields({
                id: emailId,
                recipientUid: producerUid,
                template: "PAYOUT_DISBURSED",
                subject: `Disbursement Confirmation: ${currency} ${(paidMinor / 100).toLocaleString()}`,
                variables: {
                  payoutId,
                  receiptId,
                  reference: body.settlementReference,
                  amount: (paidMinor / 100).toLocaleString(),
                  currency,
                  paymentDate: effectivePaymentDate,
                  status: newStatus,
                },
                status: "QUEUED",
                createdAt: new Date().toISOString(),
              }),
            },
          };

          const auditWrite: FirestoreWrite = {
            update: {
              name: `zillionaire_audit_logs/audit_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
              fields: encodeFields({
                module: "finance",
                action: isPartial ? "payout_partially_settled" : "payout_settled",
                payoutId,
                receiptId,
                actorUid: actor.uid,
                actorEmail: actor.email,
                reference: body.settlementReference,
                paidAmountMinor: paidMinor,
                totalAmountMinor,
                status: newStatus,
                timestamp: new Date().toISOString(),
              }),
            },
          };

          await Firestore.commit([partnerUpdate, payoutUpdate, notifWrite, emailWrite, auditWrite]);

          return Response.json({
            success: true,
            status: newStatus,
            payoutId,
            receiptId,
            paidAmountMinor: paidMinor,
            currency,
            settlementReference: body.settlementReference,
            paymentDate: effectivePaymentDate,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
