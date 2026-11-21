import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { resolvePlatformAccess } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { DEFAULT_KYC_STRINGS } from "@/lib/kyc-strings";

const updateSchema = z.object({
  strings: z.record(z.string(), z.string().max(2000)),
  reason: z.string().trim().min(5).max(500),
});

export const Route = createFileRoute("/api/public/v1/kyc/strings")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const fs = await Firestore.create();
          const doc = await fs.getDoc("systemSettings/kyc_strings");
          const custom = (doc?.["strings"] as Record<string, string>) || {};
          const merged = { ...DEFAULT_KYC_STRINGS, ...custom };
          return Response.json({
            strings: merged,
            updatedAt: doc?.["updatedAt"] || null,
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, updateSchema);
          const fs = await Firestore.create();
          const access = await resolvePlatformAccess(fs, user.uid, user.email);

          if (!access.isZillionaireOwner && !access.zillionaireModules?.includes("compliance")) {
            return Response.json(
              { error: "Only verified platform owner or compliance officers can edit KYC string tables." },
              { status: 403 }
            );
          }

          const now = new Date().toISOString();
          await fs.patchDoc(
            "systemSettings/kyc_strings",
            {
              strings: body.strings,
              updatedAt: now,
              updatedBy: user.uid,
              lastReason: body.reason,
            },
          );

          await writeAuditLog(fs, {
            action: "kyc.string_table_updated",
            actorUid: user.uid,
            targetType: "settings",
            targetId: "kyc_strings",
            reason: body.reason,
            metadata: {
              actorEmail: user.email || "",
              keysUpdatedCount: Object.keys(body.strings).length,
            },
          });

          return Response.json({
            ok: true,
            updatedAt: now,
            keysCount: Object.keys(body.strings).length,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
