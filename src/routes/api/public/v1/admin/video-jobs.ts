import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/admin/video-jobs")({
  server: { handlers: { GET: async ({ request }) => {
    try {
      const user = await requireUser(request);
      const fs = await Firestore.create();
      await requireAdminModule(fs, user, "content");
      const jobs = await fs.query("videoTranscodeJobs", {
        orderByField: "createdAt",
        descending: true,
        limit: 50,
      });
      const rows = jobs.map(job => ({
        assetId: job.__id,
        status: job["status"] ?? "unknown",
        stage: job["stage"] ?? null,
        progress: typeof job["progress"] === "number" ? job["progress"] : 0,
        attempts: typeof job["attempts"] === "number" ? job["attempts"] : 0,
        workerId: job["workerId"] ?? null,
        lastHeartbeatAt: job["lastHeartbeatAt"] ?? null,
        lastErrorCode: job["lastErrorCode"] ?? null,
        profile: job["transcodeProfile"] ?? "standard",
        outputResolutions: job["outputResolutions"] ?? [],
        outputBytes: job["outputBytes"] ?? null,
        modalEstimatedCostUsd: job["modalEstimatedCostUsd"] ?? null,
        createdAt: job["createdAt"] ?? null,
        updatedAt: job["updatedAt"] ?? null,
      }));
      const queued = rows.filter(row => row.status === "queued");
      const queuePositions = new Map(queued.map((row, index) => [row.assetId, index + 1]));
      return Response.json({
        jobs: rows.map(row => ({ ...row, queuePosition: queuePositions.get(row.assetId) ?? null })),
      }, { headers: { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow, noarchive" } });
    } catch (error) { return errorBody(error); }
  } } },
});
