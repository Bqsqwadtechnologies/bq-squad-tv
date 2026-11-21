import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser, parseBody } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { getKycProfile } from "@/lib/server/kyc/persistence";
import { isRetentionPeriodActive, getStatutoryRetentionYears } from "@/lib/server/kyc/retention";

const erasureRequestSchema = z.object({
  uid: z.string().trim().min(1),
  reason: z.string().trim().min(5).max(1000),
  forceRedactStatutory: z.boolean().default(false),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/kyc/lifecycle/erasure-request")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          // Compliance or security access required
          await requireZillionaireModule(fs, user, "compliance");

          const body = await parseBody(request, erasureRequestSchema);
          const profile = await getKycProfile(fs, body.uid);
          if (!profile) {
            throw new ApiError(404, "PROFILE_NOT_FOUND", "KYC profile not found.");
          }

          // 1. Check legal hold
          if (profile.legalHold) {
            throw new ApiError(
              409,
              "LEGAL_HOLD_ACTIVE",
              `Record is subject to an active regulatory legal hold (${profile.legalHoldReason || "No reason specified"}). Deletion is legally prohibited.`,
            );
          }

          const now = new Date().toISOString();
          const createdAt = profile.createdAt || now;
          const retentionActive = isRetentionPeriodActive(createdAt, profile.kycCountry);
          const retentionYears = getStatutoryRetentionYears(profile.kycCountry);

          // 2. If statutory retention is still active and not force redacted
          if (retentionActive && !body.forceRedactStatutory) {
            // Apply partial privacy redaction (contact and non-statutory info) while strictly retaining AML records
            await fs.patchDoc(`kycProfiles/${body.uid}`, {
              erasureRequestedAt: now,
              erasureStatus: "statutory_retention_restricted",
              marketingConsent: false,
              analyticsConsent: false,
              phone: "REDACTED",
              officialEmail: "redacted@privacy.internal",
              updatedAt: now,
            });

            await writeAuditLog(fs, {
              action: "kyc.data_subject_partial_redaction",
              actorUid: user.uid,
              actorEmail: user.email || "",
              targetType: "kyc_case",
              targetId: body.uid,
              reason: body.reason,
              metadata: {
                retentionYears,
                statutoryRetentionActive: true,
                message: "Non-statutory data redacted. Financial and AML records retained pursuant to statutory retention laws.",
              },
            });

            return Response.json({
              ok: true,
              type: "partial_statutory_redaction",
              uid: body.uid,
              retentionYears,
              statutoryRetentionActive: true,
              financialRecordsPreserved: true,
              message: `Personal contact data redacted. Financial compliance records retained under statutory ${retentionYears}-year AML retention requirement.`,
            });
          }

          // 3. Full statutory erasure (retention expired or authorized):
          // Redact PII in KYC profile, remove document vault references, but preserve financial transactions ledger
          await fs.patchDoc(`kycProfiles/${body.uid}`, {
            erasureProcessedAt: now,
            erasureStatus: "erased_pii_retained_ledger",
            legalName: "[REDACTED_DATA_SUBJECT]",
            businessName: "[REDACTED_DATA_SUBJECT]",
            maskedIdNumber: "****",
            maskedTaxNumber: "****",
            maskedAccountNumber: "****",
            phone: "[REDACTED]",
            officialEmail: "redacted@privacy.internal",
            documentVaultPaths: {},
            faceCaptureVaultPath: null,
            tier2Documents: {},
            accountStatus: "CLOSED",
            updatedAt: now,
          });

          // Delete private vault files if exists (remove pointer)
          await writeAuditLog(fs, {
            action: "kyc.data_subject_erasure_processed",
            actorUid: user.uid,
            actorEmail: user.email || "",
            targetType: "kyc_case",
            targetId: body.uid,
            reason: body.reason,
            metadata: {
              financialRecordsPreserved: true,
              erasureProcessedAt: now,
            },
          });

          return Response.json({
            ok: true,
            type: "full_erasure_retained_financial_ledger",
            uid: body.uid,
            financialRecordsPreserved: true,
            message: "Data subject PII and document vault references permanently erased. Financial ledger integrity preserved.",
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
