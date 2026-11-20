import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/user/library/liked")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          const likedDocs = await fs.listDocs(`users/${user.uid}/liked_items`);
          const items = likedDocs
            .map((doc) => doc.data)
            .filter((item) => item["active"] !== false)
            .sort((a, b) => {
              const aTime = typeof a["likedAt"] === "string" ? new Date(a["likedAt"]).getTime() : 0;
              const bTime = typeof b["likedAt"] === "string" ? new Date(b["likedAt"]).getTime() : 0;
              return bTime - aTime;
            })
            .map((item) => ({
              id: String(item["id"] || ""),
              targetType: String(item["targetType"] || "video"),
              targetId: String(item["targetId"] || ""),
              title: String(item["title"] || "Liked title"),
              posterUrl: item["posterUrl"] ? String(item["posterUrl"]) : null,
              likedAt: item["likedAt"] ? String(item["likedAt"]) : null,
            }));

          return Response.json(items);
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
