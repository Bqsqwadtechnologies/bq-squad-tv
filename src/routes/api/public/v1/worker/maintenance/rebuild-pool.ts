import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";
import { requireVideoWorker } from "@/lib/server/video-worker-auth";
import { rebuildStoragePoolIndex } from "@/lib/server/storage/pool-index";

export const Route = createFileRoute("/api/public/v1/worker/maintenance/rebuild-pool")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const fs = await Firestore.create();
      await requireVideoWorker(request, fs);
      const result = await rebuildStoragePoolIndex(fs);
      return Response.json({ rebuilt: true, ...result });
    } catch (error) { return errorBody(error); }
  } } },
});
