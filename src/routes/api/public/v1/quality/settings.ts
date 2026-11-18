import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";

const schema = z.object({
  qualityMode: z.enum(["auto", "saver", "high"]).default("auto"),
  wifiOnly: z.boolean().default(false),
}).strict();

export const Route = createFileRoute("/api/public/v1/quality/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const doc = await fs.getDoc(`users/${user.uid}/settings/playback`);

          return Response.json({
            qualityMode: doc?.["qualityMode"] ?? "auto",
            wifiOnly: doc?.["wifiOnly"] ?? false,
            estimatedMonthlyDataMb: doc?.["estimatedMonthlyDataMb"] ?? 250,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
      PUT: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();

          await fs.setDoc(`users/${user.uid}/settings/playback`, {
            qualityMode: body.qualityMode,
            wifiOnly: body.wifiOnly,
            updatedAt: new Date().toISOString(),
          });

          return Response.json({ saved: true, settings: body });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
