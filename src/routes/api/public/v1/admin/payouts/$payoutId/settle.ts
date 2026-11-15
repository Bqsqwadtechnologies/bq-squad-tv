import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";

const schema = z.object({
  settlementReference: z.string().trim().min(4).max(150),
  reason: z.string().trim().min(3).max(1000),
});

export const Route = createFileRoute("/api/public/v1/admin/payouts/$payoutId/settle")({
  server: { handlers: { POST: async ({ request, params }) => {
    try {
      const actor = await requireUser(request);
      const payoutId = params.payoutId;
      if (!/^po_[a-f0-9]{64}$/.test(payoutId)) throw new ApiError(400, "PAYOUT_ID_INVALID", "The payout identifier is invalid.");
      const body = await parseBody(request, schema);
      const fs = await Firestore.create();
      await requireAdminModule(fs, actor, "payouts");
      const payoutPath = "payouts/" + payoutId;
      const auditPath = "auditLog/" + crypto.randomUUID();
      const now = new Date().toISOString();
      const result = await fs.transact([payoutPath, auditPath], ([payout, audit]) => {
        if (!payout) throw new ApiError(404, "PAYOUT_NOT_FOUND", "The payout request was not found.");
        if (audit) throw new ApiError(409, "AUDIT_ID_CONFLICT", "Could not record payout settlement.");
        if (payout["status"] !== "APPROVED") throw new ApiError(409, "PAYOUT_NOT_APPROVED", "Only approved payouts can be marked settled.");
        return {
          result: { payoutId, status: "SETTLED", settlementReference: body.settlementReference },
          writes: [
            { update: { name: fs.docName(payoutPath), fields: encodeFields({
              status: "SETTLED", settlementReference: body.settlementReference,
              settledAt: now, settledBy: actor.uid, settlementReason: body.reason, updatedAt: now,
            }) }, updateMask: { fieldPaths: ["status", "settlementReference", "settledAt", "settledBy", "settlementReason", "updatedAt"] } },
            { update: { name: fs.docName(auditPath), fields: encodeFields({
              actorUid: actor.uid, action: "payout.settled", targetType: "payout",
              targetId: payoutId, reason: body.reason,
              metadata: { uid: payout["uid"], amountMinor: payout["amountMinor"], currency: payout["currency"], settlementReference: body.settlementReference },
              createdAt: now,
            }) }, currentDocument: { exists: false } },
          ],
        };
      });
      return Response.json(result);
    } catch (error) { return errorBody(error); }
  } } },
});
