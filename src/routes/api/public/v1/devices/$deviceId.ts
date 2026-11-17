import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

export const Route = createFileRoute("/api/public/v1/devices/$deviceId")({
  server: { handlers: {
    DELETE: async ({ request, params }) => {
      try {
        const user = await requireUser(request);
        if (!/^[a-f0-9]{64}$/.test(params.deviceId)) {
          throw new ApiError(404, "DEVICE_NOT_FOUND", "This device is not registered to your account.");
        }
        const body = await request.json().catch(() => ({}));
        const parsed = schema.safeParse(body);
        if (!parsed.success) throw new ApiError(400, "INVALID_REQUEST", "Provide a short reason for revoking this device.");
        const fs = await Firestore.create();
        await enforceRateLimit(fs, "device-revoke:" + user.uid, { limit: 8, windowMs: 15 * 60_000 });
        const path = "users/" + user.uid + "/devices/" + params.deviceId;
        const device = await fs.getDoc(path);
        if (!device) throw new ApiError(404, "DEVICE_NOT_FOUND", "This device is not registered to your account.");
        if (device["status"] !== "REVOKED") {
          const now = new Date().toISOString();
          await fs.patchDoc(path, { status: "REVOKED", revokedAt: now, updatedAt: now });
          await writeAuditLog(fs, {
            actorUid: user.uid, action: "device.revoked", targetType: "device", targetId: params.deviceId,
            reason: parsed.data.reason,
            metadata: { platform: device["platform"] === "web" ? "web" : "android" },
          });
        }
        return Response.json({ revoked: true }, { headers: { "cache-control": "no-store" } });
      } catch (error) { return errorBody(error); }
    },
  } },
});
