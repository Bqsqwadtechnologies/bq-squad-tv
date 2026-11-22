import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { getBadgeCounts, clearBadgeCount } from "@/lib/server/badges";

const clearSchema = z.object({
  key: z.enum(["unreadMessages", "pendingReviews", "changeRequests", "supportTickets", "all"]).default("all"),
});

export const Route = createFileRoute("/api/public/v1/notifications/badges")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const badges = await getBadgeCounts(fs, user.uid);
          return Response.json(badges, {
            headers: { "cache-control": "private, no-cache, no-store" },
          });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, clearSchema);
          const fs = await Firestore.create();
          const updated = await clearBadgeCount(fs, user.uid, body.key);
          return Response.json({ success: true, badges: updated });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
