import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/auth/web/me")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const user = await requireUser(request);
        return Response.json(
          { uid: user.uid, email: user.email, emailVerified: user.emailVerified },
          { headers: { "cache-control": "no-store", pragma: "no-cache" } },
        );
      } catch (error) {
        return errorBody(error);
      }
    },
  } },
});
