import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields, type FirestoreWrite } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { getStoragePoolEntries, rebuildStoragePoolIndex } from "@/lib/server/storage/pool-index";
import { reserveStorageDestination, releaseStorageReservation } from "@/lib/server/storage/reservations";

const schema = z.object({
  assetId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  replicaCount: z.number().int().min(1).max(8).default(3),
  popular: z.boolean().default(true),
  movePrimary: z.boolean().default(false),
  reason: z.string().trim().min(3).max(1000),
}).strict();

function requireStepUp(authTime: number): void {
  const age = Math.floor(Date.now() / 1000) - authTime;
  if (!Number.isSafeInteger(authTime) || age < 0 || age > 300) {
    throw new ApiError(401, "STEP_UP_REQUIRED", "Sign in again to confirm this sensitive storage action.");
  }
}
function safeBytes(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export const Route = createFileRoute("/api/public/v1/admin/storage/replicas")({
  server: { handlers: { POST: async ({ request }) => {
    const fs = await Firestore.create();
    let reservations: string[] = [];
    let budgetReserved = 0;
    try {
      const user = await requireUser(request);
      requireStepUp(user.authTime);
      const body = await parseBody(request, schema);
      const access = await requireAdminModule(fs, user, "system");
      if (!access.isZillionaireOwner) throw new ApiError(403, "OWNER_ONLY", "Only the Zillionaire owner can manage popular films.");
      const assetPath = "contentAssets/" + body.assetId;
      const asset = await fs.getDoc(assetPath);
      if (!asset || !["published", "approved"].includes(String(asset["status"]))) {
        throw new ApiError(404, "ASSET_NOT_AVAILABLE", "This published film could not be found.");
      }
      if (!body.popular) {
        await fs.patchDoc(assetPath, {
          popular: false, popularMarkedBy: user.uid,
          popularMarkedAt: new Date().toISOString(), popularReason: body.reason,
        });
        await writeAuditLog(fs, {
          actorUid: user.uid, action: "storage.asset_unmarked_popular",
          targetType: "contentAsset", targetId: body.assetId, reason: body.reason,
        });
        return Response.json({ updated: true, popular: false, queuedCount: 0 });
      }
      const sourceDestinationId = typeof asset["streamDestinationId"] === "string" ? asset["streamDestinationId"] : "";
      const objectPrefix = typeof asset["objectPrefix"] === "string" ? asset["objectPrefix"] : "";
      const streamBytes = safeBytes(asset["streamBytes"] ?? asset["actualHlsBytes"]);
      if (!sourceDestinationId || !objectPrefix || streamBytes < 1) {
        throw new ApiError(409, "ASSET_STREAM_BINDING_INCOMPLETE", "This film needs a verified streaming location and file-size report before copies can be made.");
      }
      const primary = await fs.getDoc("storageDestinations/" + sourceDestinationId);
      if (!primary || typeof primary["accountGroup"] !== "string") {
        throw new ApiError(409, "ASSET_PRIMARY_LOCATION_MISSING", "The film's primary storage location could not be checked.");
      }
      const existingReplicas = Array.isArray(asset["streamReplicaIds"])
        ? asset["streamReplicaIds"].filter((id): id is string => typeof id === "string")
        : [];
      const excludeDestinationIds = [sourceDestinationId, ...existingReplicas];
      const excludeAccountGroups = [primary["accountGroup"]];
      for (const replicaId of existingReplicas) {
        const replica = await fs.getDoc("storageDestinations/" + replicaId);
        if (typeof replica?.["accountGroup"] === "string") excludeAccountGroups.push(replica["accountGroup"]);
      }
      await rebuildStoragePoolIndex(fs, ["hls_streaming"]);
      const pool = await getStoragePoolEntries(fs, "hls_streaming");
      const totalFreeBytes = pool.filter(entry => entry.state === "eligible")
        .reduce((sum, entry) => sum + entry.freeBytes, 0);
      const budgetPath = "storageReplicaBudget/global";
      const budget = await fs.getDoc(budgetPath);
      const budgetBytes = safeBytes(budget?.["budgetBytes"]);
      const usedBytes = safeBytes(budget?.["usedBytes"]);
      if (budgetBytes < 1) throw new ApiError(507, "STORAGE_REPLICA_BUDGET_EMPTY", "There is not enough spare storage capacity for additional film copies.");
      const desiredCount = body.movePrimary ? 1 : Math.max(0, body.replicaCount - existingReplicas.length);
      const availableBytes = Math.max(0, budgetBytes - usedBytes);
      const budgetCount = Math.floor(availableBytes / streamBytes);
      const queueCount = Math.min(desiredCount, budgetCount, 8 - existingReplicas.length);
      if (queueCount < 1) throw new ApiError(507, "STORAGE_REPLICA_BUDGET_EMPTY", "The spare storage allowance is full or too small for another complete film copy.");

      const targetReservations: Array<{ destinationId: string; reservationId: string }> = [];
      const excludedDestinations = [...excludeDestinationIds];
      const excludedGroups = [...excludeAccountGroups];
      for (let index = 0; index < queueCount; index++) {
        const reservationId = "replica-" + crypto.randomUUID().replace(/-/g, "");
        try {
          const reservation = await reserveStorageDestination(fs, {
            purpose: "hls_streaming",
            incomingBytes: streamBytes,
            reservationId,
            assetId: body.assetId,
            excludeDestinationIds: excludedDestinations,
            excludeAccountGroups: excludedGroups,
          });
          targetReservations.push({ destinationId: reservation.destinationId, reservationId });
          reservations.push(reservationId);
          excludedDestinations.push(reservation.destinationId);
          const target = await fs.getDoc("storageDestinations/" + reservation.destinationId);
          if (typeof target?.["accountGroup"] === "string") excludedGroups.push(target["accountGroup"]);
        } catch (error) {
          if (targetReservations.length === 0) throw error;
          break;
        }
      }
      if (targetReservations.length === 0) throw new ApiError(507, "STORAGE_REPLICA_TARGETS_UNAVAILABLE", "No separate healthy storage account has enough room for a complete copy.");

      const requestedBudgetBytes = streamBytes * targetReservations.length;
      if (!Number.isSafeInteger(requestedBudgetBytes)) throw new ApiError(413, "STORAGE_REPLICA_BUDGET_INVALID", "The requested copy size is too large.");
      await fs.transact([budgetPath], docs => {
        const current = docs[0];
        const currentBudget = safeBytes(current?.["budgetBytes"]);
        const currentUsed = safeBytes(current?.["usedBytes"]);
        if (currentUsed + requestedBudgetBytes > currentBudget) {
          throw new ApiError(409, "STORAGE_REPLICA_BUDGET_CHANGED", "The spare storage allowance changed; retry after the pool refreshes.");
        }
        return {
          result: undefined,
          writes: [{
            update: {
              name: fs.docName(budgetPath),
              fields: encodeFields({
                usedBytes: currentUsed + requestedBudgetBytes,
                updatedAt: new Date().toISOString(),
              }),
            },
            updateMask: { fieldPaths: ["usedBytes", "updatedAt"] },
          }],
        };
      });
      budgetReserved = requestedBudgetBytes;

      const now = new Date().toISOString();
      const taskIds = targetReservations.map(() => "replica-" + crypto.randomUUID().replace(/-/g, "").slice(0, 24));
      const writes: FirestoreWrite[] = targetReservations.map((target, index) => ({
        update: {
          name: fs.docName("videoMaintenanceJobs/" + taskIds[index]),
          fields: encodeFields({
            taskType: body.movePrimary ? "storage_rebalance" : "storage_replica_copy",
            payload: {
              switchPrimary: body.movePrimary,
              assetId: body.assetId,
              sourceDestinationId,
              targetDestinationId: target.destinationId,
              sourcePrefix: objectPrefix,
              targetPrefix: objectPrefix,
              reservationId: target.reservationId,
              streamBytes,
              phase: "files",
              listingCursor: null,
              pendingKeys: [],
              pendingIndex: 0,
              copiedBytes: 0,
              copiedObjectCount: 0,
              verifyCursor: null,
              verifiedBytes: 0,
              verifiedObjectCount: 0,
            },
            status: "queued", attempts: 0, reason: body.reason,
            createdBy: user.uid, createdAt: now, updatedAt: now,
          }),
        },
        currentDocument: { exists: false },
      }));
      writes.push({
        update: {
          name: fs.docName(assetPath),
          fields: encodeFields({
            popular: true, popularMarkedBy: user.uid,
            popularMarkedAt: now, popularReason: body.reason,
            replicaCountRequested: body.replicaCount,
          }),
        },
        updateMask: { fieldPaths: ["popular", "popularMarkedBy", "popularMarkedAt", "popularReason", "replicaCountRequested"] },
      });
      await fs.commit(writes);
      await writeAuditLog(fs, {
        actorUid: user.uid, action: "storage.asset_replication_queued",
        targetType: "contentAsset", targetId: body.assetId, reason: body.reason,
        metadata: {
          targetCount: targetReservations.length,
          targetDestinationIds: targetReservations.map(item => item.destinationId),
          requestedBytes: requestedBudgetBytes,
          poolFreeBytes: totalFreeBytes,
          replicaBudgetBytes: budgetBytes,
        },
      });
      return Response.json({
        updated: true, popular: true,
        queuedCount: targetReservations.length,
        taskIds,
        note: body.movePrimary
          ? "A complete copy is queued. The primary changes only after every copied file is verified and its reservation is committed; the old copy is retained."
          : "Complete copies are queued on the maintenance worker. The primary remains unchanged until each copy is verified.",
      }, { status: 202 });
    } catch (error) {
      for (const reservationId of reservations) await releaseStorageReservation(fs, reservationId).catch(() => undefined);
      if (budgetReserved > 0) {
        await fs.transact(["storageReplicaBudget/global"], docs => {
          const current = docs[0];
          if (!current) return { result: undefined, writes: [] };
          const next = Math.max(0, safeBytes(current["usedBytes"]) - budgetReserved);
          return {
            result: undefined,
            writes: [{
              update: { name: fs.docName("storageReplicaBudget/global"), fields: encodeFields({ usedBytes: next, updatedAt: new Date().toISOString() }) },
              updateMask: { fieldPaths: ["usedBytes", "updatedAt"] },
            }],
          };
        }).catch(() => undefined);
      }
      return errorBody(error);
    }
  } } },
});
