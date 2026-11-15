import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { getPricingConfig } from "@/lib/server/pricing";
import { isSafeStoragePath } from "@/lib/server/storage/security";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({ published: z.boolean(), reason: z.string().trim().min(3).max(1000) });

function validLicense(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const license = value as Record<string, unknown>;
  return license["status"] === "verified" &&
    license["verificationStatus"] === "verified" &&
    license["commercialStreamingAllowed"] === true &&
    license["payPerMinuteAllowed"] === true &&
    Array.isArray(license["territoryCodes"]) && license["territoryCodes"].length > 0 &&
    Array.isArray(license["platforms"]) && license["platforms"].length > 0 &&
    typeof license["validFrom"] === "string" && Number.isFinite(Date.parse(license["validFrom"])) &&
    typeof license["validUntil"] === "string" && Number.isFinite(Date.parse(license["validUntil"])) &&
    Date.parse(license["validUntil"]) > Date.parse(license["validFrom"]);
}

export const Route = createFileRoute("/api/public/v1/admin/channels/$channelId/publish")({
  server: { handlers: { POST: async ({ request, params }) => {
    try {
      const user = await requireUser(request);
      const body = await parseBody(request, schema);
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(params.channelId)) throw new ApiError(400, "CHANNEL_ID_INVALID", "The channel id is invalid.");
      const fs = await Firestore.create();
      await requireAdminModule(fs, user, "channels");
      const channel = await fs.getDoc("channels/" + params.channelId);
      if (!channel) throw new ApiError(404, "CHANNEL_NOT_FOUND", "This channel does not exist.");
      const before = { published: channel["published"] === true, status: channel["status"] ?? "DRAFT" };
      if (body.published) {
        const assetId = typeof channel["currentAssetId"] === "string" ? channel["currentAssetId"] : "";
        if (!assetId) throw new ApiError(409, "CHANNEL_ASSET_REQUIRED", "A ready content asset is required before publishing.");
        const asset = await fs.getDoc("contentAssets/" + assetId);
        if (!asset || asset["channelId"] !== params.channelId || asset["status"] !== "ready") {
          throw new ApiError(409, "CHANNEL_ASSET_NOT_READY", "The channel's selected content asset is not ready.");
        }
        const license = asset["license"] ?? channel["license"];
        if (!validLicense(license)) throw new ApiError(403, "CONTENT_RIGHTS_NOT_VERIFIED", "Verified distribution rights are required before publishing.");
        const mode = asset["deliveryMode"] ?? channel["deliveryMode"];
        if (mode === "bq_hosted") {
          const path = asset["storagePath"];
          if (typeof path !== "string" || !isSafeStoragePath(path) || !path.toLowerCase().endsWith(".m3u8")) {
            throw new ApiError(409, "STREAM_MANIFEST_REQUIRED", "A verified private HLS manifest is required before publishing.");
          }
        } else if (mode === "external") {
          if (channel["providerSetupStatus"] !== "READY") {
            throw new ApiError(409, "STREAM_PROVIDER_NOT_READY", "The external provider adapter must be verified before publishing.");
          }
        } else {
          throw new ApiError(409, "DELIVERY_MODE_INVALID", "The channel delivery mode is invalid.");
        }
        const pricing = await getPricingConfig(fs);
        const split = channel["producerShareBps"] ?? pricing["defaultProducerShareBps"];
        if (typeof split !== "number" || !Number.isSafeInteger(split) || split < 0 || split > 10_000) {
          throw new ApiError(409, "REVENUE_SPLIT_NOT_CONFIGURED", "An approved producer revenue split is required before publishing.");
        }
        await fs.patchDoc("channels/" + params.channelId, {
          published: true, status: "PUBLISHED", currentAssetId: assetId,
          producerShareBps: split, updatedAt: new Date().toISOString(),
        });
        await fs.patchDoc("contentAssets/" + assetId, { contentStatus: "published", updatedAt: new Date().toISOString() });
      } else {
        await fs.patchDoc("channels/" + params.channelId, { published: false, status: "UNPUBLISHED", updatedAt: new Date().toISOString() });
      }
      await writeAuditLog(fs, {
        actorUid: user.uid, action: body.published ? "channel.published" : "channel.unpublished",
        targetType: "channel", targetId: params.channelId, reason: body.reason,
        before, after: { published: body.published, status: body.published ? "PUBLISHED" : "UNPUBLISHED" },
      });
      return Response.json({ channelId: params.channelId, published: body.published });
    } catch (error) { return errorBody(error); }
  } } },
});
