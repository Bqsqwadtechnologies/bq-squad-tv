import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser, parseBody } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { getKycProfile } from "@/lib/server/kyc/persistence";

const reviewNameChangeSchema = z.object({
  uid: z.string().trim().min(1),
  action: z.enum(["approve", "reject"]),
  notes: z.string().trim().min(3).max(1000),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/kyc/lifecycle/name-change")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "compliance");

          const allProfiles = (await fs.query("kycProfiles", { limit: 500 }).catch(() => [])) as any[];
          const pending = allProfiles
            .filter((p) => p["pendingNameChange"] && typeof p["pendingNameChange"] === "object")
            .map((p) => ({
              uid: p.uid,
              legalName: p.legalName,
              kycCountry: p.kycCountry,
              pendingNameChange: p.pendingNameChange,
            }));

          return Response.json({
            ok: true,
            pendingCount: pending.length,
            requests: pending,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "compliance");

          const body = await parseBody(request, reviewNameChangeSchema);
          const profile = await getKycProfile(fs, body.uid);
          if (!profile) {
            throw new ApiError(404, "PROFILE_NOT_FOUND", "KYC profile not found.");
          }

          const pending = (profile as any).pendingNameChange;
          if (!pending) {
            throw new ApiError(400, "NO_PENDING_NAME_CHANGE", "This profile has no pending name change request.");
          }

          const now = new Date().toISOString();
          const existingHistory = Array.isArray(profile.nameChangeHistory) ? profile.nameChangeHistory : [];

          const historyEntry = {
            previousName: pending.previousName || profile.legalName || "",
            newName: pending.newName,
            proofDocumentPath: pending.proofDocumentVaultPath || "",
            reason: pending.reason || "",
            reviewedBy: user.uid,
            reviewedAt: now,
            status: body.action === "approve" ? "approved" : "rejected",
            reviewerNotes: body.notes,
          };

          const patchData: Record<string, any> = {
            pendingNameChange: null,
            nameChangeHistory: [...existingHistory, historyEntry],
            updatedAt: now,
          };

          if (body.action === "approve") {
            patchData.legalName = pending.newName;
            // Also update producer document
            await fs.patchDoc(`producers/${body.uid}`, {
              name: pending.newName,
              legalName: pending.newName,
              updatedAt: now,
            }).catch(() => {});
          }

          await fs.patchDoc(`kycProfiles/${body.uid}`, patchData);

          await writeAuditLog(fs, {
            action: body.action === "approve" ? "kyc.name_change_approved" : "kyc.name_change_rejected",
            actorUid: user.uid,
            actorEmail: user.email || "",
            targetType: "kyc_case",
            targetId: body.uid,
            reason: body.notes,
            metadata: {
              previousName: pending.previousName,
              newName: pending.newName,
              action: body.action,
            },
          });

          return Response.json({
            ok: true,
            action: body.action,
            uid: body.uid,
            updatedName: body.action === "approve" ? pending.newName : profile.legalName,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
