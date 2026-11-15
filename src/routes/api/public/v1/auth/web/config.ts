import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/auth/web/config")({
  server: { handlers: {
    GET: async () => {
      const clientId = process.env["GOOGLE_WEB_CLIENT_ID"]?.trim()
        || process.env["web_client_id"]?.trim()
        || "";
      return Response.json(
        { googleClientId: clientId },
        { headers: { "cache-control": "public, max-age=300" } },
      );
    },
  } },
});
