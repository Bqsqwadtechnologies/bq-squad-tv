import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { logErrorEvent } from "@/lib/server/error-telemetry";

const schema = z.object({
  code: z.string().trim().min(1).max(64),
  routePattern: z.string().trim().min(1).max(256),
  status: z.number().int().min(100).max(599),
  ref: z.string().trim().min(1).max(64),
  platform: z.enum(["android", "web", "ios", "worker", "unknown"]).default("unknown"),
  appVersion: z.string().trim().max(64).optional(),
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
            ...(body.appVersion ? { appVersion: body.appVersion } : {}),
          });

          return Response.json({ recorded: true, ref: body.ref });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
