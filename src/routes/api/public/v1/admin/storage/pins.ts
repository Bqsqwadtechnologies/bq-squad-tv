import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({
  assetId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  pinned: z.boolean(),
  reason: z.string().trim().min(3).max(1000),
}).strict();

export const Route = createFileRoute("/api/public/v1/admin/storage/pins")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const user = await requireUser(request);
      const age = Math.floor(Date.now() / 1000) - user.authTime;
      if (!Number.isSafeInteger(user.authTime) || age < 0 || age > 300) {
        throw new ApiError(401, "STEP_UP_REQUIRED", "Sign in again to confirm this storage-retention change.");
      }
      const body = await parseBody(request, schema);
      const fs = await Firestore.create();
      const access = await requireAdminModule(fs, user, "system");
      if (!access.isZillionaireOwner) throw new ApiError(403, "OWNER_ONLY", "Only the Zillionaire owner can change storage retention pins.");
      const path = "contentAssets/" + body.assetId;
      const asset = await fs.getDoc(path);
      if (!asset) throw new ApiError(404, "ASSET_NOT_FOUND", "The content record could not be found.");
      const now = new Date().toISOString();
      await fs.patchDoc(path, {
        sourcePinned: body.pinned,
        sourcePinnedAt: body.pinned ? now : null,
        sourcePinnedBy: body.pinned ? user.uid : null,
        sourcePinReason: body.pinned ? body.reason : null,
        updatedAt: now,
      });
      await writeAuditLog(fs, {
        actorUid: user.uid,
        action: body.pinned ? "storage.source_pinned" : "storage.source_unpinned",
        targetType: "contentAsset",
        targetId: body.assetId,
        reason: body.reason,
        metadata: { sourcePinned: body.pinned },
      });
      return Response.json({
        saved: true,
        assetId: body.assetId,
        sourcePinned: body.pinned,
        note: body.pinned
          ? "The original upload is marked to be kept and must be excluded from automated source cleanup."
          : "The original upload is no longer pinned. Retention rules and the safety review still apply before any cleanup.",
      });
    } catch (error) {
      return errorBody(error);
    }
  } } },
});
