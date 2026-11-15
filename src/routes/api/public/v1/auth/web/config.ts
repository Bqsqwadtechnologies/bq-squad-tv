import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/auth/web/config")({
  server: { handlers: {
    GET: async () => {
      const clientId = process.env["GOOGLE_WEB_CLIENT_ID"]?.trim()
        || process.env["web_client_id"]?.trim()
        || "";
      const recaptchaSiteKey = process.env["RECAPTCHA_ENTERPRISE_SITE_KEY"]?.trim()
        || process.env["recaptcha_enterprise_site_key"]?.trim()
        || "";
      return Response.json(
        { googleClientId: clientId, recaptchaSiteKey },
        { headers: { "cache-control": "public, max-age=300" } },
      );
    },
  } },
});
