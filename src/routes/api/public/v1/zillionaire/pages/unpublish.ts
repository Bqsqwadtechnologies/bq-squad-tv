import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const unpublishSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/zillionaire/pages/unpublish")({
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
              "Sign in again before unpublishing a legal page.",
            );
          }
          const body = await parseBody(request, unpublishSchema);
          const fs = await Firestore.create();
          const access = await requireZillionaireModule(fs, user, "system");
          if (!access.isZillionaireOwner) {
            throw new ApiError(403, "OWNER_ONLY", "Only the owner can unpublish legal pages.");
          }

          const path = "sitePages/" + body.slug;
          const existing = await fs.getDoc(path);
          if (!existing) {
            throw new ApiError(404, "PAGE_NOT_FOUND", "Legal page not found.");
          }

          const now = new Date().toISOString();
          await fs.patchDoc(path, {
            status: "draft",
            updatedAt: now,
            updatedBy: user.uid,
          });

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "legal.page_unpublished",
            targetType: "sitePage",
            targetId: body.slug,
            reason: body.reason,
            before: { status: existing["status"] },
            after: { status: "draft" },
          });

          return Response.json({
            unpublished: true,
            slug: body.slug,
            status: "draft",
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
