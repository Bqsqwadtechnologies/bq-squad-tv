import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireVerifiedViewer } from "@/lib/server/access";

const addSchema = z
  .object({
    titleId: z.string().trim().min(1).max(100),
    titleName: z.string().trim().max(200).optional(),
    posterUrl: z.string().url().optional(),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/watchlist/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { user } = await requireVerifiedViewer(request);
          const fs = await Firestore.create();
          const items = await fs.query("watchlist", {
            filters: [{ field: "uid", op: "EQUAL", value: user.uid }],
          });
          items.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
            String(b["addedAt"] ?? "").localeCompare(String(a["addedAt"] ?? "")),
          );
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

          const doc = {
            uid: user.uid,
            titleId: body.titleId,
            titleName: body.titleName ?? "Untitled",
            posterUrl: body.posterUrl ?? null,
            addedAt: now,
          };

          await fs.setDoc(`watchlist/${user.uid}_${body.titleId}`, doc);
          return Response.json({ saved: true, item: doc });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
