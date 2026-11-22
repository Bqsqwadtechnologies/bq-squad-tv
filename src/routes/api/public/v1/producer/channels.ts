import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { requireViewer } from "@/lib/server/access";

const restricted = () =>
  Response.json(
    { code: "CHANNEL_CREATION_RESTRICTED", error: "CHANNEL_CREATION_RESTRICTED", message: "Only we can create channels. Contact tv@bqsqwad.com." },
    { status: 403, headers: { "cache-control": "no-store" } },
  );

export const Route = createFileRoute("/api/public/v1/producer/channels")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireViewer(request);
          return restricted();
        } catch (err) {
          return errorBody(err);
        }
      },
      POST: async () => {
        return restricted();
      },
    },
  },
});
