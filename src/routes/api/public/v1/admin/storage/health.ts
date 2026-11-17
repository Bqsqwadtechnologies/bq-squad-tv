import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { refreshStoragePoolDestination } from "@/lib/server/storage/pool-index";
import { resolveStorageDestinationConfiguration, validateStorageDestinationMetadata } from "@/lib/server/storage/registry";
import { createStorageProviderAdapter } from "@/lib/server/storage/providers";
import { isStorageQuotaOrRateLimit, storageFailureCode, storageFailureMessage } from "@/lib/server/storage/maintenance";
import { nextHealthRecoveryState } from "@/lib/server/storage/failover";

const bodySchema = z.object({
  destinationId: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
  reason: z.string().trim().min(3).max(1000),
});

export const Route = createFileRoute("/api/public/v1/admin/storage/health")({
  server: { handlers: {
    POST: async ({ request }) => {
      let fs: Firestore | null = null;
      let destinationId = "";
      let actorUid = "";
      let reason = "";
      try {
        const user = await requireUser(request);
        actorUid = user.uid;
        const body = await parseBody(request, bodySchema);
        destinationId = body.destinationId;
        reason = body.reason;
        fs = await Firestore.create();
        const access = await requireAdminModule(fs, user, "system");
        if (!access.isZillionaireOwner) throw new ApiError(403, "OWNER_ONLY", "Only the Zillionaire owner can test storage destinations.");
        const raw = await fs.getDoc("storageDestinations/" + destinationId);
        if (!raw) throw new ApiError(404, "STORAGE_DESTINATION_NOT_FOUND", "The storage destination could not be found.");
        const metadata = validateStorageDestinationMetadata({ ...raw, destinationId });
        const configuration = resolveStorageDestinationConfiguration(metadata);
        if (configuration.configurationStatus !== "configured") {
          await fs.patchDoc("storageDestinations/" + destinationId, {
            healthStatus: "misconfigured",
            healthCheckedAt: new Date().toISOString(),
            lastErrorCode: "STORAGE_DESTINATION_MISCONFIGURED",
          });
          await refreshStoragePoolDestination(fs, destinationId).catch(() => undefined);
          throw new ApiError(503, "STORAGE_DESTINATION_MISCONFIGURED", "Required server credentials or endpoint configuration are missing or invalid.");
        }
        try {
          await createStorageProviderAdapter(configuration).healthCheck();
          const now = new Date().toISOString();
          const recovering = raw["healthStatus"] === "degraded" || raw["healthStatus"] === "unreachable";
          const recovery = recovering
            ? nextHealthRecoveryState({
                status: String(raw["healthStatus"]),
                cleanChecks: typeof raw["cleanHealthChecks"] === "number" ? raw["cleanHealthChecks"] : 0,
              }, "clean")
            : { status: "healthy", cleanChecks: 3 };
          const healthStatus = recovery.status;
          await fs.patchDoc("storageDestinations/" + destinationId, {
            healthStatus,
            cleanHealthChecks: recovery.cleanChecks,
            healthCheckedAt: now,
            lastErrorCode: null,
            degradedUntil: healthStatus === "healthy" ? null : new Date(Date.now() + 60 * 60_000).toISOString(),
          });
          await refreshStoragePoolDestination(fs, destinationId).catch(() => undefined);
          await writeAuditLog(fs, {
            actorUid, action: "storage.destination_health_check_passed",
            targetType: "storageDestination", targetId: destinationId, reason,
            metadata: { providerType: metadata.providerType, bucketName: metadata.bucketName, healthStatus, cleanChecks: recovery.cleanChecks },
          });
          return Response.json({ destinationId, healthStatus, cleanHealthChecks: recovery.cleanChecks, healthCheckedAt: now });
        } catch (error) {
          const now = new Date().toISOString();
          const code = storageFailureCode(error);
          const degraded = isStorageQuotaOrRateLimit(code);
          const healthStatus = degraded ? "degraded" : "unreachable";
          const message = storageFailureMessage(code);
          await fs.patchDoc("storageDestinations/" + destinationId, {
            healthStatus,
            cleanHealthChecks: 0,
            healthCheckedAt: now,
            lastErrorCode: code,
            degradedUntil: degraded ? new Date(Date.now() + 24 * 60 * 60_000).toISOString() : null,
          });
          await refreshStoragePoolDestination(fs, destinationId).catch(() => undefined);
          if (degraded) {
            const alertId = crypto.randomUUID().replace(/-/g, "");
            await fs.setDoc("storageAlerts/" + alertId, {
              destinationId, severity: "warning", reasonCode: code, message,
              createdAt: now, expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
              acknowledged: false,
            }).catch(() => undefined);
          }
          await writeAuditLog(fs, {
            actorUid, action: "storage.destination_health_check_failed",
            targetType: "storageDestination", targetId: destinationId, reason,
            metadata: { providerType: metadata.providerType, errorCode: code, healthStatus },
          });
          return Response.json({ destinationId, healthStatus, healthCheckedAt: now, error: message }, { status: degraded ? 429 : 502 });
        }
      } catch (error) {
        return errorBody(error);
      }
    },
  } },
});
