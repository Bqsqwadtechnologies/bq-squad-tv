import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
    effectiveAt: z.string().datetime(),
    changeSummary: z.string().trim().min(3).max(500),
    reason: z.string().trim().min(3).max(1000),
    requiresReacceptance: z.boolean().default(true),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/zillionaire/pages/publish")({
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
              "Sign in again before publishing a legal page.",
            );
          }
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          const access = await requireZillionaireModule(fs, user, "system");
          if (!access.isZillionaireOwner)
            throw new ApiError(
              403,
              "OWNER_ONLY",
              "Only the signed-in owner can publish legal pages.",
            );
          const path = "sitePages/" + body.slug;
          const existing = await fs.getDoc(path);
          if (!existing || typeof existing["body"] !== "string")
            throw new ApiError(404, "PAGE_NOT_FOUND", "The draft page could not be found.");
          const settingsDoc = await fs.getDoc("platformConfig/legalSettings");
          const settings =
            settingsDoc?.["values"] && typeof settingsDoc["values"] === "object"
              ? (settingsDoc["values"] as Record<string, unknown>)
              : {};
          const sourceMarkdown = existing["body"] as string;
          const DEFAULT_CONFIG: Record<string, string> = {
            effective_date: "January 1, 2026",
            last_updated: "April 2026",
            company_name: "BQ Sqwad Technologies",
            platform_name: "BQ SQWAD TV",
            contact_email: "tv@bqsqwad.com",
            support_email: "tv@bqsqwad.com",
            legal_email: "tv@bqsqwad.com",
            minimum_age: "13",
            governing_law: "the laws of the Federal Republic of Nigeria",
            dispute_resolution_forum: "Lagos, Nigeria",
            data_retention_period: "7 years for billing logs and 90 days for diagnostic data",
          };

          const markdown = sourceMarkdown.replace(
            /\{\{\s*([a-z0-9_-]+)\s*\}\}/g,
            (_match, rawKey: string) => {
              const key = rawKey.toLowerCase().replace(/-/g, "_");
              const val =
                typeof settings[key] === "string" && (settings[key] as string).trim()
                  ? (settings[key] as string).trim()
                  : (DEFAULT_CONFIG[key] ?? "BQ SQWAD TV");
              return val;
            },
          );
          if (/<\/?[a-z][^>]*>/i.test(markdown))
            throw new ApiError(
              400,
              "PAGE_MARKDOWN_UNSAFE",
              "Remove raw HTML from the page. Use supported Markdown only.",
            );
          if (/\]\(\s*(?!https:\/\/|mailto:)[^)]+\)/i.test(markdown))
            throw new ApiError(
              400,
              "PAGE_LINK_UNSAFE",
              "Only secure web and email links are allowed.",
            );
          const nextVersion =
            (Number.isSafeInteger(existing["version"]) ? Number(existing["version"]) : 0) + 1;
          const now = new Date().toISOString();
          const history = Array.isArray(existing["versions"])
            ? (existing["versions"] as unknown[])
            : [];
          const versionRecord = {
            version: nextVersion,
            title: existing["title"],
            body: markdown,
            status: "published",
            effectiveAt: body.effectiveAt,
            changeSummary: body.changeSummary,
            createdAt: now,
            createdBy: user.uid,
          };
          await fs.transact([path], (docs) => {
            const current = docs[0];
            if (!current || current["version"] !== existing["version"])
              throw new ApiError(
                409,
                "PAGE_CHANGED",
                "This page changed. Reload it before publishing.",
              );
            return {
              result: undefined,
              writes: [
                {
                  update: {
                    name: fs.docName(path),
                    fields: encodeFields({
                      status: "published",
                      body: markdown,
                      version: nextVersion,
                      effectiveAt: body.effectiveAt,
                      changeSummary: body.changeSummary,
                      requiresReacceptance: body.requiresReacceptance,
                      updatedBy: user.uid,
                      updatedAt: now,
                      versions: [...history, versionRecord],
                    }),
                  },
                },
              ],
            };
          });
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "legal.page_published",
            targetType: "sitePage",
            targetId: body.slug,
            reason: body.reason,
            before: { status: existing["status"], version: existing["version"] },
            after: {
              status: "published",
              version: nextVersion,
              requiresReacceptance: body.requiresReacceptance,
            },
          });
          return Response.json({ published: true, slug: body.slug, version: nextVersion });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
