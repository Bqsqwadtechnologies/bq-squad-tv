import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requirePlatformRole } from "@/lib/server/roles";
import { getKycProfile } from "@/lib/server/kyc/persistence";
import { isSafeStoragePath } from "@/lib/server/storage/security";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({
  proofOfAddressVaultPath: z.string().min(5).max(300),
  sourceOfIncomeVaultPath: z.string().min(5).max(300).optional(),
  sourceOfIncomeDescription: z.string().min(3).max(500),
  declarationAccepted: z.literal(true),
});

export const Route = createFileRoute("/api/public/v1/producer/tier2-verification")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, user, "producer");

          const profile = await getKycProfile(fs, user.uid);
          if (!profile || profile.kycStatus !== "approved") {
            throw new ApiError(
              403,
              "KYC_NOT_APPROVED",
              "Standard Tier 1 KYC approval is required before submitting Tier 2 enhanced verification.",
            );
          }

          const body = await parseBody(request, schema);

          // Validate safe storage paths
          if (!isSafeStoragePath(body.proofOfAddressVaultPath)) {
            throw new ApiError(400, "INVALID_PATH", "Invalid proof of address storage path.");
          }
          if (body.sourceOfIncomeVaultPath && !isSafeStoragePath(body.sourceOfIncomeVaultPath)) {
            throw new ApiError(400, "INVALID_PATH", "Invalid source of income storage path.");
          }

          const now = new Date().toISOString();
          const tier2Doc = {
            proofOfAddressVaultPath: body.proofOfAddressVaultPath,
            sourceOfIncomeVaultPath: body.sourceOfIncomeVaultPath || "",
            sourceOfIncomeDescription: body.sourceOfIncomeDescription,
            submittedAt: now,
          };

          await fs.patchDoc(`kycProfiles/${user.uid}`, {
            tier2Status: "pending_review",
            tier2SubmittedAt: now,
            tier2Documents: tier2Doc,
            updatedAt: now,
          });

          await writeAuditLog(fs, {
            action: "kyc.tier2_submitted",
            actorUid: user.uid,
            actorEmail: user.email || "",
            targetType: "user",
            targetId: user.uid,
            reason: "Producer submitted Tier 2 enhanced KYC verification documents",
          });

          return Response.json(
            { ok: true, tier2Status: "pending_review", submittedAt: now },
            { status: 202, headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
