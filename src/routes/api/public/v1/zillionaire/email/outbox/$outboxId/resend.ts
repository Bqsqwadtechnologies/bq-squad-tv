import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore, ApiError } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { writeAuditLog } from "@/lib/server/audit";
import { executeOutboxDelivery, type DurableOutboxRecord } from "@/lib/server/email/outbox";

const resendSchema = z.object({
  reason: z.string().trim().min(3, "Reason must be at least 3 characters").max(500),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/email/outbox/$outboxId/resend")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "notifications");

          await enforceRateLimit(fs, "zillionaire-outbox-resend:" + user.uid, {
            limit: 10,
            windowMs: 60_000,
          });

          const body = await parseBody(request, resendSchema);
          const outboxId = params.outboxId;

          const doc = await fs.getDoc(`email_outbox/${outboxId}`);
          if (!doc) {
            throw new ApiError(404, "OUTBOX_ITEM_NOT_FOUND", "Email outbox record not found.");
          }

          const record = doc as unknown as DurableOutboxRecord;

          // Execute delivery attempt
          const result = await executeOutboxDelivery(fs, outboxId);

          const updatedDoc = (await fs.getDoc(`email_outbox/${outboxId}`)) as unknown as DurableOutboxRecord;

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "notification.email_outbox_resend",
            targetType: "emailOutboxItem",
            targetId: outboxId,
            reason: body.reason,
            metadata: {
              eventType: record.eventType,
              recipientEmail: record.recipientEmail,
              previousStatus: record.status,
              newStatus: result.status,
              attempts: updatedDoc.attempts,
              lastError: result.error || null,
            },
          });

          return Response.json({
            success: true,
            status: result.status,
            item: updatedDoc,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
