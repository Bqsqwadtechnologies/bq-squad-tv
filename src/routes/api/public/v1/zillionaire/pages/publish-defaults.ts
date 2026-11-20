import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { defaultPages } from "@/lib/legal/default-pages";

const schema = z
  .object({
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

const DEFAULT_CONFIG: Record<string, string> = {
  effective_date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  last_updated: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  company_name: "BQ Sqwad Technologies",
  platform_name: "BQ SQWAD TV",
  contact_email: "tv@bqsqwad.com",
  support_email: "tv@bqsqwad.com",
  legal_email: "tv@bqsqwad.com",
};

function fillPlaceholders(raw: string, dynamicSettings: Record<string, unknown>): { text: string; defaultedCount: number } {
  if (typeof raw !== "string") return { text: "", defaultedCount: 0 };
  let defaultedCount = 0;
  const text = raw.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_match, rawKey: string) => {
    const key = rawKey.toLowerCase().replace(/-/g, "_");
    const val =
      typeof dynamicSettings[key] === "string" && (dynamicSettings[key] as string).trim()
        ? (dynamicSettings[key] as string).trim()
        : DEFAULT_CONFIG[key];
    if (val) {
      return val;
    }
    defaultedCount++;
    return _match;
  });
  return { text, defaultedCount };
}

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

          const settingsDoc = await fs.getDoc("platformConfig/legalSettings").catch(() => null);
          const settings =
            settingsDoc?.["values"] && typeof settingsDoc["values"] === "object"
              ? (settingsDoc["values"] as Record<string, unknown>)
              : {};

          const now = new Date().toISOString();
          const results = [];
          let totalDefaulted = 0;

          // Preflight every document before writing any of them. Never replace
          // unknown legal, financial or retention terms with a generic company name.
          const incompletePages: string[] = [];
          for (const page of defaultPages) {
            const existing = await fs.getDoc("sitePages/" + page.slug);
            const sourceBody = typeof existing?.["body"] === "string" ? (existing["body"] as string) : page.body;
            const { defaultedCount } = fillPlaceholders(sourceBody, settings);
            if (defaultedCount > 0) incompletePages.push(page.slug);
          }
          if (incompletePages.length > 0) {
            throw new ApiError(
              409,
              "LEGAL_DEFAULTS_INCOMPLETE",
              "No legal documents were published. Complete the unresolved policy, retention, refund, payout and jurisdiction details for: " + incompletePages.join(", ") + ".",
            );
          }

          for (const page of defaultPages) {
            const path = "sitePages/" + page.slug;
            const existing = await fs.getDoc(path);
            const sourceBody = typeof existing?.["body"] === "string" ? (existing["body"] as string) : page.body;
            const sourceTitle = typeof existing?.["title"] === "string" ? (existing["title"] as string) : page.title;
            const sourceAudience = existing?.["audience"] ?? page.audience ?? "public";
            const currentVersion = Number.isSafeInteger(existing?.["version"])
              ? Number(existing!["version"])
              : 0;
            const nextVersion = currentVersion + 1;

            const { text: processedBody, defaultedCount } = fillPlaceholders(sourceBody, settings);
            totalDefaulted += defaultedCount;

            const versionRecord = {
              version: nextVersion,
              title: sourceTitle,
              body: processedBody,
              status: "published",
              effectiveAt: now,
              changeSummary: "One-click default publish with auto-filled placeholders",
              createdAt: now,
              createdBy: user.uid,
            };

            const existingHistory = Array.isArray(existing?.["versions"])
              ? (existing!["versions"] as unknown[])
              : [];

            await fs.setDoc(path, {
              slug: page.slug,
              title: sourceTitle,
              audience: sourceAudience,
              status: "published",
              body: processedBody,
              version: nextVersion,
              effectiveAt: now,
              changeSummary: "One-click published defaults",
              requiresReacceptance: false,
              updatedBy: user.uid,
              updatedAt: now,
              versions: [...existingHistory, versionRecord],
            });

            results.push({ slug: page.slug, version: nextVersion });
          }

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "legal.defaults_published",
            targetType: "sitePages",
            targetId: "all_defaults",
            reason: body.reason,
            after: { count: results.length, totalDefaulted },
          });

          return Response.json({
            published: true,
            pages: results,
            warning:
              totalDefaulted > 0
                ? `${totalDefaulted} placeholder fields were automatically populated from standard defaults.`
                : null,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
