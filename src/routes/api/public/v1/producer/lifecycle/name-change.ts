import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser, parseBody } from "@/lib/server/api";
import { writeAuditLog } from "@/lib/server/audit";
import { getKycProfile } from "@/lib/server/kyc/persistence";

const nameChangeRequestSchema = z.object({
  newName: z.string().trim().min(3).max(150),
  proofDocumentVaultPath: z.string().trim().min(5),
  reason: z.string().trim().min(5).max(500),
});

export const Route = createFileRoute("/api/public/v1/producer/lifecycle/name-change")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          const profile = await getKycProfile(fs, user.uid);
          if (!profile) {
            throw new ApiError(404, "PROFILE_NOT_FOUND", "KYC profile not found.");
          }

          if (profile.kycStatus !== "approved") {
            throw new ApiError(
              403,
              "KYC_NOT_APPROVED",
              "Only verified accounts with approved identity verification can request a name change.",
            );
          }

          const body = await parseBody(request, nameChangeRequestSchema);
          const now = new Date().toISOString();

          await fs.patchDoc(`kycProfiles/${user.uid}`, {
            pendingNameChange: {
              previousName: profile.legalName || "",
              newName: body.newName,
              proofDocumentVaultPath: body.proofDocumentVaultPath,
              reason: body.reason,
              requestedAt: now,
            },
            updatedAt: now,
          });

          await writeAuditLog(fs, {
            action: "kyc.name_change_requested",
            actorUid: user.uid,
            targetType: "kyc_case",
            targetId: user.uid,
            reason: body.reason,
            metadata: {
              actorEmail: user.email || "",
              previousName: profile.legalName,
              newName: body.newName,
              proofDocumentVaultPath: body.proofDocumentVaultPath,
            },
          });

          return Response.json({
            ok: true,
            status: "pending_review",
            message: "Legal name change request submitted for compliance review.",
            request: {
              previousName: profile.legalName,
              newName: body.newName,
              requestedAt: now,
            },
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
