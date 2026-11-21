import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser, parseBody } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { getKycProfile } from "@/lib/server/kyc/persistence";

const legalHoldSchema = z.object({
  uid: z.string().trim().min(1),
  action: z.enum(["place", "remove"]),
  reason: z.string().trim().min(5).max(1000),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/kyc/retention/legal-hold")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          // Compliance or security access required
          await requireZillionaireModule(fs, user, "compliance");

          const body = await parseBody(request, legalHoldSchema);
          const profile = await getKycProfile(fs, body.uid);
          if (!profile) {
            throw new ApiError(404, "PROFILE_NOT_FOUND", "KYC profile not found.");
          }

          const now = new Date().toISOString();

          if (body.action === "place") {
            await fs.patchDoc(`kycProfiles/${body.uid}`, {
              legalHold: true,
              legalHoldReason: body.reason,
              legalHoldPlacedAt: now,
              legalHoldPlacedBy: user.uid,
              updatedAt: now,
            });

            await writeAuditLog(fs, {
              action: "kyc.legal_hold_placed",
              actorUid: user.uid,
              actorEmail: user.email || "",
              targetType: "kyc_case",
              targetId: body.uid,
              reason: body.reason,
              metadata: {
                legalHoldPlacedAt: now,
                placedBy: user.uid,
              },
            });

            return Response.json({
              ok: true,
              action: "place",
              uid: body.uid,
              legalHold: true,
              reason: body.reason,
            });
          } else {
            await fs.patchDoc(`kycProfiles/${body.uid}`, {
              legalHold: false,
              legalHoldReason: null,
              legalHoldRemovedAt: now,
              legalHoldRemovedBy: user.uid,
              updatedAt: now,
            });

            await writeAuditLog(fs, {
              action: "kyc.legal_hold_removed",
              actorUid: user.uid,
              actorEmail: user.email || "",
              targetType: "kyc_case",
              targetId: body.uid,
              reason: body.reason,
              metadata: {
                legalHoldRemovedAt: now,
                removedBy: user.uid,
              },
            });

            return Response.json({
              ok: true,
              action: "remove",
              uid: body.uid,
              legalHold: false,
              reason: body.reason,
            });
          }
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
