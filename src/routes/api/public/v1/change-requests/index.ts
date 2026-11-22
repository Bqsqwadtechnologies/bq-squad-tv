import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import {
  maskSecrets,
  validateChangeRequestPayload,
  type ChangeRequestRecord,
  type ChangeRequestScope,
} from "@/lib/server/change-requests";
import { createInAppNotification } from "@/lib/server/notifications";

const submitSchema = z
  .object({
    scope: z.enum([
      "channel_details",
      "artwork",
      "stream_config",
      "schedule",
      "privacy_link",
      "payout_profile",
      "producer_title",
    ]),
    targetType: z.enum(["channel", "stream", "title", "artwork", "payout", "schedule"]),
    targetId: z.string().min(1).max(120),
    partnerId: z.string().min(1).max(120),
    channelId: z.string().max(120).nullable().optional(),
    before: z.record(z.unknown()),
    after: z.record(z.unknown()),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/change-requests/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          const url = new URL(request.url);
          const statusFilter = url.searchParams.get("status");
          const channelFilter = url.searchParams.get("channelId");

          let isReviewer = false;
          try {
            await requireZillionaireModule(fs, user, "moderation");
            isReviewer = true;
          } catch {
            try {
              await requireZillionaireModule(fs, user, "content");
              isReviewer = true;
            } catch {
              isReviewer = false;
            }
          }

          const rawList = await fs.query("changeRequests", { limit: 100 }).catch(() => []);
          const requests: ChangeRequestRecord[] = [];

          for (const item of rawList) {
            const req = item as unknown as ChangeRequestRecord;
            if (!isReviewer) {
              if (req.submitterUid !== user.uid && req.partnerId !== user.uid) {
                continue;
              }
            }
            if (statusFilter && req.status !== statusFilter) continue;
            if (channelFilter && req.channelId !== channelFilter) continue;
            requests.push(req);
          }

          requests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          return Response.json({ requests });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, submitSchema);
          const fs = await Firestore.create();

          validateChangeRequestPayload({
            scope: body.scope,
            targetType: body.targetType,
            targetId: body.targetId,
            before: body.before,
            after: body.after,
          });

          const now = new Date().toISOString();
          const cleanBefore = maskSecrets(body.before);
          const cleanAfter = maskSecrets(body.after);

          const id = `cr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

          const record: ChangeRequestRecord = {
            id,
            scope: body.scope as ChangeRequestScope,
            submitterUid: user.uid,
            submitterRole: "partner",
            partnerId: body.partnerId,
            channelId: body.channelId ?? null,
            targetType: body.targetType,
            targetId: body.targetId,
            before: cleanBefore,
            after: cleanAfter,
            status: "submitted",
            reason: body.reason,
            autoTestResults: { passed: true, details: "Preflight structure verified" },
            createdAt: now,
            updatedAt: now,
          };

          await fs.setDoc(`changeRequests/${id}`, record as unknown as Record<string, unknown>);

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "change_request.submitted",
            targetType: body.targetType,
            targetId: body.targetId,
            reason: body.reason,
            after: { scope: body.scope, requestId: id },
          });

          return Response.json({
            success: true,
            changeRequest: record,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
