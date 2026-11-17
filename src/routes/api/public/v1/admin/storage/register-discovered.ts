import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields, type FirestoreWrite } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { discoverStorageDestinations, storageMetadataFromDiscovery } from "@/lib/server/storage/discovery";
import { writeAuditLog } from "@/lib/server/audit";
import { rebuildStoragePoolIndex } from "@/lib/server/storage/pool-index";

const bodySchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  destinationIds: z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/)).max(500).optional(),
}).strict();

function requireStepUp(authTime: number): void {
  const age = Math.floor(Date.now() / 1000) - authTime;
  if (!Number.isSafeInteger(authTime) || age < 0 || age > 300) {
    throw new ApiError(401, "STEP_UP_REQUIRED", "Sign in again to confirm this sensitive storage action.");
  }
}

export const Route = createFileRoute("/api/public/v1/admin/storage/register-discovered")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const user = await requireUser(request);
      requireStepUp(user.authTime);
      const body = await parseBody(request, bodySchema);
      const fs = await Firestore.create();
      const access = await requireAdminModule(fs, user, "system");
      if (!access.isZillionaireOwner) throw new ApiError(403, "OWNER_ONLY", "Only the protected platform owner can register discovered storage locations.");

      const rows = await fs.query("storageDestinations", { limit: 500 });
      const registered = new Set(rows.map(row => row.__id));
      const discovery = await discoverStorageDestinations(process.env, registered);
      const requested = body.destinationIds
        ? new Set(body.destinationIds)
        : new Set(discovery.destinations.map(item => item.destinationId));
      const discoveredById = new Map(discovery.destinations.map(item => [item.destinationId, item]));
      for (const id of requested) {
        if (!registered.has(id) && !discoveredById.has(id)) {
          throw new ApiError(400, "STORAGE_DESTINATION_NOT_DISCOVERED", "One or more selected storage locations no longer have valid connection settings.");
        }
      }

      const selected = [...requested].filter(id => !registered.has(id))
        .map(id => discoveredById.get(id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      if (selected.length > 500) throw new ApiError(413, "STORAGE_REGISTER_LIMIT", "Register up to 500 storage locations per request.");

      const now = new Date().toISOString();
      const writes: FirestoreWrite[] = selected.map(item => {
        const metadata = storageMetadataFromDiscovery(item);
        return {
          update: {
            name: fs.docName("storageDestinations/" + metadata.destinationId),
            fields: encodeFields({
              ...metadata,
              usageBytes: null,
              usageSource: null,
              usageCheckedAt: null,
              reservedBytes: 0,
              healthStatus: "unknown",
              healthCheckedAt: null,
              lastErrorCode: null,
              degradedUntil: null,
              egressMonthBytes: 0,
              egressDayBytes: 0,
              createdAt: now,
              updatedAt: now,
              updatedBy: user.uid,
            }),
          },
          currentDocument: { exists: false },
        };
      });

      // Firestore accepts at most 500 writes per commit. A concurrent registration
      // is re-read and skipped rather than overwriting the winning document.
      const created: string[] = [];
      const skipped = [...requested].filter(id => registered.has(id));
      if (writes.length) {
        try {
          await fs.commit(writes);
          created.push(...selected.map(item => item.destinationId));
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 409) throw error;
          const refreshed = await fs.query("storageDestinations", { limit: 500 });
          const nowRegistered = new Set(refreshed.map(row => row.__id));
          const retryItems = selected.filter(item => !nowRegistered.has(item.destinationId));
          skipped.push(...selected.filter(item => nowRegistered.has(item.destinationId)).map(item => item.destinationId));
          if (retryItems.length) {
            const retryWrites: FirestoreWrite[] = retryItems.map(item => {
              const metadata = storageMetadataFromDiscovery(item);
              return {
                update: {
                  name: fs.docName("storageDestinations/" + metadata.destinationId),
                  fields: encodeFields({
                    ...metadata, usageBytes: null, usageSource: null, usageCheckedAt: null,
                    reservedBytes: 0, healthStatus: "unknown", healthCheckedAt: null,
                    lastErrorCode: null, degradedUntil: null, egressMonthBytes: 0, egressDayBytes: 0,
                    createdAt: now, updatedAt: now, updatedBy: user.uid,
                  }),
                },
                currentDocument: { exists: false },
              };
            });
            await fs.commit(retryWrites);
            created.push(...retryItems.map(item => item.destinationId));
          }
        }
      }

      await rebuildStoragePoolIndex(fs);
      await writeAuditLog(fs, {
        actorUid: user.uid,
        action: "storage.destinations_discovered_registered",
        targetType: "storageDestinationPool",
        targetId: "storageDestinations",
        reason: body.reason,
        metadata: {
          requestedCount: requested.size,
          createdCount: created.length,
          skippedCount: skipped.length,
          createdIds: created,
          skippedIds: skipped,
          paidEgressEnabled: false,
        },
      });
      return Response.json({
        registered: true,
        created,
        skipped,
        counts: { requested: requested.size, created: created.length, skipped: skipped.length },
        note: "Locations were registered as unverified. Usage and health must be checked before they can receive new files.",
      }, { status: created.length ? 201 : 200, headers: { "cache-control": "no-store" } });
    } catch (error) { return errorBody(error); }
  } } },
});
