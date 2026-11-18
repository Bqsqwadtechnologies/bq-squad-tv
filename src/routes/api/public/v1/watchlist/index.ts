import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";

const addSchema = z.object({
  titleId: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  posterUrl: z.string().url().optional(),
  type: z.enum(["movie", "series", "channel"]).default("movie"),
}).strict();

export const Route = createFileRoute("/api/public/v1/watchlist/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const items = await fs.listDocs(`users/${user.uid}/watchlist`);
          items.sort((a, b) => String(b["addedAt"] ?? "").localeCompare(String(a["addedAt"] ?? "")));
          return Response.json({ items });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, addSchema);
          const fs = await Firestore.create();
          const now = new Date().toISOString();

          await fs.setDoc(`users/${user.uid}/watchlist/${body.titleId}`, {
            titleId: body.titleId,
            title: body.title,
            posterUrl: body.posterUrl ?? "",
            type: body.type,
            addedAt: now,
          });

          return Response.json({ added: true, titleId: body.titleId });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
