import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";

export const Route = createFileRoute("/api/public/v1/continue-watching/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const items = await fs.listDocs(`users/${user.uid}/resumePositions`);
          items.sort((a, b) => String(b["updatedAt"] ?? "").localeCompare(String(a["updatedAt"] ?? "")));
          return Response.json({ items });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
