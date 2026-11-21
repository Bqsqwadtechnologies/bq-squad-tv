import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";
import { requireVerifiedViewer } from "@/lib/server/access";

export const Route = createFileRoute("/api/public/v1/user/library/liked")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { user } = await requireVerifiedViewer(request);
          const fs = await Firestore.create();

          const raw = typeof (fs as any).listDocs === "function"
            ? (await (fs as any).listDocs(`users/${user.uid}/liked_items`)).map((d: any) => ({ ...(d.data || {}), __id: d.id, id: d.id }))
            : await fs.query(`users/${user.uid}/liked_items`);
          const likedDocs = raw as Array<Record<string, unknown> & { __id?: string }>;
          const items = likedDocs
            .filter((item: Record<string, unknown>) => item["active"] !== false)
            .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
              const aTime = typeof a["likedAt"] === "string" ? new Date(a["likedAt"]).getTime() : 0;
              const bTime = typeof b["likedAt"] === "string" ? new Date(b["likedAt"]).getTime() : 0;
              return bTime - aTime;
            })
            .map((item: Record<string, unknown> & { __id: string }) => ({
              id: String(item["id"] || item.__id || ""),
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
