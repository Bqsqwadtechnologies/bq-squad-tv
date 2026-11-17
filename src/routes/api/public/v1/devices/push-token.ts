import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { writeAuditLog } from "@/lib/server/audit";
import { recordRiskSignal } from "@/lib/server/risk-engine";

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
      const devicePath = "users/" + user.uid + "/devices/" + tokenId;
      const existing = await fs.getDoc(devicePath);
      await fs.setDoc(devicePath, {
        token: body.token, platform: body.platform,
        deviceName: body.deviceName ?? null, status: "ACTIVE",
        registeredAt: typeof existing?.["registeredAt"] === "string" ? existing["registeredAt"] : now,
        updatedAt: now, revokedAt: null,
      });
      if (!existing || existing["status"] === "REVOKED") {
        const notificationId = crypto.randomUUID();
        await fs.setDoc("users/" + user.uid + "/notifications/" + notificationId, {
          title: "A device was registered",
          body: "A device has been added to your BQ SQWAD TV account. Review your registered devices if you do not recognise it.",
          category: "device_registered", read: false, createdAt: now,
        });
        await writeAuditLog(fs, {
          actorUid: user.uid, action: "device.registered", targetType: "device", targetId: tokenId,
          reason: "A push-enabled device registered to the signed-in account",
          metadata: { platform: body.platform },
        });
        await recordRiskSignal(fs, user.uid, "device_change");
      }
      return Response.json({ registered: true });
    } catch (error) { return errorBody(error); }
  } } },
});
