import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { getRequiredLegalPages, type LegalAudience } from "@/lib/server/legal-acceptance";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z
  .object({
    audience: z.enum(["public", "producer", "provider"]).default("public"),
    acceptedSlugs: z
      .array(z.string().regex(/^[a-z0-9-]{1,80}$/))
      .min(2)
      .max(5),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/legal/acceptance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          const pages = await getRequiredLegalPages(fs, body.audience as LegalAudience);
          const expected = pages.map((page) => page.slug).sort();
          const supplied = [...new Set(body.acceptedSlugs)].sort();
          if (
            expected.length !== supplied.length ||
            expected.some((slug, index) => slug !== supplied[index])
          ) {
            throw new ApiError(
              400,
              "LEGAL_ACCEPTANCE_INCOMPLETE",
              "Review and accept every required page before continuing.",
            );
          }
          const now = new Date().toISOString();
          for (const page of pages) {
            const id = user.uid + "_" + page.slug + "_v" + page.version;
            await fs
              .setDoc(
                "legalAcceptances/" + id,
                {
                  uid: user.uid,
                  slug: page.slug,
                  version: page.version,
                  acceptedAt: now,
                  audience: body.audience,
                  textHash: await (async () => {
                    const source = await fs.getDoc("sitePages/" + page.slug);
                    const digest = await crypto.subtle.digest(
                      "SHA-256",
                      new TextEncoder().encode(String(source?.["body"] ?? "")),
                    );
                    return Array.from(new Uint8Array(digest), (value) =>
                      value.toString(16).padStart(2, "0"),
                    ).join("");
                  })(),
                },
                { mustNotExist: true },
              )
              .catch(async (error) => {
                if (!(error instanceof ApiError) || error.status !== 409) throw error;
              });
          }
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "legal.pages_accepted",
            targetType: "legalAcceptance",
            targetId: body.audience,
            reason: "User confirmed acceptance of the current required legal pages.",
            metadata: { slugs: expected },
          });
          return Response.json({
            accepted: true,
            audience: body.audience,
            pages: pages.map(({ slug, version }) => ({ slug, version })),
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
