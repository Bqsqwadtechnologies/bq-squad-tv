import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser, parseBody } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { getKycProfile } from "@/lib/server/kyc/persistence";

const closeAccountSchema = z.object({
  uid: z.string().trim().min(1),
  reason: z.string().trim().min(5).max(1000),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/kyc/lifecycle/account-closure")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          // Compliance or security access required
          await requireZillionaireModule(fs, user, "compliance");

          const body = await parseBody(request, closeAccountSchema);
          const profile = await getKycProfile(fs, body.uid);
          if (!profile) {
            throw new ApiError(404, "PROFILE_NOT_FOUND", "KYC profile not found.");
          }

          if (profile.accountStatus === "CLOSED") {
            throw new ApiError(400, "ACCOUNT_ALREADY_CLOSED", "This account has already been closed.");
          }

          // Check if there are any pending payouts that must be cleared
          const pendingPayouts = await fs.query("payoutRequests", {
            where: [
              { field: "producerUid", op: "==", value: body.uid },
              { field: "status", op: "==", value: "pending" },
            ],
            limit: 10,
          }).catch(() => []);

          if (pendingPayouts.length > 0) {
            throw new ApiError(
              409,
              "PENDING_PAYOUTS_EXIST",
              "Cannot close account while pending payouts exist. Settle or return all payouts first.",
            );
          }

          const now = new Date().toISOString();

          // Mark KYC Profile closed while preserving all compliance and audit data under statutory retention
          await fs.patchDoc(`kycProfiles/${body.uid}`, {
            accountStatus: "CLOSED",
            closedAt: now,
            closedReason: body.reason,
            closedBy: user.uid,
            updatedAt: now,
          });

          // Disable producer / provider account
          if (profile.role === "producer") {
            await fs.patchDoc(`producers/${body.uid}`, {
              status: "CLOSED",
              isSuspended: true,
              updatedAt: now,
            }).catch(() => {});
          } else if (profile.role === "provider") {
            await fs.patchDoc(`providers/${body.uid}`, {
              status: "CLOSED",
              isSuspended: true,
              updatedAt: now,
            }).catch(() => {});
          }

          await writeAuditLog(fs, {
            action: "kyc.account_closed",
            actorUid: user.uid,
            actorEmail: user.email || "",
            targetType: "user",
            targetId: body.uid,
            reason: body.reason,
            metadata: {
              closedAt: now,
              closedBy: user.uid,
              preservedUnderRetention: true,
            },
          });

          return Response.json({
            ok: true,
            uid: body.uid,
            accountStatus: "CLOSED",
            closedAt: now,
            message: "Account closed. Identity and transaction records are preserved under statutory retention standards.",
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
