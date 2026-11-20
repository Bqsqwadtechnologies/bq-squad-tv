import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { writeAuditLog } from "@/lib/server/audit";
import { sendTestEmail } from "@/lib/server/email/brevo";

const schema = z.object({
  recipient: z.string().trim().email().optional(),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/email/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "security");
          await enforceRateLimit(fs, "zillionaire-test-email:" + user.uid, {
            limit: 5,
            windowMs: 60 * 60_000,
          });

          const body = await parseBody(request, schema);
          const target = body.recipient || user.email;
          if (!target) {
            throw new ApiError(
              400,
              "RECIPIENT_REQUIRED",
              "A destination email address is required.",
            );
          }

          const result = await sendTestEmail(target);

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "secret.email_delivery_tested",
            targetType: "email",
            targetId: target,
            reason: "Owner tested transactional email delivery pipeline",
            metadata: { messageId: result.messageId },
          });

          return Response.json({
            success: true,
            recipient: target,
            messageId: result.messageId,
            message: "Test email successfully dispatched via Brevo.",
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
