import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { DEFAULT_HOME_RAILS, getHomeRailsConfig } from "@/lib/server/trending";

const schema = z.object({
  rails: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      enabled: z.boolean(),
      order: z.number().int(),
      description: z.string().optional(),
    }),
  ),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/rails")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "catalog");
          const rails = await getHomeRailsConfig(fs);
          return Response.json({ rails });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "catalog");
          const body = await parseBody(request, schema);

          const orderedRails = body.rails.sort((a, b) => a.order - b.order);
          await fs.setDoc("platformSettings/homeRails", {
            rails: orderedRails,
            updatedAt: new Date().toISOString(),
            updatedBy: user.uid,
          });

          const auditId = crypto.randomUUID();
          await fs.setDoc("auditLog/" + auditId, {
            actorUid: user.uid,
            action: "rails.reordered",
            railCount: orderedRails.length,
            createdAt: new Date().toISOString(),
          });

          return Response.json({ success: true, rails: orderedRails });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
