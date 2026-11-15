import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { clearWebRefreshCookie, requireSameOrigin } from "@/lib/server/web-session";

export const Route = createFileRoute("/api/public/v1/auth/web/session/logout")({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        requireSameOrigin(request);
        return Response.json(
          { signedOut: true },
          {
            headers: {
              "set-cookie": clearWebRefreshCookie(),
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
