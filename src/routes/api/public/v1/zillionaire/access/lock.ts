import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { requireViewer } from "@/lib/server/access";
import { ZILLIONAIRE_UNLOCK_COOKIE } from "@/lib/server/zillionaire-access";

export const Route = createFileRoute("/api/public/v1/zillionaire/access/lock")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await requireViewer(request);

          const isProd = process.env["NODE_ENV"] === "production";
          const cookieHeader = `${ZILLIONAIRE_UNLOCK_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isProd ? "; Secure" : ""}`;

          return new Response(JSON.stringify({ ok: true, locked: true }), {
            status: 200,
            headers: {
              "content-type": "application/json",
              "set-cookie": cookieHeader,
            },
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
