import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const schema = z.object({
  token: z.string().min(40).max(4096),
  platform: z.enum(["android", "web"]),
  deviceName: z.string().max(120).optional(),
});

export const Route = createFileRoute("/api/public/v1/devices/push-token")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const user = await requireUser(request);
      const body = await parseBody(request, schema);
      const fs = await Firestore.create();
      await enforceRateLimit(fs, "push-token:" + user.uid, { limit: 10, windowMs: 60_000 });
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.token));
      const tokenId = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      const now = new Date().toISOString();
      await fs.setDoc("users/" + user.uid + "/devices/" + tokenId, {
        token: body.token, platform: body.platform,
        deviceName: body.deviceName ?? null, status: "ACTIVE", updatedAt: now,
      });
      return Response.json({ registered: true });
    } catch (error) { return errorBody(error); }
  } } },
});
