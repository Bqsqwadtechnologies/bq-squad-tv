import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const errorBeaconSchema = z
  .object({
    message: z.string().trim().min(1).max(2000),
    context: z.string().trim().max(500).optional(),
    stack: z.string().trim().max(8000).optional(),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/monitoring/client-errors")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const fs = await Firestore.create();
          const ip =
            request.headers.get("cf-connecting-ip") ||
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            "unknown-client";

          await enforceRateLimit(fs, `client-errors:${ip}`, { limit: 30, windowMs: 60000 }).catch(
            () => undefined,
          );

          const payload = await parseBody(request, errorBeaconSchema);
          const errorId = `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

          await fs.setDoc(`errorEvents/${errorId}`, {
            id: errorId,
            ...payload,
            ip,
            userAgent: request.headers.get("user-agent") || null,
            receivedAt: new Date().toISOString(),
          }).catch(() => undefined);

          return Response.json({ success: true, errorId });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
