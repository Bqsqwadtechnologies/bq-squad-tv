import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getUserProfile, parseBody, requireUser } from "@/lib/server/api";
import { isAdSuitableForViewer } from "@/lib/server/ads-policy";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const schema = z.object({
  event: z.enum(["impression", "start", "quartile_25", "quartile_50", "quartile_75", "complete", "skip", "click"]),
  positionSeconds: z.number().int().min(0).max(86_400).default(0),
  platform: z.enum(["android", "web"]),
  slot: z.string().regex(/^[a-z0-9_-]{1,40}$/),
});

export const Route = createFileRoute("/api/public/v1/ads/$adId/events")({
  server: { handlers: { POST: async ({ request, params }) => {
    try {
      const user = await requireUser(request);
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(params.adId)) throw new ApiError(400, "AD_ID_INVALID", "The ad identifier is invalid.");
      const body = await parseBody(request, schema);
      const fs = await Firestore.create();
      await enforceRateLimit(fs, "ad-event:" + user.uid, { limit: 120, windowMs: 60_000 });
      const campaign = await fs.getDoc("adCampaigns/" + params.adId);
      if (!campaign || campaign["status"] !== "ACTIVE") {
        throw new ApiError(404, "AD_NOT_FOUND", "This advertisement is unavailable.");
      }
      if (
        !Array.isArray(campaign["platforms"]) ||
        !campaign["platforms"].includes(body.platform) ||
        !Array.isArray(campaign["placements"]) ||
        !campaign["placements"].includes(body.slot)
      ) {
        throw new ApiError(403, "AD_PLACEMENT_MISMATCH", "This advertisement is not configured for the reported platform or placement.");
      }
      const profile = await getUserProfile(fs, user.uid);
      const viewerCountry = request.headers.get("cf-ipcountry")?.trim().toUpperCase() ?? "";
      if (!isAdSuitableForViewer(campaign, profile.adultEligible, viewerCountry)) {
        throw new ApiError(403, "AD_NOT_ELIGIBLE", "This advertisement is not eligible for this viewer.");
      }
      const eventId = crypto.randomUUID();
      await fs.setDoc("adEvents/" + eventId, {
        adId: params.adId, campaignId: campaign["campaignId"] ?? params.adId,
        uid: user.uid, event: body.event, positionSeconds: body.positionSeconds,
        platform: body.platform, slot: body.slot, createdAt: new Date().toISOString(),
      }, { mustNotExist: true });
      return Response.json({ recorded: true });
    } catch (error) { return errorBody(error); }
  } } },
});
