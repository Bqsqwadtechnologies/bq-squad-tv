import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser, parseBody } from "@/lib/server/api";
import { resolvePlatformAccess } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { getKycProfile } from "@/lib/server/kyc/persistence";

const revealSchema = z.object({
  uid: z.string().trim().min(1),
  field: z.enum([
    "idNumber",
    "taxNumber",
    "dateOfBirth",
    "accountNumber",
    "representativeIdNumber",
  ]),
  reason: z.string().trim().min(3).max(1000),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/kyc/reveal")({
  server: {
    handlers: {
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
            throw new ApiError(403, "FORBIDDEN", "Only compliance officers and platform owners can reveal sensitive KYC credentials.");
          }

          const body = await parseBody(request, revealSchema);

          // Retrieve profile with decrypted sensitive fields
          const profile = await getKycProfile(fs, body.uid, { decryptSensitive: true });
          if (!profile) {
            throw new ApiError(404, "PROFILE_NOT_FOUND", "KYC applicant record not found.");
          }

          let plaintext: string | null = null;
          if (body.field === "idNumber") {
            plaintext = (profile as any).decryptedIdNumber || null;
          } else if (body.field === "taxNumber") {
            plaintext = (profile as any).decryptedTaxNumber || null;
          } else if (body.field === "dateOfBirth") {
            plaintext = (profile as any).decryptedDateOfBirth || null;
          } else if (body.field === "accountNumber") {
            plaintext = (profile as any).decryptedAccountNumber || null;
          } else if (body.field === "representativeIdNumber") {
            plaintext = (profile as any).decryptedRepresentativeIdNumber || null;
          }

          if (!plaintext) {
            throw new ApiError(404, "FIELD_NOT_AVAILABLE", "Requested sensitive field is not recorded or cannot be decrypted.");
          }

          // Write mandatory audit log entry for credential reveal
          await writeAuditLog(fs, {
            action: "kyc_sensitive_field_revealed",
            actorUid: user.uid,
            targetType: "user",
            targetId: body.uid,
            reason: body.reason,
            metadata: {
              applicantUid: body.uid,
              revealedField: body.field,
              kycCountry: profile.kycCountry,
              kycType: profile.kycType,
            },
          });

          return Response.json({
            ok: true,
            uid: body.uid,
            field: body.field,
            plaintext,
            revealedAt: new Date().toISOString(),
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
