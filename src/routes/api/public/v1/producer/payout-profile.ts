import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requirePlatformRole } from "@/lib/server/roles";
import { getBanksForCountry, validateIban, validateNuban } from "@/lib/server/payouts/bank-directory";
import { encryptSensitiveField } from "@/lib/server/kyc/types";
import { PURPOSE_OF_PAYMENT_OPTIONS } from "@/lib/server/payouts/types";
import { fuzzyNameMatch } from "@/lib/kyc-country-rules";

const postSchema = z.object({
  bankId: z.string().optional(),
  bankName: z.string().trim().min(2).max(100),
  bankCountry: z.string().trim().length(2).toUpperCase(),
  bankAddress: z.string().trim().min(2).max(250),
  accountNumber: z.string().trim().min(5).max(34),
  accountNumberConfirm: z.string().trim().min(5).max(34),
  iban: z.string().trim().max(34).optional().nullable(),
  accountType: z.enum(["checking", "savings", "current"]).default("checking"),
  swiftBic: z.string().trim().min(8).max(11),
  routingCode: z.string().trim().max(20).optional().nullable(),
  purposeOfPayment: z.string().trim().min(2).max(100).default("streaming_royalties"),
  isManualBank: z.boolean().default(false),
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
            kycDoc?.["fullName"] || kycDoc?.["companyName"] || kycDoc?.["directorFullName"] || user.name || "",
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

          if (body.bankCountry !== kycCountry) {
            throw new ApiError(
              400,
              "COUNTRY_LOCK_VIOLATION",
              `Please use a bank account in ${kycCountry}, the country you verified.`,
            );
          }

          // 2. Account number confirmation match
          if (body.accountNumber !== body.accountNumberConfirm) {
            throw new ApiError(400, "ACCOUNT_CONFIRMATION_MISMATCH", "Account numbers do not match.");
          }

          // 3. Country-specific validation
          if (kycCountry === "NG") {
            const nubanCheck = validateNuban(body.accountNumber);
            if (!nubanCheck.valid) {
              throw new ApiError(400, "INVALID_NUBAN", nubanCheck.error || "Invalid 10-digit account number.");
            }
          }

          if (body.iban) {
            const ibanCheck = validateIban(body.iban, kycCountry);
            if (!ibanCheck.valid) {
              throw new ApiError(400, "INVALID_IBAN", ibanCheck.error || "Invalid IBAN.");
            }
          }

          // 4. Beneficiary details pre-filled from verified KYC
          const beneficiaryName = String(
            kycDoc?.["fullName"] || kycDoc?.["companyName"] || kycDoc?.["directorFullName"] || user.name || "",
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

          const record = {
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
            taxIdMasked: kycDoc?.["maskedTaxNumber"] || null,
            isManualBank: body.isManualBank,
            status: body.isManualBank ? "flagged_for_review" : "active",
            createdAt: now,
            updatedAt: now,
          };

          await fs.setDoc(`payoutProfiles/${user.uid}`, record);

          return Response.json({
            success: true,
            accountNumberMasked: masked,
            currency,
            status: record.status,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
