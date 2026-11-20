import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CREATE"),
    title: z.string().trim().min(2).max(120),
    type: z.enum(["image", "video"]),
    mediaUrl: z.string().url().refine((u) => u.startsWith("https://"), "HTTPS required"),
    clickThroughUrl: z.string().url().refine((u) => u.startsWith("https://"), "HTTPS required"),
    impressionTrackingUrl: z.string().url().optional(),
    clickTrackingUrl: z.string().url().optional(),
    channelId: z.string().optional(),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("MODERATE"),
    creativeId: z.string().min(1).max(100),
    decision: z.enum(["APPROVE", "REJECT"]),
    rejectionReason: z.string().max(500).optional(),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("DELETE"),
    creativeId: z.string().min(1).max(100),
    reason: z.string().trim().min(3).max(1000),
  }),
]);

export const Route = createFileRoute("/api/public/v1/zillionaire/ads/creatives")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "ads");
          const url = new URL(request.url);
          const status = url.searchParams.get("status");

          const filters: Array<{ field: string; op: "EQUAL"; value: unknown }> = [];
          if (status) {
            filters.push({ field: "status", op: "EQUAL", value: status });
          }

          const docs = await fs.query("adCreatives", {
            ...(filters.length > 0 ? { filters } : {}),
            orderByField: "createdAt",
            descending: true,
            limit: 150,
          }).catch(() => []);

          const creatives = docs.map((d) => ({
            id: d.__id,
            title: String(d["title"] || "Untitled Creative"),
            type: d["type"] || "image",
            mediaUrl: String(d["mediaUrl"] || ""),
            clickThroughUrl: String(d["clickThroughUrl"] || ""),
            impressionTrackingUrl: d["impressionTrackingUrl"] || null,
            clickTrackingUrl: d["clickTrackingUrl"] || null,
            status: d["status"] || "PENDING",
            rejectionReason: d["rejectionReason"] || null,
            impressions: Number(d["impressions"] || 0),
            clicks: Number(d["clicks"] || 0),
            createdAt: d["createdAt"] || new Date().toISOString(),
          }));

          return Response.json({ creatives });
        } catch (e) {
          return errorBody(e);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "ads");
          const now = new Date().toISOString();

          if (body.action === "CREATE") {
            const creativeId = "creative-" + crypto.randomUUID().slice(0, 8);
            const record = {
              id: creativeId,
              title: body.title,
              type: body.type,
              mediaUrl: body.mediaUrl,
              clickThroughUrl: body.clickThroughUrl,
              impressionTrackingUrl: body.impressionTrackingUrl || null,
              clickTrackingUrl: body.clickTrackingUrl || null,
              channelId: body.channelId || null,
              status: "APPROVED", // Owner-created creatives are approved by default
              impressions: 0,
              clicks: 0,
              createdAt: now,
              createdBy: user.uid,
            };
            await fs.setDoc(`adCreatives/${creativeId}`, record, { mustNotExist: true });
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "ads.creative_create",
              targetType: "ad_creative",
              targetId: creativeId,
              reason: body.reason,
              after: record,
            });
            return Response.json({ success: true, creative: record });
          } else if (body.action === "MODERATE") {
            const existing = await fs.getDoc(`adCreatives/${body.creativeId}`);
            if (!existing) throw new ApiError(404, "CREATIVE_NOT_FOUND", "Creative does not exist.");
            const updates = {
              status: body.decision === "APPROVE" ? "APPROVED" : "REJECTED",
              rejectionReason: body.decision === "REJECT" ? (body.rejectionReason || "Declined by administrator") : null,
              moderatedAt: now,
              moderatedBy: user.uid,
            };
            await fs.patchDoc(`adCreatives/${body.creativeId}`, updates);
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: `ads.creative_${body.decision.toLowerCase()}`,
              targetType: "ad_creative",
              targetId: body.creativeId,
              reason: body.reason,
              before: existing,
              after: updates,
            });
            return Response.json({ success: true, creativeId: body.creativeId, status: updates.status });
          } else {
            const existing = await fs.getDoc(`adCreatives/${body.creativeId}`);
            if (!existing) throw new ApiError(404, "CREATIVE_NOT_FOUND", "Creative does not exist.");
            await fs.deleteDoc(`adCreatives/${body.creativeId}`);
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "ads.creative_delete",
              targetType: "ad_creative",
              targetId: body.creativeId,
              reason: body.reason,
              before: existing,
            });
            return Response.json({ success: true, creativeId: body.creativeId });
          }
        } catch (e) {
          return errorBody(e);
        }
      },
    },
  },
});
