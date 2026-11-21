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

const postSchema = z.object({
  assetId: z.string().min(1).max(100),
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(3).max(1000),
  reasonCode: z.enum(REJECTION_REASON_CODES).optional(),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/rights-review/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "content");

          const url = new URL(request.url);
          const filter = url.searchParams.get("filter") || "all";

          const allAssets = await fs.query("contentAssets", { limit: 200 });

          const queueItems = [];
          for (const a of allAssets) {
            const status = (a["status"] || a["contentStatus"] || "ready") as string;
            const rightsReviewStatus = (a["rightsReviewStatus"] ||
              (a["license"] as Record<string, unknown> | undefined)?.["status"] ||
              "pending") as string;
            const duplicateDetected = a["duplicateDetected"] === true;
            const appealSubmitted = a["appealSubmitted"] === true;

            let matchesFilter = true;
            if (filter === "duplicates") {
              matchesFilter = duplicateDetected;
            } else if (filter === "appealed") {
              matchesFilter = appealSubmitted;
            } else if (filter === "pending") {
              matchesFilter = rightsReviewStatus === "pending" || rightsReviewStatus === "flagged";
            } else if (filter === "resolved") {
              matchesFilter =
                rightsReviewStatus === "verified" || rightsReviewStatus === "rejected";
            }

            if (!matchesFilter) continue;

            let matchedAsset = null;
            if (a["duplicateOfAssetId"]) {
              const matched = await fs.getDoc("contentAssets/" + a["duplicateOfAssetId"]);
              if (matched) {
                matchedAsset = {
                  assetId: String(matched["id"] || matched.__id || ""),
                  title: matched["title"] || String(matched["id"] || matched.__id || ""),
                  channelId: matched["channelId"] || null,
                  ownerUid: matched["ownerUid"] || null,
                  contentStatus: matched["contentStatus"] || matched["status"] || null,
                  posterUrl: matched["posterUrl"] || null,
                  createdAt: matched["createdAt"] || null,
                };
              }
            }

            const code =
              (a["rejectionReasonCode"] as RejectionReasonCode) ||
              ((a["license"] as Record<string, unknown> | undefined)?.[
                "rejectionReasonCode"
              ] as RejectionReasonCode) ||
              null;

            queueItems.push({
              assetId: String(a["id"] || a.__id || ""),
              title: a["title"] || String(a["id"] || a.__id || ""),
              channelId: a["channelId"] || null,
              ownerUid: a["ownerUid"] || a["uploadedBy"] || null,
              ownerName: a["ownerName"] || null,
              status,
              contentStatus: a["contentStatus"] || status,
              rightsReviewStatus,
              fileHash: a["fileHash"] || a["checksumSha256"] || null,
              perceptualFingerprint: a["perceptualFingerprint"] || null,
              checksumSha256: a["checksumSha256"] || null,
              duplicateDetected,
              duplicateOfAssetId: a["duplicateOfAssetId"] || null,
              duplicateOfTitle: a["duplicateOfTitle"] || null,
              duplicateType: a["duplicateType"] || null,
              reviewQueueFlag: a["reviewQueueFlag"] || null,
              matchedAsset,
              license: a["license"] || null,
              ageRating: a["ageRating"] || null,
              contentWarnings: Array.isArray(a["contentWarnings"]) ? a["contentWarnings"] : [],
              language: a["language"] || null,
              genre: a["genre"] || a["category"] || null,
              rejectionReasonCode: code,
              rejectionReasonLabel: code ? REJECTION_REASON_LABELS[code] || code : null,
              rejectionMessage:
                a["rejectionMessage"] ||
                (a["license"] as Record<string, unknown> | undefined)?.["reviewReason"] ||
                null,
              rejectedAt: a["rejectedAt"] || null,
              rejectedBy: a["rejectedBy"] || null,
              appealSubmitted,
              appealSubmittedAt: a["appealSubmittedAt"] || null,
              appealExplanation: a["appealExplanation"] || null,
              createdAt: a["createdAt"] || null,
              updatedAt: a["updatedAt"] || null,
            });
          }

          const reasonCodes = REJECTION_REASON_CODES.map((code) => ({
            code,
            label: REJECTION_REASON_LABELS[code],
          }));

          return Response.json({
            items: queueItems,
            reasonCodes,
            total: queueItems.length,
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, postSchema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "content");

          const asset = await fs.getDoc("contentAssets/" + body.assetId);
          if (!asset) {
            throw new ApiError(404, "ASSET_NOT_FOUND", "The content asset was not found.");
          }

          const license = (asset["license"] as Record<string, unknown>) || {};
          const isApprove = body.action === "approve";

          // Rule: Independent reviewer check (reviewer cannot be the submitter)
          if (isApprove && (license["submittedBy"] === user.uid || asset["ownerUid"] === user.uid)) {
            throw new ApiError(
              403,
              "INDEPENDENT_REVIEW_REQUIRED",
              "A different authorized reviewer must approve the rights submission.",
            );
          }

          if (isApprove) {
            const evidencePath = license["evidencePath"];
            if (typeof evidencePath === "string" && evidencePath.trim()) {
              if (!isSafeStoragePath(evidencePath)) {
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
              if (error || !data?.signedUrl) {
                throw new ApiError(
                  409,
                  "RIGHTS_EVIDENCE_NOT_FOUND",
                  "The private rights-evidence file could not be found.",
                );
              }
            }
          }

          const now = new Date().toISOString();
          const reasonCode = !isApprove ? body.reasonCode || "other" : null;

          const updatedLicense = {
            ...license,
            status: isApprove ? "verified" : "rejected",
            verificationStatus: isApprove ? "verified" : "rejected",
            reviewedBy: user.uid,
            reviewedAt: now,
            reviewReason: body.reason,
            ...(reasonCode ? { rejectionReasonCode: reasonCode } : {}),
          };

          await fs.patchDoc("contentAssets/" + body.assetId, {
            license: updatedLicense,
            ...(isApprove
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
            action: isApprove ? "content.rights_verified" : "content.rights_rejected",
            targetType: "contentAsset",
            targetId: body.assetId,
            reason: body.reason,
          });

          return Response.json({
            assetId: body.assetId,
            action: body.action,
            rightsReviewStatus: isApprove ? "verified" : "rejected",
            rejectionReasonCode: reasonCode,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
