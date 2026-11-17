import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";
import { requireVideoWorker } from "@/lib/server/video-worker-auth";

export const Route = createFileRoute("/api/public/v1/worker/maintenance/schedule-wallet-holds")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const fs = await Firestore.create();
      await requireVideoWorker(request, fs);
      const now = new Date();
      const bucket = Math.floor(now.getTime() / 300_000);
      const taskId = "wallet-hold-expiry-" + bucket;
      const nowIso = now.toISOString();
      try {
        await fs.setDoc("videoMaintenanceJobs/" + taskId, {
          taskType: "wallet_hold_reconcile",
          payload: { cursorValue: null, cursorId: null, processedCount: 0 },
          status: "queued",
          attempts: 0,
          reason: "Release expired viewing-session wallet holds",
          createdAt: nowIso,
          updatedAt: nowIso,
        }, { mustNotExist: true });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;
      }
      return Response.json({ scheduled: true, taskId });
    } catch (error) { return errorBody(error); }
  } } },
});
