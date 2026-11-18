import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { logErrorEvent } from "@/lib/server/error-events";

const schema = z.object({
  ref: z.string().trim().min(3).max(20),
  code: z.string().trim().min(1).max(50),
  routePattern: z.string().trim().min(1).max(200),
  status: z.number().int().min(100).max(599).default(500),
  platform: z.enum(["web", "android", "ios", "worker", "unknown"]).default("web"),
  appVersion: z.string().trim().max(30).optional(),
}).strict();

export const Route = createFileRoute("/api/public/v1/errors/beacon")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();

          await logErrorEvent(fs, {
            code: body.code,
            routePattern: body.routePattern,
            status: body.status,
            ref: body.ref,
            platform: body.platform,
            appVersion: body.appVersion,
          });

          return Response.json({ recorded: true, ref: body.ref });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
