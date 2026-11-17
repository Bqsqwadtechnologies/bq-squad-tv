import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { requireVideoWorker } from "@/lib/server/video-worker-auth";

const schema = z.object({
  taskId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
  claimToken: z.string().regex(/^[a-f0-9]{32}$/),
  result: z.object({
    deletedObjectCount: z.number().int().min(0).max(1_000_000).optional(),
    processedObjectCount: z.number().int().min(0).max(10_000_000).optional(),
    usageBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    healthStatus: z.enum(["healthy", "degraded", "unreachable", "misconfigured"]).optional(),
  }).optional(),
}).strict();

export const Route = createFileRoute("/api/public/v1/worker/maintenance/complete")({
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
      const deletedObjectCount = body.result?.deletedObjectCount ??
        (typeof task["deletedObjectCount"] === "number" ? task["deletedObjectCount"] : 0);
      const processedObjectCount = body.result?.processedObjectCount ??
        (typeof task["objectCount"] === "number" ? task["objectCount"] : 0);
      const usageBytes = body.result?.usageBytes ??
        (typeof task["usageBytes"] === "number" ? task["usageBytes"] : null);
      const healthStatus = body.result?.healthStatus ??
        (typeof task["healthStatus"] === "string" ? task["healthStatus"] : null);
      await fs.patchDoc(path, {
        status: "completed",
        completedAt: now,
        updatedAt: now,
        claimToken: null,
        leaseExpiresAt: null,
        deletedObjectCount,
        processedObjectCount,
        ...(usageBytes === null ? {} : { usageBytes }),
        ...(healthStatus === null ? {} : { healthStatus }),
      });
      const auditId = crypto.randomUUID().replace(/-/g, "");
      await fs.setDoc("videoMaintenanceAudit/" + auditId, {
        taskId: body.taskId,
        taskType: task["taskType"] ?? "unknown",
        workerId,
        result: { deletedObjectCount, processedObjectCount, ...(usageBytes === null ? {} : { usageBytes }), ...(healthStatus === null ? {} : { healthStatus }) },
        createdAt: now,
      });
      return Response.json({ taskId: body.taskId, status: "completed", deletedObjectCount, processedObjectCount, usageBytes, healthStatus });
    } catch (error) { return errorBody(error); }
  } } },
});
