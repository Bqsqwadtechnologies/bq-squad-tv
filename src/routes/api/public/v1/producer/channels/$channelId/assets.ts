import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireChannelPermission } from "@/lib/server/channel-access";
import { isSafeStoragePath } from "@/lib/server/storage/security";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({
  assetId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  title: z.string().trim().min(2).max(150),
  description: z.string().trim().max(3000).default(""),
  category: z.string().trim().min(2).max(60),
  contentType: z.enum(["movie", "series", "video"]).default("movie"),
  ageRating: z.enum(["G", "PG", "12", "15", "18"]),
  ownershipDeclaration: z.literal(true),
  copyrightDeclaration: z.literal(true),
  seriesTitle: z.string().trim().max(150).optional(),
  seasonNumber: z.number().int().min(1).default(1),
  episodeNumber: z.number().int().min(1).optional(),
  episodeTitle: z.string().trim().max(150).optional(),
  commentsOpen: z.boolean().default(true),
  territoryCodes: z
    .array(z.string().regex(/^[A-Z]{2}$/))
    .min(1)
    .max(250),
  platforms: z
    .array(z.enum(["android", "web", "android_tv"]))
    .min(1)
    .max(3),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  rightsEvidencePath: z.string().min(1).max(1024).optional(),
});

export const Route = createFileRoute("/api/public/v1/producer/channels/$channelId/assets")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const channelId = params.channelId;
          const fs = await Firestore.create();
          await requireChannelPermission(fs, channelId, user.uid, "video.upload");
          const assets = await fs.query("contentAssets", {
            filters: [{ field: "channelId", op: "EQUAL", value: channelId }],
            limit: 150,
          });
          return Response.json({
            assets: assets.map((a) => ({
              id: a.__id || a["id"],
              assetId: a["assetId"] || a.__id || a["id"],
              title: a["title"] || "Untitled",
              contentType: a["contentType"] || (a["episodeNumber"] ? "series" : "movie"),
              seriesTitle: a["seriesTitle"] || a["title"] || "Feature",
              seasonNumber: Number(a["seasonNumber"] || 1),
              episodeNumber: a["episodeNumber"] !== undefined ? Number(a["episodeNumber"]) : null,
              episodeTitle: a["episodeTitle"] || a["title"] || "",
              description: a["description"] || "",
              category: a["category"] || "General",
              ageRating: a["ageRating"] || "PG",
              status: a["status"] || a["contentStatus"] || "ready",
              durationSeconds: Number(a["durationSeconds"] || 0),
              commentsOpen: a["commentsOpen"] !== false,
              posterUrl: a["posterUrl"] || null,
              createdAt: a["createdAt"] || null,
            })),
          });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const channelId = params.channelId;
          if (!/^[A-Za-z0-9_-]{1,80}$/.test(channelId))
            throw new ApiError(400, "CHANNEL_ID_INVALID", "The channel id is invalid.");
          const fs = await Firestore.create();
          await requireChannelPermission(fs, channelId, user.uid, "video.upload");
          const body = await parseBody(request, schema);
          if (Date.parse(body.validUntil) <= Date.parse(body.validFrom))
            throw new ApiError(
              400,
              "LICENSE_TERM_INVALID",
              "The license end date must be after its start date.",
            );
          const asset = await fs.getDoc("contentAssets/" + body.assetId);
          if (
            !asset ||
            asset["channelId"] !== channelId ||
            asset["ownerUid"] !== user.uid ||
            asset["status"] !== "uploaded_pending_transcode"
          ) {
            throw new ApiError(
              404,
              "UPLOAD_NOT_READY_FOR_METADATA",
              "The uploaded source is not ready for content details.",
            );
          }
          if (
            body.rightsEvidencePath &&
            (!isSafeStoragePath(body.rightsEvidencePath) ||
              !body.rightsEvidencePath.startsWith("producers/" + user.uid + "/" + channelId + "/"))
          ) {
            throw new ApiError(
              400,
              "RIGHTS_EVIDENCE_PATH_INVALID",
              "Rights evidence must be stored in this channel's private source folder.",
            );
          }
          const now = new Date().toISOString();
          const license = {
            status: "pending",
            verificationStatus: "pending",
            commercialStreamingAllowed: false,
            payPerMinuteAllowed: false,
            territoryCodes: [...new Set(body.territoryCodes)],
            platforms: [...new Set(body.platforms)],
            validFrom: body.validFrom,
            validUntil: body.validUntil,
            evidencePath: body.rightsEvidencePath || null,
            submittedBy: user.uid,
            submittedAt: now,
            ownershipDeclaration: true,
            copyrightDeclaration: true,
          };
          await fs.patchDoc("contentAssets/" + body.assetId, {
            title: body.title,
            description: body.description,
            category: body.category,
            contentType: body.contentType,
            ageRating: body.ageRating,
            ownershipDeclaration: true,
            copyrightDeclaration: true,
            seriesTitle: body.seriesTitle || body.title,
            seasonNumber: body.seasonNumber,
            ...(body.episodeNumber !== undefined ? { episodeNumber: body.episodeNumber } : {}),
            ...(body.episodeTitle ? { episodeTitle: body.episodeTitle } : {}),
            commentsOpen: body.commentsOpen,
            contentStatus: "draft",
            license,
            updatedAt: now,
          });
          await fs.patchDoc("channels/" + channelId, {
            currentAssetId: body.assetId,
            updatedAt: now,
          });
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "content.rights_submitted",
            targetType: "contentAsset",
            targetId: body.assetId,
            reason: "Producer submitted content metadata and distribution rights for review",
            metadata: {
              channelId,
              territories: license.territoryCodes,
              platforms: license.platforms,
            },
          });
          return Response.json(
            { assetId: body.assetId, rightsStatus: "pending", contentStatus: "draft" },
            { status: 201 },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
