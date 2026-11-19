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
  rightsEvidencePath: z.string().min(1).max(1024),
});

export const Route = createFileRoute("/api/public/v1/producer/channels/$channelId/assets")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const channelId = params.channelId;
          if (!/^[A-Za-z0-9_-]{1,80}$/.test(channelId))
            throw new ApiError(400, "CHANNEL_ID_INVALID", "The channel id is invalid.");
          if (Date.parse(body.validUntil) <= Date.parse(body.validFrom))
            throw new ApiError(
              400,
              "LICENSE_TERM_INVALID",
              "The license end date must be after its start date.",
            );
          const fs = await Firestore.create();
          await requireChannelPermission(fs, channelId, user.uid, "video.upload");
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
            !isSafeStoragePath(body.rightsEvidencePath) ||
            !body.rightsEvidencePath.startsWith("producers/" + user.uid + "/" + channelId + "/")
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
            commercialStreamingAllowed: true,
            payPerMinuteAllowed: true,
            territoryCodes: [...new Set(body.territoryCodes)],
            platforms: [...new Set(body.platforms)],
            validFrom: body.validFrom,
            validUntil: body.validUntil,
            evidencePath: body.rightsEvidencePath,
            submittedBy: user.uid,
            submittedAt: now,
          };
          await fs.patchDoc("contentAssets/" + body.assetId, {
            title: body.title,
            description: body.description,
            category: body.category,
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
