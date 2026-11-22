import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";

const restricted = () =>
  Response.json(
    { code: "CHANNEL_CREATION_RESTRICTED", error: "CHANNEL_CREATION_RESTRICTED", message: "Only we can create channels. Contact tv@bqsqwad.com." },
    { status: 403, headers: { "cache-control": "no-store" } },
  );

export const Route = createFileRoute("/api/public/v1/producer/channels")({
  server: {
    handlers: {
      GET: async () => restricted(),
      POST: async () => restricted(),
    },
  },
});
