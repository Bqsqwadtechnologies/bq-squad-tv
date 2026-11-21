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
import { requireStepUp } from "@/lib/server/zillionaire-access";

const schema = z.object({
  action: z.enum(["SETTLE", "PAID", "PARTIAL", "FAIL", "REVERSE", "RETURN"]).default("SETTLE"),
  settlementReference: z.string().trim().min(3).max(150),
  paidAmountMinor: z.number().int().positive().optional(),
  paymentDate: z.string().datetime().optional(),
  reason: z.string().trim().min(3).max(1000),
  receiptPath: z.string().trim().optional().nullable(),
  receiptUrl: z.string().trim().optional().nullable(),
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

          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "payouts");

          // Optional step-up verification if header provided
          if (request.headers.get("x-zillionaire-step-up")) {
            requireStepUp(request, actor.uid, "payout_settlement");
          }

          const body = await parseBody(request, schema);
          const action = body.action === "PAID" ? "SETTLE" : body.action;
          const payoutRef = `payouts/${payoutId}`;
          const currentPayoutDoc = await fs.getDoc(payoutRef);

          if (!currentPayoutDoc) {
            throw new ApiError(404, "NOT_FOUND", "Payout record not found.");
          }

          const currentStatus = String(currentPayoutDoc["status"] || "");
          const currency = String(currentPayoutDoc["currency"] || "NGN");
          const totalAmountMinor = Number(currentPayoutDoc["amountMinor"] || 0);
          const recipientUid = String(currentPayoutDoc["uid"] || currentPayoutDoc["producerUid"] || currentPayoutDoc["providerUid"] || "");
          const targetRole = currentPayoutDoc["providerUid"] ? "provider" : "producer";
          const targetCol = targetRole === "producer" ? "producers" : "providers";
          const targetDoc = await fs.getDoc(`${targetCol}/${recipientUid}`);
          const reservedMap = (targetDoc?.["payoutReservedByCurrency"] || {}) as Record<string, number>;
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
                name: fs.docName(`payout_reversals/${reversalId}`),
                fields: encodeFields({
                  reversalId,
                  originalPayoutId: payoutId,
                  recipientUid,
                  recipientRole: targetRole,
                  currency,
                  amountMinor: totalAmountMinor,
                  originalReference: String(currentPayoutDoc["settlementReference"] || ""),
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
                name: fs.docName(payoutRef),
                fields: encodeFields({
                  ...currentPayoutDoc,
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
                name: fs.docName(`auditLog/${crypto.randomUUID()}`),
                fields: encodeFields({
                  module: "finance",
                  action: "payout.reversed",
                  targetType: "payout",
                  targetId: payoutId,
                  reversalId,
                  actorUid: actor.uid,
                  reference: body.settlementReference,
                  reason: body.reason,
                  createdAt: new Date().toISOString(),
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

          // 2. FAIL OR RETURN WORKFLOW: "Failed or returned transfers move back to Hold with a reason."
          if (action === "FAIL" || action === "RETURN") {
            if (currentStatus === "REVERSED") {
              throw new ApiError(409, "INVALID_STATE", "Cannot fail or return a reversed payout.");
            }

            // Move back to HELD, keep the reservation intact so funds are safe
            const payoutUpdate: FirestoreWrite = {
              update: {
                name: fs.docName(payoutRef),
                fields: encodeFields({
                  ...currentPayoutDoc,
                  status: "HELD",
                  holdReason: body.reason,
                  failureReason: body.reason,
                  heldAt: effectivePaymentDate,
                  heldBy: actor.uid,
                  updatedAt: new Date().toISOString(),
                }),
              },
            };

            const auditWrite: FirestoreWrite = {
              update: {
                name: fs.docName(`auditLog/${crypto.randomUUID()}`),
                fields: encodeFields({
                  actorUid: actor.uid,
                  action: action === "RETURN" ? "payout.returned_to_hold" : "payout.failed_to_hold",
                  targetType: "payout",
                  targetId: payoutId,
                  reason: body.reason,
                  metadata: {
                    reference: body.settlementReference,
                    previousStatus: currentStatus,
                  },
                  createdAt: new Date().toISOString(),
                }),
              },
            };

            // In-app notification for recipient
            const notifId = `notif_hold_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
            const notifWrite: FirestoreWrite = {
              update: {
                name: fs.docName(`notifications/${notifId}`),
                fields: encodeFields({
                  id: notifId,
                  recipientUid,
                  title: "Payout On Hold",
                  body: `Your payout transfer of ${currency} ${(totalAmountMinor / 100).toLocaleString()} was placed on hold: ${body.reason}`,
                  type: "PAYOUT_HELD",
                  metadata: {
                    payoutId,
                    reference: body.settlementReference,
                    amountMinor: totalAmountMinor,
                    currency,
                  },
                  read: false,
                  createdAt: new Date().toISOString(),
                }),
              },
            };

            // Queued Email Notification (Never SMS)
            const outboxId = `outbox_hold_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
            const emailWrite: FirestoreWrite = {
              update: {
                name: fs.docName(`emailOutbox/${outboxId}`),
                fields: encodeFields({
                  id: outboxId,
                  recipientUid,
                  channel: "email",
                  template: "PAYOUT_HELD",
                  subject: `Payout Status Update: ${currency} ${(totalAmountMinor / 100).toLocaleString()}`,
                  variables: {
                    payoutId,
                    amount: (totalAmountMinor / 100).toLocaleString(),
                    currency,
                    reason: body.reason,
                  },
                  status: "QUEUED",
                  createdAt: new Date().toISOString(),
                }),
              },
            };

            await Firestore.commit([payoutUpdate, notifWrite, emailWrite, auditWrite]);

            return Response.json({
              success: true,
              status: "HELD",
              payoutId,
              holdReason: body.reason,
              timestamp: effectivePaymentDate,
            });
          }

          // 3. SETTLE / PAID / PARTIAL WORKFLOW
          if (currentStatus !== "APPROVED" && currentStatus !== "PARTIALLY_SETTLED" && currentStatus !== "REQUESTED") {
            throw new ApiError(409, "INVALID_STATE", "Payout must be approved before settlement.");
          }

          const paidMinor = body.paidAmountMinor ?? totalAmountMinor;
          if (paidMinor > totalAmountMinor) {
            throw new ApiError(400, "OVERPAYMENT", "Paid amount cannot exceed total payout request amount.");
          }

          const isPartial = paidMinor < totalAmountMinor || action === "PARTIAL";
          const newStatus = isPartial ? "PARTIALLY_SETTLED" : "SETTLED";

          const newReserved = Math.max(0, currentReserved - paidMinor);
          const writes: FirestoreWrite[] = [];

          if (targetDoc) {
            writes.push({
              update: {
                name: fs.docName(`${targetCol}/${recipientUid}`),
                fields: encodeFields({
                  ...targetDoc,
                  payoutReservedByCurrency: {
                    ...reservedMap,
                    [currency]: newReserved,
                  },
                }),
              },
            });
          }

          const receiptId = `rcpt_${payoutId.replace(/^po_/, "").slice(0, 16)}_${Date.now().toString().slice(-6)}`;
          const receiptPath = body.receiptPath || body.receiptUrl || null;

          const payoutUpdate: FirestoreWrite = {
            update: {
              name: fs.docName(payoutRef),
              fields: encodeFields({
                ...currentPayoutDoc,
                status: newStatus,
                settlementReference: body.settlementReference,
                settlementReason: body.reason,
                paidAmountMinor: paidMinor,
                totalAmountMinor,
                paymentDate: effectivePaymentDate,
                receiptId,
                receiptPath,
                settledAt: effectivePaymentDate,
                settledByUid: actor.uid,
                updatedAt: new Date().toISOString(),
              }),
            },
          };
          writes.push(payoutUpdate);

          // In-app notification for payout recipient (Strictly in-app + email, never SMS)
          const notifId = `notif_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
          writes.push({
            update: {
              name: fs.docName(`notifications/${notifId}`),
              fields: encodeFields({
                id: notifId,
                recipientUid,
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
                  receiptPath,
                },
                read: false,
                createdAt: new Date().toISOString(),
              }),
            },
          });

          // Queued Email Notification in emailOutbox (Strictly email, never SMS)
          const outboxId = `outbox_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
          writes.push({
            update: {
              name: fs.docName(`emailOutbox/${outboxId}`),
              fields: encodeFields({
                id: outboxId,
                recipientUid,
                channel: "email",
                template: "PAYOUT_PAID",
                subject: `Disbursement Confirmation: ${currency} ${(paidMinor / 100).toLocaleString()}`,
                variables: {
                  payoutId,
                  receiptId,
                  reference: body.settlementReference,
                  amount: (paidMinor / 100).toLocaleString(),
                  currency,
                  paymentDate: effectivePaymentDate,
                  status: newStatus,
                  receiptPath,
                },
                status: "QUEUED",
                createdAt: new Date().toISOString(),
              }),
            },
          });

          // Also keep write to emails/ for backwards compatibility
          const emailId = `email_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
          writes.push({
            update: {
              name: fs.docName(`emails/${emailId}`),
              fields: encodeFields({
                id: emailId,
                recipientUid,
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
                  receiptPath,
                },
                status: "QUEUED",
                createdAt: new Date().toISOString(),
              }),
            },
          });

          const auditWrite: FirestoreWrite = {
            update: {
              name: fs.docName(`auditLog/${crypto.randomUUID()}`),
              fields: encodeFields({
                action: isPartial ? "payout.partially_settled" : "payout.settled",
                targetType: "payout",
                targetId: payoutId,
                receiptId,
                actorUid: actor.uid,
                reference: body.settlementReference,
                paidAmountMinor: paidMinor,
                totalAmountMinor,
                status: newStatus,
                receiptPath,
                createdAt: new Date().toISOString(),
              }),
            },
          };
          writes.push(auditWrite);

          await Firestore.commit(writes);

          return Response.json({
            success: true,
            status: newStatus,
            payoutId,
            receiptId,
            paidAmountMinor: paidMinor,
            currency,
            settlementReference: body.settlementReference,
            paymentDate: effectivePaymentDate,
            receiptPath,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
