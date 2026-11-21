import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/zillionaire/blocked-content/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "moderation");

          const allAssets = await fs.query("contentAssets", { limit: 300 });

          const blockedAssets = allAssets.filter(
            (a) =>
              a["status"] === "BLOCKED" ||
              a["status"] === "TAKEDOWN" ||
              a["contentStatus"] === "blocked" ||
              a["contentStatus"] === "takedown" ||
              Boolean(a["blockedReason"]),
          );

          const url = new URL(request.url);
          const q = url.searchParams.get("q")?.toLowerCase().trim();

          let results = blockedAssets;
          if (q) {
            results = results.filter((a) => {
              const notice = (a["takedownNotice"] as Record<string, string>) || {};
              return (
                (a["title"] as string)?.toLowerCase().includes(q) ||
                (a["id"] as string)?.toLowerCase().includes(q) ||
                (a["__id"] as string)?.toLowerCase().includes(q) ||
                (a["channelId"] as string)?.toLowerCase().includes(q) ||
                (a["blockedReason"] as string)?.toLowerCase().includes(q) ||
                notice["claimant"]?.toLowerCase().includes(q) ||
                notice["complaintRef"]?.toLowerCase().includes(q)
              );
            });
          }

          return Response.json({
            items: results.map((a) => {
              const notice = (a["takedownNotice"] as Record<string, string>) || null;
              return {
                assetId: a.__id || a["id"],
                title: a["title"] || "Untitled Video",
                posterUrl: a["posterUrl"] || a["thumbnailUrl"] || null,
                channelId: a["channelId"] || "platform",
                category: a["category"] || "general",
                status: a["status"] || "BLOCKED",
                contentStatus: a["contentStatus"] || "blocked",
                blockedAt: a["blockedAt"] || a["updatedAt"] || null,
                blockedBy: a["blockedBy"] || "operator",
                blockedReason: a["blockedReason"] || "Violation of platform standards or copyright complaint.",
                takedownNotice: notice,
                viewsCount: Number(a["viewsCount"] || 0),
                totalWatchMinutes: Math.round(Number(a["totalWatchSeconds"] || 0) / 60),
              };
            }),
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
