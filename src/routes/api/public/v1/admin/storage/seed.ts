import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields, type FirestoreWrite } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { validateStorageDestinationMetadata, redactStorageDestination, resolveStorageDestinationConfiguration } from "@/lib/server/storage/registry";
import { writeAuditLog } from "@/lib/server/audit";
import { rebuildStoragePoolIndex } from "@/lib/server/storage/pool-index";

const metadataSchema = z.object({
  destinationId: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
  providerType: z.enum(["lovable_storage", "backblaze_b2"]),
  accountAlias: z.string().min(2).max(80),
  secretPrefix: z.string().regex(/^[A-Z][A-Z0-9_]{1,47}$/),
  bucketName: z.string().min(2).max(64),
  region: z.string().min(1).max(80),
  purpose: z.enum(["source_media", "hls_streaming", "posters", "thumbnails", "downloads", "temporary", "backup", "producer_verification"]),
  accountGroup: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9:_-]{1,99}$/),
  mode: z.enum(["active", "drain", "retired"]),
  replicaOf: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/).nullable(),
  softCapBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  accountCapBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().default(null),
  dailyEgressCapBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  priority: z.number().int().min(0).max(10000),
  enabled: z.boolean(),
  paidEgressEnabled: z.literal(false).default(false),
  freeEgressBudgetBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().default(null),
});
const bodySchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  destinations: z.array(metadataSchema).min(1).max(500),
});

export const Route = createFileRoute("/api/public/v1/admin/storage/seed")({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const body = await parseBody(request, bodySchema);
        const fs = await Firestore.create();
        const access = await requireAdminModule(fs, user, "system");
        if (!access.isZillionaireOwner) throw new ApiError(403, "OWNER_ONLY", "Only the Zillionaire owner can seed storage metadata.");
        const ids = body.destinations.map(item => item.destinationId);
        if (new Set(ids).size !== ids.length) throw new ApiError(400, "DUPLICATE_DESTINATION", "Destination IDs must be unique in a seed request.");
        const existingRows = await fs.query("storageDestinations", { limit: 500 });
        const existingIds = new Set(existingRows.map(row => row.__id));
        const created: string[] = [];
        const skipped: string[] = ids.filter(id => existingIds.has(id));
        const pending = body.destinations.filter(item => !existingIds.has(item.destinationId));
        const now = new Date().toISOString();
        const writes: FirestoreWrite[] = pending.map(raw => {
          const metadata = validateStorageDestinationMetadata(raw);
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
                createdAt: now,
                updatedAt: now,
                updatedBy: user.uid,
              }),
            },
            currentDocument: { exists: false },
          };
        });
        if (writes.length) {
          try {
            await fs.commit(writes);
            created.push(...pending.map(item => item.destinationId));
          } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 409) throw error;
            const refreshed = await fs.query("storageDestinations", { limit: 500 });
            const refreshedIds = new Set(refreshed.map(row => row.__id));
            const retry = pending.filter(item => !refreshedIds.has(item.destinationId));
            skipped.push(...pending.filter(item => refreshedIds.has(item.destinationId)).map(item => item.destinationId));
            if (retry.length) {
              const retryWrites: FirestoreWrite[] = retry.map(raw => {
                const metadata = validateStorageDestinationMetadata(raw);
                return {
                  update: {
                    name: fs.docName("storageDestinations/" + metadata.destinationId),
                    fields: encodeFields({
                      ...metadata, usageBytes: null, usageSource: null, usageCheckedAt: null,
                      reservedBytes: 0, healthStatus: "unknown", healthCheckedAt: null,
                      lastErrorCode: null, degradedUntil: null, createdAt: now,
                      updatedAt: now, updatedBy: user.uid,
                    }),
                  },
                  currentDocument: { exists: false },
                };
              });
              await fs.commit(retryWrites);
              created.push(...retry.map(item => item.destinationId));
            }
          }
        }
        await rebuildStoragePoolIndex(fs);
        await writeAuditLog(fs, {
          actorUid: user.uid,
          action: "storage.destinations_seeded",
          targetType: "storageDestinationPool",
          targetId: "storageDestinations",
          reason: body.reason,
          metadata: { requested: body.destinations.length, createdCount: created.length, skippedCount: skipped.length, createdIds: created, skippedIds: skipped },
        });
        const destinations = body.destinations.filter(item => created.includes(item.destinationId)).map(item => redactStorageDestination(resolveStorageDestinationConfiguration(validateStorageDestinationMetadata(item))));
        return Response.json({ seeded: true, created, skipped, destinations, note: "This seeds Firestore metadata only. It does not create provider buckets, verify account separation, or mark destinations healthy." }, { status: 201 });
      } catch (error) {
        return errorBody(error);
      }
    },
  } },
});
