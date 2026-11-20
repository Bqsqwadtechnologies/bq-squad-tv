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
  settlementReference: z.string().trim().min(4).max(150),
  reason: z.string().trim().min(3).max(1000),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/payouts/$payoutId/settle")({
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
          if (isProtectedZillionaire(actor.email || ""))
            requireStepUp(request, actor.uid, "payout_settlement");
          const payoutPath = "payouts/" + payoutId;
          const initial = await fs.getDoc(payoutPath);
          if (!initial || typeof initial["uid"] !== "string")
            throw new ApiError(404, "PAYOUT_NOT_FOUND", "The payout request was not found.");
          const uid = initial["uid"] as string;
          const producerPath = "producers/" + uid;
          const auditPath = "auditLog/" + crypto.randomUUID();
          const now = new Date().toISOString();
          const result = await fs.transact(
            [payoutPath, producerPath, auditPath],
            ([payout, producer, audit]) => {
              if (!payout || payout["uid"] !== uid)
                throw new ApiError(404, "PAYOUT_NOT_FOUND", "The payout request was not found.");
              if (!producer)
                throw new ApiError(
                  503,
                  "PRODUCER_ACCOUNT_MISSING",
                  "The producer account is unavailable.",
                );
              if (audit)
                throw new ApiError(409, "AUDIT_ID_CONFLICT", "Could not record payout settlement.");
              if (payout["status"] !== "APPROVED")
                throw new ApiError(
                  409,
                  "PAYOUT_NOT_APPROVED",
                  "Only approved payouts can be marked settled.",
                );
              const amount = payout["amountMinor"];
              const currency =
                typeof payout["currency"] === "string" ? (payout["currency"] as string) : "";
              if (
                typeof amount !== "number" ||
                !Number.isSafeInteger(amount) ||
                amount < 1 ||
                !/^[A-Z]{3}$/.test(currency)
              ) {
                throw new ApiError(409, "PAYOUT_RECORD_INVALID", "The payout record is invalid.");
              }
              const reserved =
                producer["payoutReservedByCurrency"] &&
                typeof producer["payoutReservedByCurrency"] === "object"
                  ? (producer["payoutReservedByCurrency"] as Record<string, unknown>)
                  : {};
              const currentReserved =
                typeof reserved[currency] === "number" ? (reserved[currency] as number) : 0;
              if (!Number.isSafeInteger(currentReserved) || currentReserved < amount) {
                throw new ApiError(
                  409,
                  "PAYOUT_RESERVATION_MISMATCH",
                  "The reserved producer earnings do not match this payout.",
                );
              }
              const nextReserved = { ...reserved, [currency]: currentReserved - amount };
              const producerFields = { payoutReservedByCurrency: nextReserved, updatedAt: now };
              const writes: FirestoreWrite[] = [
                {
                  update: {
                    name: fs.docName(payoutPath),
                    fields: encodeFields({
                      status: "SETTLED",
                      settlementReference: body.settlementReference,
                      settledAt: now,
                      settledBy: actor.uid,
                      settlementReason: body.reason,
                      updatedAt: now,
                    }),
                  },
                  updateMask: {
                    fieldPaths: [
                      "status",
                      "settlementReference",
                      "settledAt",
                      "settledBy",
                      "settlementReason",
                      "updatedAt",
                    ],
                  },
                },
                {
                  update: { name: fs.docName(producerPath), fields: encodeFields(producerFields) },
                  updateMask: { fieldPaths: Object.keys(producerFields) },
                },
                {
                  update: {
                    name: fs.docName(auditPath),
                    fields: encodeFields({
                      actorUid: actor.uid,
                      action: "payout.settled",
                      targetType: "payout",
                      targetId: payoutId,
                      reason: body.reason,
                      metadata: {
                        uid,
                        amountMinor: amount,
                        currency,
                        settlementReference: body.settlementReference,
                      },
                      createdAt: now,
                    }),
                  },
                  currentDocument: { exists: false },
                },
              ];
              return {
                result: {
                  payoutId,
                  status: "SETTLED",
                  settlementReference: body.settlementReference,
                },
                writes,
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
