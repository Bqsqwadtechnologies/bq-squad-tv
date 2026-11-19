import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/zillionaire/errors/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const access = await requireZillionaireModule(fs, user, "security");

          const url = new URL(request.url);
          const refQuery = url.searchParams.get("ref");

          // If searching by ref, look up fingerprint first
          if (refQuery) {
            const refDoc = await fs.getDoc(`errorRefs/${refQuery}`);
            if (!refDoc) {
              return Response.json({ items: [] });
            }
            const fp = refDoc["fingerprint"] as string;
            const errDoc = await fs.getDoc(`errorEvents/${fp}`);
            return Response.json({ items: errDoc ? [errDoc] : [] });
          }

          // Otherwise return recent error events
          // Using listDocs or query
          const events = await fs.query("errorEvents", { limit: 50 });
          // Sort by lastSeen desc
          events.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
            String(b["lastSeen"] ?? "").localeCompare(String(a["lastSeen"] ?? "")),
          );

          return Response.json({ items: events });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
