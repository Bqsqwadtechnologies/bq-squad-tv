import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { requireVideoWorker } from "@/lib/server/video-worker-auth";
import { validateStorageDestinationMetadata, resolveStorageDestinationConfiguration } from "@/lib/server/storage/registry";
import { createStorageProviderAdapter } from "@/lib/server/storage/providers";
import { videoWorkerLeaseExpiry } from "@/lib/server/video-worker-policy";

const schema = z.object({
  taskId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
  claimToken: z.string().regex(/^[a-f0-9]{32}$/),
}).strict();

export const Route = createFileRoute("/api/public/v1/worker/maintenance/run")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const fs = await Firestore.create();
      const workerId = await requireVideoWorker(request, fs);
      const body = await parseBody(request, schema);
      const taskPath = "videoMaintenanceJobs/" + body.taskId;
      const task = await fs.getDoc(taskPath);
      if (!task || task["status"] !== "processing" || task["workerId"] !== workerId ||
          task["claimToken"] !== body.claimToken || typeof task["leaseExpiresAt"] !== "string" ||
          Date.parse(task["leaseExpiresAt"]) <= Date.now()) {
        throw new ApiError(409, "MAINTENANCE_LEASE_INVALID", "The maintenance task lease is no longer valid.");
      }
      if (task["taskType"] !== "delete_attempt_prefix") {
        throw new ApiError(400, "MAINTENANCE_TASK_UNSUPPORTED", "This maintenance task type is not supported by this worker version.");
      }
      const payload = task["payload"] as Record<string, unknown> | undefined;
      const prefix = typeof payload?.["prefix"] === "string" ? payload["prefix"] : "";
      const destinationId = typeof payload?.["destinationId"] === "string" ? payload["destinationId"] : "";
      const assetId = typeof payload?.["assetId"] === "string" ? payload["assetId"] : "";
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId) || !/^hls\/[A-Za-z0-9_-]{1,100}\/a[1-9][0-9]*$/.test(prefix) ||
          !destinationId || !prefix.startsWith("hls/" + assetId + "/")) {
        throw new ApiError(400, "MAINTENANCE_PREFIX_INVALID", "The cleanup folder is not valid for this content asset.");
      }
      const raw = await fs.getDoc("storageDestinations/" + destinationId);
      if (!raw) throw new ApiError(503, "HLS_DESTINATION_MISSING", "The assigned storage location is unavailable.");
      const metadata = validateStorageDestinationMetadata({ ...raw, destinationId });
      const config = resolveStorageDestinationConfiguration(metadata);
      if (config.configurationStatus !== "configured") throw new ApiError(503, "HLS_DESTINATION_MISCONFIGURED", "The assigned storage location is not configured.");
      const adapter = createStorageProviderAdapter(config);
      const page = await adapter.listObjects(prefix, null);
      const batch = page.objects.slice(0, 40);
      await Promise.all(batch.map(item => adapter.deleteObject(item.key)));
      const now = new Date().toISOString();
      await fs.patchDoc(taskPath, {
        leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()),
        deletedObjectCount: (typeof task["deletedObjectCount"] === "number" ? task["deletedObjectCount"] : 0) + batch.length,
        updatedAt: now,
      });
      return Response.json({ deletedCount: batch.length, done: batch.length === 0 });
    } catch (error) { return errorBody(error); }
  } } },
});
