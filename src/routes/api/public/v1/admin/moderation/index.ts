import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";
import { Firestore } from "@/lib/server/firebase-admin";
import { requireAdminModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/admin/moderation/")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const fs = await Firestore.create();
        await requireAdminModule(fs, user, "moderation");

        const comments = await fs.query("contentComments", { limit: 100 });
        return Response.json({
          comments: comments.map(c => ({
            id: c.__id || c["id"] || c["commentId"],
            assetId: c["assetId"],
            authorUid: c["authorUid"],
            authorName: c["authorName"] || "Viewer",
            text: c["text"] || "",
            status: c["status"] || "pending",
            createdAt: c["createdAt"] || null,
          })),
        });
      } catch (err: unknown) {
        return errorBody(err);
      }
    },
  }},
});
