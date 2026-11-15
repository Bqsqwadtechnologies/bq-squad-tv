import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";

export const Route = createFileRoute("/api/public/v1/ads/provider-config")({
  server: { handlers: { GET: async ({ request }) => {
    try {
      const user = await requireUser(request);
      const platform = new URL(request.url).searchParams.get("platform") ?? "android";
      if (platform !== "android" && platform !== "web") throw new ApiError(400, "AD_PLATFORM_INVALID", "The ad platform is invalid.");
      const fs = await Firestore.create();
      await enforceRateLimit(fs, "ads-config:" + platform + ":" + user.uid, { limit: 30, windowMs: 60_000 });
      const config = await fs.getDoc("adProviders/" + platform);
      if (!config || config["enabled"] !== true || typeof config["providerId"] !== "string") {
        return Response.json({ enabled: false, platform });
      }
      const placements = config["placements"] && typeof config["placements"] === "object"
        ? config["placements"] as Record<string, unknown> : {};
      // Only public SDK identifiers are returned. Private keys and server credentials never leave Firestore.
      return Response.json({
        enabled: true,
        platform,
        providerId: config["providerId"],
        appId: typeof config["publicAppId"] === "string" ? config["publicAppId"] : null,
        placements: Object.fromEntries(Object.entries(placements).filter(([key, value]) =>
          /^[a-z0-9_-]{1,40}$/.test(key) && typeof value === "string" && value.length <= 200
        )),
        blockedCategories: ["gambling", "sports_betting", "casino", "wagering", "prediction_market", "lottery"],
      });
    } catch (error) { return errorBody(error); }
  } } },
});
