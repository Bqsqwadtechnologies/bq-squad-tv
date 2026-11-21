import { calculateKycRiskScore } from "@/lib/server/kyc/risk-scoring";
import { maskIdNumber } from "@/lib/server/kyc/types";
import { getKycVerifier } from "@/lib/server/kyc/verifier";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { getConfiguredOwnerEmail } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import {
  getCountryRule,
  validateCompanyRegistrationFormat,
  validateTaxIdFormat,
  validateIdFormat,
  isBusinessDomainEmail,
  fuzzyNameMatch,
} from "@/lib/kyc-country-rules";
import {
  saveKycProfile,
  getKycProfile,
  deleteKycDraft,
  getKycDraft,
} from "@/lib/server/kyc/persistence";
import { isSafeStoragePath } from "@/lib/server/storage/security";

const UPLOAD_ID_REGEX = /^[A-Za-z0-9_-]{20,64}$/;

const schema = z.object({
  countryCode: z.string().trim().length(2),
  legalCompanyName: z.string().trim().min(2).max(200),
  registrationNumber: z.string().trim().min(3).max(64),
  taxId: z.string().trim().min(3).max(64),
  registeredAddress: z.object({
    line1: z.string().trim().min(2).max(200),
    line2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().max(100).optional(),
    postalCode: z.string().trim().max(30).optional(),
    country: z.string().trim().min(2).max(100),
  }),
  businessEmail: z.string().trim().email().max(160),
  businessEmailVerified: z.boolean(),
  businessPhone: z.string().trim().min(7).max(30),
  businessPhoneVerified: z.boolean(),
  representative: z.object({
    fullName: z.string().trim().min(2).max(160),
    title: z.string().trim().min(2).max(100),
    idTypeId: z.string().trim().min(2).max(50),
    idNumber: z.string().trim().min(3).max(64),
  }),
  settlementAccount: z.object({
    bankName: z.string().trim().min(2).max(100),
    accountNumber: z.string().trim().min(4).max(64),
    accountName: z.string().trim().min(2).max(160),
    currency: z.string().trim().min(2).max(10),
  }),
  evidenceUploadIds: z.array(z.string().regex(UPLOAD_ID_REGEX)).min(1).max(10),
  declarationAccepted: z.literal(true),
});

export const Route = createFileRoute("/api/public/v1/provider/verification")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          const callerEmail = (user.email || "").trim().toLowerCase();
          const ownerEmail = getConfiguredOwnerEmail();
          const isOwner = Boolean(ownerEmail && callerEmail === ownerEmail);

          // Check approved list
          let isPreapproved = isOwner;
          if (!isPreapproved && callerEmail) {
            const approvedDoc = await fs.getDoc(`approvedProviders/${callerEmail}`);
            isPreapproved = Boolean(
              approvedDoc &&
                (approvedDoc["status"] === "granted" ||
                  approvedDoc["status"] === "verified" ||
                  approvedDoc["status"] === "approved"),
            );
          }

          const providerUser = await fs.getDoc(`providerUsers/${user.uid}`);
          const providerId = providerUser?.["providerId"] || user.uid;

          const [kycDoc, draft, providerDoc] = await Promise.all([
            getKycProfile(fs, user.uid),
            getKycDraft(fs, user.uid),
            fs.getDoc(`providers/${providerId}`),
          ]);

          const verificationStatus =
            kycDoc?.kycStatus ||
            (providerDoc?.["status"] === "active" ? "approved" : "unsubmitted");

          return Response.json({
            isPreapproved,
            providerId,
            verificationStatus,
            rejectionReason: kycDoc?.kycRejectionReason || null,
            submittedAt: kycDoc?.kycSubmittedAt || null,
            reviewedAt: kycDoc?.kycReviewedAt || null,
            kycProfile: kycDoc
              ? {
                  kycStatus: kycDoc.kycStatus,
                  kycType: kycDoc.kycType,
                  kycCountry: kycDoc.kycCountry,
                  legalName: kycDoc.legalName,
                  businessName: kycDoc.businessName,
                  companyRegNumber: kycDoc.companyRegNumber,
                  officialEmail: kycDoc.officialEmail,
                  phone: kycDoc.phone,
                  maskedTaxNumber: kycDoc.maskedTaxNumber,
                  maskedAccountNumber: kycDoc.maskedAccountNumber,
                  representative: kycDoc.representative,
                  businessAddress: kycDoc.businessAddress,
                }
              : null,
            draft: draft || null,
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          const raw = await request.json().catch(() => null);
          const parsed = schema.safeParse(raw);
          if (!parsed.success) {
            const first = parsed.error.issues[0];
            throw new ApiError(
              400,
              "VALIDATION_FAILED",
              first ? `${first.path.join(".")}: ${first.message}` : "Invalid verification payload.",
            );
          }

          const body = parsed.data;

          // 1. Approved provider email check
          const callerEmail = (user.email || body.businessEmail).trim().toLowerCase();
          const ownerEmail = getConfiguredOwnerEmail();
          const isOwner = Boolean(ownerEmail && callerEmail === ownerEmail);

          if (!isOwner) {
            const approvedDoc = await fs.getDoc(`approvedProviders/${callerEmail}`);
            const isApproved =
              approvedDoc &&
              (approvedDoc["status"] === "granted" ||
                approvedDoc["status"] === "verified" ||
                approvedDoc["status"] === "approved");
            if (!isApproved) {
              throw new ApiError(
                403,
                "EMAIL_NOT_PREAPPROVED",
                "We couldn't verify this account. Request access at tv.bqsqwad.com/provider.",
              );
            }
          }

          // 2. Business domain email check (must NOT be consumer freemail)
          if (!isBusinessDomainEmail(body.businessEmail)) {
            throw new ApiError(
              400,
              "BUSINESS_EMAIL_REQUIRED",
              "Official company email must be on a corporate business domain (freemail accounts are not accepted for licensed providers).",
            );
          }

          if (!body.businessEmailVerified) {
            throw new ApiError(
              400,
              "EMAIL_VERIFICATION_REQUIRED",
              "Official company email must be verified by verification code.",
            );
          }

          if (!body.businessPhoneVerified) {
            throw new ApiError(
              400,
              "PHONE_VERIFICATION_REQUIRED",
              "Official company phone number must be verified by verification code.",
            );
          }

          // 3. Country compliance & format checks
          const countryCode = body.countryCode.toUpperCase().trim();
          getCountryRule(countryCode); // throws if invalid ISO code

          const regCheck = validateCompanyRegistrationFormat(countryCode, body.registrationNumber);
          if (!regCheck.valid) {
            throw new ApiError(
              400,
              "INVALID_REGISTRATION_NUMBER",
              regCheck.message || "Invalid company registration number for selected country.",
            );
          }

          const taxCheck = validateTaxIdFormat(countryCode, body.taxId);
          if (!taxCheck.valid) {
            throw new ApiError(
              400,
              "INVALID_TAX_ID",
              taxCheck.message || "Invalid tax identification number for selected country.",
            );
          }

          const repIdCheck = validateIdFormat(
            countryCode,
            body.representative.idTypeId,
            body.representative.idNumber,
          );
          if (!repIdCheck.valid) {
            throw new ApiError(
              400,
              "INVALID_REPRESENTATIVE_ID",
              repIdCheck.message || "Invalid representative ID number for selected ID type and country.",
            );
          }

          // 4. Corporate payout account name matching
          const matchResult = fuzzyNameMatch(
            body.settlementAccount.accountName,
            body.legalCompanyName,
          );
          if (!matchResult.matches) {
            throw new ApiError(
              400,
              "CORPORATE_PAYOUT_MISMATCH",
              "Corporate payout account name must match the legal company name.",
            );
          }

          // 5. Evidence uploads validation
          const docPaths: Record<string, string> = {};
          const nowMs = Date.now();
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          for (const uploadId of body.evidenceUploadIds) {
            const session = await fs.getDoc(`kycUploadSessions/${uploadId}`);
            if (!session) {
              throw new ApiError(400, "UPLOAD_SESSION_NOT_FOUND", `Upload session ${uploadId} not found.`);
            }
            if (session["uid"] !== user.uid) {
              throw new ApiError(403, "UPLOAD_SESSION_FORBIDDEN", "Upload session belongs to another user.");
            }
            if (session["status"] !== "awaiting_submission") {
              throw new ApiError(400, "UPLOAD_SESSION_INVALID", `Upload session is already ${session["status"]}.`);
            }
            const expiry = typeof session["expiresAt"] === "string" ? Date.parse(session["expiresAt"]) : 0;
            if (!Number.isFinite(expiry) || nowMs >= expiry) {
              throw new ApiError(410, "UPLOAD_SESSION_EXPIRED", "One or more document uploads have expired.");
            }

            const safePath = String(session["storagePath"] || "");
            if (!isSafeStoragePath(safePath) || !safePath.startsWith(`kyc/${user.uid}/`)) {
              throw new ApiError(400, "UPLOAD_PATH_INVALID", "Invalid document path.");
            }

            const { data, error } = await supabaseAdmin.storage
              .from("bq-sqwad-source-media")
              .createSignedUrl(safePath, 60);

            if (error || !data?.signedUrl) {
              throw new ApiError(
                400,
                "UPLOAD_FILE_MISSING",
                "Uploaded document could not be found in secure storage.",
              );
            }

            docPaths[uploadId] = safePath;
          }

          // 6. Resolve provider ID
          const providerUser = await fs.getDoc(`providerUsers/${user.uid}`);
          const providerId = (providerUser?.["providerId"] as string) || `prov_${Date.now()}`;

          // Batch C2: Risk Scoring and Duplicate Checks
          const existingPayout = await fs.getDoc(`payoutProfiles/${user.uid}`).catch(() => null);
          const payoutAccountName = existingPayout
            ? (existingPayout["beneficiaryName"] || existingPayout["accountName"] || "")
            : undefined;

          let duplicateIdFound = false;
          let duplicatePhoneFound = false;
          const otherProfiles = await fs.query("kycProfiles", { limit: 100 }).catch(() => []);
          for (const other of otherProfiles) {
            if (other["uid"] === user.uid) continue;
            if (body.representative.idNumber && other["maskedIdNumber"] && other["maskedIdNumber"] === maskIdNumber(body.representative.idNumber)) {
              duplicateIdFound = true;
            }
            if (body.businessPhone && other["phone"] === body.businessPhone) {
              duplicatePhoneFound = true;
            }
          }

          const riskResult = calculateKycRiskScore({
            applicantUid: user.uid,
            country: countryCode,
            applicantName: body.legalCompanyName,
            payoutAccountName,
            duplicateIdFound,
            duplicatePhoneFound,
          });

          // 7. Evaluate with KYC verification adapter
          const verifier = getKycVerifier();
          const verifierResult = await verifier.evaluateCase({
            uid: user.uid,
            role: "provider",
            fullName: body.legalCompanyName,
            countryCode,
            idNumber: body.representative.idNumber,
            companyRegNumber: body.registrationNumber,
            documentVaultPaths: docPaths,
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

          // Persist KYC profile with encrypted fields and verifier output
          const profile = await saveKycProfile(fs, {
            uid: user.uid,
            providerId,
            role: "provider",
            kycType: "provider_corporate",
            kycCountry: countryCode,
            legalName: body.legalCompanyName,
            businessName: body.legalCompanyName,
            officialEmail: body.businessEmail,
            officialEmailVerified: true,
            phone: body.businessPhone,
            phoneVerified: true,
            companyRegNumber: body.registrationNumber,
            representative: {
              fullName: body.representative.fullName,
              title: body.representative.title,
              idTypeId: body.representative.idTypeId,
            },
            businessAddress: body.registeredAddress,
            rawTaxNumber: body.taxId,
            rawAccountNumber: body.settlementAccount.accountNumber,
            rawRepresentativeIdNumber: body.representative.idNumber,
            documentVaultPaths: docPaths,
            status: "pending",
            verifierResult,
            riskScore: riskResult.riskScore,
            riskLevel: riskResult.riskLevel,
            requiresFourEyes: riskResult.requiresFourEyes,
            riskFactors: riskResult.factors.map((f) => f.code),
          });

          // Mark upload sessions consumed
          for (const uploadId of body.evidenceUploadIds) {
            await fs.patchDoc(`kycUploadSessions/${uploadId}`, {
              status: "consumed",
              consumedAt: new Date().toISOString(),
            }).catch(() => {});
          }

          // Synchronize provider doc
          await fs.setDoc(`providers/${providerId}`, {
            providerId,
            name: body.legalCompanyName,
            country: countryCode,
            contactEmail: body.businessEmail,
            contactPhone: body.businessPhone,
            legal: {
              registrationNumber: body.registrationNumber,
              taxId: profile.maskedTaxNumber,
              registeredAddress: `${body.registeredAddress.line1}, ${body.registeredAddress.city}`,
              legalEntityType: "Corporation",
            },
            settlement: {
              bankName: body.settlementAccount.bankName,
              accountName: body.settlementAccount.accountName,
              accountNumberMasked: profile.maskedAccountNumber,
              currency: body.settlementAccount.currency,
            },
            kycStatus: "pending",
            status: "pending_approval",
            registeredByUid: user.uid,
            updatedAt: new Date().toISOString(),
          });

          await fs.setDoc(`providerUsers/${user.uid}`, {
            uid: user.uid,
            providerId,
            status: "PENDING_APPROVAL",
            assignedAt: new Date().toISOString(),
          });

          // Create approval ticket for Zillionaire review queue
          const approvalId = `appr_kyc_prov_${Date.now()}`;
          await fs.setDoc(`approvals/${approvalId}`, {
            approvalId,
            type: "provider_kyc",
            targetType: "provider",
            targetId: providerId,
            applicantUid: user.uid,
            providerName: body.legalCompanyName,
            contactEmail: body.businessEmail,
            country: countryCode,
            status: "PENDING",
            createdAt: new Date().toISOString(),
            metadata: {
              kycVersion: profile.kycVersion,
              kycType: "provider_corporate",
              registrationNumber: body.registrationNumber,
              representative: body.representative.fullName,
              currency: body.settlementAccount.currency,
            },
          });

          // 8. Delete draft after successful submission
          await deleteKycDraft(fs, user.uid);

          // 9. Write audit log
          await writeAuditLog(fs, {
            action: "provider_kyc_submitted",
            actorUid: user.uid,
            targetType: "provider",
            targetId: providerId,
            reason: "Provider corporate KYC verification submitted",
            metadata: {
              country: countryCode,
              companyName: body.legalCompanyName,
              businessEmail: body.businessEmail,
              approvalId,
            },
          });

          return Response.json(
            {
              ok: true,
              providerId,
              kycStatus: "pending",
              message: "Corporate KYC submitted successfully. Your application is under compliance review.",
              approvalTicketId: approvalId,
            },
            { status: 201 },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
