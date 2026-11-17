import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { validateStorageDestinationMetadata } from "@/lib/server/storage/registry";
import { writeAuditLog } from "@/lib/server/audit";
import { refreshStoragePoolDestination } from "@/lib/server/storage/pool-index";

const schema = z.object({
  destinationId: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
  usageBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  reason: z.string().trim().min(3).max(1000),
});

export const Route = createFileRoute("/api/public/v1/admin/storage/usage")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const user = await requireUser(request);
      const body = await parseBody(request, schema);
      const fs = await Firestore.create();
      const access = await requireAdminModule(fs, user, "system");
      if (!access.isZillionaireOwner) throw new ApiError(403, "OWNER_ONLY", "Only the Zillionaire owner can reconcile storage usage.");
      const raw = await fs.getDoc("storageDestinations/" + body.destinationId);
      if (!raw) throw new ApiError(404, "STORAGE_DESTINATION_NOT_FOUND", "The storage destination could not be found.");
      const metadata = validateStorageDestinationMetadata({ ...raw, destinationId: body.destinationId });
      const now = new Date().toISOString();
      await fs.patchDoc("storageDestinations/" + body.destinationId, {
        usageBytes: body.usageBytes,
        usageSource: "manual",
        usageCheckedAt: now,
        updatedAt: now,
        updatedBy: user.uid,
      });
      await refreshStoragePoolDestination(fs, body.destinationId).catch(() => undefined);
      await writeAuditLog(fs, {
        actorUid: user.uid,
        action: "storage.destination_usage_attested",
        targetType: "storageDestination",
        targetId: body.destinationId,
        reason: body.reason,
        metadata: {
          providerType: metadata.providerType,
          bucketName: metadata.bucketName,
          usageBytes: body.usageBytes,
          softCapBytes: metadata.softCapBytes,
          accountGroup: metadata.accountGroup,
        },
      });
      return Response.json({
        destinationId: body.destinationId,
        usageBytes: body.usageBytes,
        usageSource: "manual",
        usageCheckedAt: now,
        note: "This is an owner-attested snapshot, not a live provider reconciliation. Refresh it after external storage changes.",
      });
    } catch (error) { return errorBody(error); }
  } } },
});
