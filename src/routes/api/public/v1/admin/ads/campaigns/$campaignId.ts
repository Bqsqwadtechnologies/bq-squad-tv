import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]),
  reason: z.string().trim().min(3).max(500),
});

export const Route = createFileRoute("/api/public/v1/admin/ads/campaigns/$campaignId")({
  server: { handlers: {
    PATCH: async ({ request, params }) => {
      try {
        const user = await requireUser(request);
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(params.campaignId)) {
          throw new ApiError(400, "CAMPAIGN_ID_INVALID", "The campaign identifier is invalid.");
        }
        const body = await parseBody(request, schema);
        const fs = await Firestore.create();
        await requireAdminModule(fs, user, "ads");
        await enforceRateLimit(fs, "ad-campaign-status:" + user.uid, { limit: 30, windowMs: 60_000 });
        const campaign = await fs.getDoc("adCampaigns/" + params.campaignId);
        if (!campaign) throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "The advertising campaign was not found.");
        if (body.status === "ACTIVE") {
          if (
            typeof campaign["title"] !== "string" ||
            typeof campaign["creativeUrl"] !== "string" ||
            !campaign["creativeUrl"].startsWith("https://") ||
            !Array.isArray(campaign["platforms"]) || campaign["platforms"].length === 0 ||
            !Array.isArray(campaign["placements"]) || campaign["placements"].length === 0 ||
            (campaign["adultOnly"] === true && campaign["ageRating"] !== "18+")
          ) {
            throw new ApiError(409, "CAMPAIGN_NOT_READY", "Complete the campaign creative, platform, placement and age-rating settings before activation.");
          }
          if (typeof campaign["startsAt"] === "string" && Date.parse(campaign["startsAt"]) > Date.now()) {
            throw new ApiError(409, "CAMPAIGN_NOT_STARTED", "This campaign is scheduled to start in the future.");
          }
          if (typeof campaign["endsAt"] === "string" && Date.parse(campaign["endsAt"]) <= Date.now()) {
            throw new ApiError(409, "CAMPAIGN_EXPIRED", "An expired campaign cannot be activated.");
          }
        }
        const now = new Date().toISOString();
        await fs.patchDoc("adCampaigns/" + params.campaignId, {
          status: body.status,
          updatedAt: now,
          updatedBy: user.uid,
          statusChangedAt: now,
          statusChangedBy: user.uid,
        });
        await writeAuditLog(fs, {
          actorUid: user.uid,
          action: "ads.campaign_status_changed",
          targetType: "adCampaign",
          targetId: params.campaignId,
          reason: body.reason,
          metadata: { from: campaign["status"] ?? "DRAFT", to: body.status },
        });
        return Response.json({ updated: true, campaignId: params.campaignId, status: body.status });
      } catch (error) {
        return errorBody(error);
      }
    },
  } },
});
