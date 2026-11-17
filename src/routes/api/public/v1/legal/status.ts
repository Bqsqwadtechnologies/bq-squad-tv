import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { getRequiredLegalPages, type LegalAudience } from "@/lib/server/legal-acceptance";

export const Route = createFileRoute("/api/public/v1/legal/status")({
  server: { handlers: { GET: async ({ request }) => {
    try {
      const user = await requireUser(request);
      const requested = new URL(request.url).searchParams.get("audience") ?? "public";
      const audience = z.enum(["public", "producer", "provider"]).parse(requested) as LegalAudience;
      const fs = await Firestore.create();
      const pages = await getRequiredLegalPages(fs, audience);
      const status = await Promise.all(pages.map(async page => {
        const exact = await fs.getDoc("legalAcceptances/" + user.uid + "_" + page.slug + "_v" + page.version);
        let accepted = Boolean(exact && exact["uid"] === user.uid && exact["slug"] === page.slug && exact["version"] === page.version);
        if (!accepted && !page.requiresReacceptance) {
          for (let version = page.version - 1; version >= 1; version -= 1) {
            const prior = await fs.getDoc("legalAcceptances/" + user.uid + "_" + page.slug + "_v" + version);
            if (prior && prior["uid"] === user.uid && prior["slug"] === page.slug && prior["version"] === version) {
              accepted = true;
              break;
            }
          }
        }
        const source = await fs.getDoc("sitePages/" + page.slug);
        return {
          slug: page.slug, title: page.title, version: page.version,
          body: String(source?.["body"] ?? ""), accepted,
        };
      }));
      return Response.json({ audience, pages: status, acceptanceRequired: status.some(page => !page.accepted) }, {
        headers: { "cache-control": "no-store", pragma: "no-cache" },
      });
    } catch (error) { return errorBody(error); }
  } } },
});
