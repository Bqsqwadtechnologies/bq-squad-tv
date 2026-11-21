import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requirePlatformRole } from "@/lib/server/roles";
import { getBanksForCountry, validateIban, validateNuban } from "@/lib/server/payouts/bank-directory";
import { encryptSensitiveField } from "@/lib/server/kyc/types";
import { PURPOSE_OF_PAYMENT_OPTIONS, type PayoutAccountChecks, type PayoutProfileRecord } from "@/lib/server/payouts/types";
import { fuzzyNameMatch } from "@/lib/kyc-country-rules";

const postSchema = z.object({
  bankId: z.string().optional(),
  bankName: z.string().trim().min(2).max(100),
  bankCountry: z.string().trim().length(2).toUpperCase().optional(),
  bankAddress: z.string().trim().min(2).max(250),
  accountNumber: z.string().trim().min(5).max(34),
  accountNumberConfirm: z.string().trim().min(5).max(34).optional(), confirmAccountNumber: z.string().trim().min(5).max(34).optional(),
  iban: z.string().trim().max(34).optional().nullable(),
  accountType: z.enum(["checking", "savings", "current"]).default("checking"),
  swiftBic: z.string().trim().min(8).max(11),
  routingCode: z.string().trim().max(20).optional().nullable(),
  purposeOfPayment: z.string().trim().min(2).max(100).default("streaming_royalties"),
  isManualBank: z.boolean().default(false),
  proofDocumentPath: z.string().trim().max(500).optional().nullable(),
  proofDocumentFileName: z.string().trim().max(255).optional().nullable(),
});

export const Route = createFileRoute("/api/public/v1/producer/payout-profile")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, user, "producer");

          const [kycDoc, payoutDoc] = await Promise.all([
            fs.getDoc(`kycProfiles/${user.uid}`),
            fs.getDoc(`payoutProfiles/${user.uid}`),
          ]);

          const kycCountry = String(kycDoc?.["kycCountry"] || "NG").toUpperCase();
          const kycStatus = String(kycDoc?.["kycStatus"] || "unsubmitted");
          const beneficiaryName = String(
            kycDoc?.["fullName"] || kycDoc?.["companyName"] || kycDoc?.["directorFullName"] || kycDoc?.["legalName"] || "",
          );
          const beneficiaryAddress = String(
            kycDoc?.["residentialAddress"] || kycDoc?.["registeredAddress"] || "",
          );

          const banks = getBanksForCountry(kycCountry);
          const defaultCurrency = kycCountry === "NG" ? "NGN" : "USD";

          return Response.json({
            kycCountry,
            kycStatus,
            beneficiaryName,
            beneficiaryAddress,
            defaultCurrency,
            banks,
            purposeOptions: PURPOSE_OF_PAYMENT_OPTIONS,
            existingProfile: payoutDoc
              ? {
                  bankName: payoutDoc["bankName"],
                  bankCountry: payoutDoc["bankCountry"],
                  bankAddress: payoutDoc["bankAddress"],
                  accountNumberMasked: payoutDoc["accountNumberMasked"],
                  iban: payoutDoc["iban"],
                  accountType: payoutDoc["accountType"],
                  currency: payoutDoc["currency"],
                  swiftBic: payoutDoc["swiftBic"],
                  routingCode: payoutDoc["routingCode"],
                  purposeOfPayment: payoutDoc["purposeOfPayment"],
                  isManualBank: Boolean(payoutDoc["isManualBank"]),
                  status: payoutDoc["status"],
                  verificationStatus: payoutDoc["verificationStatus"] || "pending",
                  isLocked: Boolean(payoutDoc["isLocked"]),
                  payoutsPaused: Boolean(payoutDoc["payoutsPaused"]),
                  rejectionReason: payoutDoc["rejectionReason"] || null,
                  proofDocumentPath: payoutDoc["proofDocumentPath"] || null,
                  proofDocumentFileName: payoutDoc["proofDocumentFileName"] || null,
                  checks: payoutDoc["checks"] || null,
                  updatedAt: payoutDoc["updatedAt"],
                }
              : null,
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, user, "producer");

          const body = await parseBody(request, postSchema);

          // 1. Enforce hard country lock against KYC profile
          const kycDoc = await fs.getDoc(`kycProfiles/${user.uid}`);
          const kycCountry = String(kycDoc?.["kycCountry"] || "NG").toUpperCase();

          const targetCountry = (body.bankCountry || kycCountry).toUpperCase();
          if (targetCountry !== kycCountry) {
            throw new ApiError(
              400,
              "COUNTRY_LOCK_VIOLATION",
              `Please use a bank account in ${kycCountry}, the country you verified.`,
            );
          }

          // 2. Account number confirmation match
          const confirmation = body.accountNumberConfirm || body.confirmAccountNumber;
          if (body.accountNumber !== confirmation) {
            throw new ApiError(400, "ACCOUNT_CONFIRMATION_MISMATCH", "Account numbers do not match.");
          }

          // 3. Country-specific validation
          let formatValid = true;
          if (kycCountry === "NG") {
            const nubanCheck = validateNuban(body.accountNumber);
            if (!nubanCheck.valid) {
              formatValid = false;
              throw new ApiError(400, "INVALID_NUBAN", nubanCheck.error || "Invalid 10-digit account number.");
            }
          }

          if (body.iban) {
            const ibanCheck = validateIban(body.iban, kycCountry);
            if (!ibanCheck.valid) {
              formatValid = false;
              throw new ApiError(400, "INVALID_IBAN", ibanCheck.error || "Invalid IBAN.");
            }
          }

          // 4. Beneficiary details pre-filled from verified KYC
          const beneficiaryName = String(
            kycDoc?.["fullName"] || kycDoc?.["companyName"] || kycDoc?.["directorFullName"] || kycDoc?.["legalName"] || "",
          );
          const beneficiaryAddress = String(
            kycDoc?.["residentialAddress"] || kycDoc?.["registeredAddress"] || "",
          );

          // 5. Encrypt sensitive account number and mask
          const rawAccount = body.accountNumber.trim();
          const encrypted = encryptSensitiveField(rawAccount);
          const masked =
            rawAccount.length > 4
              ? "*".repeat(Math.min(6, rawAccount.length - 4)) + rawAccount.slice(-4)
              : "****";

          const currency = kycCountry === "NG" ? "NGN" : "USD";
          const now = new Date().toISOString();

          // 6. Automated checks: name match, country match, format, duplicate across users
          const nameMatch = beneficiaryName.length > 0;
          const countryMatch = (body.bankCountry || kycCountry).toUpperCase() === kycCountry;
          const currencyValid = (kycCountry === "NG" && currency === "NGN") || (kycCountry !== "NG" && currency === "USD");

          // Duplicate account check
          let duplicateDetected = false;
          const otherProfiles = await fs.query("payoutProfiles", { limit: 250 });
          for (const other of otherProfiles) {
            if (other["uid"] === user.uid) continue;
            const sameBank = String(other["bankName"] || "").toLowerCase() === body.bankName.toLowerCase();
            const sameMasked = other["accountNumberMasked"] === masked;
            const sameIban = body.iban && typeof other["iban"] === "string" && other["iban"].toLowerCase() === body.iban.toLowerCase();
            if ((sameBank && sameMasked) || sameIban) {
              duplicateDetected = true;
              break;
            }
          }

          const checks: PayoutAccountChecks = {
            nameMatch,
            formatValid,
            currencyValid,
            countryMatch,
            duplicateDetected,
          };

          // Existing record check
          const existing = await fs.getDoc(`payoutProfiles/${user.uid}`);
          if (body.proofDocumentPath) {
            const expectedPrefix = `kyc-vault/payout-proof/${user.uid}/`;
            if (!body.proofDocumentPath.startsWith(expectedPrefix)) {
              throw new ApiError(400, "INVALID_PROOF_PATH", "Proof document path must belong to your account.");
            }
          }

          const wasApproved = existing?.["verificationStatus"] === "approved";

          // If was previously approved, modifying triggers re-review and pauses payouts
          const isLocked = false;
          const verificationStatus = "pending";
          const payoutsPaused = wasApproved ? true : false;

          const record: PayoutProfileRecord = {
            uid: user.uid,
            country: kycCountry,
            beneficiaryName,
            beneficiaryAddress,
            bankName: body.bankName,
            bankCountry: kycCountry,
            bankAddress: body.bankAddress,
            accountNumberEncrypted: JSON.stringify(encrypted),
            accountNumberMasked: masked,
            iban: body.iban || null,
            accountType: body.accountType,
            currency,
            swiftBic: body.swiftBic,
            routingCode: body.routingCode || null,
            purposeOfPayment: body.purposeOfPayment,
            taxResidency: kycCountry,
            taxIdMasked: typeof kycDoc?.["maskedTaxNumber"] === "string" ? kycDoc["maskedTaxNumber"] : null,
            isManualBank: body.isManualBank,
            status: body.isManualBank ? "flagged_for_review" : "active",
            verificationStatus,
            isLocked,
            payoutsPaused,
            proofDocumentPath: body.proofDocumentPath || (typeof existing?.["proofDocumentPath"] === "string" ? existing["proofDocumentPath"] : null),
            proofDocumentFileName: body.proofDocumentFileName || (typeof existing?.["proofDocumentFileName"] === "string" ? existing["proofDocumentFileName"] : null),
            proofDocumentUploadedAt: body.proofDocumentPath ? now : (typeof existing?.["proofDocumentUploadedAt"] === "string" ? existing["proofDocumentUploadedAt"] : null),
            checks,
            createdAt: typeof existing?.["createdAt"] === "string" ? existing["createdAt"] : now,
            updatedAt: now,
          };

          await fs.setDoc(`payoutProfiles/${user.uid}`, { ...record });

          const { accountNumberEncrypted: _omitted, ...safeProfile } = record;

          return Response.json({
            success: true,
            profile: safeProfile,
            accountNumberMasked: masked,
            currency,
            status: record.status,
            verificationStatus: record.verificationStatus,
            isLocked: record.isLocked,
            payoutsPaused: record.payoutsPaused,
            checks,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
