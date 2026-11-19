import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

const channelActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("verify"),
    verified: z.boolean(),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("suspend"),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("unsuspend"),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("feature"),
    featured: z.boolean(),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("transfer"),
    newOwnerUid: z.string().trim().min(1).max(128),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("delete"),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("restore"),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("change_handle"),
    handle: z.string().trim().min(2).max(50).regex(/^@?[A-Za-z0-9_-]+$/),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("toggle_live"),
    allowed: z.boolean(),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("rev_share"),
    shareBps: z.number().int().min(0).max(10000),
    reason: z.string().trim().min(3).max(1000),
  }),
]);

export const Route = createFileRoute("/api/public/v1/zillionaire/channels/$channelId/actions")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const actor = await requireUser(request);
          const channelId = params.channelId;
          if (!/^[A-Za-z0-9_-]{1,80}$/.test(channelId)) {
            throw new ApiError(400, "CHANNEL_ID_INVALID", "Invalid channel identifier.");
          }
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "channels");

          const channel = await fs.get(`channels/${channelId}`);
          if (!channel) {
            throw new ApiError(404, "CHANNEL_NOT_FOUND", "Channel not found.");
          }

          const body = await parseBody(request, channelActionSchema);
          const now = new Date().toISOString();
          const auditId = crypto.randomUUID();

          if (body.action === "verify") {
            await fs.set(`channels/${channelId}`, {
              ...channel,
              verified: body.verified,
              verifiedAt: body.verified ? now : null,
              verifiedBy: body.verified ? actor.uid : null,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: body.verified ? "channel.verified" : "channel.unverified",
              targetId: channelId,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, verified: body.verified });
          }

          if (body.action === "suspend") {
            await fs.set(`channels/${channelId}`, {
              ...channel,
              status: "SUSPENDED",
              suspendedAt: now,
              suspendedBy: actor.uid,
              suspendedReason: body.reason,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "channel.suspended",
              targetId: channelId,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, status: "SUSPENDED" });
          }

          if (body.action === "unsuspend") {
            await fs.set(`channels/${channelId}`, {
              ...channel,
              status: "ACTIVE",
              suspendedAt: null,
              suspendedBy: null,
              suspendedReason: null,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "channel.unsuspended",
              targetId: channelId,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, status: "ACTIVE" });
          }

          if (body.action === "feature") {
            await fs.set(`channels/${channelId}`, {
              ...channel,
              featured: body.featured,
              featuredAt: body.featured ? now : null,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: body.featured ? "channel.featured" : "channel.unfeatured",
              targetId: channelId,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, featured: body.featured });
          }

          if (body.action === "transfer") {
            const previousOwner = channel["ownerUid"];
            await fs.set(`channels/${channelId}`, {
              ...channel,
              ownerUid: body.newOwnerUid,
              transferredAt: now,
              transferredBy: actor.uid,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "channel.transferred",
              targetId: channelId,
              previousOwner,
              newOwner: body.newOwnerUid,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, ownerUid: body.newOwnerUid });
          }

          if (body.action === "delete") {
            const purgeDate = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
            await fs.set(`channels/${channelId}`, {
              ...channel,
              status: "DELETED",
              deletedAt: now,
              deletedBy: actor.uid,
              deleteReason: body.reason,
              scheduledPurgeAt: purgeDate,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "channel.soft_deleted",
              targetId: channelId,
              scheduledPurgeAt: purgeDate,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, status: "DELETED", scheduledPurgeAt: purgeDate });
          }

          if (body.action === "restore") {
            await fs.set(`channels/${channelId}`, {
              ...channel,
              status: "ACTIVE",
              deletedAt: null,
              deletedBy: null,
              scheduledPurgeAt: null,
              restoredAt: now,
              restoreReason: body.reason,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "channel.restored",
              targetId: channelId,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, status: "ACTIVE" });
          }

          if (body.action === "change_handle") {
            const formattedHandle = body.handle.startsWith("@") ? body.handle : `@${body.handle}`;
            const previousHandle = channel["handle"];
            await fs.set(`channels/${channelId}`, {
              ...channel,
              handle: formattedHandle,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "channel.handle_changed",
              targetId: channelId,
              previousHandle,
              newHandle: formattedHandle,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, handle: formattedHandle });
          }

          if (body.action === "toggle_live") {
            await fs.set(`channels/${channelId}`, {
              ...channel,
              liveStreamingAllowed: body.allowed,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: body.allowed ? "channel.live_permitted" : "channel.live_revoked",
              targetId: channelId,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, liveStreamingAllowed: body.allowed });
          }

          if (body.action === "rev_share") {
            const previousShare = channel["producerShareBps"] || 7000;
            await fs.set(`channels/${channelId}`, {
              ...channel,
              producerShareBps: body.shareBps,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "channel.rev_share_override",
              targetId: channelId,
              previousShareBps: previousShare,
              newShareBps: body.shareBps,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({
              success: true,
              producerShareBps: body.shareBps,
              producerSharePercent: Math.round(body.shareBps / 100),
            });
          }

          throw new ApiError(400, "INVALID_ACTION", "Unrecognised action.");
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
