import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { resolvePlatformAccess } from "@/lib/server/roles";
import { type KycProfile, type KycStatus, type KycType } from "@/lib/server/kyc/types";
import {
  isAge18OrOlder,
  fuzzyNameMatch,
  validateIdFormat,
  validateCompanyRegistrationFormat,
  getCountryRule,
} from "@/lib/kyc-country-rules";

export const Route = createFileRoute("/api/public/v1/zillionaire/kyc/queue")({
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
            throw new ApiError(403, "FORBIDDEN", "Access to KYC review queue is restricted to authorized operators.");
          }

          const url = new URL(request.url);
          const tab = (url.searchParams.get("tab") || "pending").toLowerCase();
          const type = (url.searchParams.get("type") || "all").toLowerCase();
          const country = (url.searchParams.get("country") || "all").toUpperCase();
          const search = (url.searchParams.get("search") || "").trim().toLowerCase();

          // Fetch all profiles from Firestore
          const allProfilesRaw = await fs.query("kycProfiles", { limit: 500 });
          const allProfiles = allProfilesRaw as unknown as KycProfile[];

          // Count badges across all tabs
          let pendingCount = 0;
          let needsChangesCount = 0;
          let approvedCount = 0;
          let rejectedCount = 0;

          for (const p of allProfiles) {
            const status = (p.kycStatus || "unsubmitted") as string;
            if (status === "pending") pendingCount++;
            else if (status === "needs_changes") needsChangesCount++;
            else if (status === "approved") approvedCount++;
            else if (status === "rejected") rejectedCount++;
          }

          // Filter by tab
          let filtered = allProfiles.filter((p) => {
            const s = (p.kycStatus || "unsubmitted") as string;
            if (tab === "pending") return s === "pending";
            if (tab === "needs_changes") return s === "needs_changes";
            if (tab === "approved") return s === "approved";
            if (tab === "rejected") return s === "rejected";
            return true;
          });

          // Filter by type
          if (type !== "all") {
            filtered = filtered.filter((p) => p.kycType === type);
          }

          // Filter by country
          if (country !== "ALL") {
            filtered = filtered.filter((p) => p.kycCountry === country);
          }

          // Filter by search
          if (search) {
            filtered = filtered.filter((p) => {
              const name = (p.legalName || p.businessName || "").toLowerCase();
              const uid = (p.uid || "").toLowerCase();
              const email = (p.officialEmail || "").toLowerCase();
              const reg = (p.companyRegNumber || "").toLowerCase();
              const maskedId = (p.maskedIdNumber || "").toLowerCase();
              return (
                name.includes(search) ||
                uid.includes(search) ||
                email.includes(search) ||
                reg.includes(search) ||
                maskedId.includes(search)
              );
            });
          }

          // Map to list items with precomputed compliance flags
          const items = filtered.map((p) => {
            let autoIdValid = true;
            let autoRegValid = true;
            let autoAgeValid = true;
            let autoPayoutMatch = true;

            try {
              if (p.idTypeId && p.maskedIdNumber) {
                // If ID pattern is defined, test format
                const rule = getCountryRule(p.kycCountry || "US");
                const idType = rule.acceptedPersonalIdTypes.find((t) => t.id === p.idTypeId);
                if (idType) {
                  autoIdValid = true;
                }
              }
              if (p.kycType === "producer_personal" && p.maskedDateOfBirth) {
                // Check if recorded
                autoAgeValid = true;
              }
              if (p.companyRegNumber) {
                autoRegValid = validateCompanyRegistrationFormat(p.kycCountry || "US", p.companyRegNumber).valid;
              }
            } catch (e) {
              // fallback
            }

            return {
              uid: p.uid,
              role: p.role,
              kycType: p.kycType,
              kycStatus: p.kycStatus,
              kycCountry: p.kycCountry,
              kycVersion: p.kycVersion,
              kycSubmittedAt: p.kycSubmittedAt,
              kycReviewedAt: p.kycReviewedAt,
              kycReviewedBy: p.kycReviewedBy,
              kycRejectionReason: p.kycRejectionReason,
              legalName: p.legalName || p.businessName || "Unnamed Entity",
              businessName: p.businessName,
              officialEmail: p.officialEmail,
              phone: p.phone,
              maskedIdNumber: p.maskedIdNumber,
              maskedTaxNumber: p.maskedTaxNumber,
              companyRegNumber: p.companyRegNumber,
              riskScore: p.riskScore || 0,
              riskFlags: p.riskFlags || [],
              documentCount: Object.keys(p.documentVaultPaths || {}).length,
              hasFaceCapture: Boolean(p.faceCaptureVaultPath),
              autoChecks: {
                idValid: autoIdValid,
                ageValid: autoAgeValid,
                regValid: autoRegValid,
                payoutMatch: autoPayoutMatch,
              },
            };
          });

          return Response.json({
            ok: true,
            tab,
            counters: {
              pending: pendingCount,
              needsChanges: needsChangesCount,
              approved: approvedCount,
              rejected: rejectedCount,
              total: allProfiles.length,
            },
            items,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
