import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { getRequiredLegalPages } from "@/lib/server/legal-acceptance";

export const Route = createFileRoute("/api/public/v1/legal/required")({
  server: { handlers: { GET: async ({ request }) => {
    try {
      const user = await requireUser(request);
      const audience = new URL(request.url).searchParams.get("audience") ?? "public";
      const parsed = z.enum(["public", "producer", "provider"]).parse(audience);
      const fs = await Firestore.create();
      const pages = await getRequiredLegalPages(fs, parsed);
      return Response.json({ audience: parsed, pages });
    } catch (error) { return errorBody(error); }
  } } },
});
