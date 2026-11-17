import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  effectiveAt: z.string().datetime(),
  changeSummary: z.string().trim().min(3).max(500),
  reason: z.string().trim().min(3).max(1000),
  requiresReacceptance: z.boolean().default(true),
}).strict();

export const Route = createFileRoute("/api/public/v1/admin/pages/publish")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const user = await requireUser(request);
      if (!Number.isSafeInteger(user.authTime) || Math.floor(Date.now() / 1000) - user.authTime > 300) {
        throw new ApiError(401, "STEP_UP_REQUIRED", "Sign in again before publishing a legal page.");
      }
      const body = await parseBody(request, schema);
      const fs = await Firestore.create();
      const access = await requireAdminModule(fs, user, "system");
      if (!access.isZillionaireOwner) throw new ApiError(403, "OWNER_ONLY", "Only the signed-in owner can publish legal pages.");
      const path = "sitePages/" + body.slug;
      const existing = await fs.getDoc(path);
      if (!existing || typeof existing["body"] !== "string") throw new ApiError(404, "PAGE_NOT_FOUND", "The draft page could not be found.");
      const markdown = existing["body"] as string;
      const placeholders = [...new Set([...markdown.matchAll(/\{\{([a-z0-9_]+)\}\}/g)].map(match => match[1]))];
      if (placeholders.length) throw new ApiError(409, "PAGE_PLACEHOLDERS_UNFILLED", "Complete these page settings before publishing: " + placeholders.join(", "));
      if (/<\/?[a-z][^>]*>/i.test(markdown)) throw new ApiError(400, "PAGE_MARKDOWN_UNSAFE", "Remove raw HTML from the page. Use supported Markdown only.");
      if (/\]\(\s*(?!https:\/\/|mailto:)[^)]+\)/i.test(markdown)) throw new ApiError(400, "PAGE_LINK_UNSAFE", "Only secure web and email links are allowed.");
      const nextVersion = (Number.isSafeInteger(existing["version"]) ? Number(existing["version"]) : 0) + 1;
      const now = new Date().toISOString();
      const history = Array.isArray(existing["versions"]) ? existing["versions"] as unknown[] : [];
      const versionRecord = { version: nextVersion, title: existing["title"], body: markdown, status: "published", effectiveAt: body.effectiveAt, changeSummary: body.changeSummary, createdAt: now, createdBy: user.uid };
      await fs.transact([path], docs => {
        const current = docs[0];
        if (!current || current["version"] !== existing["version"]) throw new ApiError(409, "PAGE_CHANGED", "This page changed. Reload it before publishing.");
        return { result: undefined, writes: [{
          update: { name: fs.docName(path), fields: encodeFields({
            status: "published", version: nextVersion, effectiveAt: body.effectiveAt,
            changeSummary: body.changeSummary, requiresReacceptance: body.requiresReacceptance,
            updatedBy: user.uid, updatedAt: now, versions: [...history, versionRecord],
          }) },
        }] };
      });
      await writeAuditLog(fs, { actorUid: user.uid, action: "legal.page_published", targetType: "sitePage", targetId: body.slug, reason: body.reason, before: { status: existing["status"], version: existing["version"] }, after: { status: "published", version: nextVersion, requiresReacceptance: body.requiresReacceptance } });
      return Response.json({ published: true, slug: body.slug, version: nextVersion });
    } catch (error) { return errorBody(error); }
  } } },
});
