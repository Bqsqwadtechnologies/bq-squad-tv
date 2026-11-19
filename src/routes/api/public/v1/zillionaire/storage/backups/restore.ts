import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { decryptStorageConfigurationBackup } from "@/lib/server/storage/config-backup";
import { createStorageProviderAdapter } from "@/lib/server/storage/providers";
import {
  resolveStorageDestinationConfiguration,
  validateStorageDestinationMetadata,
} from "@/lib/server/storage/registry";
import { rebuildStoragePoolIndex } from "@/lib/server/storage/pool-index";
import { assertStorageObjectKey } from "@/lib/server/storage/ledger";

const schema = z
  .object({
    action: z.enum(["preview", "apply"]),
    destinationId: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
    objectKey: z.string().min(20).max(512),
    ticketId: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

async function fingerprint(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/v1/zillionaire/storage/backups/restore")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const age = Math.floor(Date.now() / 1000) - user.authTime;
          if (!Number.isSafeInteger(user.authTime) || age < 0 || age > 300) {
            throw new ApiError(
              401,
              "STEP_UP_REQUIRED",
              "Sign in again before restoring storage settings.",
            );
          }
          const body = await parseBody(request, schema);
          if (
            !body.objectKey.startsWith("config-backups/") ||
            !body.objectKey.endsWith(".json.enc")
          ) {
            throw new ApiError(
              400,
              "STORAGE_BACKUP_PATH_INVALID",
              "Choose an encrypted configuration backup file.",
            );
          }
          assertStorageObjectKey(body.objectKey);
          const fs = await Firestore.create();
          const access = await requireZillionaireModule(fs, user, "system");
          if (!access.isZillionaireOwner)
            throw new ApiError(
              403,
              "OWNER_ONLY",
              "Only the Zillionaire owner can restore storage settings.",
            );
          const raw = await fs.getDoc("storageDestinations/" + body.destinationId);
          if (!raw)
            throw new ApiError(
              404,
              "STORAGE_BACKUP_DESTINATION_MISSING",
              "The backup location could not be found.",
            );
          const metadata = validateStorageDestinationMetadata({
            ...raw,
            destinationId: body.destinationId,
          });
          if (metadata.purpose !== "backup" || metadata.mode !== "active" || !metadata.enabled) {
            throw new ApiError(
              409,
              "STORAGE_BACKUP_DESTINATION_UNAVAILABLE",
              "The selected backup location is not active.",
            );
          }
          const config = resolveStorageDestinationConfiguration(metadata);
          if (config.configurationStatus !== "configured")
            throw new ApiError(
              503,
              "STORAGE_BACKUP_DESTINATION_MISCONFIGURED",
              "The backup location needs its connection settings checked.",
            );
          const encrypted = await createStorageProviderAdapter(config).getObject(body.objectKey);
          if (encrypted.info.sizeBytes > 10_500_000)
            throw new ApiError(
              413,
              "STORAGE_BACKUP_TOO_LARGE",
              "The selected backup exceeds the restore size limit.",
            );
          const serialized = new TextDecoder().decode(encrypted.body);
          const backupKey = process.env["CONFIG_BACKUP_KEY"];
          if (!backupKey)
            throw new ApiError(
              503,
              "STORAGE_BACKUP_KEY_MISSING",
              "The private backup setting is not configured.",
            );
          const backup = await decryptStorageConfigurationBackup(serialized, backupKey);
          const digest = await fingerprint(serialized);
          const now = new Date().toISOString();

          if (body.action === "preview") {
            const ticketId = crypto.randomUUID().replace(/-/g, "");
            await fs.setDoc(
              "storageRestoreApprovals/" + ticketId,
              {
                actorUid: user.uid,
                destinationId: body.destinationId,
                objectKey: body.objectKey,
                backupDigest: digest,
                status: "previewed",
                expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
                reason: body.reason,
                createdAt: now,
              },
              { mustNotExist: true },
            );
            return Response.json({
              previewed: true,
              ticketId,
              expiresInSeconds: 600,
              counts: {
                destinations: backup.destinations.length,
                poolIndexSnapshots: backup.poolIndex.length,
                assetBindings: backup.assetBindings.length,
                egressLedgerSnapshots: backup.egressLedgers.length,
              },
              applyScope:
                "Existing non-legacy destination settings only. Current connection-setting references are preserved. Playback bindings and delivery ledgers are not overwritten; fresh usage reconciliation is required after restore.",
              protectedLocations: ["legacy_lovable_source", "legacy_lovable_streaming"],
            });
          }

          if (!body.ticketId)
            throw new ApiError(
              400,
              "STORAGE_RESTORE_TICKET_REQUIRED",
              "Preview this backup before applying it.",
            );
          const ticketPath = "storageRestoreApprovals/" + body.ticketId;
          const ticket = await fs.getDoc(ticketPath);
          if (
            !ticket ||
            ticket["actorUid"] !== user.uid ||
            ticket["status"] !== "previewed" ||
            ticket["destinationId"] !== body.destinationId ||
            ticket["objectKey"] !== body.objectKey ||
            ticket["backupDigest"] !== digest ||
            typeof ticket["expiresAt"] !== "string" ||
            Date.parse(ticket["expiresAt"]) <= Date.now()
          ) {
            throw new ApiError(
              409,
              "STORAGE_RESTORE_PREVIEW_EXPIRED",
              "The restore preview expired or no longer matches this backup. Preview it again.",
            );
          }
          const results: Array<{ destinationId: string; restored: boolean; reason?: string }> = [];
          for (const entry of backup.destinations) {
            const destinationId =
              typeof entry["destinationId"] === "string" ? entry["destinationId"] : "";
            if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(destinationId)) continue;
            if (
              destinationId === "legacy_lovable_source" ||
              destinationId === "legacy_lovable_streaming"
            ) {
              results.push({ destinationId, restored: false, reason: "protected_legacy_location" });
              continue;
            }
            const existing = await fs.getDoc("storageDestinations/" + destinationId);
            if (!existing || typeof existing["secretPrefix"] !== "string") {
              results.push({
                destinationId,
                restored: false,
                reason: "existing_connection_reference_required",
              });
              continue;
            }
            const restored = validateStorageDestinationMetadata({
              ...entry,
              destinationId,
              secretPrefix: existing["secretPrefix"],
              healthStatus: "unknown",
              healthCheckedAt: null,
              usageBytes: null,
              usageSource: null,
              usageCheckedAt: null,
              paidEgressEnabled: false,
            });
            await fs.patchDoc("storageDestinations/" + destinationId, {
              providerType: restored.providerType,
              accountAlias: restored.accountAlias,
              bucketName: restored.bucketName,
              region: restored.region,
              purpose: restored.purpose,
              softCapBytes: restored.softCapBytes,
              accountCapBytes: restored.accountCapBytes,
              dailyEgressCapBytes: restored.dailyEgressCapBytes,
              priority: restored.priority,
              enabled: restored.enabled,
              paidEgressEnabled: false,
              freeEgressBudgetBytes: restored.freeEgressBudgetBytes,
              accountGroup: restored.accountGroup,
              mode: restored.mode,
              replicaOf: restored.replicaOf,
              healthStatus: "unknown",
              healthCheckedAt: null,
              usageBytes: null,
              usageSource: null,
              usageCheckedAt: null,
              restoredAt: now,
              updatedAt: now,
            });
            results.push({ destinationId, restored: true });
          }
          await rebuildStoragePoolIndex(fs);
          await fs.patchDoc(ticketPath, { status: "applied", appliedAt: now });
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "storage.configuration_backup_restored",
            targetType: "storageConfigurationBackup",
            targetId: body.objectKey,
            reason: body.reason,
            metadata: {
              backupCreatedAt: backup.createdAt,
              destinationCount: results.filter((item) => item.restored).length,
              skippedCount: results.filter((item) => !item.restored).length,
              legacyLocationsProtected: true,
            },
          });
          return Response.json({
            applied: true,
            restoredCount: results.filter((item) => item.restored).length,
            skippedCount: results.filter((item) => !item.restored).length,
            results,
            note: "Connection settings were preserved and every restored location is marked unverified. Run fresh health and usage checks before allowing new assignments. Asset bindings and delivery ledgers were deliberately not overwritten.",
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
