import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { defaultPages } from "@/lib/legal/default-pages";

const saveSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
    title: z.string().trim().min(2).max(120),
    body: z.string().min(10).max(150000),
    audience: z.enum(["public", "producer", "provider"]).default("public"),
    category: z.enum(["legal", "producer", "provider", "help"]).optional(),
    changeSummary: z.string().trim().min(3).max(500),
    effectiveAt: z.string().datetime().nullable().optional(),
    publishedAt: z.string().datetime().nullable().optional(),
    scheduledPublishAt: z.string().datetime().nullable().optional(),
    requiresReacceptance: z.boolean().default(false),
    status: z.enum(["draft", "published", "scheduled"]).optional(),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/zillionaire/pages/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const access = await requireZillionaireModule(fs, user, "system");
          if (!access.isZillionaireOwner) {
            throw new ApiError(403, "OWNER_ONLY", "Only the owner can view and manage legal pages.");
          }

          // Fetch all saved sitePages
          const pagesMap = new Map<string, Record<string, unknown>>();

          // Seed default pages in map
          for (const page of defaultPages) {
            pagesMap.set(page.slug, {
              slug: page.slug,
              title: page.title,
              body: page.body,
              audience: page.audience ?? "public",
              category: (page as { category?: string }).category ?? "legal",
              status: "draft",
              version: 0,
              effectiveAt: null,
              publishedAt: null,
              scheduledPublishAt: null,
              requiresReacceptance: false,
              versions: [],
              updatedAt: null,
              updatedBy: null,
            });
          }

          // Overlay stored pages from Firestore
          for (const defaultPage of defaultPages) {
            try {
              const doc = await fs.getDoc("sitePages/" + defaultPage.slug);
              if (doc) {
                pagesMap.set(defaultPage.slug, {
                  ...pagesMap.get(defaultPage.slug),
                  ...doc,
                });
              }
            } catch {
              // ignore individual get errors
            }
          }

          const pagesList = Array.from(pagesMap.values()).map((p) => {
            const bodyStr = typeof p["body"] === "string" ? (p["body"] as string) : "";
            const matches = bodyStr.match(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g);
            const placeholders = matches ? [...new Set(matches)] : [];

            return {
              slug: p["slug"],
              title: p["title"],
              body: p["body"],
              audience: p["audience"] ?? "public",
              category: p["category"] ?? "legal",
              status: p["status"] ?? "draft",
              version: p["version"] ?? 0,
              effectiveAt: p["effectiveAt"] ?? null,
              publishedAt: p["publishedAt"] ?? (p["status"] === "published" ? p["updatedAt"] : null),
              scheduledPublishAt: p["scheduledPublishAt"] ?? null,
              requiresReacceptance: p["requiresReacceptance"] === true,
              versions: Array.isArray(p["versions"]) ? p["versions"] : [],
              updatedAt: p["updatedAt"] ?? null,
              updatedBy: p["updatedBy"] ?? null,
              unfilledPlaceholders: placeholders,
            };
          });

          return Response.json({ pages: pagesList });
        } catch (error) {
          return errorBody(error);
        }
      },

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
              "Sign in again before editing or saving a legal draft.",
            );
          }
          const body = await parseBody(request, saveSchema);
          const fs = await Firestore.create();
          const access = await requireZillionaireModule(fs, user, "system");
          if (!access.isZillionaireOwner) {
            throw new ApiError(403, "OWNER_ONLY", "Only the owner can manage legal page drafts.");
          }

          const path = "sitePages/" + body.slug;
          const existing = await fs.getDoc(path);
          const now = new Date().toISOString();

          const currentVersion = Number.isSafeInteger(existing?.["version"])
            ? Number(existing!["version"])
            : 0;

          const isScheduled =
            typeof body.scheduledPublishAt === "string" &&
            new Date(body.scheduledPublishAt).getTime() > Date.now();

          let status = existing?.["status"] ?? "draft";
          if (body.status) {
            status = body.status;
          } else if (isScheduled) {
            status = "scheduled";
          } else if (existing?.["status"] === "published") {
            status = "draft";
          }

          const effectiveAt = body.effectiveAt !== undefined ? body.effectiveAt : (existing?.["effectiveAt"] ?? null);
          const publishedAt = body.publishedAt !== undefined ? body.publishedAt : (existing?.["publishedAt"] ?? null);
          const scheduledPublishAt = body.scheduledPublishAt !== undefined ? body.scheduledPublishAt : (existing?.["scheduledPublishAt"] ?? null);

          const versionRecord = {
            version: currentVersion,
            title: body.title,
            body: body.body,
            status,
            effectiveAt,
            publishedAt,
            scheduledPublishAt,
            changeSummary: body.changeSummary,
            createdAt: now,
            createdBy: user.uid,
          };

          const history = Array.isArray(existing?.["versions"]) ? existing!["versions"] : [];

          await fs.setDoc(path, {
            slug: body.slug,
            title: body.title,
            body: body.body,
            audience: body.audience,
            category: body.category || existing?.["category"] || "legal",
            status,
            version: currentVersion,
            effectiveAt,
            publishedAt,
            scheduledPublishAt,
            changeSummary: body.changeSummary,
            requiresReacceptance: body.requiresReacceptance,
            updatedBy: user.uid,
            updatedAt: now,
            versions: [...history, versionRecord],
          });

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "legal.page_draft_saved",
            targetType: "sitePage",
            targetId: body.slug,
            reason: body.reason,
            after: { status, effectiveAt, publishedAt, scheduledPublishAt },
          });

          return Response.json({
            saved: true,
            slug: body.slug,
            status,
            version: currentVersion,
            effectiveAt,
            publishedAt,
            scheduledPublishAt,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
