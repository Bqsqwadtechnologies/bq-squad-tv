import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";

const schema = z
  .object({
    themeMode: z.enum(["system", "light", "dark"]),
  })
  .strict();

const DEFAULT_THEME = "system" as const;

export const Route = createFileRoute("/api/public/v1/profile/preferences")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const profile = await fs.getDoc("users/" + user.uid);
          const stored = profile?.["themeMode"];
          const themeMode =
            stored === "light" || stored === "dark" || stored === "system" ? stored : DEFAULT_THEME;
          return Response.json(
            { themeMode },
            { headers: { "cache-control": "private, no-store" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
      PUT: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          await fs.patchDoc("users/" + user.uid, {
            themeMode: body.themeMode,
            themeUpdatedAt: new Date().toISOString(),
          });
          return Response.json(
            { saved: true, themeMode: body.themeMode },
            {
              headers: { "cache-control": "private, no-store" },
            },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
