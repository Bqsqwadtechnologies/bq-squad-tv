import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { resolveStorageDestinationConfiguration, validateStorageDestinationMetadata } from "@/lib/server/storage/registry";
import { createStorageProviderAdapter } from "@/lib/server/storage/providers";

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
        if (!access.isSuperAdmin) throw new ApiError(403, "OWNER_ONLY", "Only the protected platform owner can test storage destinations.");
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
          throw new ApiError(503, "STORAGE_DESTINATION_MISCONFIGURED", "Required server credentials or endpoint configuration are missing or invalid.");
        }
        try {
          await createStorageProviderAdapter(configuration).healthCheck();
          const now = new Date().toISOString();
          await fs.patchDoc("storageDestinations/" + destinationId, {
            healthStatus: "healthy",
            healthCheckedAt: now,
            lastErrorCode: null,
          });
          await writeAuditLog(fs, {
            actorUid, action: "storage.destination_health_check_passed",
            targetType: "storageDestination", targetId: destinationId, reason,
            metadata: { providerType: metadata.providerType, bucketName: metadata.bucketName },
          });
          return Response.json({ destinationId, healthStatus: "healthy", healthCheckedAt: now });
        } catch {
          const now = new Date().toISOString();
          await fs.patchDoc("storageDestinations/" + destinationId, {
            healthStatus: "unreachable",
            healthCheckedAt: now,
            lastErrorCode: "STORAGE_PROVIDER_HEALTH_CHECK_FAILED",
          });
          await writeAuditLog(fs, {
            actorUid, action: "storage.destination_health_check_failed",
            targetType: "storageDestination", targetId: destinationId, reason,
            metadata: { providerType: metadata.providerType, errorCode: "STORAGE_PROVIDER_HEALTH_CHECK_FAILED" },
          });
          return Response.json({ destinationId, healthStatus: "unreachable", healthCheckedAt: now, error: "The provider health check failed. Review provider permissions and endpoint configuration." }, { status: 502 });
        }
      } catch (error) {
        return errorBody(error);
      }
    },
  } },
});
