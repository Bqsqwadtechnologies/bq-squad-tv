import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { defaultPages } from "@/lib/legal/default-pages";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const bodySchema = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();

export const Route = createFileRoute("/api/public/v1/admin/pages/seed")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const user = await requireUser(request);
      const body = await parseBody(request, bodySchema);
      const fs = await Firestore.create();
      const access = await requireAdminModule(fs, user, "system");
      if (!access.isZillionaireOwner) throw new ApiError(403, "OWNER_ONLY", "Only the signed-in owner can load the original legal drafts.");
      const created: string[] = [];
      const skipped: string[] = [];
      for (const page of defaultPages) {
        const now = new Date().toISOString();
        try {
          await fs.setDoc("sitePages/" + page.slug, {
            slug: page.slug, title: page.title, body: page.body, audience: page.audience,
            status: "draft", version: 1, effectiveAt: null, changeSummary: "Initial legal draft; requires qualified legal review before launch.",
            requiresReacceptance: false, updatedBy: user.uid, updatedAt: now,
            versions: [{ version: 1, title: page.title, body: page.body, status: "draft", createdAt: now, createdBy: user.uid, changeSummary: "Initial draft." }],
          }, { mustNotExist: true });
          created.push(page.slug);
        } catch (error) {
          if (error instanceof ApiError && error.status === 409) skipped.push(page.slug);
          else throw error;
        }
      }
      if (created.length) await writeAuditLog(fs, {
        actorUid: user.uid, action: "legal.default_pages_seeded", targetType: "sitePages",
        targetId: created.join(","), reason: body.reason, metadata: { created, skipped },
      });
      return Response.json({ created, skipped, message: "Default pages are drafts only. Existing pages were left unchanged. Complete every placeholder and obtain qualified legal review before publishing." });
    } catch (error) { return errorBody(error); }
  } } },
});
