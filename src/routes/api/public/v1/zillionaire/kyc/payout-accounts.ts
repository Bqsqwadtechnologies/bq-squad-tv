import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser, parseBody } from "@/lib/server/api";
import { resolvePlatformAccess } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { generateShortLivedViewerUrl } from "@/lib/server/kyc/storage";
import { type PayoutProfileRecord } from "@/lib/server/payouts/types";

const actionSchema = z.object({
  uid: z.string().trim().min(1),
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/kyc/payout-accounts")({
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
              ["security", "compliance", "finance", "producers", "overview"].includes(m),
            );

          if (!hasAccess) {
            throw new ApiError(403, "FORBIDDEN", "Access to payout account review queue is restricted.");
          }

          const url = new URL(request.url);
          const tab = (url.searchParams.get("tab") || "pending").toLowerCase();
          const search = (url.searchParams.get("search") || "").trim().toLowerCase();

          const allProfilesRaw = await fs.query("payoutProfiles", { limit: 500 });
          const allProfiles = allProfilesRaw as unknown as PayoutProfileRecord[];

          let pendingCount = 0;
          let approvedCount = 0;
          let rejectedCount = 0;

          for (const p of allProfiles) {
            const vStatus = p.verificationStatus || "pending";
            if (vStatus === "approved") approvedCount++;
            else if (vStatus === "rejected") rejectedCount++;
            else pendingCount++;
          }

          // Filter by tab
          let filtered = allProfiles.filter((p) => {
            const vStatus = p.verificationStatus || "pending";
            if (tab === "pending") return vStatus === "pending";
            if (tab === "approved") return vStatus === "approved";
            if (tab === "rejected") return vStatus === "rejected";
            return true;
          });

          // Search filter
          if (search) {
            filtered = filtered.filter((p) => {
              const name = (p.beneficiaryName || "").toLowerCase();
              const bank = (p.bankName || "").toLowerCase();
              const c = (p.country || "").toLowerCase();
              const uid = (p.uid || "").toLowerCase();
              return name.includes(search) || bank.includes(search) || c.includes(search) || uid.includes(search);
            });
          }

          const viewerSecret = process.env["KYC_VAULT_SIGNING_SECRET"];

          const items = filtered.map((p) => {
            let proofViewerUrl: string | null = null;
            if (p.proofDocumentPath && viewerSecret) {
              try {
                const signed = generateShortLivedViewerUrl(p.proofDocumentPath, user.uid, 15);
                proofViewerUrl = `/api/public/v1/zillionaire/kyc/view-doc?path=${encodeURIComponent(p.proofDocumentPath)}&reviewerUid=${encodeURIComponent(user.uid)}&expires=${signed.expires}&sig=${signed.signature}`;
              } catch (e) {
                // fall through
              }
            }

            return {
              uid: p.uid,
              beneficiaryName: p.beneficiaryName,
              beneficiaryAddress: p.beneficiaryAddress,
              bankName: p.bankName,
              bankCountry: p.bankCountry,
              bankAddress: p.bankAddress,
              accountNumberMasked: p.accountNumberMasked,
              iban: p.iban,
              accountType: p.accountType,
              currency: p.currency,
              swiftBic: p.swiftBic,
              routingCode: p.routingCode,
              purposeOfPayment: p.purposeOfPayment,
              isManualBank: p.isManualBank,
              verificationStatus: p.verificationStatus || "pending",
              isLocked: Boolean(p.isLocked),
              payoutsPaused: Boolean(p.payoutsPaused),
              rejectionReason: p.rejectionReason || null,
              proofDocumentPath: p.proofDocumentPath || null,
              proofDocumentFileName: p.proofDocumentFileName || null,
              proofViewerUrl,
              checks: p.checks || {
                nameMatch: true,
                formatValid: true,
                currencyValid: true,
                countryMatch: true,
                duplicateDetected: false,
              },
              updatedAt: p.updatedAt,
            };
          });

          return Response.json({
            ok: true,
            items,
            counters: {
              pending: pendingCount,
              approved: approvedCount,
              rejected: rejectedCount,
              total: allProfiles.length,
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
            throw new ApiError(403, "FORBIDDEN", "Only compliance and platform owners can review payout accounts.");
          }

          const body = await parseBody(request, actionSchema);
          const now = new Date().toISOString();

          if (body.action === "reject" && (!body.reason || body.reason.trim().length < 3)) {
            throw new ApiError(400, "REJECTION_REASON_REQUIRED", "A rejection reason of at least 3 characters is required.");
          }

          const existing = await fs.getDoc(`payoutProfiles/${body.uid}`);
          if (!existing) {
            throw new ApiError(404, "PROFILE_NOT_FOUND", "Payout account profile not found.");
          }

          const isApproved = body.action === "approve";
          const newStatus = isApproved ? "approved" : "rejected";
          const isLocked = isApproved;
          const payoutsPaused = !isApproved;

          await fs.patchDoc(`payoutProfiles/${body.uid}`, {
            verificationStatus: newStatus,
            isLocked,
            payoutsPaused,
            rejectionReason: isApproved ? null : body.reason || null,
            reviewerNotes: body.notes || null,
            reviewedAt: now,
            reviewedBy: user.uid,
            updatedAt: now,
          });

          // In-app notification
          const notifId = `notif_payout_account_${body.uid}_${Date.now()}`;
          await fs.setDoc(`notifications/${notifId}`, {
            id: notifId,
            recipientUid: body.uid,
            type: "payout_account_decision",
            status: newStatus,
            title: isApproved ? "Payout Bank Account Verified" : "Payout Bank Account Needs Attention",
            message: isApproved
              ? "Your payout bank account has been verified and locked for secure payments."
              : `Your payout bank account was not approved: ${body.reason}`,
            createdAt: now,
            read: false,
          });

          // Email outbox event (user notices by email, never SMS)
          const outboxId = `mail_payout_acc_${body.uid}_${Date.now()}`;
          await fs.setDoc(`emailOutbox/${outboxId}`, {
            id: outboxId,
            toUid: body.uid,
            subject: isApproved
              ? "Your payout bank account is verified"
              : "Update on your payout bank account verification",
            template: "payout_account_status",
            context: {
              status: newStatus,
              reason: body.reason || null,
              notes: body.notes || null,
            },
            status: "queued",
            createdAt: now,
          });

          // Mandatory audit log
          await writeAuditLog(fs, {
            action: isApproved ? "payout_account_approved" : "payout_account_rejected",
            actorUid: user.uid,
            targetType: "user",
            targetId: body.uid,
            reason: body.reason || body.notes || `Payout account decision: ${body.action}`,
            metadata: {
              applicantUid: body.uid,
              action: body.action,
              resultingStatus: newStatus,
              isLocked,
              payoutsPaused,
            },
          });

          return Response.json({
            ok: true,
            success: true,
            action: body.action,
            uid: body.uid,
            verificationStatus: newStatus,
            isLocked,
            payoutsPaused,
            updatedAt: now,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
