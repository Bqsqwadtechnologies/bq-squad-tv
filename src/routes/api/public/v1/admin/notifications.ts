import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { writeAuditLog } from "@/lib/server/audit";
import { notificationDeliveryStatus, sendPushNotificationToUser } from "@/lib/server/notifications";

const schema = z.object({
  idempotencyKey: z.string().uuid(),
  recipients: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)).min(1).max(25)
    .refine(values => new Set(values).size === values.length, "Recipients must be unique."),
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(1000),
  deepLink: z.string().max(2048).optional().refine(value => value === undefined || (value.startsWith("/") && !value.startsWith("//"))),
});

async function notificationIdFor(requesterUid: string, key: string, recipientUid: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(requesterUid + ":" + key + ":" + recipientUid),
  );
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/v1/admin/notifications")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const user = await requireUser(request);
      const body = await parseBody(request, schema);
      const fs = await Firestore.create();
      await requireAdminModule(fs, user, "notifications");
      await enforceRateLimit(fs, "admin-notifications:" + user.uid, { limit: 3, windowMs: 60_000 });

      const results: Array<{ uid: string; notificationId: string; status: string; sentCount: number; failedCount: number }> = [];
      for (const recipientUid of body.recipients) {
        const notificationId = await notificationIdFor(user.uid, body.idempotencyKey, recipientUid);
        const path = "users/" + recipientUid + "/notifications/" + notificationId;
        const existing = await fs.getDoc(path);
        if (existing) {
          results.push({
            uid: recipientUid,
            notificationId,
            status: typeof existing["deliveryStatus"] === "string" ? existing["deliveryStatus"] as string : "queued",
            sentCount: typeof existing["sentCount"] === "number" ? existing["sentCount"] as number : 0,
            failedCount: typeof existing["failedCount"] === "number" ? existing["failedCount"] as number : 0,
          });
          continue;
        }

        const now = new Date().toISOString();
        try {
          await fs.setDoc(path, {
            notificationId,
            title: body.title,
            body: body.body,
            deepLink: body.deepLink ?? null,
            read: false,
            deliveryStatus: "sending",
            sentCount: 0,
            failedCount: 0,
            createdAt: now,
            createdBy: user.uid,
            idempotencyKey: body.idempotencyKey,
          }, { mustNotExist: true });
        } catch (error) {
          const concurrent = await fs.getDoc(path);
          if (!concurrent) throw error;
          results.push({
            uid: recipientUid, notificationId,
            status: typeof concurrent["deliveryStatus"] === "string" ? concurrent["deliveryStatus"] as string : "queued",
            sentCount: typeof concurrent["sentCount"] === "number" ? concurrent["sentCount"] as number : 0,
            failedCount: typeof concurrent["failedCount"] === "number" ? concurrent["failedCount"] as number : 0,
          });
          continue;
        }

        let delivery = { sentCount: 0, failedCount: 1, deviceCount: 1 };
        try {
          delivery = await sendPushNotificationToUser(fs, recipientUid, {
            notificationId,
            title: body.title,
            body: body.body,
            deepLink: body.deepLink,
          });
        } catch {
          // Keep the notification in history and report delivery failure without
          // leaking Firebase credentials or device tokens.
        }
        const status = notificationDeliveryStatus(delivery);
        await fs.patchDoc(path, {
          deliveryStatus: status,
          sentCount: delivery.sentCount,
          failedCount: delivery.failedCount,
          deviceCount: delivery.deviceCount,
          deliveredAt: new Date().toISOString(),
        });
        results.push({
          uid: recipientUid, notificationId, status,
          sentCount: delivery.sentCount, failedCount: delivery.failedCount,
        });
      }

      await writeAuditLog(fs, {
        actorUid: user.uid,
        action: "notification.admin_send",
        targetType: "notificationBatch",
        targetId: body.idempotencyKey,
        reason: "Administrator sent a targeted notification",
        metadata: {
          recipientCount: results.length,
          sentCount: results.reduce((sum, item) => sum + item.sentCount, 0),
          failedCount: results.reduce((sum, item) => sum + item.failedCount, 0),
        },
      });
      return Response.json({ results }, { status: 200 });
    } catch (error) {
      return errorBody(error);
    }
  } } },
});
