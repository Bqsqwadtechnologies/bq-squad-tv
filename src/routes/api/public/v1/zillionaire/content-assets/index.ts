import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

const bulkActionSchema = z.object({
  action: z.enum(["bulk_block", "bulk_unpublish", "bulk_delete", "bulk_change_category", "bulk_change_age_rating"]),
  assetIds: z.array(z.string().trim().min(1)).min(1).max(100),
  reason: z.string().trim().min(3).max(1000),
  category: z.string().trim().optional(),
  ageRating: z.enum(["G", "PG", "12", "15", "18"]).optional(),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/content-assets/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "content");

          const url = new URL(request.url);
          const query = url.searchParams.get("q")?.toLowerCase().trim();
          const channelFilter = url.searchParams.get("channelId")?.trim();
          const statusFilter = url.searchParams.get("status")?.trim();

          const allAssets = await fs.query("contentAssets", { orderByField: "createdAt", descending: true, limit: 200 });
          let filtered = allAssets;

          if (channelFilter) {
            filtered = filtered.filter((a) => a["channelId"] === channelFilter);
          }

          if (statusFilter && statusFilter !== "ALL") {
            if (statusFilter === "BLOCKED") {
              filtered = filtered.filter((a) => a["status"] === "BLOCKED");
            } else if (statusFilter === "DELETED") {
              filtered = filtered.filter((a) => a["status"] === "DELETED" || a["deletedAt"]);
            } else if (statusFilter === "PUBLISHED") {
              filtered = filtered.filter((a) => a["contentStatus"] === "published" && a["status"] !== "BLOCKED" && a["status"] !== "DELETED");
            } else if (statusFilter === "UNPUBLISHED") {
              filtered = filtered.filter((a) => a["contentStatus"] !== "published" && a["status"] !== "BLOCKED" && a["status"] !== "DELETED");
            } else if (statusFilter === "FEATURED") {
              filtered = filtered.filter((a) => Boolean(a["featured"]));
            }
          }

          if (query) {
            filtered = filtered.filter(
              (a) =>
                (a["title"] as string)?.toLowerCase().includes(query) ||
                (a["description"] as string)?.toLowerCase().includes(query) ||
                (a["channelId"] as string)?.toLowerCase().includes(query) ||
                (a["category"] as string)?.toLowerCase().includes(query) ||
                (a["id"] as string)?.toLowerCase().includes(query) ||
                (a["__id"] as string)?.toLowerCase().includes(query),
            );
          }

          return Response.json({
            assets: filtered.map((a) => {
              const license = (a["license"] as Record<string, unknown>) || {};
              const storage = (a["storage"] as Record<string, unknown>) || {};
              return {
                id: a.__id || a["id"],
                title: a["title"] || "Untitled Video",
                description: a["description"] || "",
                channelId: a["channelId"] || "platform",
                category: a["category"] || "general",
                ageRating: a["ageRating"] || "PG",
                ownershipDeclaration: a["ownershipDeclaration"] === true,
                copyrightDeclaration: a["copyrightDeclaration"] === true,
                posterUrl: a["posterUrl"] || a["thumbnailUrl"] || null,
                masterPlaylistUrl: a["masterPlaylistUrl"] || null,
                status: a["status"] || "ready",
                contentStatus: a["contentStatus"] || "unpublished",
                viewsCount: Number(a["viewsCount"] || 0),
                totalWatchMinutes: Math.round(Number(a["totalWatchSeconds"] || 0) / 60),
                ratingAverage: Number(a["ratingAverage"] || 0),
                ratingCount: Number(a["ratingCount"] || 0),
                commentsCount: Number(a["commentsCount"] || 0),
                featured: Boolean(a["featured"]),
                storageLocation: (storage["primaryRegion"] as string) || (a["storagePool"] as string) || "Backblaze B2 (EU/AF)",
                rightsStatus: (license["status"] as string) || (license["verificationStatus"] as string) || "unverified",
                deletedAt: a["deletedAt"] || null,
                blockedReason: a["blockedReason"] || null,
                createdAt: a["createdAt"] || null,
                updatedAt: a["updatedAt"] || null,
              };
            }),
          });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const actor = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "content");

          const body = await parseBody(request, bulkActionSchema);
          const now = new Date().toISOString();
          const auditId = crypto.randomUUID();

          let count = 0;
          for (const id of body.assetIds) {
            const asset = await fs.get(`contentAssets/${id}`);
            if (!asset) continue;

            const updates: Record<string, unknown> = { updatedAt: now };

            if (body.action === "bulk_block") {
              updates["status"] = "BLOCKED";
              updates["blockedAt"] = now;
              updates["blockedBy"] = actor.uid;
              updates["blockedReason"] = body.reason;
            } else if (body.action === "bulk_unpublish") {
              updates["contentStatus"] = "unpublished";
              updates["unpublishedAt"] = now;
              updates["unpublishReason"] = body.reason;
            } else if (body.action === "bulk_delete") {
              updates["status"] = "DELETED";
              updates["contentStatus"] = "deleted";
              updates["deletedAt"] = now;
              updates["deletedBy"] = actor.uid;
              updates["deleteReason"] = body.reason;
              updates["scheduledPurgeAt"] = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            } else if (body.action === "bulk_change_category" && body.category) {
              updates["category"] = body.category;
            } else if (body.action === "bulk_change_age_rating" && body.ageRating) {
              updates["ageRating"] = body.ageRating;
            }

            await fs.set(`contentAssets/${id}`, { ...asset, ...updates });
            count++;
          }

          await fs.set(`auditLog/${auditId}`, {
            actorUid: actor.uid,
            action: `content.${body.action}`,
            targetCount: count,
            assetIds: body.assetIds,
            reason: body.reason,
            createdAt: now,
          });

          return Response.json({ success: true, updatedCount: count });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
