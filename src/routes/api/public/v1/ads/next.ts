import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getUserProfile, requireUser } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const slots = ["pre_roll", "mid_roll", "half_time", "between_segments", "home_banner", "web_banner"] as const;
const blockedAdCategories = new Set([
  "gambling", "sports_betting", "casino", "wagering", "prediction_market", "lottery",
  "alcohol", "tobacco", "nicotine", "vaping", "adult_entertainment", "adult_dating",
  "pornography", "sexual_content", "weapons",
]);

const adultAgeRatings = new Set(["18", "18+", "r", "nc-17", "tv-ma", "adult", "mature"]);

function isAdultRestricted(campaign: Record<string, unknown>): boolean {
  const rating = typeof campaign["ageRating"] === "string"
    ? campaign["ageRating"].trim().toLowerCase()
    : "";
  return campaign["adultOnly"] === true || campaign["ageRestricted"] === true || adultAgeRatings.has(rating);
}

export const Route = createFileRoute("/api/public/v1/ads/next")({
  server: { handlers: { GET: async ({ request }) => {
    try {
      const user = await requireUser(request);
      const url = new URL(request.url);
      const platform = url.searchParams.get("platform") ?? "android";
      const slot = url.searchParams.get("slot") ?? "";
      const channelId = url.searchParams.get("channelId") ?? "";
      if (platform !== "android" && platform !== "web") throw new ApiError(400, "AD_PLATFORM_INVALID", "The ad platform is invalid.");
      if (!slots.includes(slot as typeof slots[number])) throw new ApiError(400, "AD_SLOT_INVALID", "The ad placement is invalid.");
      const fs = await Firestore.create();
      await enforceRateLimit(fs, "ads-next:" + platform + ":" + user.uid, { limit: 60, windowMs: 60_000 });
      const profile = await getUserProfile(fs, user.uid);
      const viewerCountry = request.headers.get("cf-ipcountry")?.trim().toUpperCase() ?? "";
      const provider = await fs.getDoc("adProviders/" + platform);
      const campaigns = await fs.query("adCampaigns", {
        filters: [{ field: "status", op: "EQUAL", value: "ACTIVE" }],
        limit: 100,
      });
      const now = Date.now();
      const eligible = campaigns.filter(campaign => {
        const category = typeof campaign["category"] === "string"
          ? campaign["category"].toLowerCase().replace(/[\s-]+/g, "_") : "";
        if (!category || blockedAdCategories.has(category)) return false;
        if (!profile.adultEligible && isAdultRestricted(campaign)) return false;
        const territories = campaign["territoryCodes"];
        if (Array.isArray(territories) && territories.length > 0 &&
            (!viewerCountry || !territories.includes(viewerCountry))) return false;
        return Array.isArray(campaign["platforms"]) && campaign["platforms"].includes(platform) &&
        Array.isArray(campaign["placements"]) && campaign["placements"].includes(slot) &&
        (!campaign["startsAt"] || (typeof campaign["startsAt"] === "string" && Date.parse(campaign["startsAt"]) <= now)) &&
        (!campaign["endsAt"] || (typeof campaign["endsAt"] === "string" && Date.parse(campaign["endsAt"]) > now)) &&
        (campaign["channelIds"] === undefined || (Array.isArray(campaign["channelIds"]) && campaign["channelIds"].includes(channelId)));
      });
      const ad = eligible[0];
      if (!ad) return Response.json(null);
      const creativeUrl = typeof ad["creativeUrl"] === "string" ? ad["creativeUrl"] : "";
      if (!creativeUrl || !/^https:\/\//i.test(creativeUrl)) return Response.json(null);
      return Response.json({
        id: ad.__id,
        campaignId: typeof ad["campaignId"] === "string" ? ad["campaignId"] : ad.__id,
        title: typeof ad["title"] === "string" ? ad["title"] : "Sponsored",
        creativeUrl,
        videoUrl: typeof ad["videoUrl"] === "string" ? ad["videoUrl"] : null,
        skipAfterSeconds: typeof ad["skipAfterSeconds"] === "number" ? ad["skipAfterSeconds"] : null,
        durationSeconds: typeof ad["durationSeconds"] === "number" ? ad["durationSeconds"] : 15,
        clickUrl: typeof ad["clickUrl"] === "string" && /^https:\/\//i.test(ad["clickUrl"]) ? ad["clickUrl"] : null,
        rewardEnabled: false,
        providerId: typeof provider?.["providerId"] === "string" ? provider["providerId"] : null,
      });
    } catch (error) { return errorBody(error); }
  } } },
});
