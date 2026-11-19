import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { defaultPages } from "@/lib/legal/default-pages";

const schema = z
  .object({
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/zillionaire/pages/publish-defaults")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          if (
            !Number.isSafeInteger(user.authTime) ||
            Math.floor(Date.now() / 1000) - user.authTime > 300
          ) {
            throw new ApiError(
              401,
              "STEP_UP_REQUIRED",
              "Sign in again before publishing legal defaults.",
            );
          }
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          const access = await requireZillionaireModule(fs, user, "system");
          if (!access.isZillionaireOwner) {
            throw new ApiError(
              403,
              "OWNER_ONLY",
              "Only the signed-in owner can publish legal pages.",
            );
          }

          const now = new Date().toISOString();
          const results = [];

          for (const page of defaultPages) {
            const path = "sitePages/" + page.slug;
            const existing = await fs.getDoc(path);
            const currentVersion = Number.isSafeInteger(existing?.["version"])
              ? Number(existing!["version"])
              : 0;
            const nextVersion = currentVersion + 1;

            const versionRecord = {
              version: nextVersion,
              title: page.title,
              body: page.body,
              status: "published",
              effectiveAt: now,
              changeSummary: "One-click default publish",
              createdAt: now,
              createdBy: user.uid,
            };

            await fs.setDoc(path, {
              slug: page.slug,
              title: page.title,
              audience: page.audience ?? "public",
              status: "published",
              body: page.body,
              version: nextVersion,
              effectiveAt: now,
              changeSummary: "Published bundled defaults",
              requiresReacceptance: false,
              updatedBy: user.uid,
              updatedAt: now,
              versions: [versionRecord],
            });

            results.push({ slug: page.slug, version: nextVersion });
          }

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "legal.defaults_published",
            targetType: "sitePages",
            targetId: "all_defaults",
            reason: body.reason,
            after: { count: results.length },
          });

          return Response.json({ published: true, pages: results });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
