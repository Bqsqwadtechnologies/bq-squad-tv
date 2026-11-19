import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const patchSchema = z.object({
  fingerprint: z.string().min(1).max(256),
  statusState: z.enum(["new", "investigating", "resolved"]),
  resolutionNotes: z.string().max(1000).optional(),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/errors/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "security");

          const url = new URL(request.url);
          const refQuery = url.searchParams.get("ref");

          // If searching by ref, look up fingerprint first
          if (refQuery) {
            const refDoc = await fs.getDoc(`errorRefs/${refQuery}`).catch(() => null);
            if (!refDoc) {
              return Response.json({ items: [] });
            }
            const fp = refDoc["fingerprint"] as string;
            const errDoc = await fs.getDoc(`errorEvents/${fp}`).catch(() => null);
            return Response.json({ items: errDoc ? [errDoc] : [] });
          }

          // Otherwise return recent error events
          const events = await fs.query("errorEvents", { limit: 50 }).catch(() => []);
          events.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
            String(b["lastSeen"] ?? "").localeCompare(String(a["lastSeen"] ?? "")),
          );

          return Response.json({ items: events });
        } catch (error) {
          return errorBody(error);
        }
      },

      PATCH: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, patchSchema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "security");

          const path = `errorEvents/${body.fingerprint}`;
          const existing = await fs.getDoc(path).catch(() => null);
          const now = new Date().toISOString();

          await fs.patchDoc(path, {
            statusState: body.statusState,
            resolvedAt: body.statusState === "resolved" ? now : null,
            resolvedBy: body.statusState === "resolved" ? user.uid : null,
            resolutionNotes: body.resolutionNotes ?? null,
            updatedAt: now,
          });

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "error.status_update",
            targetType: "errorFingerprint",
            targetId: body.fingerprint,
            reason: `Error status marked as ${body.statusState}`,
            metadata: {
              fingerprint: body.fingerprint,
              statusState: body.statusState,
              resolutionNotes: body.resolutionNotes,
            },
          });

          return Response.json({
            success: true,
            fingerprint: body.fingerprint,
            statusState: body.statusState,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
