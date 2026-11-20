import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";

const preferencesSchema = z.object({
  emailWatchlist: z.boolean().default(true),
  pushLiveBroadcasts: z.boolean().default(true),
  watchPartyInvites: z.boolean().default(true),
  billingReceipts: z.boolean().default(true),
  marketingUpdates: z.boolean().default(false),
});

export const Route = createFileRoute("/api/public/v1/user/notification-preferences")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          const doc = await fs.getDoc(`users/${user.uid}/settings/notifications`).catch(() => null);
          const preferences = {
            emailWatchlist: doc?.["emailWatchlist"] ?? true,
            pushLiveBroadcasts: doc?.["pushLiveBroadcasts"] ?? true,
            watchPartyInvites: doc?.["watchPartyInvites"] ?? true,
            billingReceipts: doc?.["billingReceipts"] ?? true,
            marketingUpdates: doc?.["marketingUpdates"] ?? false,
          };

          return Response.json(preferences);
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, preferencesSchema);
          const fs = await Firestore.create();

          const now = new Date().toISOString();
          await fs.setDoc(`users/${user.uid}/settings/notifications`, {
            ...body,
            updatedAt: now,
          });

          return Response.json({ success: true, preferences: body });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
