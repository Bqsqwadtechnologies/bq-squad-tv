import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { validateStorageDestinationMetadata, redactStorageDestination, resolveStorageDestinationConfiguration } from "@/lib/server/storage/registry";
import { writeAuditLog } from "@/lib/server/audit";

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
  paidEgressEnabled: z.boolean().default(false),
  freeEgressBudgetBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().default(null),
});
const bodySchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  destinations: z.array(metadataSchema).min(1).max(18),
});

export const Route = createFileRoute("/api/public/v1/admin/storage/seed")({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const body = await parseBody(request, bodySchema);
        const fs = await Firestore.create();
        const access = await requireAdminModule(fs, user, "system");
        if (!access.isSuperAdmin) throw new ApiError(403, "OWNER_ONLY", "Only the protected platform owner can seed storage metadata.");
        const ids = body.destinations.map(item => item.destinationId);
        if (new Set(ids).size !== ids.length) throw new ApiError(400, "DUPLICATE_DESTINATION", "Destination IDs must be unique in a seed request.");
        const created: string[] = [];
        const skipped: string[] = [];
        for (const raw of body.destinations) {
          const metadata = validateStorageDestinationMetadata(raw);
          const now = new Date().toISOString();
          const result = await fs.transact(["storageDestinations/" + metadata.destinationId], docs => {
            if (docs[0]) return { result: false, writes: [] };
            return {
              result: true,
              writes: [{
                update: {
                  name: fs.docName("storageDestinations/" + metadata.destinationId),
                  fields: {
                    destinationId: { stringValue: metadata.destinationId },
                    providerType: { stringValue: metadata.providerType },
                    accountAlias: { stringValue: metadata.accountAlias },
                    secretPrefix: { stringValue: metadata.secretPrefix },
                    bucketName: { stringValue: metadata.bucketName },
                    region: { stringValue: metadata.region },
                    purpose: { stringValue: metadata.purpose },
                    softCapBytes: { integerValue: String(metadata.softCapBytes) },
                    dailyEgressCapBytes: metadata.dailyEgressCapBytes === null ? { nullValue: null } : { integerValue: String(metadata.dailyEgressCapBytes) },
                    priority: { integerValue: String(metadata.priority) },
                    enabled: { booleanValue: metadata.enabled },
                    accountGroup: { stringValue: metadata.accountGroup },
                    mode: { stringValue: metadata.mode },
                    replicaOf: metadata.replicaOf === null ? { nullValue: null } : { stringValue: metadata.replicaOf },
                    usageBytes: { nullValue: null },
                    usageSource: { nullValue: null },
                    healthStatus: { stringValue: "unknown" },
                    createdAt: { stringValue: now },
                    updatedAt: { stringValue: now },
                    updatedBy: { stringValue: user.uid },
                  },
                },
              }],
            };
          });
          (result ? created : skipped).push(metadata.destinationId);
        }
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
