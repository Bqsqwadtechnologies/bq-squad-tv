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
import { addVerifiedAssetStreamReplica, bindAssetStreamStorage } from "@/lib/server/storage/asset-binding";
import { nextHealthRecoveryState } from "@/lib/server/storage/failover";
import { confirmOrphanDeletion, isExpiredTemporaryObject, sourceCanBeDeleted } from "@/lib/server/storage/cleanup";
import { encryptStorageConfigurationBackup, type StorageConfigurationBackup } from "@/lib/server/storage/config-backup";
import { reserveStorageDestination, releaseStorageReservation, commitStorageReservation } from "@/lib/server/storage/reservations";

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
      return Response.json({ done: false, phase: "verify", processedObjectCount: page.objects.length });
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
    const previousReservationId = typeof asset["streamReservationId"] === "string" ? asset["streamReservationId"] : "";
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
          payload: {
            assetId, destinationId: sourceId, prefix: sourcePrefix, targetDestinationId: targetId,
            ...(previousReservationId ? { previousReservationId } : {}),
          },
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

      if (task["taskType"] === "storage_destination_drain") {
        const payload = task["payload"] as Record<string, unknown> | undefined;
        const destinationId = typeof payload?.["destinationId"] === "string" ? payload["destinationId"] : "";
        const cursorValue = typeof payload?.["cursorValue"] === "string" ? payload["cursorValue"] : null;
        const cursorId = typeof payload?.["cursorId"] === "string" ? payload["cursorId"] : null;
        if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(destinationId) ||
            ["legacy_lovable_source", "legacy_lovable_streaming", "lovable-source-legacy", "lovable-stream-legacy"].includes(destinationId)) {
          throw new ApiError(400, "STORAGE_DRAIN_DESTINATION_INVALID", "This storage location is protected or invalid.");
        }
        const sourceRaw = await fs.getDoc("storageDestinations/" + destinationId);
        if (!sourceRaw) throw new ApiError(404, "STORAGE_DRAIN_DESTINATION_MISSING", "The storage location could not be found.");
        const sourceMetadata = validateStorageDestinationMetadata({ ...sourceRaw, destinationId });
        if (sourceMetadata.purpose !== "hls_streaming" || sourceMetadata.mode !== "drain") {
          throw new ApiError(409, "STORAGE_DRAIN_MODE_REQUIRED", "Only a streaming location already in drain mode can be moved.");
        }
        const page = await fs.query("contentAssets", {
          filters: [{ field: "streamDestinationId", op: "EQUAL", value: destinationId }],
          orderByField: "updatedAt",
          ...(cursorValue && cursorId ? { startAfter: { fieldValue: cursorValue, documentId: "contentAssets/" + cursorId } } : {}),
          limit: 1,
        });
        if (page.length === 0) {
          // A fresh first-page query is the final safety check before retirement.
          const remaining = await fs.query("contentAssets", {
            filters: [{ field: "streamDestinationId", op: "EQUAL", value: destinationId }],
            limit: 1,
          });
          if (remaining.length > 0) {
            await fs.patchDoc(taskPath, { payload: { destinationId, cursorValue: null, cursorId: null }, leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()), updatedAt: now });
            return Response.json({ done: false, resetCursor: true });
          }
          await fs.patchDoc("storageDestinations/" + destinationId, {
            mode: "retired", enabled: false, drainCompletedAt: now, updatedAt: now,
          });
          await rebuildStoragePoolIndex(fs, ["hls_streaming"]);
          await fs.patchDoc(taskPath, { phase: "done", completedAt: now, updatedAt: now });
          return Response.json({ done: true, retired: true });
        }
        const asset = page[0]!;
        const assetId = asset.__id;
        const objectPrefix = typeof asset["objectPrefix"] === "string" ? asset["objectPrefix"] : "";
        const streamBytes = typeof asset["streamBytes"] === "number" && Number.isSafeInteger(asset["streamBytes"])
          ? asset["streamBytes"] : typeof asset["actualHlsBytes"] === "number" && Number.isSafeInteger(asset["actualHlsBytes"])
            ? asset["actualHlsBytes"] : 0;
        if (!/^hls\/[A-Za-z0-9_-]{1,100}\/a[1-9][0-9]*$/.test(objectPrefix) ||
            !objectPrefix.startsWith("hls/" + assetId + "/") || streamBytes < 1) {
          throw new ApiError(409, "STORAGE_DRAIN_ASSET_UNVERIFIABLE", "A film on this location has no complete verified copy details; the drain remains paused.");
        }
        const sourceGroup = sourceMetadata.accountGroup;
        const replicaIds = Array.isArray(asset["streamReplicaIds"])
          ? asset["streamReplicaIds"].filter((id): id is string => typeof id === "string") : [];
        const excludedGroups = [sourceGroup];
        for (const replicaId of replicaIds) {
          const replica = await fs.getDoc("storageDestinations/" + replicaId);
          if (typeof replica?.["accountGroup"] === "string") excludedGroups.push(replica["accountGroup"]);
        }
        const reservationId = "drain-" + crypto.randomUUID().replace(/-/g, "");
        const reservation = await reserveStorageDestination(fs, {
          purpose: "hls_streaming", incomingBytes: streamBytes, reservationId, assetId,
          excludeDestinationIds: [destinationId, ...replicaIds],
          excludeAccountGroups: excludedGroups,
        });
        const budgetPath = "storageReplicaBudget/global";
        try {
          await fs.transact([budgetPath], docs => {
            const current = docs[0];
            const budgetBytes = typeof current?.["budgetBytes"] === "number" ? current["budgetBytes"] : 0;
            const usedBytes = typeof current?.["usedBytes"] === "number" ? current["usedBytes"] : 0;
            if (!Number.isSafeInteger(budgetBytes) || !Number.isSafeInteger(usedBytes) ||
                budgetBytes < 1 || usedBytes + streamBytes > budgetBytes) {
              throw new ApiError(507, "STORAGE_DRAIN_REPLICA_BUDGET", "There is not enough reserved spare space to move this film.");
            }
            return { result: undefined, writes: [{
              update: { name: fs.docName(budgetPath), fields: (await import("@/lib/server/firebase-admin")).encodeFields({ usedBytes: usedBytes + streamBytes, updatedAt: now }) },
              updateMask: { fieldPaths: ["usedBytes", "updatedAt"] },
            }] };
          });
          const next = page[0]!;
          const nextCursorValue = typeof next["updatedAt"] === "string" ? next["updatedAt"] : "";
          if (!nextCursorValue) throw new ApiError(409, "STORAGE_DRAIN_CURSOR_UNAVAILABLE", "The film record is missing its update date; the drain was paused safely.");
          const copyTaskId = "drain-copy-" + crypto.randomUUID().replace(/-/g, "").slice(0, 24);
          await fs.setDoc("videoMaintenanceJobs/" + copyTaskId, {
            taskType: "storage_rebalance", payload: {
              switchPrimary: true, assetId, sourceDestinationId: destinationId,
              targetDestinationId: reservation.destinationId, sourcePrefix: objectPrefix,
              targetPrefix: objectPrefix, reservationId, streamBytes,
              phase: "files", listingCursor: null, pendingKeys: [], pendingIndex: 0,
              copiedBytes: 0, copiedObjectCount: 0, verifyCursor: null,
              verifiedBytes: 0, verifiedObjectCount: 0,
            },
            status: "queued", attempts: 0, reason: "Move a film from a draining storage location",
            createdAt: now, updatedAt: now,
          }, { mustNotExist: true });
          await fs.patchDoc(taskPath, {
            payload: { destinationId, cursorValue: nextCursorValue, cursorId: assetId, queuedAssetId: assetId, queuedCopyTaskId: copyTaskId },
            queuedAssetCount: (typeof task["queuedAssetCount"] === "number" ? task["queuedAssetCount"] : 0) + 1,
            leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()), updatedAt: now,
          });
          return Response.json({ done: false, queuedCopy: true, assetId, copyTaskId });
        } catch (error) {
          await releaseStorageReservation(fs, reservationId).catch(() => undefined);
          await fs.transact([budgetPath], docs => {
            const current = docs[0];
            if (!current) return { result: undefined, writes: [] };
            const used = typeof current["usedBytes"] === "number" ? current["usedBytes"] : 0;
            return { result: undefined, writes: [{
              update: { name: fs.docName(budgetPath), fields: (await import("@/lib/server/firebase-admin")).encodeFields({ usedBytes: Math.max(0, used - streamBytes), updatedAt: now }) },
              updateMask: { fieldPaths: ["usedBytes", "updatedAt"] },
            }] };
          }).catch(() => undefined);
          throw error;
        }
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
        const pendingKeys = Array.isArray(payload?.["pendingKeys"])
          ? payload["pendingKeys"].filter((key): key is string => typeof key === "string") : [];
        const pendingIndex = typeof payload?.["pendingIndex"] === "number" ? payload["pendingIndex"] : 0;
        if (pendingIndex < pendingKeys.length) {
          const batch = pendingKeys.slice(pendingIndex, pendingIndex + 40);
          await Promise.all(batch.map(key => adapter.deleteObject(key)));
          await fs.patchDoc(taskPath, {
            payload: { ...payload, pendingIndex: pendingIndex + batch.length },
            deletedObjectCount: (typeof task["deletedObjectCount"] === "number" ? task["deletedObjectCount"] : 0) + batch.length,
            leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()), updatedAt: now,
          });
          return Response.json({ done: false, deletedCount: batch.length });
        }
        if (pendingKeys.length > 0 && cursor) {
          await fs.patchDoc(taskPath, {
            payload: { ...payload, pendingKeys: [], pendingIndex: 0 },
            leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()), updatedAt: now,
          });
          return Response.json({ done: false, deletedCount: 0 });
        }
        if (pendingKeys.length === 0) {
          const page = await adapter.listObjects(prefix, cursor);
          if (page.objects.length > 0) {
            await fs.patchDoc(taskPath, {
              payload: { ...payload, pendingKeys: page.objects.map(item => item.key), pendingIndex: 0, deleteCursor: page.nextCursor },
              leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()), updatedAt: now,
            });
            return Response.json({ done: false, deletedCount: 0 });
          }
          if (page.nextCursor) {
            await fs.patchDoc(taskPath, {
              payload: { ...payload, pendingKeys: [], pendingIndex: 0, deleteCursor: page.nextCursor },
              leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()), updatedAt: now,
            });
            return Response.json({ done: false, deletedCount: 0 });
          }
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
        const previousReservationId = typeof payload?.["previousReservationId"] === "string" ? payload["previousReservationId"] : "";
        let previousReservation: Record<string, unknown> | null = null;
        let reconciledReservationId = "";
        if (/^[A-Za-z0-9_-]{8,100}$/.test(previousReservationId)) {
          previousReservation = await fs.getDoc("storageReservations/" + previousReservationId);
          reconciledReservationId = previousReservationId;
        } else {
          // Older moves did not persist the reservation ID on the asset. Reconcile
          // only when the historical lookup is unambiguous; never guess between
          // multiple committed reservations for the same asset and location.
          const historical = await fs.query("storageReservations", {
            filters: [
              { field: "assetId", op: "EQUAL", value: assetId },
              { field: "destinationId", op: "EQUAL", value: destinationId },
              { field: "purpose", op: "EQUAL", value: "hls_streaming" },
              { field: "status", op: "EQUAL", value: "committed" },
            ],
            limit: 2,
          });
          if (historical.length === 1) {
            previousReservation = historical[0]!;
            reconciledReservationId = historical[0]!.__id;
          }
        }
        if (previousReservation && reconciledReservationId &&
            previousReservation["status"] === "committed" &&
            previousReservation["destinationId"] === destinationId &&
            previousReservation["assetId"] === assetId &&
            previousReservation["purpose"] === "hls_streaming" &&
            typeof previousReservation["actualBytes"] === "number" &&
            Number.isSafeInteger(previousReservation["actualBytes"]) &&
            previousReservation["actualBytes"] > 0) {
          await fs.patchDoc("storageReservations/" + reconciledReservationId, {
            status: "released_after_delete",
            deletedBytes: previousReservation["actualBytes"],
            actualBytes: 0,
            deletedAt: now,
            updatedAt: now,
          });
        }
        await rebuildStoragePoolIndex(fs, ["hls_streaming"]);
        await fs.patchDoc(taskPath, { phase: "done", completedAt: now, updatedAt: now });
        return Response.json({ done: true, deletedCount: typeof task["deletedObjectCount"] === "number" ? task["deletedObjectCount"] : 0 });
      }

      if (task["taskType"] === "storage_config_backup") {
        const payload = task["payload"] as Record<string, unknown> | undefined;
        const destinationId = typeof payload?.["destinationId"] === "string" ? payload["destinationId"] : "";
        if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(destinationId)) {
          throw new ApiError(400, "STORAGE_BACKUP_DESTINATION_INVALID", "The backup location is invalid.");
        }
        const backupKey = process.env["CONFIG_BACKUP_KEY"];
        if (!backupKey || backupKey.length < 32) {
          throw new ApiError(503, "STORAGE_BACKUP_KEY_MISSING", "The private backup setting is not configured.");
        }
        const raw = await fs.getDoc("storageDestinations/" + destinationId);
        if (!raw) throw new ApiError(404, "STORAGE_BACKUP_DESTINATION_MISSING", "The backup location could not be found.");
        const metadata = validateStorageDestinationMetadata({ ...raw, destinationId });
        if (metadata.purpose !== "backup" || metadata.mode !== "active" || !metadata.enabled || metadata.healthStatus !== "healthy") {
          throw new ApiError(409, "STORAGE_BACKUP_DESTINATION_UNAVAILABLE", "The backup location must be active and recently checked before use.");
        }
        const config = resolveStorageDestinationConfiguration(metadata);
        if (config.configurationStatus !== "configured") throw new ApiError(503, "STORAGE_BACKUP_DESTINATION_MISCONFIGURED", "The backup location needs its connection settings checked.");
        const [destinations, poolIndex, assets, egressLedgers] = await Promise.all([
          fs.query("storageDestinations", { limit: 500 }),
          fs.query("storagePool", { limit: 500 }),
          fs.query("contentAssets", { limit: 500 }),
          fs.query("storageEgressState", { limit: 500 }),
        ]);
        const backup: StorageConfigurationBackup = {
          version: 1,
          createdAt: now,
          destinations: destinations.map(row => {
            const { __id, secretPrefix: _secretPrefix, ...fields } = row;
            return { destinationId: __id, ...fields };
          }),
          poolIndex: poolIndex.map(row => {
            const { __id, ...fields } = row;
            return { documentId: __id, ...fields };
          }),
          assetBindings: assets.map(row => ({
            assetId: row.__id,
            ...(typeof row["streamDestinationId"] === "string" ? { streamDestinationId: row["streamDestinationId"] } : {}),
            ...(Array.isArray(row["streamReplicaIds"]) ? { streamReplicaIds: row["streamReplicaIds"] } : {}),
            ...(typeof row["objectPrefix"] === "string" ? { objectPrefix: row["objectPrefix"] } : {}),
            ...(typeof row["streamObjectPrefix"] === "string" ? { streamObjectPrefix: row["streamObjectPrefix"] } : {}),
            ...(typeof row["posterMediaId"] === "string" ? { posterMediaId: row["posterMediaId"] } : {}),
            ...(Array.isArray(row["thumbnailMediaIds"]) ? { thumbnailMediaIds: row["thumbnailMediaIds"] } : {}),
          })),
          egressLedgers: egressLedgers.map(row => {
            const { __id, ...fields } = row;
            return { documentId: __id, ...fields };
          }),
        };
        const encrypted = await encryptStorageConfigurationBackup(backup, backupKey);
        const bodyBytes = new TextEncoder().encode(encrypted);
        const reservationId = "backup-" + crypto.randomUUID().replace(/-/g, "");
        let uploadedKey = "";
        let reservationCommitted = false;
        try {
          const reservation = await reserveStorageDestination(fs, {
            purpose: "backup",
            incomingBytes: bodyBytes.byteLength,
            reservationId,
            excludeDestinationIds: destinations.map(row => row.__id).filter(id => id !== destinationId),
          });
          if (reservation.destinationId !== destinationId) {
            await releaseStorageReservation(fs, reservationId);
            throw new ApiError(409, "STORAGE_BACKUP_ROUTING_CHANGED", "The selected backup location is no longer the location chosen by the storage pool.");
          }
          const adapter = createStorageProviderAdapter(config);
          const week = String(payload?.["scheduleKey"] ?? new Date().toISOString().slice(0, 10));
          uploadedKey = "config-backups/" + week + "-" + Date.now() + ".json.enc";
          await adapter.putObject(uploadedKey, bodyBytes, "application/octet-stream");
          const stored = await adapter.headObject(uploadedKey);
          if (!stored || stored.sizeBytes !== bodyBytes.byteLength) throw new ApiError(409, "STORAGE_BACKUP_UPLOAD_UNVERIFIED", "The encrypted backup did not pass its storage check.");
          await commitStorageReservation(fs, reservationId, stored.sizeBytes);
          reservationCommitted = true;
          let cursor: string | null = null;
          const backups: string[] = [];
          do {
            const page = await adapter.listObjects("config-backups", cursor);
            backups.push(...page.objects.map(item => item.key).filter(key => key.endsWith(".json.enc")));
            cursor = page.nextCursor;
          } while (cursor && backups.length < 1000);
          const ordered = backups.sort().reverse();
          const excess = ordered.slice(8);
          for (const key of excess) await adapter.deleteObject(key);
          if (excess.length) await rebuildStoragePoolIndex(fs, ["backup"]);
          await fs.patchDoc(taskPath, { phase: "done", backupObjectKey: uploadedKey, backupBytes: stored.sizeBytes, retainedBackupCount: Math.min(8, ordered.length), completedAt: now, updatedAt: now });
          return Response.json({ done: true, backupObjectKey: uploadedKey, backupBytes: stored.sizeBytes, retainedBackupCount: Math.min(8, ordered.length) });
        } catch (error) {
          if (uploadedKey && !reservationCommitted) await createStorageProviderAdapter(config).deleteObject(uploadedKey).catch(() => undefined);
          if (!reservationCommitted) await releaseStorageReservation(fs, reservationId).catch(() => undefined);
          throw error;
        }
      }

      if (task["taskType"] === "storage_source_retention") {
        const payload = task["payload"] as Record<string, unknown> | undefined;
        const destinationId = typeof payload?.["destinationId"] === "string" ? payload["destinationId"] : "";
        if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(destinationId) ||
            ["legacy_lovable_source", "legacy_lovable_streaming", "lovable-source-legacy", "lovable-stream-legacy"].includes(destinationId)) {
          throw new ApiError(400, "SOURCE_RETENTION_DESTINATION_INVALID", "This location is protected from automatic source cleanup.");
        }
        const raw = await fs.getDoc("storageDestinations/" + destinationId);
        if (!raw) throw new ApiError(404, "SOURCE_RETENTION_DESTINATION_MISSING", "The original-file location could not be found.");
        const metadata = validateStorageDestinationMetadata({ ...raw, destinationId });
        if (metadata.purpose !== "source_media" || metadata.mode === "retired") {
          throw new ApiError(409, "SOURCE_RETENTION_DESTINATION_UNSAFE", "Only registered original-file locations can be checked.");
        }
        const config = resolveStorageDestinationConfiguration(metadata);
        if (config.configurationStatus !== "configured") throw new ApiError(503, "SOURCE_RETENTION_DESTINATION_MISCONFIGURED", "The original-file location needs its connection settings checked.");
        const adapter = createStorageProviderAdapter(config);

        // Keep a bounded page in the task payload while processing it in small
        // slices. Once exhausted, advance with an exclusive timestamp+document
        // cursor so collections larger than 500 are fully covered.
        const pageSize = 100;
        const sliceSize = 20;
        let pageIds = Array.isArray(payload?.["pageAssetIds"])
          ? payload["pageAssetIds"].filter((id): id is string => typeof id === "string").slice(0, pageSize)
          : [];
        let pageIndex = typeof payload?.["pageIndex"] === "number" && Number.isSafeInteger(payload["pageIndex"])
          ? Math.max(0, Math.min(pageIds.length, payload["pageIndex"])) : 0;
        let cursorValue = typeof payload?.["cursorValue"] === "string" ? payload["cursorValue"] : null;
        let cursorId = typeof payload?.["cursorId"] === "string" ? payload["cursorId"] : null;
        let pageLastValue = typeof payload?.["pageLastValue"] === "string" ? payload["pageLastValue"] : null;
        let pageLastId = typeof payload?.["pageLastId"] === "string" ? payload["pageLastId"] : null;

        if (pageIds.length === 0) {
          const page = await fs.query("contentAssets", {
            filters: [{ field: "sourceDestinationId", op: "EQUAL", value: destinationId }],
            orderByField: "updatedAt",
            ...(cursorValue && cursorId ? { startAfter: { fieldValue: cursorValue, documentId: "contentAssets/" + cursorId } } : {}),
            limit: pageSize,
          });
          if (page.length === 0) {
            await rebuildStoragePoolIndex(fs, ["source_media"]);
            await fs.patchDoc(taskPath, {
              phase: "done",
              completedAt: now,
              inspectedCount: typeof task["inspectedCount"] === "number" ? task["inspectedCount"] : 0,
              deletedCount: typeof task["deletedCount"] === "number" ? task["deletedCount"] : 0,
              updatedAt: now,
            });
            return Response.json({ done: true, inspectedCount: task["inspectedCount"] ?? 0, deletedCount: task["deletedCount"] ?? 0 });
          }
          pageIds = page.map(asset => asset.__id);
          const last = page[page.length - 1]!;
          pageLastValue = typeof last["updatedAt"] === "string" ? last["updatedAt"] : null;
          pageLastId = last.__id;
          if (!pageLastValue) {
            throw new ApiError(409, "SOURCE_RETENTION_CURSOR_UNAVAILABLE", "A source record is missing its update date; automatic cleanup paused for a safe owner review.");
          }
          pageIndex = 0;
        }

        const batchIds = pageIds.slice(pageIndex, pageIndex + sliceSize);
        let deletedCount = 0;
        let inspectedCount = 0;
        for (const assetId of batchIds) {
          const asset = await fs.getDoc("contentAssets/" + assetId);
          inspectedCount++;
          if (!asset || asset["sourceDestinationId"] !== destinationId) continue;
          const publishedAt = typeof asset["publishedAt"] === "string" ? asset["publishedAt"] : null;
          const sourceObjectKey = typeof asset["sourceObjectKey"] === "string" ? asset["sourceObjectKey"] : "";
          const ownerUid = typeof asset["ownerUid"] === "string" ? asset["ownerUid"] : "";
          const channelId = typeof asset["channelId"] === "string" ? asset["channelId"] : "";
          const expectedPrefix = "producers/" + ownerUid + "/" + channelId + "/" + assetId + "/";
          const eligible = asset["status"] === "ready" && asset["contentStatus"] === "published" &&
            sourceObjectKey.startsWith(expectedPrefix) && sourceCanBeDeleted({
              publishedAt,
              pinned: asset["sourcePinned"] === true,
              graceDays: 7,
            });
          if (!eligible) continue;
          const { assertStorageObjectKey } = await import("@/lib/server/storage/ledger");
          await adapter.deleteObject(assertStorageObjectKey(sourceObjectKey));
          await fs.patchDoc("contentAssets/" + assetId, {
            sourceRetentionStatus: "deleted_after_grace_period",
            sourceFileDeletedAt: now,
            sourceFileDeletedByPolicy: true,
            updatedAt: now,
          });
          deletedCount++;
        }

        const nextIndex = pageIndex + batchIds.length;
        const pageComplete = nextIndex >= pageIds.length;
        const nextPayload = pageComplete
          ? { destinationId, cursorValue: pageLastValue, cursorId: pageLastId, pageAssetIds: [], pageIndex: 0, pageLastValue: null, pageLastId: null }
          : { ...payload, destinationId, cursorValue, cursorId, pageAssetIds: pageIds, pageIndex: nextIndex, pageLastValue, pageLastId };
        await fs.patchDoc(taskPath, {
          payload: nextPayload,
          inspectedCount: (typeof task["inspectedCount"] === "number" ? task["inspectedCount"] : 0) + inspectedCount,
          deletedCount: (typeof task["deletedCount"] === "number" ? task["deletedCount"] : 0) + deletedCount,
          leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()),
          updatedAt: now,
        });
        return Response.json({
          done: false,
          inspectedCount,
          deletedCount,
          pageComplete,
          cursorAdvanced: pageComplete,
        });
      }

      if (task["taskType"] === "storage_orphan_scan") {
        const payload = task["payload"] as Record<string, unknown> | undefined;
        const destinationId = typeof payload?.["destinationId"] === "string" ? payload["destinationId"] : "";
        if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(destinationId) ||
            ["legacy_lovable_source", "legacy_lovable_streaming", "lovable-source-legacy", "lovable-stream-legacy"].includes(destinationId)) {
          throw new ApiError(400, "ORPHAN_SCAN_DESTINATION_INVALID", "This location cannot be scanned for automatic cleanup.");
        }
        const raw = await fs.getDoc("storageDestinations/" + destinationId);
        if (!raw) throw new ApiError(404, "ORPHAN_SCAN_DESTINATION_MISSING", "The streaming location could not be found.");
        const metadata = validateStorageDestinationMetadata({ ...raw, destinationId });
        if (metadata.purpose !== "hls_streaming" || metadata.mode === "retired") {
          throw new ApiError(409, "ORPHAN_SCAN_DESTINATION_UNSAFE", "Only registered streaming locations can be scanned.");
        }
        const config = resolveStorageDestinationConfiguration(metadata);
        if (config.configurationStatus !== "configured") throw new ApiError(503, "ORPHAN_SCAN_DESTINATION_MISCONFIGURED", "The streaming location needs its connection settings checked.");
        const adapter = createStorageProviderAdapter(config);
        const cursor = typeof payload?.["cursor"] === "string" ? payload["cursor"] : null;
        const pendingKeys = Array.isArray(payload?.["pendingKeys"])
          ? payload["pendingKeys"].filter((key): key is string => typeof key === "string") : [];
        const pendingIndex = typeof payload?.["pendingIndex"] === "number" ? payload["pendingIndex"] : 0;
        const listingNextCursor = typeof payload?.["listingNextCursor"] === "string" ? payload["listingNextCursor"] : null;
        if (pendingIndex < pendingKeys.length) {
          const batch = pendingKeys.slice(pendingIndex, pendingIndex + 40);
          for (const key of batch) {
            const match = key.match(/^hls\/([A-Za-z0-9_-]{1,100})\/a[1-9][0-9]*\/.+$/);
            if (!match?.[1]) continue;
            const assetId = match[1];
            const asset = await fs.getDoc("contentAssets/" + assetId);
            let referenced = false;
            if (asset) {
              const replicas = Array.isArray(asset["streamReplicaIds"])
                ? asset["streamReplicaIds"].filter((id): id is string => typeof id === "string") : [];
              if (replicas.includes(destinationId)) referenced = true;
              if (asset["streamDestinationId"] === destinationId) {
                const currentPrefix = [asset["objectPrefix"], asset["streamObjectPrefix"]]
                  .find(value => typeof value === "string" && value.startsWith("hls/" + assetId + "/"));
                const manifest = typeof asset["hlsManifestKey"] === "string" ? asset["hlsManifestKey"] : "";
                if ((typeof currentPrefix === "string" && key.startsWith(currentPrefix + "/")) ||
                    (manifest && key.startsWith(manifest.slice(0, manifest.lastIndexOf("/") + 1)))) referenced = true;
              }
            }
            if (referenced) continue;
            const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(destinationId + ":" + key)));
            const candidateId = Array.from(digest, value => value.toString(16).padStart(2, "0")).join("");
            const candidatePath = "storageOrphanCandidates/" + candidateId;
            const candidate = await fs.getDoc(candidatePath);
            const observedAt = new Date().toISOString();
            if (!candidate) {
              await fs.setDoc(candidatePath, { destinationId, key, firstSeenAt: observedAt, status: "reviewing", createdAt: observedAt, updatedAt: observedAt }, { mustNotExist: true }).catch(() => undefined);
            } else if (candidate["status"] === "reviewing" && typeof candidate["firstSeenAt"] === "string" &&
                !candidate["confirmingRunAt"] && Date.now() - Date.parse(candidate["firstSeenAt"]) >= 24 * 60 * 60_000) {
              await fs.patchDoc(candidatePath, { confirmingRunAt: observedAt, updatedAt: observedAt });
            } else if (candidate["status"] === "reviewing" &&
                confirmOrphanDeletion({
                  key,
                  firstSeenAt: String(candidate["firstSeenAt"] ?? ""),
                  confirmingRunAt: typeof candidate["confirmingRunAt"] === "string" ? candidate["confirmingRunAt"] : null,
                })) {
              const deleteTaskId = "orphan-delete-" + candidateId;
              await fs.setDoc("videoMaintenanceJobs/" + deleteTaskId, {
                taskType: "storage_orphan_delete",
                payload: { candidateId, destinationId, key },
                status: "queued", attempts: 0,
                reason: "Delete a file confirmed unreferenced by two scans at least 24 hours apart",
                createdAt: observedAt, updatedAt: observedAt,
              }, { mustNotExist: true }).catch(() => undefined);
            }
          }
          const nextIndex = pendingIndex + batch.length;
          await fs.patchDoc(taskPath, {
            payload: { ...payload, pendingIndex: nextIndex },
            leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()), updatedAt: now,
          });
          return Response.json({ done: false, scannedCount: batch.length });
        }
        if (pendingKeys.length > 0 && listingNextCursor) {
          await fs.patchDoc(taskPath, {
            payload: { ...payload, cursor: listingNextCursor, pendingKeys: [], pendingIndex: 0, listingNextCursor: null, listingDone: false },
            leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()), updatedAt: now,
          });
          return Response.json({ done: false, scannedCount: 0 });
        }
        if (pendingKeys.length > 0 && payload?.["listingDone"] === true) {
          await fs.patchDoc(taskPath, { phase: "done", completedAt: now, updatedAt: now });
          return Response.json({ done: true, scannedCount: pendingKeys.length });
        }
        const page = await adapter.listObjects("hls", cursor);
        if (page.objects.length > 0 || page.nextCursor) {
          await fs.patchDoc(taskPath, {
            payload: { ...payload, pendingKeys: page.objects.map(item => item.key), pendingIndex: 0, listingNextCursor: page.nextCursor, listingDone: !page.nextCursor },
            leaseExpiresAt: videoWorkerLeaseExpiry(Date.now()), updatedAt: now,
          });
          return Response.json({ done: false, scannedCount: 0 });
        }
        await fs.patchDoc(taskPath, { phase: "done", completedAt: now, updatedAt: now });
        return Response.json({ done: true, scannedCount: 0 });
      }

      if (task["taskType"] === "storage_orphan_delete") {
        const payload = task["payload"] as Record<string, unknown> | undefined;
        const candidateId = typeof payload?.["candidateId"] === "string" ? payload["candidateId"] : "";
        const destinationId = typeof payload?.["destinationId"] === "string" ? payload["destinationId"] : "";
        const key = typeof payload?.["key"] === "string" ? payload["key"] : "";
        if (!/^[a-f0-9]{64}$/.test(candidateId) || !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(destinationId) ||
            ["legacy_lovable_source", "legacy_lovable_streaming", "lovable-source-legacy", "lovable-stream-legacy"].includes(destinationId) || !/^hls\/[A-Za-z0-9_-]{1,100}\/a[1-9][0-9]*\/.+$/.test(key)) {
          throw new ApiError(400, "ORPHAN_DELETE_INVALID", "The confirmed cleanup request is invalid.");
        }
        const candidatePath = "storageOrphanCandidates/" + candidateId;
        const candidate = await fs.getDoc(candidatePath);
        if (!candidate || candidate["status"] !== "reviewing" || candidate["destinationId"] !== destinationId ||
            candidate["key"] !== key || !confirmOrphanDeletion({
              key, firstSeenAt: String(candidate["firstSeenAt"] ?? ""),
              confirmingRunAt: typeof candidate["confirmingRunAt"] === "string" ? candidate["confirmingRunAt"] : null,
            })) {
          throw new ApiError(409, "ORPHAN_DELETE_NOT_CONFIRMED", "The file has not passed both required checks and the waiting period.");
        }
        const assetId = key.split("/")[1] ?? "";
        const asset = await fs.getDoc("contentAssets/" + assetId);
        const replicas = Array.isArray(asset?.["streamReplicaIds"])
          ? asset["streamReplicaIds"].filter((id): id is string => typeof id === "string") : [];
        const prefix = typeof asset?.["objectPrefix"] === "string" ? asset["objectPrefix"] :
          typeof asset?.["streamObjectPrefix"] === "string" ? asset["streamObjectPrefix"] : "";
        if (asset && (replicas.includes(destinationId) ||
            (asset["streamDestinationId"] === destinationId && prefix && key.startsWith(prefix + "/")))) {
          await fs.patchDoc(candidatePath, { status: "cleared", clearedAt: now, updatedAt: now });
          return Response.json({ done: true, deleted: false, reason: "The file is now referenced." });
        }
        const raw = await fs.getDoc("storageDestinations/" + destinationId);
        if (!raw) throw new ApiError(404, "ORPHAN_DELETE_DESTINATION_MISSING", "The storage location could not be found.");
        const metadata = validateStorageDestinationMetadata({ ...raw, destinationId });
        if (metadata.purpose !== "hls_streaming") throw new ApiError(409, "ORPHAN_DELETE_PURPOSE_INVALID", "Only streaming files can be cleaned automatically.");
        const config = resolveStorageDestinationConfiguration(metadata);
        if (config.configurationStatus !== "configured") throw new ApiError(503, "ORPHAN_DELETE_DESTINATION_MISCONFIGURED", "The storage location needs its connection settings checked.");
        await createStorageProviderAdapter(config).deleteObject(key);
        await fs.patchDoc(candidatePath, { status: "deleted", deletedAt: now, updatedAt: now });
        await rebuildStoragePoolIndex(fs, ["hls_streaming"]);
        return Response.json({ done: true, deleted: true });
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
