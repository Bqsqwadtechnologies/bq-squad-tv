import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields, type FirestoreWrite } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";

const schema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().min(3).max(1000),
});

export const Route = createFileRoute("/api/public/v1/admin/payouts/$payoutId/review")({
  server: { handlers: { POST: async ({ request, params }) => {
    try {
      const actor = await requireUser(request);
      const payoutId = params.payoutId;
      if (!/^po_[a-f0-9]{64}$/.test(payoutId)) throw new ApiError(400, "PAYOUT_ID_INVALID", "The payout identifier is invalid.");
      const body = await parseBody(request, schema);
      const fs = await Firestore.create();
      await requireAdminModule(fs, actor, "payouts");
      const payoutPath = "payouts/" + payoutId;
      const initial = await fs.getDoc(payoutPath);
      if (!initial || typeof initial["uid"] !== "string") throw new ApiError(404, "PAYOUT_NOT_FOUND", "The payout request was not found.");
      const uid = initial["uid"] as string;
      const producerPath = "producers/" + uid;
      const auditPath = "auditLog/" + crypto.randomUUID();
      const now = new Date().toISOString();
      const result = await fs.transact([payoutPath, producerPath, auditPath], ([payout, producer, audit]) => {
        if (!payout) throw new ApiError(404, "PAYOUT_NOT_FOUND", "The payout request was not found.");
        if (!producer) throw new ApiError(503, "PRODUCER_ACCOUNT_MISSING", "The producer account is unavailable.");
        if (audit) throw new ApiError(409, "AUDIT_ID_CONFLICT", "Could not record this payout review.");
        if (payout["uid"] !== uid || payout["status"] !== "REQUESTED") {
          throw new ApiError(409, "PAYOUT_NOT_REVIEWABLE", "Only requested payouts can be reviewed.");
        }
        const currency = typeof payout["currency"] === "string" ? payout["currency"] as string : "";
        const amount = typeof payout["amountMinor"] === "number" ? payout["amountMinor"] as number : 0;
        if (!/^[A-Z]{3}$/.test(currency) || !Number.isSafeInteger(amount) || amount < 1) {
          throw new ApiError(409, "PAYOUT_RECORD_INVALID", "The payout record is invalid.");
        }
        const nextStatus = body.decision === "APPROVE" ? "APPROVED" : "REJECTED";
        const writes = [
          { update: { name: fs.docName(payoutPath), fields: encodeFields({
            status: nextStatus, reviewedAt: now, reviewedBy: actor.uid, reviewReason: body.reason, updatedAt: now,
          }) }, updateMask: { fieldPaths: ["status", "reviewedAt", "reviewedBy", "reviewReason", "updatedAt"] } },
          { update: { name: fs.docName(auditPath), fields: encodeFields({
            actorUid: actor.uid, action: body.decision === "APPROVE" ? "payout.approved" : "payout.rejected",
            targetType: "payout", targetId: payoutId, reason: body.reason,
            metadata: { uid, amountMinor: amount, currency }, createdAt: now,
          }) }, currentDocument: { exists: false } },
        ] as FirestoreWrite[];
        if (body.decision === "REJECT") {
          const balances = producer["earningsBalanceByCurrency"] && typeof producer["earningsBalanceByCurrency"] === "object"
            ? producer["earningsBalanceByCurrency"] as Record<string, unknown> : {};
          const reserved = producer["payoutReservedByCurrency"] && typeof producer["payoutReservedByCurrency"] === "object"
            ? producer["payoutReservedByCurrency"] as Record<string, unknown> : {};
          const nextBalances = { ...balances, [currency]: (typeof balances[currency] === "number" ? balances[currency] as number : 0) + amount };
          const nextReserved = { ...reserved, [currency]: Math.max(0, (typeof reserved[currency] === "number" ? reserved[currency] as number : 0) - amount) };
          const fields: Record<string, unknown> = {
            earningsBalanceByCurrency: nextBalances, payoutReservedByCurrency: nextReserved, updatedAt: now,
            ...(currency === "NGN" ? { earningsBalanceMinor: nextBalances["NGN"] } : {}),
          };
          writes.push({ update: { name: fs.docName(producerPath), fields: encodeFields(fields) }, updateMask: { fieldPaths: Object.keys(fields) } });
        }
        return { result: { payoutId, status: nextStatus }, writes };
      });
      return Response.json(result);
    } catch (error) { return errorBody(error); }
  } } },
});
