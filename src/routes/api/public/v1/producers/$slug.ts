import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { resolveProducerBySlugOrId, formatPublicProducer } from "@/lib/server/producer-profile";

export const Route = createFileRoute("/api/public/v1/producers/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const fs = await Firestore.create();
          const { producerDoc, uid } = await resolveProducerBySlugOrId(fs, params.slug);

          // Check if request is authenticated to determine isFollowing
          let isFollowing = false;
          let currentViewerUid: string | null = null;
          const authHeader = request.headers.get("authorization");
          if (authHeader && authHeader.startsWith("Bearer ")) {
            try {
              const authUser = await requireUser(request);
              currentViewerUid = authUser.uid;
              const followDoc = await fs.getDoc(`producers/${uid}/followers/${authUser.uid}`);
              isFollowing = Boolean(followDoc && followDoc["active"] !== false);
            } catch {
              // Unauthenticated public request
            }
          }

          // Fetch approved and published titles for this producer
          const titles = await fs.query("contentAssets", {
            filters: [
              { field: "ownerUid", op: "EQUAL", value: uid },
              { field: "status", op: "EQUAL", value: "ready" },
            ],
            limit: 100,
          });

          // Group into movies and series
          const publishedTitles = titles.map((t) => ({
            id: t.__id || t["assetId"],
            assetId: t["assetId"] || t.__id,
            title: t["title"] || "Untitled",
            description: t["description"] || "",
            contentType: t["contentType"] || (t["episodeNumber"] ? "series" : "movie"),
            category: t["category"] || "Entertainment",
            genre: t["genre"] || "General",
            language: t["language"] || "English",
            ageRating: t["ageRating"] || "PG",
            posterUrl: t["posterUrl"] || null,
            backdropUrl: t["backdropUrl"] || null,
            seriesTitle: t["seriesTitle"] || null,
            seasonNumber: t["seasonNumber"] || 1,
            episodeNumber: t["episodeNumber"] || null,
            episodeTitle: t["episodeTitle"] || null,
            averageStars: typeof t["averageStars"] === "number" ? t["averageStars"] : 0,
            ratingCount: typeof t["ratingCount"] === "number" ? t["ratingCount"] : 0,
            releaseDate: t["releaseDate"] || null,
          }));

          const profile = formatPublicProducer(producerDoc, uid, publishedTitles.length);
          if (typeof producerDoc["avatarPath"] === "string" || typeof producerDoc["bannerPath"] === "string") {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const [avatarSigned, bannerSigned] = await Promise.all([
              typeof producerDoc["avatarPath"] === "string"
                ? supabaseAdmin.storage.from("bq-sqwad-source-media").createSignedUrl(producerDoc["avatarPath"] as string, 60 * 60)
                : Promise.resolve({ data: null, error: null }),
              typeof producerDoc["bannerPath"] === "string"
                ? supabaseAdmin.storage.from("bq-sqwad-source-media").createSignedUrl(producerDoc["bannerPath"] as string, 60 * 60)
                : Promise.resolve({ data: null, error: null }),
            ]);
            if (avatarSigned.data?.signedUrl) profile.avatarUrl = avatarSigned.data.signedUrl;
            if (bannerSigned.data?.signedUrl) profile.bannerUrl = bannerSigned.data.signedUrl;
          }

          return Response.json({
            producer: profile,
            isFollowing,
            isSelf: currentViewerUid === uid,
            titles: publishedTitles,
          }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
