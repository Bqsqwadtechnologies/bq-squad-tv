import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/notifications/unread-count")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const notifs = await fs.query("notifications", {
            filters: [{ field: "uid", op: "EQUAL", value: user.uid }],
          });
          const unread = notifs.filter((n: Record<string, unknown>) => n["read"] !== true).length;
          return Response.json({ unreadCount: unread });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
