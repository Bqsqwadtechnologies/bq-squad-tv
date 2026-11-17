import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { wakeModalVideoWorker } from "@/lib/server/modal-wake";

const schema = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();

export const Route = createFileRoute("/api/public/v1/admin/content-assets/$assetId/reprocess")({
  server: { handlers: { POST: async ({ request, params }) => {
    try {
      const user = await requireUser(request);
      const body = await parseBody(request, schema);
      const assetId = params.assetId;
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId)) throw new ApiError(400, "ASSET_ID_INVALID", "The asset id is invalid.");
      if (!Number.isSafeInteger(user.authTime) || Math.floor(Date.now() / 1000) - user.authTime > 300) {
        throw new ApiError(403, "RECENT_SIGN_IN_REQUIRED", "Sign in again before reprocessing this video.");
      }
      const fs = await Firestore.create();
      await requireAdminModule(fs, user, "content");
      const asset = await fs.getDoc("contentAssets/" + assetId);
      const jobPath = "videoTranscodeJobs/" + assetId;
      const job = await fs.getDoc(jobPath);
      if (!asset || !job || asset["sourceVerified"] !== true ||
          !["completed", "failed"].includes(String(job["status"]))) {
        throw new ApiError(409, "ASSET_NOT_REPROCESSABLE", "Only a previously processed or failed, verified source can be reprocessed.");
      }
      if (typeof asset["sourceSha256"] !== "string" || asset["sourceSha256"] !== job["sourceSha256"]) {
        throw new ApiError(409, "SOURCE_HASH_REQUIRED", "The original source must have a verified fingerprint before reprocessing.");
      }
      const now = new Date().toISOString();
      await fs.patchDoc(jobPath, {
        status: "queued",
        workerStatus: "waiting_for_worker",
        attempts: 0,
        nextAttemptAt: null,
        claimToken: null,
        leaseExpiresAt: null,
        outputDestinationId: null,
        outputPrefix: null,
        outputReservationId: null,
        outputReservedBytes: null,
        lastErrorCode: null,
        reprocessRequestedAt: now,
        reprocessRequestedBy: user.uid,
        reprocessReason: body.reason,
        updatedAt: now,
      });
      await fs.patchDoc("contentAssets/" + assetId, {
        status: "uploaded_pending_transcode",
        transcodeJobStatus: "queued",
        ownerReviewRequired: false,
        updatedAt: now,
      });
      await writeAuditLog(fs, {
        actorUid: user.uid,
        action: "content.asset_reprocess_requested",
        targetType: "contentAsset",
        targetId: assetId,
        reason: body.reason,
        metadata: { sourceSha256: asset["sourceSha256"] },
      });
      await wakeModalVideoWorker();
      return Response.json({ assetId, status: "queued" });
    } catch (error) { return errorBody(error); }
  } } },
});
