import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const schema = z.object({ stars: z.number().int().min(1).max(5) });

export const Route = createFileRoute("/api/public/v1/content-assets/$assetId/rating")({
  server: { handlers: { POST: async ({ request, params }) => {
    try {
      const user = await requireUser(request);
      const body = await parseBody(request, schema);
      const assetId = params.assetId;
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId)) throw new ApiError(400, "ASSET_ID_INVALID", "The content identifier is invalid.");
      const fs = await Firestore.create();
      await enforceRateLimit(fs, "content-rating:" + user.uid, { limit: 30, windowMs: 60_000 });
      const assetPath = "contentAssets/" + assetId;
      const ratingPath = "contentRatings/" + assetId + "_" + user.uid;
      const result = await fs.transact<{ ratingCount: number; averageStars: number; updated: boolean }>(
        [ratingPath, assetPath],
        docs => {
          const existing = docs[0];
          const asset = docs[1];
          if (!asset || asset["status"] !== "ready" || asset["contentStatus"] !== "published") {
            throw new ApiError(404, "CONTENT_NOT_AVAILABLE", "This published content is not available for rating.");
          }
          const currentCount = typeof asset["ratingCount"] === "number" && Number.isSafeInteger(asset["ratingCount"]) && asset["ratingCount"] >= 0
            ? asset["ratingCount"] as number : 0;
          const currentTotal = typeof asset["ratingTotalStars"] === "number" && Number.isSafeInteger(asset["ratingTotalStars"]) && asset["ratingTotalStars"] >= 0
            ? asset["ratingTotalStars"] as number : 0;
          const previousStars = existing && typeof existing["stars"] === "number" && Number.isInteger(existing["stars"]) && existing["stars"] >= 1 && existing["stars"] <= 5 ? existing["stars"] : 0;
          const nextCount = currentCount + (previousStars === 0 ? 1 : 0);
          const nextTotal = currentTotal - previousStars + body.stars;
          if (!Number.isSafeInteger(nextCount) || !Number.isSafeInteger(nextTotal) || nextCount < 1 || nextTotal < 1) {
            throw new ApiError(409, "RATING_TOTAL_INVALID", "The content rating totals need administrator reconciliation.");
          }
          const averageStars = Math.round((nextTotal / nextCount) * 100) / 100;
          const now = new Date().toISOString();
          return {
            result: { ratingCount: nextCount, averageStars, updated: previousStars !== body.stars },
            writes: [
              {
                update: { name: fs.docName(ratingPath), fields: encodeFields({
                  assetId, uid: user.uid, stars: body.stars, updatedAt: now,
                  ...(existing ? {} : { createdAt: now }),
                }) },
              },
              {
                update: { name: fs.docName(assetPath), fields: encodeFields({
                  ratingCount: nextCount, ratingTotalStars: nextTotal, averageStars, updatedAt: now,
                }) },
                updateMask: { fieldPaths: ["ratingCount", "ratingTotalStars", "averageStars", "updatedAt"] },
              },
            ],
          };
        },
      );
      return Response.json(result);
    } catch (error) { return errorBody(error); }
  } } },
});
