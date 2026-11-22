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
    scheduledPublishAt: z.string().datetime().nullable().optional(),
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
  effective_date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  last_updated: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  company_name: "BQ Sqwad Technologies",
  platform_name: "BQ SQWAD TV",
  contact_email: "tv@bqsqwad.com",
  support_email: "tv@bqsqwad.com",
  legal_email: "tv@bqsqwad.com",
  governing_law: "Federal Republic of Nigeria",
  jurisdiction: "Federal Republic of Nigeria",
  minimum_age: "13",
  minimum_payout: "$500 USD",
  revenue_basis: "Pay-as-you-go viewer watch minutes",
  revenue_change_notice_days: "30",
  dispute_window_days: "60",
  liability_period_months: "12",
  wallet_refund_rule: "Eligible within 14 days for unspent wallet balances upon verified request",
  closure_balance_rule: "Settled prior to account termination subject to statutory reserves",
  producer_data_retention: "7 years from account closure in compliance with financial regulations",
  provider_data_retention: "7 years from agreement termination in compliance with commercial standards",
  viewing_history_retention: "90 days active retention",
  security_log_retention: "1 year audit log retention",
  evidence_retention: "5 years statutory compliance record retention",
  postal_address_if_required: "BQ Sqwad Technologies, Lagos, Nigeria",
};

          let defaultedCount = 0;
          const markdown = sourceMarkdown.replace(
            /\{\{\s*([a-z0-9_-]+)\s*\}\}/g,
            (_match, rawKey: string) => {
              const key = rawKey.toLowerCase().replace(/-/g, "_");
              const val =
                typeof settings[key] === "string" && (settings[key] as string).trim()
                  ? (settings[key] as string).trim()
                  : DEFAULT_CONFIG[key];
              if (val) return val;
              defaultedCount++;
              return _match;
            },
          );
          if (defaultedCount > 0) {
            throw new ApiError(
              409,
              "LEGAL_PAGE_INCOMPLETE",
              "This legal page still contains " + defaultedCount + " unresolved placeholder fields. Complete the legal settings or edit the document before publishing.",
            );
          }
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

          const isScheduled =
            typeof body.scheduledPublishAt === "string" &&
            new Date(body.scheduledPublishAt).getTime() > Date.now();

          const targetStatus = isScheduled ? "scheduled" : "published";

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
            status: targetStatus,
            effectiveAt: body.effectiveAt,
            scheduledPublishAt: body.scheduledPublishAt ?? null,
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
                      status: targetStatus,
                      body: markdown,
                      version: nextVersion,
                      effectiveAt: body.effectiveAt,
                      scheduledPublishAt: body.scheduledPublishAt ?? null,
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
            action: isScheduled ? "legal.page_scheduled" : "legal.page_published",
            targetType: "sitePage",
            targetId: body.slug,
            reason: body.reason,
            before: { status: existing["status"], version: existing["version"] },
            after: {
              status: targetStatus,
              version: nextVersion,
              scheduledPublishAt: body.scheduledPublishAt,
              requiresReacceptance: body.requiresReacceptance,
            },
          });
          return Response.json({
            published: targetStatus === "published",
            scheduled: targetStatus === "scheduled",
            slug: body.slug,
            version: nextVersion,
            status: targetStatus,
            warning:
              defaultedCount > 0
                ? `${defaultedCount} empty placeholders were filled with standard system defaults.`
                : null,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
