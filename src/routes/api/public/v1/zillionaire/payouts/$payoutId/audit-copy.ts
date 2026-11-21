import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

const schema = z.object({
  field: z.string().trim().min(1).max(100),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/payouts/$payoutId/audit-copy")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const actor = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "payouts");

          const payoutId = params.payoutId;
          const payout = await fs.getDoc(`payouts/${payoutId}`);
          if (!payout) {
            throw new ApiError(404, "PAYOUT_NOT_FOUND", "The payout request was not found.");
          }

          const now = new Date().toISOString();
          await fs.setDoc(`auditLog/${crypto.randomUUID()}`, {
            actorUid: actor.uid,
            action: "payout.transfer_details.copied",
            targetType: "payout",
            targetId: payoutId,
            metadata: {
              field: body.field,
              uid: payout["uid"],
              currency: payout["currency"],
            },
            createdAt: now,
          });

          return Response.json({ success: true, field: body.field, payoutId });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
