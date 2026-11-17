import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import {
  redactStorageDestination,
  resolveStorageDestinationConfiguration,
  validateStorageDestinationMetadata,
} from "@/lib/server/storage/registry";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({
  destinationId: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
  providerType: z.enum(["lovable_storage", "backblaze_b2"]),
  accountAlias: z.string().min(2).max(80),
  secretPrefix: z.string().regex(/^[A-Z][A-Z0-9_]{1,47}$/),
  bucketName: z.string().min(2).max(64),
  region: z.string().min(1).max(80),
  purpose: z.enum(["source_media", "hls_streaming", "posters", "thumbnails", "downloads", "temporary", "backup", "producer_verification"]),
  accountGroup: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9:_-]{1,99}$/).optional(),
  mode: z.enum(["active", "drain", "retired"]).default("active"),
  replicaOf: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/).nullable().default(null),
  softCapBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  accountCapBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().default(null),
  dailyEgressCapBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().default(null),
  priority: z.number().int().min(0).max(10000).default(100),
  enabled: z.boolean().default(true),
  paidEgressEnabled: z.boolean().default(false),
  freeEgressBudgetBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().default(null),
});

export const Route = createFileRoute("/api/public/v1/admin/storage/destinations")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const fs = await Firestore.create();
        const access = await requireAdminModule(fs, user, "system");
        if (!access.isZillionaireOwner) throw new ApiError(403, "OWNER_ONLY", "Only the Zillionaire owner can manage storage destinations.");
        const rows = await fs.query("storageDestinations", { limit: 500, orderByField: "priority" });
        const destinations = rows.map(row => {
          const { __id, ...metadata } = row;
          const normalized = validateStorageDestinationMetadata({ ...metadata, destinationId: __id });
          return redactStorageDestination(resolveStorageDestinationConfiguration(normalized));
        });
        return Response.json({ destinations });
      } catch (error) {
        return errorBody(error);
      }
    },
    PUT: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const body = await parseBody(request, schema);
        const fs = await Firestore.create();
        const access = await requireAdminModule(fs, user, "system");
        if (!access.isZillionaireOwner) throw new ApiError(403, "OWNER_ONLY", "Only the Zillionaire owner can manage storage destinations.");
        const metadata = validateStorageDestinationMetadata(body);
        const configuration = resolveStorageDestinationConfiguration(metadata);
        const now = new Date().toISOString();
        await fs.transact(["storageDestinations/" + metadata.destinationId], docs => {
          const current = docs[0];
          const createdAt = typeof current?.["createdAt"] === "string" ? current["createdAt"] : now;
          return {
            result: undefined,
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
                  accountCapBytes: metadata.accountCapBytes == null ? { nullValue: null } : { integerValue: String(metadata.accountCapBytes) },
                  dailyEgressCapBytes: metadata.dailyEgressCapBytes === null
                    ? { nullValue: null } : { integerValue: String(metadata.dailyEgressCapBytes) },
                  priority: { integerValue: String(metadata.priority) },
                  enabled: { booleanValue: metadata.enabled },
                  paidEgressEnabled: { booleanValue: metadata.paidEgressEnabled ?? false },
                  freeEgressBudgetBytes: metadata.freeEgressBudgetBytes == null ? { nullValue: null } : { integerValue: String(metadata.freeEgressBudgetBytes) },
                  accountGroup: { stringValue: metadata.accountGroup },
                  mode: { stringValue: metadata.mode },
                  replicaOf: metadata.replicaOf === null ? { nullValue: null } : { stringValue: metadata.replicaOf },
                  healthStatus: { stringValue: "unknown" },
                  healthCheckedAt: { nullValue: null },
                  lastErrorCode: { nullValue: null },
                  createdAt: { stringValue: createdAt },
                  updatedAt: { stringValue: now },
                  updatedBy: { stringValue: user.uid },
                },
              },
              updateMask: { fieldPaths: [
                "destinationId", "providerType", "accountAlias", "secretPrefix", "bucketName", "region",
                "purpose", "softCapBytes", "accountCapBytes", "dailyEgressCapBytes", "priority", "enabled",
                "paidEgressEnabled", "freeEgressBudgetBytes", "accountGroup", "mode", "replicaOf",
                "healthStatus", "healthCheckedAt", "lastErrorCode", "createdAt", "updatedAt", "updatedBy",
              ] },
            }],
          };
        });
        await writeAuditLog(fs, {
          actorUid: user.uid,
          action: "storage.destination_configured",
          targetType: "storageDestination",
          targetId: metadata.destinationId,
          reason: "Owner configured a storage destination",
          metadata: {
            providerType: metadata.providerType,
            accountAlias: metadata.accountAlias,
            bucketName: metadata.bucketName,
            purpose: metadata.purpose,
            enabled: metadata.enabled,
            configurationStatus: configuration.configurationStatus,
          },
        });
        return Response.json({
          saved: true,
          destination: redactStorageDestination(configuration),
          note: "Credentials are resolved only from server environment secrets. This endpoint registers metadata; it does not yet perform provider uploads or usage discovery.",
        });
      } catch (error) {
        return errorBody(error);
      }
    },
  } },
});
