import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser, parseBody } from "@/lib/server/api";
import { resolvePlatformAccess } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import {
  getKycProfile,
  reviewKycProfile,
  saveKycProfile,
} from "@/lib/server/kyc/persistence";
import { generateShortLivedViewerUrl } from "@/lib/server/kyc/storage";
import {
  getCountryRule,
  validateCompanyRegistrationFormat,
  validateIdFormat,
  validateTaxIdFormat,
} from "@/lib/kyc-country-rules";

const actionSchema = z.object({
  uid: z.string().trim().min(1),
  action: z.enum(["approve", "reject", "request_changes", "escalate", "force_rekyc"]),
  reason: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(2000).optional(),
  fieldComments: z.record(z.string()).optional(),
  escalatedTo: z.string().trim().max(128).optional(),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/kyc/detail")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          const access = await resolvePlatformAccess(
            fs,
            user.uid,
            user.email,
            user.customClaims,
            user.emailVerified === true,
          );

          const hasAccess =
            access.isZillionaireOwner ||
            access.zillionaireModules.some((m) =>
              ["security", "compliance", "finance", "producers", "providers", "overview"].includes(m),
            );

          if (!hasAccess) {
            throw new ApiError(403, "FORBIDDEN", "Access to KYC applicant detail is restricted.");
          }

          const url = new URL(request.url);
          const uid = (url.searchParams.get("uid") || "").trim();
          if (!uid) {
            throw new ApiError(400, "UID_REQUIRED", "The applicant uid query parameter is required.");
          }

          const profile = await getKycProfile(fs, uid);
          if (!profile) {
            throw new ApiError(404, "PROFILE_NOT_FOUND", "KYC profile not found for this applicant.");
          }

          // Build signed document viewer links
          const viewerSecret = process.env["KYC_VAULT_SIGNING_SECRET"];
          const signedDocuments: Record<string, { label: string; viewerUrl: string }> = {};

          if (viewerSecret && profile.documentVaultPaths) {
            for (const [key, path] of Object.entries(profile.documentVaultPaths)) {
              try {
                const signed = generateShortLivedViewerUrl(path, user.uid, 15);
                signedDocuments[key] = {
                  label: key.replace(/_/g, " ").toUpperCase(),
                  viewerUrl: `/api/public/v1/zillionaire/kyc/view-doc?path=${encodeURIComponent(path)}&reviewerUid=${encodeURIComponent(user.uid)}&expires=${signed.expires}&sig=${signed.signature}`,
                };
              } catch (e) {
                // skip if secret issue
              }
            }
          }

          let signedFaceCaptureUrl: string | null = null;
          if (viewerSecret && profile.faceCaptureVaultPath) {
            try {
              const signed = generateShortLivedViewerUrl(profile.faceCaptureVaultPath, user.uid, 15);
              signedFaceCaptureUrl = `/api/public/v1/zillionaire/kyc/view-doc?path=${encodeURIComponent(profile.faceCaptureVaultPath)}&reviewerUid=${encodeURIComponent(user.uid)}&expires=${signed.expires}&sig=${signed.signature}`;
            } catch (e) {
              // skip
            }
          }

          // Check for duplicate credentials across other applicant profiles
          let duplicateIdWarning = false;
          let duplicateTaxWarning = false;
          let duplicateBankWarning = false;

          const allOther = await fs.query("kycProfiles", { limit: 200 });
          for (const other of allOther) {
            if (other["uid"] === uid) continue;
            if (profile.maskedIdNumber && other["maskedIdNumber"] === profile.maskedIdNumber) {
              duplicateIdWarning = true;
            }
            if (profile.maskedTaxNumber && other["maskedTaxNumber"] === profile.maskedTaxNumber) {
              duplicateTaxWarning = true;
            }
            if (profile.maskedAccountNumber && other["maskedAccountNumber"] === profile.maskedAccountNumber) {
              duplicateBankWarning = true;
            }
          }

          // Write audit log for viewing full KYC file
          await writeAuditLog(fs, {
            action: "kyc_detail_viewed",
            actorUid: user.uid,
            targetType: "user",
            targetId: uid,
            reason: "Reviewer inspected full KYC applicant profile and document vault",
            metadata: {
              applicantUid: uid,
              kycType: profile.kycType,
              kycCountry: profile.kycCountry,
              kycVersion: profile.kycVersion,
            },
          });

          return Response.json({
            ok: true,
            profile: {
              ...profile,
              signedDocuments,
              signedFaceCaptureUrl,
              automatedChecks: {
                duplicateIdDetected: duplicateIdWarning,
                duplicateTaxDetected: duplicateTaxWarning,
                duplicateBankDetected: duplicateBankWarning,
                sanctionsCleared: false, // requires manual clearance in reviewer UI
              },
            },
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          const access = await resolvePlatformAccess(
            fs,
            user.uid,
            user.email,
            user.customClaims,
            user.emailVerified === true,
          );

          const hasAccess =
            access.isZillionaireOwner ||
            access.zillionaireModules.some((m) =>
              ["security", "compliance", "finance"].includes(m),
            );

          if (!hasAccess) {
            throw new ApiError(403, "FORBIDDEN", "Only compliance and platform owners can decide KYC applications.");
          }

          const body = await parseBody(request, actionSchema);
          const now = new Date().toISOString();

          if (body.action === "reject" && (!body.reason || body.reason.trim().length < 3)) {
            throw new ApiError(400, "REJECTION_REASON_REQUIRED", "A rejection reason of at least 3 characters is required.");
          }

          const existingProfile = await getKycProfile(fs, body.uid);
          if (!existingProfile) {
            throw new ApiError(404, "PROFILE_NOT_FOUND", "KYC profile not found.");
          }

          let newStatus = existingProfile.kycStatus;
          if (body.action === "approve") newStatus = "approved";
          else if (body.action === "reject") newStatus = "rejected";
          else if (body.action === "request_changes") (newStatus as any) = "needs_changes";
          else if (body.action === "force_rekyc") newStatus = "unsubmitted";

          if (body.action === "approve" || body.action === "reject") {
            await reviewKycProfile(fs, {
              uid: body.uid,
              reviewerUid: user.uid,
              status: body.action === "approve" ? "approved" : "rejected",
              reason: body.reason,
              notes: body.notes,
            });
          } else {
            // Update custom status transition
            await fs.patchDoc(`kycProfiles/${body.uid}`, {
              kycStatus: newStatus,
              kycReviewedAt: now,
              kycReviewedBy: user.uid,
              reviewerNotes: body.notes || null,
              fieldComments: body.fieldComments || null,
              escalatedTo: body.action === "escalate" ? body.escalatedTo || "second_reviewer" : null,
              updatedAt: now,
            });
          }

          // Create in-app notification for applicant
          const notifId = `notif_kyc_${body.uid}_${Date.now()}`;
          await fs.setDoc(`notifications/${notifId}`, {
            id: notifId,
            recipientUid: body.uid,
            type: "kyc_decision",
            status: newStatus,
            title:
              body.action === "approve"
                ? "Identity Verification Approved"
                : body.action === "reject"
                  ? "Identity Verification Rejected"
                  : body.action === "request_changes"
                    ? "Additional Information Needed for Verification"
                    : "Identity Verification Status Update",
            message:
              body.reason ||
              (body.action === "approve"
                ? "Your KYC verification has been reviewed and approved. All console features and publishing are now unlocked."
                : "Please review the feedback on your application and update your verification documents."),
            createdAt: now,
            read: false,
          });

          // Queue email notification in outbox (user notices by email, never SMS)
          const outboxId = `mail_kyc_${body.uid}_${Date.now()}`;
          await fs.setDoc(`emailOutbox/${outboxId}`, {
            id: outboxId,
            toUid: body.uid,
            recipientEmail: existingProfile.officialEmail || null,
            subject:
              body.action === "approve"
                ? "Your BQ Squad verification is approved"
                : "Update regarding your BQ Squad verification",
            template: "kyc_status_update",
            context: {
              status: newStatus,
              reason: body.reason || null,
              notes: body.notes || null,
            },
            status: "queued",
            createdAt: now,
          });

          // Audit log
          await writeAuditLog(fs, {
            action: `kyc_${body.action}`,
            actorUid: user.uid,
            targetType: "user",
            targetId: body.uid,
            reason: body.reason || body.notes || `KYC decision: ${body.action}`,
            metadata: {
              applicantUid: body.uid,
              action: body.action,
              resultingStatus: newStatus,
              escalatedTo: body.escalatedTo,
            },
          });

          return Response.json({
            ok: true,
            uid: body.uid,
            status: newStatus,
            action: body.action,
            timestamp: now,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
