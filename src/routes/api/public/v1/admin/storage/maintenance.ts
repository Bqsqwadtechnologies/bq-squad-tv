import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields, type FirestoreWrite } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const bodySchema = z.object({
  scope: z.enum(["all", "destination", "group"]),
  destinationId: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/).optional(),
  accountGroup: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9:_-]{1,99}$/).optional(),
  reason: z.string().trim().min(3).max(1000),
}).strict();

function requireStepUp(authTime: number): void {
  const age = Math.floor(Date.now() / 1000) - authTime;
  if (!Number.isSafeInteger(authTime) || age < 0 || age > 300) {
    throw new ApiError(401, "STEP_UP_REQUIRED", "Sign in again to confirm this sensitive storage action.");
  }
}

export const Route = createFileRoute("/api/public/v1/admin/storage/maintenance")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const user = await requireUser(request);
      requireStepUp(user.authTime);
      const body = await parseBody(request, bodySchema);
      if ((body.scope === "destination" && !body.destinationId) ||
          (body.scope === "group" && !body.accountGroup) ||
          (body.scope !== "destination" && body.destinationId) ||
          (body.scope !== "group" && body.accountGroup)) {
        throw new ApiError(400, "STORAGE_MAINTENANCE_SCOPE_INVALID", "Choose one valid storage location or account group.");
      }
      const fs = await Firestore.create();
      const access = await requireAdminModule(fs, user, "system");
      if (!access.isZillionaireOwner) throw new ApiError(403, "OWNER_ONLY", "Only the Zillionaire owner can run storage maintenance.");
      const rows = await fs.query("storageDestinations", { limit: 500 });
      const selected = rows.filter(row =>
        body.scope === "all" ||
        (body.scope === "destination" && row.__id === body.destinationId) ||
        (body.scope === "group" && row["accountGroup"] === body.accountGroup),
      );
      if (body.scope === "destination" && selected.length !== 1) {
        throw new ApiError(404, "STORAGE_DESTINATION_NOT_FOUND", "The storage location could not be found.");
      }
      if (body.scope === "group" && selected.length === 0) {
        throw new ApiError(404, "STORAGE_ACCOUNT_GROUP_NOT_FOUND", "The storage group could not be found.");
      }
      if (selected.length > 500) throw new ApiError(413, "STORAGE_MAINTENANCE_LIMIT", "Run maintenance for up to 500 locations per request.");
      const now = new Date().toISOString();
      const taskIds = selected.map(row => "storage-" + row.__id + "-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12));
      const writes: FirestoreWrite[] = selected.map((row, index) => ({
        update: {
          name: fs.docName("videoMaintenanceJobs/" + taskIds[index]),
          fields: encodeFields({
            taskType: "storage_health_usage",
            payload: { destinationId: row.__id },
            status: "queued",
            attempts: 0,
            reason: body.reason,
            createdBy: user.uid,
            createdAt: now,
            updatedAt: now,
          }),
        },
        currentDocument: { exists: false },
      }));
      if (writes.length) await fs.commit(writes);
      await writeAuditLog(fs, {
        actorUid: user.uid,
        action: "storage.maintenance_queued",
        targetType: "storageDestinationPool",
        targetId: body.scope === "destination" ? body.destinationId! : body.scope === "group" ? body.accountGroup! : "all",
        reason: body.reason,
        metadata: { scope: body.scope, destinationCount: selected.length, taskIds },
      });
      return Response.json({
        queued: true,
        taskIds,
        count: taskIds.length,
        note: "Checks are queued for the existing maintenance worker. Locations remain unavailable for new assignments until their health and usage are confirmed.",
      }, { status: 202, headers: { "cache-control": "no-store" } });
    } catch (error) { return errorBody(error); }
  } } },
});
