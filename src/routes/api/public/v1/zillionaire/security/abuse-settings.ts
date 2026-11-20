import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getRouteRateLimits, updateRouteRateLimit } from "@/lib/server/abuse-protection";

const updateSchema = z
  .object({
    routeKey: z.string().trim().min(1).max(80),
    maxRequests: z.number().int().min(1).max(10000),
    windowSeconds: z.number().int().min(1).max(86400),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

// createFileRoute("/api/public/v1/zillionaire/security/abuse-settings")
export const Route = createFileRoute("/api/public/v1/zillionaire/security/abuse-settings")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "security");
          await enforceRateLimit(fs, "zillionaire-abuse-settings:" + user.uid, {
            limit: 60,
            windowMs: 60_000,
          });

          const limits = await getRouteRateLimits(fs);
          return Response.json({ limits }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return errorBody(error);
        }
      },
      PUT: async ({ request }: { request: Request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, updateSchema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "security");
          await enforceRateLimit(fs, "zillionaire-abuse-settings-write:" + user.uid, {
            limit: 20,
            windowMs: 60_000,
          });

          const updated = await updateRouteRateLimit(
            fs,
            body.routeKey,
            { maxRequests: body.maxRequests, windowSeconds: body.windowSeconds },
            user.uid,
            body.reason,
          );

          return Response.json({ updated }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
