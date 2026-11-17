import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { requireVideoWorker } from "@/lib/server/video-worker-auth";
import { validateStorageDestinationMetadata, resolveStorageDestinationConfiguration } from "@/lib/server/storage/registry";
import { createStorageProviderAdapter } from "@/lib/server/storage/providers";
import { videoWorkerLeaseExpiry } from "@/lib/server/video-worker-policy";
import { checkStorageProviderHealth, isStorageQuotaOrRateLimit, readStorageUsagePage, storageFailureCode, storageFailureMessage } from "@/lib/server/storage/maintenance";
import { refreshStoragePoolDestination, updateStorageUsageAndPool, rebuildStoragePoolIndex } from "@/lib/server/storage/pool-index";
import { copyReplicaObject, replicaCopyPhase } from "@/lib/server/storage/replication";
import { commitStorageReservation } from "@/lib/server/storage/reservations";
import { addVerifiedAssetStreamReplica, bindAssetStreamStorage } from "@/lib/server/storage/asset-binding";
import { isExpiredTemporaryObject } from "@/lib/server/storage/cleanup";
import { nextHealthRecoveryState } from "@/lib/server/storage/failover";

const schema = z.object({
  taskId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
  claimToken: z.string().regex(/^[a-f0-9]{32}$/),
}).strict();


async function processReplicaCopyTask(fs: Firestore, taskPath: string, task: Record<string, unknown>): Promise<Response> {
  const payload = task["payload"] as Record<string, unknown> | undefined;
  const assetId = typeof payload?.["assetId"] === "string" ? payload["assetId"] : "";
  const sourceId = typeof payload?.["sourceDestinationId"] === "string" ? payload["sourceDestinationId"] : "";
  const targetId = typeof payload?.["targetDestinationId"] === "string" ? payload["targetDestinationId"] : "";
  const sourcePrefix = typeof payload?.["sourcePrefix"] === "string" ? payload["sourcePrefix"] : "";
  const targetPrefix = typeof payload?.["targetPrefix"] === "string" ? payload["targetPrefix"] : "";
  const reservationId = typeof payload?.["reservationId"] === "string" ? payload["reservationId"] : "";
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId) ||
      !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(sourceId) ||
      !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(targetId) ||
      !/^[A-Za-z0-9_-]{8,100}$/.test(reservationId) ||
      !/^hls\/[A-Za-z0-9_-]{1,100}\/a[1-9][0-9]*$/.test(sourcePrefix) ||
      !/^hls\/[A-Za-z0-9_-]{1,100}\/a[1-9][0-9]*$/.test(targetPrefix)) {
    throw new ApiError(400, "STORAGE_REPLICA_TASK_INVALID", "The film copy task is invalid.");
  }
  const sourceRaw = await fs.getDoc("storageDestinations/" + sourceId);
  const targetRaw = await fs.getDoc("storageDestinations/" + targetId);
  if (!sourceRaw || !targetRaw) throw new ApiError(503, "STORAGE_REPLICA_DESTINATION_MISSING", "A storage location for this copy is unavailable.");
  const sourceConfig = resolveStorageDestinationConfiguration(validateStorageDestinationMetadata({ ...sourceRaw, destinationId: sourceId }));
  const targetConfig = resolveStorageDestinationConfiguration(validateStorageDestinationMetadata({ ...targetRaw, destinationId: targetId }));
  if (sourceConfig.configurationStatus !== "configured" || targetConfig.configurationStatus !== "configured") {
    throw new ApiError(503, "STORAGE_REPLICA_DESTINATION_MISCONFIGURED", "A storage location for this copy needs its connection settings checked.");
  }
  const source = createStorageProviderAdapter(sourceConfig);
  const target = createStorageProviderAdapter(targetConfig);
  const now = new Date().toISOString();
  const phase = String(payload?.["phase"] ?? "files");
  const pendingKeys = Array.isArray(payload?.["pendingKeys"])
    ? payload["pendingKeys"].filter((item): item is { key: string; sizeBytes: number } =>
        Boolean(item) && typeof item === "object" &&
        typeof (item as Record<string, unknown>)["key"] === "string" &&
        typeof (item as Record<string, unknown>)["sizeBytes"] === "number")
    : [];
  const pendingIndex = typeof payload?.["pendingIndex"] === "number" ? payload["pendingIndex"] : 0;
  const listingCursor = typeof payload?.["listingCursor"] === "string" ? payload["listingCursor"] : null;
  const listingDone = payload?.["listingDone"] === true;
  const copiedBytes = typeof payload?.["copiedBytes"] === "number" ? payload["copiedBytes"] : 0;
  const copiedObjectCount = typeof payload?.["copiedObjectCount"] === "number" ? payload["copiedObjectCount"] : 0;
  const patchPayload = async (next: Record<string, unknown>, done = false) => {
    await fs.patchDoc(taskPath, {
      payload: next, phase: done ? "done" : phase,
      leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()), updatedAt: now,
    });
    return Response.json({ done, phase: done ? "done" : next["phase"] ?? phase, processedObjectCount: 1 });
  };

  if (phase === "verify") {
    const verifyCursor = typeof payload?.["verifyCursor"] === "string" ? payload["verifyCursor"] : null;
    const page = await target.listObjects(targetPrefix, verifyCursor);
    const verifiedBytes = (typeof payload?.["verifiedBytes"] === "number" ? payload["verifiedBytes"] : 0) +
      page.objects.reduce((sum, item) => sum + item.sizeBytes, 0);
    const verifiedObjectCount = (typeof payload?.["verifiedObjectCount"] === "number" ? payload["verifiedObjectCount"] : 0) +
      page.objects.length;
    if (page.nextCursor) {
      await fs.patchDoc(taskPath, {
        payload: { ...payload, verifyCursor: page.nextCursor, verifiedBytes, verifiedObjectCount },
        leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()), updatedAt: now,
      });
      return Response.json({ done: false, phase: "verify", processedObjectCount: page.processedObjectCount });
    }
    if (verifiedBytes !== copiedBytes || verifiedObjectCount !== copiedObjectCount || copiedBytes < 1 || copiedObjectCount < 1) {
      throw new ApiError(409, "STORAGE_REPLICA_LISTING_MISMATCH", "The copied film files did not match the verified source totals.");
    }
    const asset = await fs.getDoc("contentAssets/" + assetId);
    if (!asset) throw new ApiError(404, "STORAGE_REPLICA_ASSET_MISSING", "The film record could not be found.");
    await commitStorageReservation(fs, reservationId, copiedBytes);
    await addVerifiedAssetStreamReplica(fs, {
      assetId, destinationId: targetId, objectPrefix: targetPrefix,
      reservationId, sizeBytes: copiedBytes, objectCount: copiedObjectCount,
    });
    const switchPrimary = payload?.["switchPrimary"] === true;
    if (switchPrimary) {
      await bindAssetStreamStorage(fs, {
        assetId,
        destinationId: targetId,
        objectPrefix: targetPrefix,
        reservationId,
      });
      // The two legacy Lovable locations are immutable: never queue deletion
      // against them, even after a successful move.
      if (sourceId !== "legacy_lovable_streaming") {
        const cleanupId = "rebalance-clean-" + crypto.randomUUID().replace(/-/g, "").slice(0, 24);
        const notBefore = new Date(Date.now() + 7 * 86_400_000).toISOString();
        await fs.setDoc("videoMaintenanceJobs/" + cleanupId, {
          taskType: "storage_rebalance_cleanup",
          payload: { assetId, destinationId: sourceId, prefix: sourcePrefix, targetDestinationId: targetId },
          status: "queued", attempts: 0, notBefore,
          reason: "Remove an old streaming copy after a seven-day verified grace period",
          createdAt: now, updatedAt: now,
        }, { mustNotExist: true });
      }
    }
    const reservedBytes = typeof payload?.["streamBytes"] === "number" ? payload["streamBytes"] : copiedBytes;
    const unused = Math.max(0, reservedBytes - copiedBytes);
    if (unused > 0) {
      await fs.transact(["storageReplicaBudget/global"], docs => {
        const budget = docs[0];
        if (!budget) return { result: undefined, writes: [] };
        const nextUsed = Math.max(0, (typeof budget["usedBytes"] === "number" ? budget["usedBytes"] : 0) - unused);
        return {
          result: undefined,
          writes: [{
            update: { name: fs.docName("storageReplicaBudget/global"), fields: (await import("@/lib/server/firebase-admin")).encodeFields({ usedBytes: nextUsed, updatedAt: now }) },
            updateMask: { fieldPaths: ["usedBytes", "updatedAt"] },
          }],
        };
      });
    }
    await fs.patchDoc(taskPath, {
      payload: { ...payload, phase: "done", verifiedBytes, verifiedObjectCount },
      phase: "done", completedAt: now, leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()), updatedAt: now,
    });
    return Response.json({ done: true, phase: "done", verifiedBytes, verifiedObjectCount });
  }

  if (pendingIndex < pendingKeys.length) {
    const item = pendingKeys[pendingIndex]!;
    if (!item.key.startsWith(sourcePrefix + "/") || !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes < 1) {
      throw new ApiError(409, "STORAGE_REPLICA_SOURCE_KEY_INVALID", "A source file path could not be verified.");
    }
    const targetKey = targetPrefix + item.key.slice(sourcePrefix.length);
    const copied = await copyReplicaObject(source, target, item.key, targetKey);
    const next = {
      ...payload, phase, pendingIndex: pendingIndex + 1,
      copiedBytes: copiedBytes + copied.sizeBytes,
      copiedObjectCount: copiedObjectCount + 1,
    };
    await fs.patchDoc(taskPath, { payload: next, phase, leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()), updatedAt: now });
    return Response.json({ done: false, phase, processedObjectCount: 1 });
  }

  if (listingDone) {
    const nextPhase = phase === "files" ? "playlists" : phase === "playlists" ? "master" : "verify";
    const next = {
      ...payload, phase: nextPhase, listingCursor: null, listingDone: false,
      pendingKeys: [], pendingIndex: 0,
      ...(nextPhase === "verify" ? { verifyCursor: null, verifiedBytes: 0, verifiedObjectCount: 0 } : {}),
    };
    await fs.patchDoc(taskPath, { payload: next, phase: nextPhase, leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()), updatedAt: now });
    return Response.json({ done: false, phase: nextPhase, processedObjectCount: 0 });
  }

  const page = await source.listObjects(sourcePrefix, listingCursor);
  const wanted = page.objects.filter(item => replicaCopyPhase(item.key) === phase);
  const next = {
    ...payload, phase, pendingKeys: wanted, pendingIndex: 0,
    listingCursor: page.nextCursor, listingDone: !page.nextCursor,
  };
  await fs.patchDoc(taskPath, { payload: next, phase, leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()), updatedAt: now });
  return Response.json({ done: false, phase, processedObjectCount: wanted.length });
}

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
          const recovery = nextHealthRecoveryState({
            status: typeof raw["healthStatus"] === "string" ? raw["healthStatus"] : "unknown",
            cleanChecks: typeof raw["cleanHealthChecks"] === "number" ? raw["cleanHealthChecks"] : 0,
          }, "failed");
          await fs.patchDoc("storageDestinations/" + storageId, {
            healthStatus: degraded ? "degraded" : "unreachable",
            cleanHealthChecks: recovery.cleanChecks,
            healthCheckedAt: now,
            lastErrorCode: code,
            degradedUntil: degraded ? new Date(Date.now() + 24 * 60 * 60_000).toISOString() : null,
            updatedAt: now,
          });
          await refreshStoragePoolDestination(fs, storageId).catch(() => undefined);
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
          await refreshStoragePoolDestination(fs, storageId).catch(() => undefined);
          await alert("STORAGE_DESTINATION_MISCONFIGURED", "The storage location needs its connection settings checked.", false);
          await fs.patchDoc(taskPath, { phase: "done", healthStatus: "misconfigured", updatedAt: now });
          return Response.json({ done: true, healthStatus: "misconfigured", error: "The storage location needs its connection settings checked." });
        }

        const adapter = createStorageProviderAdapter(config);
        if (task["phase"] !== "listing") {
          try {
            await checkStorageProviderHealth(adapter);
            const previousStatus = typeof raw["healthStatus"] === "string" ? raw["healthStatus"] : "unknown";
            const recovering = previousStatus === "degraded" || previousStatus === "unreachable";
            const recovery = recovering
              ? nextHealthRecoveryState({
                  status: previousStatus,
                  cleanChecks: typeof raw["cleanHealthChecks"] === "number" ? raw["cleanHealthChecks"] : 0,
                }, "clean")
              : { status: "healthy", cleanChecks: 3 };
            const recovered = recovery.status === "healthy";
            await fs.patchDoc("storageDestinations/" + storageId, {
              healthStatus: recovered ? "healthy" : "degraded",
              cleanHealthChecks: recovery.cleanChecks,
              healthCheckedAt: now, lastErrorCode: null,
              degradedUntil: recovered ? null : new Date(Date.now() + 60 * 60_000).toISOString(),
              updatedAt: now,
            });
            await refreshStoragePoolDestination(fs, storageId).catch(() => undefined);
            await fs.patchDoc(taskPath, {
              phase: "listing", listingCursor: null, usageBytes: 0, objectCount: 0,
              healthStatus: recovered ? "healthy" : "degraded", leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()),
              updatedAt: now,
            });
            return Response.json({ done: false, phase: "listing", processedObjectCount: 0 });
          } catch (error) {
            return await failDestination(error);
          }
        }

        const cursor = typeof task["listingCursor"] === "string" ? task["listingCursor"] : null;
        try {
          const page = await readStorageUsagePage(
            adapter,
            cursor,
            typeof task["usageBytes"] === "number" ? task["usageBytes"] : 0,
            typeof task["objectCount"] === "number" ? task["objectCount"] : 0,
          );
          const totals = { usageBytes: page.usageBytes, objectCount: page.objectCount };
          if (page.nextCursor) {
            await fs.patchDoc(taskPath, {
              listingCursor: page.nextCursor,
              usageBytes: totals.usageBytes,
              objectCount: totals.objectCount,
              leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()),
              updatedAt: now,
            });
            return Response.json({ done: false, processedObjectCount: page.processedObjectCount });
          }
          await updateStorageUsageAndPool(fs, storageId, totals.usageBytes, now);
          await fs.patchDoc("storageDestinations/" + storageId, {
            healthStatus: "healthy",
            healthCheckedAt: now,
            lastErrorCode: null,
            degradedUntil: null,
            updatedAt: now,
          });
          await refreshStoragePoolDestination(fs, storageId).catch(() => undefined);
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

      if (task["taskType"] === "storage_replica_copy" || task["taskType"] === "storage_rebalance") {
        return await processReplicaCopyTask(fs, taskPath, task);
      }

      if (task["taskType"] === "storage_rebalance_cleanup") {
        const payload = task["payload"] as Record<string, unknown> | undefined;
        const assetId = typeof payload?.["assetId"] === "string" ? payload["assetId"] : "";
        const destinationId = typeof payload?.["destinationId"] === "string" ? payload["destinationId"] : "";
        const targetDestinationId = typeof payload?.["targetDestinationId"] === "string" ? payload["targetDestinationId"] : "";
        const prefix = typeof payload?.["prefix"] === "string" ? payload["prefix"] : "";
        if (destinationId === "legacy_lovable_streaming" ||
            !/^[A-Za-z0-9_-]{1,100}$/.test(assetId) ||
            !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(destinationId) ||
            !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(targetDestinationId) ||
            !/^hls\/[A-Za-z0-9_-]{1,100}\/a[1-9][0-9]*$/.test(prefix) ||
            !prefix.startsWith("hls/" + assetId + "/")) {
          throw new ApiError(400, "REBALANCE_CLEANUP_INVALID", "The old-copy cleanup request is invalid.");
        }
        const notBefore = typeof task["notBefore"] === "string" ? Date.parse(task["notBefore"]) : Number.NaN;
        if (!Number.isFinite(notBefore) || Date.now() < notBefore) {
          throw new ApiError(409, "REBALANCE_GRACE_PERIOD", "The old copy is retained until its safety period has passed.");
        }
        const [asset, replicaRecord, raw] = await Promise.all([
          fs.getDoc("contentAssets/" + assetId),
          fs.getDoc("storageReplicaRecords/" + assetId + "_" + destinationId),
          fs.getDoc("storageDestinations/" + destinationId),
        ]);
        const replicas = Array.isArray(asset?.["streamReplicaIds"])
          ? asset["streamReplicaIds"].filter((id): id is string => typeof id === "string") : [];
        if (!asset || asset["streamDestinationId"] === destinationId ||
            asset["streamDestinationId"] !== targetDestinationId ||
            !replicas.includes(destinationId) || replicaRecord?.["status"] !== "verified" || !raw) {
          throw new ApiError(409, "REBALANCE_OLD_COPY_STILL_REFERENCED", "The old copy is still referenced or its replacement is not verified; deletion was stopped.");
        }
        const metadata = validateStorageDestinationMetadata({ ...raw, destinationId });
        if (metadata.purpose !== "hls_streaming" || metadata.mode === "retired") {
          throw new ApiError(409, "REBALANCE_DESTINATION_UNSAFE", "The old storage location is not eligible for automatic cleanup.");
        }
        const config = resolveStorageDestinationConfiguration(metadata);
        if (config.configurationStatus !== "configured") throw new ApiError(503, "REBALANCE_DESTINATION_MISCONFIGURED", "The old storage location could not be checked.");
        const adapter = createStorageProviderAdapter(config);
        const cursor = typeof payload?.["deleteCursor"] === "string" ? payload["deleteCursor"] : null;
        const page = await adapter.listObjects(prefix, cursor);
        const batch = page.objects.slice(0, 40);
        await Promise.all(batch.map(item => adapter.deleteObject(item.key)));
        if (page.nextCursor) {
          await fs.patchDoc(taskPath, {
            payload: { ...payload, deleteCursor: page.nextCursor },
            leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()), updatedAt: now,
          });
          return Response.json({ done: false, deletedCount: batch.length });
        }
        await fs.transact(["contentAssets/" + assetId, "storageReplicaRecords/" + assetId + "_" + destinationId], docs => {
          const currentAsset = docs[0];
          const currentReplica = docs[1];
          if (!currentAsset || currentAsset["streamDestinationId"] === destinationId ||
              currentAsset["streamDestinationId"] !== targetDestinationId ||
              currentReplica?.["status"] !== "verified") {
            throw new ApiError(409, "REBALANCE_REFERENCE_CHANGED", "The content assignment changed during cleanup; the old copy was retained.");
          }
          const currentReplicas = Array.isArray(currentAsset["streamReplicaIds"])
            ? currentAsset["streamReplicaIds"].filter((id): id is string => typeof id === "string") : [];
          return {
            result: undefined,
            writes: [
              { update: { name: fs.docName("contentAssets/" + assetId), fields: (await import("@/lib/server/firebase-admin")).encodeFields({ streamReplicaIds: currentReplicas.filter(id => id !== destinationId), updatedAt: now }) }, updateMask: { fieldPaths: ["streamReplicaIds", "updatedAt"] } },
              { update: { name: fs.docName("storageReplicaRecords/" + assetId + "_" + destinationId), fields: (await import("@/lib/server/firebase-admin")).encodeFields({ status: "deleted", deletedAt: now }) }, updateMask: { fieldPaths: ["status", "deletedAt"] } },
            ],
          };
        });
        await rebuildStoragePoolIndex(fs, ["hls_streaming"]);
        await fs.patchDoc(taskPath, { status: "completed", phase: "done", deletedObjectCount: (typeof task["deletedObjectCount"] === "number" ? task["deletedObjectCount"] : 0) + batch.length, completedAt: now, updatedAt: now });
        return Response.json({ done: true, deletedCount: batch.length });
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
      const createdAt = typeof payload?.["createdAt"] === "string"
        ? payload["createdAt"]
        : typeof task["createdAt"] === "string" ? task["createdAt"] : "";
      if (!createdAt || !isExpiredTemporaryObject(createdAt)) {
        throw new ApiError(409, "TEMPORARY_OBJECT_RETENTION", "Temporary files are retained for at least 24 hours before cleanup.");
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
