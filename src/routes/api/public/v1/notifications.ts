import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/notifications")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const notifications = await fs.query("users/" + user.uid + "/notifications", {
            orderByField: "createdAt",
            descending: true,
            limit: 50,
          });
          return Response.json(
            notifications.map((item) => ({
              id: item.__id,
              title: item["title"] ?? "",
              body: item["body"] ?? "",
              deepLink: item["deepLink"] ?? null,
              read: item["read"] === true,
              deliveryStatus: item["deliveryStatus"] ?? "unknown",
              createdAt: item["createdAt"] ?? null,
              readAt: item["readAt"] ?? null,
            })),
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
