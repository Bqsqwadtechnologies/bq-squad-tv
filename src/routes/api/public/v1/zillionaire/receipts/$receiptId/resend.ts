import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/zillionaire/receipts/$receiptId/resend")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const actor = await requireUser(request);
          const receiptId = params.receiptId;
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "finance");

          const receiptDoc = await fs.get(`receipts/${receiptId}`);
          if (!receiptDoc) {
            throw new ApiError(404, "RECEIPT_NOT_FOUND", "Receipt not found.");
          }

          const now = new Date().toISOString();
          const sentCount = Number(receiptDoc["sentCount"] || 1) + 1;

          await fs.set(`receipts/${receiptId}`, {
            ...receiptDoc,
            sentCount,
            lastSentAt: now,
          });

          await fs.set(`auditLog/${crypto.randomUUID()}`, {
            actorUid: actor.uid,
            action: "receipt.resent",
            receiptId,
            receiptNumber: receiptDoc["receiptNumber"],
            customerEmail: receiptDoc["customerEmail"],
            createdAt: now,
          });

          return Response.json({
            success: true,
            receiptNumber: receiptDoc["receiptNumber"],
            sentTo: receiptDoc["customerEmail"],
            sentCount,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
