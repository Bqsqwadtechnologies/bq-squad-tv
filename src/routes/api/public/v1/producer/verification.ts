import { calculateKycRiskScore } from "@/lib/server/kyc/risk-scoring";
import { maskIdNumber } from "@/lib/server/kyc/types";
import { getKycVerifier } from "@/lib/server/kyc/verifier";
import { saveKycProfile, deleteKycDraft } from "@/lib/server/kyc/persistence";
import { isAge18OrOlder } from "@/lib/kyc-country-rules";
import { createFileRoute } from "@tanstack/react-router";
import { assertLegalAcceptance } from "@/lib/server/legal-acceptance";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSafeStoragePath } from "@/lib/server/storage/security";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z
  .object({
    legalName: z.string().trim().min(3).max(160),
    businessName: z.string().trim().max(160).optional(),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    entityType: z.enum(["individual", "registered_business", "company", "rights_holder"]),
    evidenceUploadIds: z
      .array(z.string().regex(/^[A-Za-z0-9_-]{20,64}$/))
      .min(1)
      .max(5),
    declarationAccepted: z.literal(true),
    // Optional extended KYC fields
    phone: z.string().trim().max(30).optional(),
    phoneVerified: z.boolean().optional(),
    idTypeId: z.string().trim().max(50).optional(),
    idNumber: z.string().trim().max(64).optional(),
    taxId: z.string().trim().max(64).optional(),
    dateOfBirth: z.string().trim().max(30).optional(),
    companyRegNumber: z.string().trim().max(64).optional(),
    directorName: z.string().trim().max(160).optional(),
    residentialAddress: z
      .object({
        line1: z.string().trim().max(200),
        line2: z.string().trim().max(200).optional(),
        city: z.string().trim().max(100),
        state: z.string().trim().max(100).optional(),
        postalCode: z.string().trim().max(30).optional(),
        country: z.string().trim().max(100).optional(),
      })
      .optional(),
    businessAddress: z
      .object({
        line1: z.string().trim().max(200),
        line2: z.string().trim().max(200).optional(),
        city: z.string().trim().max(100),
        state: z.string().trim().max(100).optional(),
        postalCode: z.string().trim().max(30).optional(),
        country: z.string().trim().max(100).optional(),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (new Set(value.evidenceUploadIds).size !== value.evidenceUploadIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidenceUploadIds"],
        message: "Evidence uploads must be unique.",
      });
    }
  });

export const Route = createFileRoute("/api/public/v1/producer/verification")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const [producerDoc, kycDoc, draftDoc] = await Promise.all([
            fs.getDoc("producers/" + user.uid),
            fs.getDoc("kycProfiles/" + user.uid),
            fs.getDoc("kycDrafts/" + user.uid),
          ]);

          const verificationStatus =
            producerDoc?.["verificationStatus"] || (kycDoc as any)?.kycStatus?.toUpperCase() || "NOT_SUBMITTED";
          const rejectionReason =
            producerDoc?.["verificationRejectionReason"] ||
            (kycDoc as any)?.kycRejectionReason ||
            null;
          const submittedAt =
            producerDoc?.["verificationSubmittedAt"] ||
            (kycDoc as any)?.kycSubmittedAt ||
            null;
          const reviewedAt =
            producerDoc?.["verificationReviewedAt"] ||
            (kycDoc as any)?.kycReviewedAt ||
            null;

          return Response.json({
            verificationStatus,
            rejectionReason,
            submittedAt,
            reviewedAt,
            kycProfile: kycDoc
              ? {
                  kycStatus: (kycDoc as any).kycStatus,
                  kycType: (kycDoc as any).kycType,
                  kycCountry: (kycDoc as any).kycCountry,
                  maskedIdNumber: (kycDoc as any).maskedIdNumber,
                  maskedTaxNumber: (kycDoc as any).maskedTaxNumber,
                  maskedDateOfBirth: (kycDoc as any).maskedDateOfBirth,
                  maskedAccountNumber: (kycDoc as any).maskedAccountNumber,
                  legalName: (kycDoc as any).legalName,
                  businessName: (kycDoc as any).businessName,
                  phone: (kycDoc as any).phone,
                  phoneVerified: (kycDoc as any).phoneVerified,
                  idTypeId: (kycDoc as any).idTypeId,
                  companyRegNumber: (kycDoc as any).companyRegNumber,
                  directorName: (kycDoc as any).directorName,
                  residentialAddress: (kycDoc as any).residentialAddress,
                  businessAddress: (kycDoc as any).businessAddress,
                }
              : null,
            draft: draftDoc?.["draft"] || null,
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          if (!user.emailVerified)
            throw new ApiError(
              403,
              "EMAIL_VERIFICATION_REQUIRED",
              "Verify your email before submitting producer verification.",
            );
          const body = await parseBody(request, schema);

          // 18+ age verification check for individual producers
          if (body.dateOfBirth && !isAge18OrOlder(body.dateOfBirth)) {
            throw new ApiError(
              400,
              "AGE_RESTRICTED",
              "Producer verification requires an age of 18 or older.",
            );
          }

          const fs = await Firestore.create();
          await assertLegalAcceptance(fs, user.uid, "producer");
          await enforceRateLimit(fs, "producer-verification:" + user.uid, {
            limit: 3,
            windowMs: 24 * 60 * 60_000,
          });
          const existing = await fs.getDoc("producers/" + user.uid);
          if (existing?.["verificationStatus"] === "APPROVED") {
            throw new ApiError(
              409,
              "PRODUCER_ALREADY_VERIFIED",
              "This producer account is already verified.",
            );
          }
          const uploads = await Promise.all(
            body.evidenceUploadIds.map((uploadId) =>
              fs.getDoc("producerVerificationUploads/" + uploadId),
            ),
          );
          if (
            uploads.some(
              (upload) =>
                !upload || upload["uid"] !== user.uid || upload["status"] !== "awaiting_upload",
            )
          ) {
            throw new ApiError(
              400,
              "VERIFICATION_UPLOAD_INVALID",
              "One or more verification uploads are invalid or already attached.",
            );
          }
          const nowMs = Date.now();
          const paths = uploads.map((upload) =>
            typeof upload?.["path"] === "string" ? upload["path"] : "",
          );
          if (
            paths.some(
              (path) =>
                !isSafeStoragePath(path) ||
                !path.startsWith("producer-verification/" + user.uid + "/"),
            )
          ) {
            throw new ApiError(
              400,
              "VERIFICATION_EVIDENCE_PATH_INVALID",
              "Evidence must be uploaded to your private producer-verification folder.",
            );
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          for (let index = 0; index < uploads.length; index += 1) {
            const upload = uploads[index]!;
            const expiry =
              typeof upload["expiresAt"] === "string" ? Date.parse(upload["expiresAt"]) : 0;
            if (!Number.isFinite(expiry) || nowMs >= expiry) {
              throw new ApiError(
                410,
                "VERIFICATION_UPLOAD_EXPIRED",
                "One or more verification upload sessions have expired.",
              );
            }
            const path = paths[index]!;
            const { data, error } = await supabaseAdmin.storage
              .from("bq-sqwad-source-media")
              .createSignedUrl(path, 60);
            if (error || !data?.signedUrl) {
              throw new ApiError(
                400,
                "VERIFICATION_EVIDENCE_NOT_FOUND",
                "One or more private verification documents could not be found.",
              );
            }
            const response = await fetch(data.signedUrl, { headers: { Range: "bytes=0-511" } });
            if (response.status !== 206)
              throw new ApiError(
                502,
                "VERIFICATION_EVIDENCE_RANGE_UNSUPPORTED",
                "Private storage did not honor the bounded evidence inspection request.",
              );
            const header = new Uint8Array(await response.arrayBuffer());
            const range = response.headers.get("content-range");
            const totalMatch = range?.match(/\/(\d+)$/);
            const actualSize = totalMatch?.[1] ? Number(totalMatch[1]) : NaN;
            if (!Number.isSafeInteger(actualSize) || actualSize !== upload["declaredSizeBytes"]) {
              throw new ApiError(
                400,
                "VERIFICATION_EVIDENCE_SIZE_MISMATCH",
                "A verification document does not match its declared size.",
              );
            }
            const mime = upload["mimeType"];
            const validSignature =
              (mime === "application/pdf" &&
                header[0] === 0x25 &&
                header[1] === 0x50 &&
                header[2] === 0x44 &&
                header[3] === 0x46) ||
              (mime === "image/jpeg" &&
                header[0] === 0xff &&
                header[1] === 0xd8 &&
                header[2] === 0xff) ||
              (mime === "image/png" &&
                header[0] === 0x89 &&
                header[1] === 0x50 &&
                header[2] === 0x4e &&
                header[3] === 0x47) ||
              (mime === "image/webp" &&
                new TextDecoder().decode(header.slice(0, 4)) === "RIFF" &&
                new TextDecoder().decode(header.slice(8, 12)) === "WEBP");
            if (!validSignature)
              throw new ApiError(
                415,
                "VERIFICATION_EVIDENCE_TYPE_INVALID",
                "A verification document's file signature does not match its declared type.",
              );
          }
          const now = new Date().toISOString();
          const currentStatus = existing?.["verificationStatus"];
          if (currentStatus === "PENDING")
            throw new ApiError(
              409,
              "VERIFICATION_ALREADY_PENDING",
              "Your producer verification is already awaiting review.",
            );
          await fs.patchDoc("producers/" + user.uid, {
            verificationStatus: "PENDING",
            legalName: body.legalName,
            businessName: body.businessName ?? null,
            countryCode: body.countryCode,
            entityType: body.entityType,
            evidencePaths: paths,
            declarationAccepted: true,
            declarationAcceptedAt: now,
            verificationSubmittedAt: now,
            verificationSubmittedBy: user.uid,
            verificationReviewedAt: null,
            verificationReviewedBy: null,
            verificationReviewReason: null,
          });
          for (const uploadId of body.evidenceUploadIds) {
            await fs.patchDoc("producerVerificationUploads/" + uploadId, {
              status: "attached",
              attachedAt: now,
            });
          }
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "producer.verification_submitted",
            targetType: "producer",
            targetId: user.uid,
            reason:
              "Producer submitted identity, legal-entity and rights-holder verification evidence",
            metadata: {
              countryCode: body.countryCode,
              entityType: body.entityType,
              evidenceCount: paths.length,
            },
          });
          const docPaths: Record<string, string> = {};
          paths.forEach((p, i) => {
            docPaths["evidence_doc_" + (i + 1)] = p;
          });

          const kycType =
            body.entityType === "registered_business" || body.entityType === "company"
              ? "producer_business"
              : "producer_personal";

          // Batch C2: Calculate Risk Score and Duplicate Checks
          const existingPayout = await fs.getDoc(`payoutProfiles/${user.uid}`).catch(() => null);
          const payoutAccountName = String(existingPayout?.["beneficiaryName"] || existingPayout?.["accountName"] || "");

          let duplicateIdFound = false;
          let duplicatePhoneFound = false;
          const otherProfiles = await fs.query("kycProfiles", { limit: 100 }).catch(() => []);
          for (const other of otherProfiles) {
            if (other["uid"] === user.uid) continue;
            if (body.idNumber && other["maskedIdNumber"] && other["maskedIdNumber"] === maskIdNumber(body.idNumber)) {
              duplicateIdFound = true;
            }
            if (body.phone && other["phone"] === body.phone) {
              duplicatePhoneFound = true;
            }
          }

          const riskResult = calculateKycRiskScore({
            applicantUid: user.uid,
            country: body.countryCode,
            applicantName: body.legalName || body.businessName || "",
            payoutAccountName,
            duplicateIdFound,
            duplicatePhoneFound,
          });

          const verifier = getKycVerifier();
          const verifierResult = await verifier.evaluateCase({
            uid: user.uid,
            role: "producer",
            fullName: body.legalName || body.businessName || "",
            countryCode: body.countryCode,
            ...(body.idNumber ? { idNumber: body.idNumber } : {}),
            ...(body.companyRegNumber ? { companyRegNumber: body.companyRegNumber } : {}),
            documentVaultPaths: docPaths,
            ...(body.dateOfBirth ? { dateOfBirth: body.dateOfBirth } : {}),
          }).catch((err) => ({
            provider: verifier.name,
            status: "manual_review_required" as const,
            overallScore: 0,
            reasons: ["Verification evaluator error, falling back to manual review."],
            checks: {},
            performedAt: new Date().toISOString(),
            fallbackToManual: true,
            fallbackReason: "automatic check unavailable",
            manualReviewRequired: true,
            ownerNotice: "automatic check unavailable",
          }));

          await saveKycProfile(fs, {
            uid: user.uid,
            role: "producer",
            kycType,
            kycCountry: body.countryCode,
            ...(body.legalName !== undefined ? { legalName: body.legalName } : {}),
            ...(body.businessName !== undefined ? { businessName: body.businessName } : {}),
            ...(body.phone !== undefined ? { phone: body.phone } : {}),
            ...(body.phoneVerified !== undefined ? { phoneVerified: body.phoneVerified } : {}),
            ...(body.idTypeId !== undefined ? { idTypeId: body.idTypeId } : {}),
            ...(body.companyRegNumber !== undefined ? { companyRegNumber: body.companyRegNumber } : {}),
            ...(body.directorName !== undefined ? { directorName: body.directorName } : {}),
            ...(body.residentialAddress ? { residentialAddress: {
              line1: body.residentialAddress.line1,
              city: body.residentialAddress.city,
              ...(body.residentialAddress.line2 !== undefined ? { line2: body.residentialAddress.line2 } : {}),
              ...(body.residentialAddress.state !== undefined ? { state: body.residentialAddress.state } : {}),
              ...(body.residentialAddress.postalCode !== undefined ? { postalCode: body.residentialAddress.postalCode } : {}),
              ...(body.residentialAddress.country !== undefined ? { country: body.residentialAddress.country } : {}),
            } } : {}),
            ...(body.businessAddress ? { businessAddress: {
              line1: body.businessAddress.line1,
              city: body.businessAddress.city,
              ...(body.businessAddress.line2 !== undefined ? { line2: body.businessAddress.line2 } : {}),
              ...(body.businessAddress.state !== undefined ? { state: body.businessAddress.state } : {}),
              ...(body.businessAddress.postalCode !== undefined ? { postalCode: body.businessAddress.postalCode } : {}),
              ...(body.businessAddress.country !== undefined ? { country: body.businessAddress.country } : {}),
            } } : {}),
            ...(body.idNumber !== undefined ? { rawIdNumber: body.idNumber } : {}),
            ...(body.taxId !== undefined ? { rawTaxNumber: body.taxId } : {}),
            ...(body.dateOfBirth !== undefined ? { rawDateOfBirth: body.dateOfBirth } : {}),
            documentVaultPaths: docPaths,
            status: "pending",
            verifierResult,
            riskScore: riskResult.riskScore,
            riskLevel: riskResult.riskLevel,
            requiresFourEyes: riskResult.requiresFourEyes,
            riskFactors: riskResult.factors.map((f) => f.code),
          }).catch((err) => {
            console.warn("[KYC] Profile mirror sync warning:", err);
          });

          // Clear draft on successful submission
          await deleteKycDraft(fs, user.uid);

          return Response.json(
            { verificationStatus: "PENDING", submittedAt: now },
            { status: 202 },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
