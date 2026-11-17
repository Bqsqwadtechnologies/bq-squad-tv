import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore, encodeFields, type FirestoreWrite } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";
import { requireVideoWorker } from "@/lib/server/video-worker-auth";

function isoWeekKey(now: Date): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return year + "-W" + String(week).padStart(2, "0");
}

export const Route = createFileRoute("/api/public/v1/worker/maintenance/schedule")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const fs = await Firestore.create();
      await requireVideoWorker(request, fs);
      const scheduleKey = isoWeekKey(new Date());
      const [destinations, existing] = await Promise.all([
        fs.query("storageDestinations", { limit: 500 }),
        fs.query("videoMaintenanceJobs", {
          filters: [{ field: "scheduleKey", op: "EQUAL", value: scheduleKey }],
          limit: 500,
        }),
      ]);
      const alreadyQueued = new Set(existing.map(row => row["destinationId"]).filter((id): id is string => typeof id === "string"));
      const pending = destinations.filter(row => !alreadyQueued.has(row.__id));
      const now = new Date().toISOString();
      const writes: FirestoreWrite[] = pending.map(row => {
        const taskId = "storage-weekly-" + scheduleKey + "-" + row.__id;
        return {
          update: {
            name: fs.docName("videoMaintenanceJobs/" + taskId),
            fields: encodeFields({
              taskType: "storage_health_usage",
              destinationId: row.__id,
              scheduleKey,
              payload: { destinationId: row.__id },
              status: "queued",
              attempts: 0,
              reason: "Weekly storage health and usage reconciliation",
              createdAt: now,
              updatedAt: now,
            }),
          },
          currentDocument: { exists: false },
        };
      });
      if (writes.length) {
        try {
          await fs.commit(writes);
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 409) throw error;
          const refreshed = await fs.query("videoMaintenanceJobs", {
            filters: [{ field: "scheduleKey", op: "EQUAL", value: scheduleKey }],
            limit: 500,
          });
          const ids = new Set(refreshed.map(row => row["destinationId"]));
          const retry = pending.filter(row => !ids.has(row.__id));
          const retryWrites = retry.map(row => {
            const taskId = "storage-weekly-" + scheduleKey + "-" + row.__id;
            return {
              update: {
                name: fs.docName("videoMaintenanceJobs/" + taskId),
                fields: encodeFields({
                  taskType: "storage_health_usage", destinationId: row.__id, scheduleKey,
                  payload: { destinationId: row.__id }, status: "queued", attempts: 0,
                  reason: "Weekly storage health and usage reconciliation",
                  createdAt: now, updatedAt: now,
                }),
              },
              currentDocument: { exists: false },
            } satisfies FirestoreWrite;
          });
          if (retryWrites.length) await fs.commit(retryWrites);
        }
      }
      const orphanDestinations = destinations.filter(row =>
        row["purpose"] === "hls_streaming" &&
        !["legacy_lovable_source", "legacy_lovable_streaming", "lovable-source-legacy", "lovable-stream-legacy"].includes(row.__id) &&
        row["enabled"] === true &&
        row["mode"] === "active",
      );
      const orphanWrites: FirestoreWrite[] = orphanDestinations.map(row => {
        const taskId = "storage-orphan-" + scheduleKey + "-" + row.__id;
        return {
          update: {
            name: fs.docName("videoMaintenanceJobs/" + taskId),
            fields: encodeFields({
              taskType: "storage_orphan_scan",
              destinationId: row.__id,
              scheduleKey,
              payload: { destinationId: row.__id, prefix: "hls", cursor: null, pendingKeys: [], pendingIndex: 0 },
              status: "queued",
              attempts: 0,
              reason: "Weekly scan for unreferenced streaming files",
              createdAt: now,
              updatedAt: now,
            }),
          },
          currentDocument: { exists: false },
        };
      });
      let orphanQueuedCount = 0;
      if (orphanWrites.length) {
        try {
          await fs.commit(orphanWrites);
          orphanQueuedCount = orphanWrites.length;
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 409) throw error;
          // Deterministic weekly task IDs make repeated scheduling idempotent.
        }
      }
      const sourceDestinations = destinations.filter(row =>
        row["purpose"] === "source_media" &&
        !["legacy_lovable_source", "legacy_lovable_streaming", "lovable-source-legacy", "lovable-stream-legacy"].includes(row.__id) &&
        row["enabled"] === true &&
        row["mode"] === "active",
      );
      const sourceRetentionWrites: FirestoreWrite[] = sourceDestinations.map(row => {
        const taskId = "storage-source-retention-" + scheduleKey + "-" + row.__id;
        return {
          update: {
            name: fs.docName("videoMaintenanceJobs/" + taskId),
            fields: encodeFields({
              taskType: "storage_source_retention",
              destinationId: row.__id,
              scheduleKey,
              payload: { destinationId: row.__id, processedAssetIds: [] },
              status: "queued",
              attempts: 0,
              reason: "Weekly original-upload retention review",
              createdAt: now,
              updatedAt: now,
            }),
          },
          currentDocument: { exists: false },
        };
      });
      let sourceRetentionQueuedCount = 0;
      if (sourceRetentionWrites.length) {
        try {
          await fs.commit(sourceRetentionWrites);
          sourceRetentionQueuedCount = sourceRetentionWrites.length;
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 409) throw error;
        }
      }
      const drainingDestinations = destinations.filter(row =>
        row["purpose"] === "hls_streaming" &&
        !["legacy_lovable_source", "legacy_lovable_streaming", "lovable-source-legacy", "lovable-stream-legacy"].includes(row.__id) &&
        row["enabled"] === true &&
        row["mode"] === "drain",
      );
      const drainWrites: FirestoreWrite[] = drainingDestinations.map(row => {
        const taskId = "storage-drain-" + scheduleKey + "-" + row.__id;
        return {
          update: {
            name: fs.docName("videoMaintenanceJobs/" + taskId),
            fields: encodeFields({
              taskType: "storage_destination_drain",
              destinationId: row.__id,
              scheduleKey,
              payload: { destinationId: row.__id, cursorValue: null, cursorId: null },
              status: "queued",
              attempts: 0,
              reason: "Move every film from a draining storage location to verified healthy storage",
              createdAt: now,
              updatedAt: now,
            }),
          },
          currentDocument: { exists: false },
        };
      });
      let drainQueuedCount = 0;
      if (drainWrites.length) {
        try {
          await fs.commit(drainWrites);
          drainQueuedCount = drainWrites.length;
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 409) throw error;
        }
      }
      const backupDestinations = process.env["CONFIG_BACKUP_KEY"] && process.env["CONFIG_BACKUP_KEY"].length >= 32
        ? destinations.filter(row => row["purpose"] === "backup" && row["enabled"] === true && row["mode"] === "active" && row["healthStatus"] === "healthy")
        : [];
      const backupWrites: FirestoreWrite[] = backupDestinations.map(row => {
        const taskId = "storage-backup-" + scheduleKey + "-" + row.__id;
        return {
          update: {
            name: fs.docName("videoMaintenanceJobs/" + taskId),
            fields: encodeFields({
              taskType: "storage_config_backup",
              destinationId: row.__id,
              scheduleKey,
              payload: { destinationId: row.__id, scheduleKey },
              status: "queued",
              attempts: 0,
              reason: "Weekly encrypted storage configuration backup",
              createdAt: now,
              updatedAt: now,
            }),
          },
          currentDocument: { exists: false },
        };
      });
      let backupQueuedCount = 0;
      if (backupWrites.length) {
        try {
          await fs.commit(backupWrites);
          backupQueuedCount = backupWrites.length;
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 409) throw error;
        }
      }
      return Response.json({
        scheduled: true,
        scheduleKey,
        queuedCount: pending.length,
        orphanScanQueuedCount: orphanQueuedCount,
        sourceRetentionQueuedCount,
        drainQueuedCount,
        backupQueuedCount,
        backupDisabledReason: backupQueuedCount === 0
          ? (!process.env["CONFIG_BACKUP_KEY"] ? "private_backup_setting_missing" : backupDestinations.length === 0 ? "no_healthy_backup_location" : "already_scheduled")
          : null,
      });
    } catch (error) { return errorBody(error); }
  } } },
});
