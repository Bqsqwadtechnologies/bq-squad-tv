import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getUserProfile, requireUser } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import {
  isAdPlacementAllowed,
  isOverlayBlockingPicture,
  normalizePlacement,
  PLACEMENT_GEOMETRIES,
} from "@/lib/server/ads-policy";

const validSlots = new Set([
  "pre_roll",
  "mid_roll",
  "half_time",
  "between_segments",
  "home_banner",
  "web_banner",
  "top",
  "bottom",
  "left",
  "right",
  "companion",
]);

export const Route = createFileRoute("/api/public/v1/ads/next")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const url = new URL(request.url);
          const rawPlatform = url.searchParams.get("platform") ?? "android";
          const rawSlot = url.searchParams.get("slot") ?? "";
          const channelId = url.searchParams.get("channelId") ?? "";
          const device = url.searchParams.get("device") ?? (rawPlatform === "android" ? "phone" : "desktop");

          if (rawPlatform !== "android" && rawPlatform !== "web") {
            throw new ApiError(400, "AD_PLATFORM_INVALID", "The ad platform is invalid.");
          }

          const slot = rawSlot.trim().toLowerCase().replace(/-/g, "_");

          if (isOverlayBlockingPicture(slot)) {
            throw new ApiError(
              400,
              "AD_SLOT_INVALID",
              "Pop-ups and overlays blocking the video picture are not permitted.",
            );
          }

          if (!validSlots.has(slot)) {
            throw new ApiError(400, "AD_SLOT_INVALID", "The ad placement is invalid.");
          }

          const fs = await Firestore.create();
          await enforceRateLimit(fs, "ads-next:" + rawPlatform + ":" + user.uid, {
            limit: 60,
            windowMs: 60_000,
          });

          const userDoc = await fs.getDoc("users/" + user.uid);
          const isKid =
            userDoc?.["childProfile"] === true ||
            userDoc?.["childMode"] === true ||
            userDoc?.["profileType"] === "child";

          let isAdultChannel = false;
          if (channelId) {
            const channel = await fs.getDoc("channels/" + channelId);
            isAdultChannel =
              channel?.["adultOnly"] === true ||
              channel?.["ageRating"] === "18+" ||
              channel?.["ageRestricted"] === true;
          }

          // Non-interruptive placement & kids / adult checks
          const placementCheck = isAdPlacementAllowed({
            slot,
            isKidsMode: isKid,
            channelAdultOnly: isAdultChannel,
            device,
          });

          if (!placementCheck.allowed) {
            return Response.json(null);
          }

          const adSettings = await fs.getDoc("config/adSettings");
          if (adSettings?.["paidViewersAdFree"] === true) {
            const isPaid =
              userDoc?.["hasPaidSubscription"] === true ||
              userDoc?.["isPaidViewer"] === true ||
              (Array.isArray(userDoc?.["roleTags"]) && userDoc["roleTags"].includes("subscriber"));
            if (isPaid) return Response.json(null);
          }

          const profile = await getUserProfile(fs, user.uid);
          const viewerCountry = request.headers.get("cf-ipcountry")?.trim().toUpperCase() ?? "";
          const provider = await fs.getDoc("adProviders/" + rawPlatform);
          if (!provider || provider["enabled"] !== true) return Response.json(null);

          const campaigns = await fs.query("adCampaigns", {
            filters: [{ field: "status", op: "EQUAL", value: "ACTIVE" }],
            limit: 100,
          });

          const now = Date.now();
          const eligible = campaigns.filter((campaign) => {
            const suitability = isAdPlacementAllowed({
              slot,
              isKidsMode: isKid,
              channelAdultOnly: isAdultChannel,
              device,
              campaign,
              adultEligible: profile.adultEligible,
              viewerCountry,
            });
            if (!suitability.allowed) return false;

            const campaignPlatforms = Array.isArray(campaign["platforms"])
              ? campaign["platforms"]
              : [];
            const campaignPlacements = Array.isArray(campaign["placements"])
              ? campaign["placements"].map((p: string) => p.replace(/-/g, "_"))
              : [];

            return (
              campaignPlatforms.includes(rawPlatform) &&
              campaignPlacements.includes(slot) &&
              (!campaign["startsAt"] ||
                (typeof campaign["startsAt"] === "string" &&
                  Date.parse(campaign["startsAt"]) <= now)) &&
              (!campaign["endsAt"] ||
                (typeof campaign["endsAt"] === "string" && Date.parse(campaign["endsAt"]) > now)) &&
              (campaign["channelIds"] === undefined ||
                (Array.isArray(campaign["channelIds"]) &&
                  campaign["channelIds"].includes(channelId)))
            );
          });

          const ad = eligible[0];
          if (!ad) return Response.json(null);

          const creativeUrl = typeof ad["creativeUrl"] === "string" ? ad["creativeUrl"] : "";
          if (!creativeUrl || !/^https:\/\//i.test(creativeUrl)) return Response.json(null);

          const normPlacement = normalizePlacement(slot);
          const geometry = normPlacement ? PLACEMENT_GEOMETRIES[normPlacement] : null;

          return Response.json({
            id: ad.__id,
            campaignId: typeof ad["campaignId"] === "string" ? ad["campaignId"] : ad.__id,
            title: typeof ad["title"] === "string" ? ad["title"] : "Sponsored",
            creativeUrl,
            videoUrl: typeof ad["videoUrl"] === "string" ? ad["videoUrl"] : null,
            skipAfterSeconds:
              typeof ad["skipAfterSeconds"] === "number" ? ad["skipAfterSeconds"] : null,
            durationSeconds: typeof ad["durationSeconds"] === "number" ? ad["durationSeconds"] : 15,
            clickUrl:
              typeof ad["clickUrl"] === "string" && /^https:\/\//i.test(ad["clickUrl"])
                ? ad["clickUrl"]
                : null,
            rewardEnabled: false,
            providerId:
              typeof provider?.["providerId"] === "string" ? provider["providerId"] : null,
            geometry: geometry
              ? {
                  placement: geometry.placement,
                  isNonInterruptive: geometry.isNonInterruptive,
                  safeMarginPx: geometry.safeMarginPx,
                }
              : null,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
