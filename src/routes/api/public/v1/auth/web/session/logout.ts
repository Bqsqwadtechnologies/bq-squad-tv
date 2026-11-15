import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { requireAppCheck } from "@/lib/server/firebase-app-check";
import { errorBody } from "@/lib/server/api";
import { clearWebRefreshCookie, readWebRefreshCookie, requireSameOrigin, revokeWebRefreshSession } from "@/lib/server/web-session";

export const Route = createFileRoute("/api/public/v1/auth/web/session/logout")({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        requireSameOrigin(request);
        await requireAppCheck(request);
        let signedOut = true;
        const refreshToken = readWebRefreshCookie(request);
        if (refreshToken) {
          try {
            await revokeWebRefreshSession(await Firestore.create(), refreshToken);
          } catch {
            signedOut = false;
          }
        }
        return Response.json(
          { signedOut },
          {
            headers: {
              "set-cookie": clearWebRefreshCookie(),
              "cache-control": "no-store",
              pragma: "no-cache",
            },
            status: signedOut ? 200 : 503,
          },
        );
      } catch (error) {
        return errorBody(error);
      }
    },
  } },
});
