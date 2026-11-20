import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { isSafeStoragePath } from "@/lib/server/storage/security";
import { writeAuditLog } from "@/lib/server/audit";
import {
  REJECTION_REASON_CODES,
  REJECTION_REASON_LABELS,
  RejectionReasonCode,
} from "@/lib/server/copyright/fingerprint";

const schema = z.object({
  approved: z.boolean(),
  reason: z.string().trim().min(3).max(1000),
  reasonCode: z.enum(REJECTION_REASON_CODES).optional(),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/content-assets/$assetId/rights")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(params.assetId))
            throw new ApiError(400, "ASSET_ID_INVALID", "The asset id is invalid.");
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "content");
          const asset = await fs.getDoc("contentAssets/" + params.assetId);
          if (!asset || !asset["license"] || typeof asset["license"] !== "object")
            throw new ApiError(
              404,
              "ASSET_RIGHTS_NOT_FOUND",
              "No rights submission exists for this asset.",
            );
          const license = asset["license"] as Record<string, unknown>;
          if (body.approved && license["submittedBy"] === user.uid) {
            throw new ApiError(
              403,
              "INDEPENDENT_REVIEW_REQUIRED",
              "A different authorized reviewer must approve the rights submission.",
            );
          }
          if (license["status"] !== "pending" || license["verificationStatus"] !== "pending") {
            throw new ApiError(
              409,
              "RIGHTS_ALREADY_REVIEWED",
              "This rights submission has already been reviewed.",
            );
          }
          if (body.approved) {
            const evidencePath = license["evidencePath"];
            if (typeof evidencePath !== "string" || !isSafeStoragePath(evidencePath)) {
              throw new ApiError(
                409,
                "RIGHTS_EVIDENCE_REQUIRED",
                "A valid private rights-evidence file is required.",
              );
            }
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data, error } = await supabaseAdmin.storage
              .from("bq-sqwad-source-media")
              .createSignedUrl(evidencePath, 60);
            if (error || !data?.signedUrl)
              throw new ApiError(
                409,
                "RIGHTS_EVIDENCE_NOT_FOUND",
                "The private rights-evidence file could not be found.",
              );
          }
          const now = new Date().toISOString();
          const reasonCode = !body.approved ? (body.reasonCode || "other") : null;
          const updatedLicense = {
            ...license,
            status: body.approved ? "verified" : "rejected",
            verificationStatus: body.approved ? "verified" : "rejected",
            reviewedBy: user.uid,
            reviewedAt: now,
            reviewReason: body.reason,
            ...(reasonCode ? { rejectionReasonCode: reasonCode } : {}),
          };
          await fs.patchDoc("contentAssets/" + params.assetId, {
            license: updatedLicense,
            ...(body.approved
              ? {
                  rightsReviewStatus: "verified",
                  ownerReviewRequired: false,
                  duplicateDetected: false,
                  reviewQueueFlag: null,
                }
              : {
                  status: "rejected",
                  rightsReviewStatus: "rejected",
                  rejectionReasonCode: reasonCode,
                  rejectionMessage: body.reason,
                  rejectedAt: now,
                  rejectedBy: user.uid,
                  appealAllowed: true,
                  appealSubmitted: false,
                }),
            updatedAt: now,
          });
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: body.approved ? "content.rights_verified" : "content.rights_rejected",
            targetType: "contentAsset",
            targetId: params.assetId,
            reason: body.reason,
          });
          return Response.json({ assetId: params.assetId, rightsStatus: updatedLicense.status });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
