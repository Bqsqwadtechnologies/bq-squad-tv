import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
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
      const taskPath = "videoMaintenanceJobs/" + body.taskId;
      const nowDate = new Date();
      const now = nowDate.toISOString();
      const notBefore = body.notBefore ?? new Date(nowDate.getTime() + 30_000).toISOString();
      if (!Number.isFinite(Date.parse(notBefore)) || Date.parse(notBefore) < nowDate.getTime() - 5_000 ||
          Date.parse(notBefore) > nowDate.getTime() + 7 * 86_400_000) {
        throw new ApiError(400, "MAINTENANCE_RETRY_TIME_INVALID", "The next maintenance attempt time is invalid.");
      }
      const released = await fs.transact([taskPath], docs => {
        const task = docs[0];
        if (!task) throw new ApiError(404, "MAINTENANCE_TASK_NOT_FOUND", "The maintenance task could not be found.");
        if (task["status"] === "queued" && task["workerId"] == null && task["claimToken"] == null) {
          return { result: "already_queued", writes: [] };
        }
        if (task["status"] !== "processing" || task["workerId"] !== workerId ||
            task["claimToken"] !== body.claimToken || typeof task["leaseExpiresAt"] !== "string" ||
            Date.parse(task["leaseExpiresAt"]) <= nowDate.getTime()) {
          throw new ApiError(409, "MAINTENANCE_LEASE_INVALID", "The maintenance task lease is no longer valid.");
        }
        return {
          result: "queued",
          writes: [{
            update: {
              name: fs.docName(taskPath),
              fields: encodeFields({
                status: "queued", workerId: null, claimToken: null,
                leaseExpiresAt: null, notBefore, updatedAt: now,
              }),
            },
            updateMask: { fieldPaths: ["status", "workerId", "claimToken", "leaseExpiresAt", "notBefore", "updatedAt"] },
          }],
        };
      });
      return Response.json({ taskId: body.taskId, status: "queued", notBefore, idempotent: released === "already_queued" });
    } catch (error) { return errorBody(error); }
  } } },
});
