import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { requireVideoWorker } from "@/lib/server/video-worker-auth";

const schema = z.object({
  taskId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
  claimToken: z.string().regex(/^[a-f0-9]{32}$/),
  notBefore: z.string().datetime().optional(),
}).strict();

export const Route = createFileRoute("/api/public/v1/worker/maintenance/release")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const fs = await Firestore.create();
      const workerId = await requireVideoWorker(request, fs);
      const body = await parseBody(request, schema);
      const path = "videoMaintenanceJobs/" + body.taskId;
      const task = await fs.getDoc(path);
      if (!task || task["status"] !== "processing" || task["workerId"] !== workerId ||
          task["claimToken"] !== body.claimToken || typeof task["leaseExpiresAt"] !== "string" ||
          Date.parse(task["leaseExpiresAt"]) <= Date.now()) {
        throw new ApiError(409, "MAINTENANCE_LEASE_INVALID", "The maintenance task lease is no longer valid.");
      }
      const now = new Date().toISOString();
      const notBefore = body.notBefore ?? new Date(Date.now() + 30_000).toISOString();
      if (!Number.isFinite(Date.parse(notBefore)) || Date.parse(notBefore) < Date.now() - 5_000 ||
          Date.parse(notBefore) > Date.now() + 7 * 86_400_000) {
        throw new ApiError(400, "MAINTENANCE_RETRY_TIME_INVALID", "The next maintenance attempt time is invalid.");
      }
      await fs.patchDoc(path, {
        status: "queued",
        workerId: null,
        claimToken: null,
        leaseExpiresAt: null,
        notBefore,
        updatedAt: now,
      });
      return Response.json({ taskId: body.taskId, status: "queued", notBefore });
    } catch (error) { return errorBody(error); }
  } } },
});
