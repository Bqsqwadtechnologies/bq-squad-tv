import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { decryptSensitiveField } from "@/lib/server/kyc/types";

const schema = z.object({
  group: z.enum(["LOCAL", "INTERNATIONAL", "ALL"]).default("ALL"),
  payoutIds: z.array(z.string().trim()).optional(),
});

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

export const Route = createFileRoute("/api/public/v1/zillionaire/payouts/export")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const actor = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, actor, "payouts");

          let candidates = await fs.query("payouts", {
            filters: [{ field: "status", op: "EQUAL", value: "APPROVED" }],
            limit: 500,
          });

          if (body.payoutIds && body.payoutIds.length > 0) {
            const requestedSet = new Set(body.payoutIds);
            candidates = candidates.filter((c) => requestedSet.has(c.__id || c["id"]));
          }

          if (candidates.length === 0) {
            throw new ApiError(404, "NO_APPROVED_PAYOUTS", "No approved payouts match selection for export.");
          }

          // Enrich records with payout account / KYC details
          const enriched = await Promise.all(
            candidates.map(async (p) => {
              const pid = p.__id || p["id"];
              const uid = (p["uid"] as string) || "";
              const [payoutProfile, kycProfile] = await Promise.all([
                fs.getDoc(`payoutProfiles/${uid}`),
                fs.getDoc(`kycProfiles/${uid}`),
              ]);

              let accountNumber = (payoutProfile?.["accountNumberMasked"] as string) || "";
              if (payoutProfile?.["accountNumberEncrypted"]) {
                try {
                  const enc = typeof payoutProfile["accountNumberEncrypted"] === "string"
                    ? JSON.parse(payoutProfile["accountNumberEncrypted"] as string)
                    : payoutProfile["accountNumberEncrypted"];
                  accountNumber = decryptSensitiveField(enc);
                } catch {
                  // fallback to masked
                }
              }

              const currency = (p["currency"] as string) || "NGN";
              const amountMinor = Number(p["amountMinor"] || 0);
              const amount = (amountMinor / 100).toFixed(2);
              const country = (payoutProfile?.["country"] as string) || (kycProfile?.["country"] as string) || "NG";
              const isLocal = country === "NG" && currency === "NGN";

              return {
                payoutId: pid,
                uid,
                isLocal,
                beneficiaryName:
                  (payoutProfile?.["beneficiaryName"] as string) ||
                  (kycProfile?.["legalName"] as string) ||
                  ((p["payoutAccount"] as any)?.accountName as string) ||
                  uid,
                accountNumber,
                bankName:
                  (payoutProfile?.["bankName"] as string) ||
                  ((p["payoutAccount"] as any)?.bankName as string) ||
                  "Bank Transfer",
                swiftBic:
                  (payoutProfile?.["swiftBic"] as string) ||
                  ((p["payoutAccount"] as any)?.bankCode as string) ||
                  "",
                routingCode: (payoutProfile?.["routingCode"] as string) || "",
                bankAddress: (payoutProfile?.["bankAddress"] as string) || "Head Office",
                beneficiaryAddress:
                  (payoutProfile?.["beneficiaryAddress"] as string) ||
                  (kycProfile?.["residentialAddress"] as string) ||
                  (kycProfile?.["registeredAddress"] as string) ||
                  "Verified Residence",
                country,
                currency,
                amount,
                reference: `BQS-PAY-${pid.replace(/^po_/, "").slice(0, 10).toUpperCase()}`,
              };
            }),
          );

          // Group by Local vs International
          const localItems = enriched.filter((i) => i.isLocal);
          const internationalItems = enriched.filter((i) => !i.isLocal);

          let filtered = enriched;
          if (body.group === "LOCAL") {
            filtered = localItems;
          } else if (body.group === "INTERNATIONAL") {
            filtered = internationalItems;
          }

          // Build CSV Header & Rows
          const headers = [
            "Beneficiary Name",
            "Account Number / IBAN",
            "Bank Name",
            "SWIFT / BIC",
            "Routing Code",
            "Currency",
            "Amount",
            "Reference",
            "Country",
            "Bank Address",
            "Beneficiary Address",
            "Payout ID",
          ];

          const rows = filtered.map((item) => [
            escapeCsvField(item.beneficiaryName),
            escapeCsvField(item.accountNumber),
            escapeCsvField(item.bankName),
            escapeCsvField(item.swiftBic),
            escapeCsvField(item.routingCode),
            escapeCsvField(item.currency),
            escapeCsvField(item.amount),
            escapeCsvField(item.reference),
            escapeCsvField(item.country),
            escapeCsvField(item.bankAddress),
            escapeCsvField(item.beneficiaryAddress),
            escapeCsvField(item.payoutId),
          ]);

          const csvContent = [headers.map(escapeCsvField).join(","), ...rows.map((r) => r.join(","))].join("\n");

          // Audit the batch export
          const now = new Date().toISOString();
          await fs.setDoc(`auditLog/${crypto.randomUUID()}`, {
            actorUid: actor.uid,
            action: "payout.batch_export",
            targetType: "payout_batch",
            targetId: body.group,
            metadata: {
              group: body.group,
              totalRecords: filtered.length,
              localCount: localItems.length,
              internationalCount: internationalItems.length,
            },
            createdAt: now,
          });

          return Response.json({
            success: true,
            group: body.group,
            totalExported: filtered.length,
            localCount: localItems.length,
            internationalCount: internationalItems.length,
            csv: csvContent,
            records: filtered,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
