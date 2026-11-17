import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { writeAuditLog } from "@/lib/server/audit";

const deviceIdSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const Route = createFileRoute("/api/public/v1/devices")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const fs = await Firestore.create();
        const devices = await fs.query("users/" + user.uid + "/devices", { limit: 100 });
        return Response.json({
          devices: devices.map(device => ({
            id: device.__id,
            platform: device["platform"] === "web" ? "web" : "android",
            deviceName: typeof device["deviceName"] === "string" ? device["deviceName"] : null,
            status: device["status"] === "REVOKED" ? "REVOKED" : "ACTIVE",
            updatedAt: typeof device["updatedAt"] === "string" ? device["updatedAt"] : null,
          })),
        }, { headers: { "cache-control": "private, no-store" } });
      } catch (error) { return errorBody(error); }
    },
    DELETE: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const fs = await Firestore.create();
        await enforceRateLimit(fs, "device-revoke-all:" + user.uid, { limit: 3, windowMs: 15 * 60_000 });
        const devices = await fs.query("users/" + user.uid + "/devices", { limit: 100 });
        const now = new Date().toISOString();
        for (const device of devices) {
          if (device["status"] === "REVOKED") continue;
          await fs.patchDoc("users/" + user.uid + "/devices/" + device.__id, {
            status: "REVOKED", revokedAt: now, updatedAt: now,
          });
        }
        await writeAuditLog(fs, {
          actorUid: user.uid, action: "devices.revoked_all", targetType: "user", targetId: user.uid,
          reason: "Viewer revoked registered devices from account settings",
          metadata: { count: devices.filter(device => device["status"] !== "REVOKED").length },
        });
        return Response.json({ revoked: true }, { headers: { "cache-control": "no-store" } });
      } catch (error) { return errorBody(error); }
    },
  } },
});

export const deviceIdValidator = deviceIdSchema;
