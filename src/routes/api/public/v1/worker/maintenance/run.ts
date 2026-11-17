import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { requireVideoWorker } from "@/lib/server/video-worker-auth";
import { validateStorageDestinationMetadata, resolveStorageDestinationConfiguration } from "@/lib/server/storage/registry";
import { createStorageProviderAdapter } from "@/lib/server/storage/providers";
import { videoWorkerLeaseExpiry } from "@/lib/server/video-worker-policy";
import { accumulateStorageUsage, isStorageQuotaOrRateLimit, storageFailureCode, storageFailureMessage } from "@/lib/server/storage/maintenance";

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
      if (task["taskType"] === "storage_health_usage") {
        const payload = task["payload"] as Record<string, unknown> | undefined;
        const storageId = typeof payload?.["destinationId"] === "string" ? payload["destinationId"] : "";
        if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(storageId)) {
          throw new ApiError(400, "STORAGE_MAINTENANCE_TARGET_INVALID", "The storage maintenance target is invalid.");
        }
        const raw = await fs.getDoc("storageDestinations/" + storageId);
        if (!raw) throw new ApiError(404, "STORAGE_DESTINATION_NOT_FOUND", "The storage location could not be found.");
        const metadata = validateStorageDestinationMetadata({ ...raw, destinationId: storageId });
        const config = resolveStorageDestinationConfiguration(metadata);
        const now = new Date().toISOString();
        const alert = async (code: string, message: string, degraded: boolean) => {
          const alertId = crypto.randomUUID().replace(/-/g, "");
          await fs.setDoc("storageAlerts/" + alertId, {
            destinationId: storageId,
            severity: degraded ? "warning" : "error",
            reasonCode: code,
            message,
            createdAt: now,
            expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
            acknowledged: false,
          }).catch(() => undefined);
        };
        const failDestination = async (error: unknown) => {
          const code = storageFailureCode(error);
          const degraded = isStorageQuotaOrRateLimit(code);
          const message = storageFailureMessage(code);
          await fs.patchDoc("storageDestinations/" + storageId, {
            healthStatus: degraded ? "degraded" : "unreachable",
            healthCheckedAt: now,
            lastErrorCode: code,
            degradedUntil: degraded ? new Date(Date.now() + 24 * 60 * 60_000).toISOString() : null,
            updatedAt: now,
          });
          await alert(code, message, degraded);
          await fs.patchDoc(taskPath, {
            phase: "done",
            healthStatus: degraded ? "degraded" : "unreachable",
            lastErrorCode: code,
            updatedAt: now,
            leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()),
          });
          return Response.json({ done: true, healthStatus: degraded ? "degraded" : "unreachable", error: message });
        };

        if (config.configurationStatus !== "configured") {
          await fs.patchDoc("storageDestinations/" + storageId, {
            healthStatus: "misconfigured", healthCheckedAt: now,
            lastErrorCode: "STORAGE_DESTINATION_MISCONFIGURED",
            degradedUntil: null, updatedAt: now,
          });
          await alert("STORAGE_DESTINATION_MISCONFIGURED", "The storage location needs its connection settings checked.", false);
          await fs.patchDoc(taskPath, { phase: "done", healthStatus: "misconfigured", updatedAt: now });
          return Response.json({ done: true, healthStatus: "misconfigured", error: "The storage location needs its connection settings checked." });
        }

        const adapter = createStorageProviderAdapter(config);
        if (task["phase"] !== "listing") {
          try {
            await adapter.healthCheck();
            await fs.patchDoc("storageDestinations/" + storageId, {
              healthStatus: "healthy", healthCheckedAt: now, lastErrorCode: null,
              degradedUntil: null, updatedAt: now,
            });
            await fs.patchDoc(taskPath, {
              phase: "listing", listingCursor: null, usageBytes: 0, objectCount: 0,
              healthStatus: "healthy", leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()),
              updatedAt: now,
            });
            return Response.json({ done: false, phase: "listing", processedObjectCount: 0 });
          } catch (error) {
            return await failDestination(error);
          }
        }

        const cursor = typeof task["listingCursor"] === "string" ? task["listingCursor"] : null;
        try {
          const page = await adapter.listObjects("", cursor);
          if (page.nextCursor && page.nextCursor === cursor) {
            throw new ApiError(409, "STORAGE_LISTING_CURSOR_STALLED", "The storage listing did not advance.");
          }
          const totals = accumulateStorageUsage(
            typeof task["usageBytes"] === "number" ? task["usageBytes"] : 0,
            typeof task["objectCount"] === "number" ? task["objectCount"] : 0,
            page.objects,
          );
          if (page.nextCursor) {
            await fs.patchDoc(taskPath, {
              listingCursor: page.nextCursor,
              usageBytes: totals.usageBytes,
              objectCount: totals.objectCount,
              leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()),
              updatedAt: now,
            });
            return Response.json({ done: false, processedObjectCount: page.objects.length });
          }
          await fs.patchDoc("storageDestinations/" + storageId, {
            usageBytes: totals.usageBytes,
            usageSource: "provider_listing",
            usageCheckedAt: now,
            healthStatus: "healthy",
            healthCheckedAt: now,
            lastErrorCode: null,
            degradedUntil: null,
            updatedAt: now,
          });
          await fs.patchDoc(taskPath, {
            phase: "done", listingCursor: null,
            usageBytes: totals.usageBytes, objectCount: totals.objectCount,
            leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()), updatedAt: now,
          });
          return Response.json({
            done: true, usageBytes: totals.usageBytes,
            processedObjectCount: totals.objectCount, healthStatus: "healthy",
          });
        } catch (error) {
          return await failDestination(error);
        }
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
