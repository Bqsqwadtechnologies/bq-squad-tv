import { createFileRoute } from "@tanstack/react-router";
import { ApiError } from "@/lib/server/firebase-admin";
import { requireAppCheck } from "@/lib/server/firebase-app-check";
import { errorBody } from "@/lib/server/api";
import {
  readWebRefreshCookie,
  refreshFirebaseWebSession,
  requireSameOrigin,
  webRefreshCookie,
} from "@/lib/server/web-session";

export const Route = createFileRoute("/api/public/v1/auth/web/session/refresh")({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        requireSameOrigin(request);
        await requireAppCheck(request);
        const refreshToken = readWebRefreshCookie(request);
        if (!refreshToken) {
          throw new ApiError(401, "WEB_SESSION_MISSING", "Sign in to continue.");
        }
        const session = await refreshFirebaseWebSession(refreshToken);
        return Response.json(
          { idToken: session.idToken, expiresInSeconds: session.expiresInSeconds },
          {
            headers: {
              "set-cookie": webRefreshCookie(session.refreshToken),
              "cache-control": "no-store",
              pragma: "no-cache",
            },
          },
        );
      } catch (error) {
        return errorBody(error);
      }
    },
  } },
});
