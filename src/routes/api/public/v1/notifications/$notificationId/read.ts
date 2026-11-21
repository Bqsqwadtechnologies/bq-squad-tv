import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";
import { requireVerifiedViewer } from "@/lib/server/access";

export const Route = createFileRoute("/api/public/v1/notifications/$notificationId/read")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { user } = await requireVerifiedViewer(request);
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(params.notificationId)) {
            throw new ApiError(400, "NOTIFICATION_ID_INVALID", "The notification id is invalid.");
          }
          const fs = await Firestore.create();
          const path = "users/" + user.uid + "/notifications/" + params.notificationId;
          const notification = await fs.getDoc(path);
          if (!notification)
            throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "This notification does not exist.");
          const readAt =
            typeof notification["readAt"] === "string"
              ? notification["readAt"]
              : new Date().toISOString();
          await fs.patchDoc(path, { read: true, readAt });
          return Response.json({ notificationId: params.notificationId, read: true, readAt });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
