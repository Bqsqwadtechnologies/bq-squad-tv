import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { recordTamperEvidentAudit } from "@/lib/server/audit";

export const Route = createFileRoute("/api/public/v1/admin/migration/zillionaire")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const access = await requireZillionaireModule(fs, user, "roles");
          if (!access.isZillionaireOwner) {
            throw new ApiError(403, "OWNER_ONLY", "Only the primary Zillionaire owner can run identity migration.");
          }

          const users = await fs.query("users", { limit: 1000 });
          let migratedCount = 0;
          const now = new Date().toISOString();

          for (const u of users) {
            const legacyModules = u["adminModules"];
            const currentModules = u["zillionaireModules"];
            if (Array.isArray(legacyModules) && legacyModules.length > 0 && (!Array.isArray(currentModules) || currentModules.length === 0)) {
              await fs.setDoc(`users/${u.__id}`, {
                ...u,
                zillionaireModules: legacyModules,
                adminModulesRetired: true,
                migratedToZillionaireAt: now,
                updatedAt: now,
              });
              migratedCount++;
            }
          }

          await recordTamperEvidentAudit(fs, {
            action: "ZILLIONAIRE_IDENTITY_MIGRATION",
            actorId: user.uid,
            actorRole: "zillionaire-owner",
            details: { migratedCount },
          });

          return Response.json({
            success: true,
            migratedCount,
            message: `Successfully migrated ${migratedCount} user records to zillionaireModules.`,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
