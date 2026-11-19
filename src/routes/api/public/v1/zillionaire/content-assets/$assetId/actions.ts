import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("block"),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("unpublish"),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("feature"),
    featured: z.boolean(),
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
    action: z.literal("reprocess"),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("move_channel"),
    channelId: z.string().trim().min(1),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("change_age_rating"),
    ageRating: z.enum(["G", "PG", "12", "15", "18"]),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("edit_details"),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000),
    tags: z.array(z.string().trim()).default([]),
    category: z.string().trim().min(1),
    ageRating: z.enum(["G", "PG", "12", "15", "18"]),
    posterUrl: z.string().trim().url().optional(),
    subtitlesUrl: z.string().trim().url().optional(),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("takedown"),
    claimant: z.string().trim().min(1).max(200),
    complaintRef: z.string().trim().min(1).max(100),
    reason: z.string().trim().min(3).max(1000),
  }),
]);

export const Route = createFileRoute("/api/public/v1/zillionaire/content-assets/$assetId/actions")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const actor = await requireUser(request);
          const assetId = params.assetId;
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId)) {
            throw new ApiError(400, "ASSET_ID_INVALID", "Invalid asset identifier.");
          }
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "content");

          const asset = await fs.get(`contentAssets/${assetId}`);
          if (!asset) {
            throw new ApiError(404, "ASSET_NOT_FOUND", "Content asset not found.");
          }

          const body = await parseBody(request, actionSchema);
          const now = new Date().toISOString();
          const auditId = crypto.randomUUID();

          if (body.action === "block") {
            await fs.set(`contentAssets/${assetId}`, {
              ...asset,
              status: "BLOCKED",
              contentStatus: "blocked",
              blockedAt: now,
              blockedBy: actor.uid,
              blockedReason: body.reason,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "content.blocked",
              targetId: assetId,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, status: "BLOCKED" });
          }

          if (body.action === "unpublish") {
            await fs.set(`contentAssets/${assetId}`, {
              ...asset,
              contentStatus: "unpublished",
              unpublishedAt: now,
              unpublishedBy: actor.uid,
              unpublishReason: body.reason,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "content.unpublished",
              targetId: assetId,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, contentStatus: "unpublished" });
          }

          if (body.action === "feature") {
            await fs.set(`contentAssets/${assetId}`, {
              ...asset,
              featured: body.featured,
              featuredAt: body.featured ? now : null,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: body.featured ? "content.featured" : "content.unfeatured",
              targetId: assetId,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, featured: body.featured });
          }

          if (body.action === "delete") {
            // Soft delete with 30-day restore window
            const purgeDate = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
            await fs.set(`contentAssets/${assetId}`, {
              ...asset,
              status: "DELETED",
              contentStatus: "deleted",
              deletedAt: now,
              deletedBy: actor.uid,
              deleteReason: body.reason,
              scheduledPurgeAt: purgeDate,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "content.soft_deleted",
              targetId: assetId,
              scheduledPurgeAt: purgeDate,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, status: "DELETED", scheduledPurgeAt: purgeDate });
          }

          if (body.action === "restore") {
            await fs.set(`contentAssets/${assetId}`, {
              ...asset,
              status: "ready",
              contentStatus: "unpublished",
              deletedAt: null,
              deletedBy: null,
              scheduledPurgeAt: null,
              restoredAt: now,
              restoreReason: body.reason,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "content.restored",
              targetId: assetId,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, status: "ready" });
          }

          if (body.action === "reprocess") {
            const jobId = crypto.randomUUID();
            await fs.set(`videoTranscodeJobs/${jobId}`, {
              assetId,
              requestedBy: actor.uid,
              reason: body.reason,
              status: "QUEUED",
              createdAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "content.reprocess_enqueued",
              targetId: assetId,
              jobId,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, jobId });
          }

          if (body.action === "move_channel") {
            const previousChannel = asset["channelId"];
            await fs.set(`contentAssets/${assetId}`, {
              ...asset,
              channelId: body.channelId,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "content.moved_channel",
              targetId: assetId,
              previousChannel,
              newChannel: body.channelId,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, channelId: body.channelId });
          }

          if (body.action === "change_age_rating") {
            const previousRating = asset["ageRating"];
            await fs.set(`contentAssets/${assetId}`, {
              ...asset,
              ageRating: body.ageRating,
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "content.change_age_rating",
              targetId: assetId,
              previousRating,
              newRating: body.ageRating,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, ageRating: body.ageRating });
          }

          if (body.action === "edit_details") {
            await fs.set(`contentAssets/${assetId}`, {
              ...asset,
              title: body.title,
              description: body.description,
              tags: body.tags,
              category: body.category,
              ageRating: body.ageRating,
              posterUrl: body.posterUrl || asset["posterUrl"],
              subtitlesUrl: body.subtitlesUrl || asset["subtitlesUrl"],
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "content.details_edited",
              targetId: assetId,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true });
          }

          if (body.action === "takedown") {
            await fs.set(`contentAssets/${assetId}`, {
              ...asset,
              status: "BLOCKED",
              contentStatus: "takedown",
              takedownNotice: {
                claimant: body.claimant,
                complaintRef: body.complaintRef,
                reason: body.reason,
                filedAt: now,
              },
              updatedAt: now,
            });
            await fs.set(`auditLog/${auditId}`, {
              actorUid: actor.uid,
              action: "content.copyright_takedown",
              targetId: assetId,
              claimant: body.claimant,
              complaintRef: body.complaintRef,
              reason: body.reason,
              createdAt: now,
            });
            return Response.json({ success: true, status: "TAKEDOWN" });
          }

          throw new ApiError(400, "INVALID_ACTION", "Unrecognised action.");
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
