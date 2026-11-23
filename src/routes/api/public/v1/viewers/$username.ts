import { createFileRoute } from "@tanstack/react-router";
import { Firestore, ApiError } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/viewers/$username")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const username = String(params.username || "").trim().toLowerCase();
          if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) {
            throw new ApiError(404, "VIEWER_NOT_FOUND", "This viewer profile could not be found.");
          }
          const fs = await Firestore.create();
          const mapping = await fs.getDoc("usernames/" + username);
          if (!mapping || mapping["kind"] !== "viewer" || typeof mapping["uid"] !== "string") {
            throw new ApiError(404, "VIEWER_NOT_FOUND", "This viewer profile could not be found.");
          }
          const uid = mapping["uid"] as string;
          const user = await fs.getDoc("users/" + uid);
          if (!user || user["profileVisibility"] === "private" || user["deletedAt"]) {
            throw new ApiError(404, "VIEWER_NOT_FOUND", "This viewer profile could not be found.");
          }
          return Response.json({
            profile: {
              username,
              displayName: String(user["displayName"] || user["name"] || "Viewer"),
              avatarUrl: typeof user["photoURL"] === "string"
                ? user["photoURL"]
                : typeof user["avatarUrl"] === "string" ? user["avatarUrl"] : null,
              joinedAt: typeof user["createdAt"] === "string" ? user["createdAt"] : null,
            },
          }, { headers: { "cache-control": "public, max-age=60" } });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
