import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { decryptSensitiveField } from "@/lib/server/kyc/types";

export const Route = createFileRoute("/api/public/v1/zillionaire/payouts/$payoutId/transfer-details")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const actor = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "payouts");

          const payoutId = params.payoutId;
          const payoutPath = `payouts/${payoutId}`;
          const payout = await fs.getDoc(payoutPath);

          if (!payout) {
            throw new ApiError(404, "PAYOUT_NOT_FOUND", "The payout request was not found.");
          }

          const uid = (payout["uid"] as string) || "";
          const [payoutProfile, kycProfile] = await Promise.all([
            fs.getDoc(`payoutProfiles/${uid}`),
            fs.getDoc(`kycProfiles/${uid}`),
          ]);

          // Decrypt account number for owner transfer view
          let unmaskedAccountNumber = (payoutProfile?.["accountNumberMasked"] as string) || "";
          if (payoutProfile?.["accountNumberEncrypted"]) {
            try {
              const enc = typeof payoutProfile["accountNumberEncrypted"] === "string"
                ? JSON.parse(payoutProfile["accountNumberEncrypted"] as string)
                : payoutProfile["accountNumberEncrypted"];
              unmaskedAccountNumber = decryptSensitiveField(enc);
            } catch {
              // fallback to masked if decryption fails
            }
          }

          const currency = (payout["currency"] as string) || "NGN";
          const amountMinor = Number(payout["amountMinor"] || 0);
          const amountFormatted = (amountMinor / 100).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });

          const beneficiaryName =
            (payoutProfile?.["beneficiaryName"] as string) ||
            (kycProfile?.["legalName"] as string) ||
            ((payout["payoutAccount"] as any)?.accountName as string) ||
            uid;

          const bankName =
            (payoutProfile?.["bankName"] as string) ||
            ((payout["payoutAccount"] as any)?.bankName as string) ||
            "Bank Wire";

          const bankAddress = (payoutProfile?.["bankAddress"] as string) || "Head Office";
          const beneficiaryAddress =
            (payoutProfile?.["beneficiaryAddress"] as string) ||
            (kycProfile?.["residentialAddress"] as string) ||
            (kycProfile?.["registeredAddress"] as string) ||
            "Verified Residence";

          const swiftBic =
            (payoutProfile?.["swiftBic"] as string) ||
            ((payout["payoutAccount"] as any)?.bankCode as string) ||
            "";

          const routingCode = (payoutProfile?.["routingCode"] as string) || "";
          const country = (payoutProfile?.["country"] as string) || (kycProfile?.["country"] as string) || "NG";

          const isLocal = country === "NG" && currency === "NGN";
          const feesNote = isLocal
            ? "Standard local transfer zero-fee settlement"
            : "International SWIFT wire transfer fee applies";

          const transferReference = `BQS-PAY-${payoutId.replace(/^po_/, "").slice(0, 10).toUpperCase()}`;

          // Ordered transfer fields matching transfer form exact order:
          // 1. Beneficiary Legal Name
          // 2. Account Number or IBAN (unmasked for owner)
          // 3. Bank Name
          // 4. SWIFT / BIC
          // 5. Routing / Sort Code
          // 6. Bank Address
          // 7. Beneficiary Address
          // 8. Country and Currency
          // 9. Transfer Amount
          // 10. Fees Note
          // 11. Reference to Use
          const orderedFields = [
            { key: "beneficiaryName", label: "Beneficiary Full Legal Name", value: beneficiaryName },
            { key: "accountNumber", label: "Account Number / IBAN", value: unmaskedAccountNumber },
            { key: "bankName", label: "Bank Name", value: bankName },
            { key: "swiftBic", label: "SWIFT / BIC Code", value: swiftBic },
            { key: "routingCode", label: "Routing / Sort Code", value: routingCode },
            { key: "bankAddress", label: "Bank Address", value: bankAddress },
            { key: "beneficiaryAddress", label: "Beneficiary Physical Address", value: beneficiaryAddress },
            { key: "countryAndCurrency", label: "Country & Currency", value: `${country} (${currency})` },
            { key: "amount", label: "Transfer Amount", value: `${currency} ${amountFormatted}` },
            { key: "feesNote", label: "Fees Note", value: feesNote },
            { key: "transferReference", label: "Transfer Reference", value: transferReference },
          ];

          // Audit owner viewing transfer details
          const now = new Date().toISOString();
          await fs.setDoc(`auditLog/${crypto.randomUUID()}`, {
            actorUid: actor.uid,
            action: "payout.transfer_details.viewed",
            targetType: "payout",
            targetId: payoutId,
            metadata: {
              uid,
              currency,
              amountMinor,
              country,
            },
            createdAt: now,
          });

          return Response.json({
            payoutId,
            uid,
            status: payout["status"],
            currency,
            amountMinor,
            amountFormatted,
            country,
            isLocal,
            feesNote,
            transferReference,
            orderedFields,
            details: {
              beneficiaryName,
              accountNumber: unmaskedAccountNumber,
              bankName,
              swiftBic,
              routingCode,
              bankAddress,
              beneficiaryAddress,
              country,
              currency,
              amountFormatted,
              feesNote,
              transferReference,
            },
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
