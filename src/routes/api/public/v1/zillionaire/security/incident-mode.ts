import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const IncidentActionSchema = z.object({
  action: z.enum(["ACTIVATE", "RELEASE"]),
  reason: z.string().min(5).max(1000),
});

export const Route = createFileRoute(
  "/api/public/v1/zillionaire/security/incident-mode",
)({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireAdminModule(fs, user, "security");

          const stateDoc = await fs.getDoc("platformSettings/incidentMode");
          const history = await fs.query("platformIncidents", {
            orderByField: "timestamp",
            descending: true,
            limit: 20,
          }).catch(() => []);

          return Response.json({
            active: stateDoc?.["active"] === true,
            currentIncident: stateDoc?.["active"] === true ? stateDoc : null,
            timeline: history.map((h) => ({
              id: h.__id || h["id"],
              action: h["action"],
              reason: h["reason"],
              actorUid: h["actorUid"],
              timestamp: h["timestamp"],
            })),
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireAdminModule(fs, user, "security");

          const body = await parseBody(request, IncidentActionSchema);
          const nowIso = new Date().toISOString();
          const isActivating = body.action === "ACTIVATE";

          // Update incidentMode state
          await fs.setDoc("platformSettings/incidentMode", {
            active: isActivating,
            action: body.action,
            reason: body.reason,
            actorUid: user.uid,
            updatedAt: nowIso,
          });

          // Sync into platformFlags: freeze payouts, freeze console logins, stop signups
          const flagsDoc = (await fs.getDoc("platformSettings/flags")) || {};
          await fs.setDoc("platformSettings/flags", {
            ...flagsDoc,
            incidentMode: isActivating,
            payoutFreeze: isActivating,
            producerLoginsBlocked: isActivating,
            providerLoginsBlocked: isActivating,
            signupsOpen: !isActivating,
            updatedAt: nowIso,
          });

          // Record in incident timeline
          const incidentId = `inc_${Date.now()}`;
          await fs.setDoc(`platformIncidents/${incidentId}`, {
            action: body.action,
            reason: body.reason,
            actorUid: user.uid,
            timestamp: nowIso,
          });

          // Write tamper-evident audit log
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: isActivating ? "security.panic_activated" : "security.panic_released",
            targetType: "platform_incident",
            targetId: incidentId,
            reason: body.reason,
            metadata: {
              action: body.action,
              flagsUpdated: {
                incidentMode: isActivating,
                payoutFreeze: isActivating,
                signupsOpen: !isActivating,
              },
            },
          });

          return Response.json({
            ok: true,
            action: body.action,
            active: isActivating,
            timestamp: nowIso,
            message: isActivating
              ? "Emergency incident mode activated: payouts, producer/provider logins, and signups frozen."
              : "Emergency incident mode released: platform restored to normal operations.",
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
