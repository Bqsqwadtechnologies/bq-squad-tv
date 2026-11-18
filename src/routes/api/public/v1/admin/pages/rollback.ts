import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  targetVersion: z.number().int().min(1),
  reason: z.string().trim().min(3).max(1000),
}).strict();

export const Route = createFileRoute("/api/public/v1/admin/pages/rollback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          if (!Number.isSafeInteger(user.authTime) || Math.floor(Date.now() / 1000) - user.authTime > 300) {
            throw new ApiError(401, "STEP_UP_REQUIRED", "Sign in again before rolling back a legal page.");
          }
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          const access = await requireAdminModule(fs, user, "system");
          if (!access.isZillionaireOwner) {
            throw new ApiError(403, "OWNER_ONLY", "Only the signed-in owner can roll back legal pages.");
          }

          const path = "sitePages/" + body.slug;
          const existing = await fs.getDoc(path);
          if (!existing) throw new ApiError(404, "PAGE_NOT_FOUND", "The legal page was not found.");

          const versions = Array.isArray(existing["versions"])
            ? (existing["versions"] as Array<Record<string, unknown>>)
            : [];
          const target = versions.find((v) => v["version"] === body.targetVersion);
          if (!target || typeof target["body"] !== "string") {
            throw new ApiError(404, "VERSION_NOT_FOUND", `Version ${body.targetVersion} not found in history.`);
          }

          const currentVersion = Number.isSafeInteger(existing["version"]) ? Number(existing["version"]) : 0;
          const nextVersion = currentVersion + 1;
          const now = new Date().toISOString();

          const versionRecord = {
            version: nextVersion,
            title: target["title"] ?? existing["title"],
            body: target["body"],
            status: "published",
            effectiveAt: now,
            changeSummary: `Rollback to version ${body.targetVersion}`,
            createdAt: now,
            createdBy: user.uid,
          };

          await fs.updateDoc(path, {
            body: target["body"],
            version: nextVersion,
            status: "published",
            effectiveAt: now,
            changeSummary: `Rollback to version ${body.targetVersion}`,
            requiresReacceptance: true,
            updatedBy: user.uid,
            updatedAt: now,
            versions: [...versions, versionRecord],
          });

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "legal.page_rolled_back",
            targetType: "sitePage",
            targetId: body.slug,
            reason: body.reason,
            before: { version: currentVersion },
            after: { version: nextVersion, restoredFrom: body.targetVersion },
          });

          return Response.json({ rolledBack: true, slug: body.slug, version: nextVersion });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
