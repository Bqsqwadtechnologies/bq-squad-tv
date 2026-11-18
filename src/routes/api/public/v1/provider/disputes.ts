import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireProviderAccess } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

export const Route = createFileRoute("/api/public/v1/provider/disputes")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const { user, fs } = await requireUser(request);
        const access = await requireProviderAccess(fs, user);
        const providerId = access.providerId;

        const allDisputes = await fs.listCollection("providerDisputes", { limit: 50 });
        const disputes = allDisputes
          .filter(d => d["providerId"] === providerId)
          .map(d => ({
            id: d["id"] || d["disputeId"],
            subject: d["subject"] || "General Dispute",
            statementId: d["statementId"] || null,
            channelId: d["channelId"] || null,
            status: d["status"] || "open", // open, under_review, resolved, rejected
            createdAt: d["createdAt"] || new Date().toISOString(),
            messages: Array.isArray(d["messages"]) ? d["messages"] : [],
          }));

        return Response.json({ disputes });
      } catch (err: unknown) {
        return errorBody(err);
      }
    },
    POST: async ({ request }) => {
      try {
        const { user, fs } = await requireUser(request);
        const access = await requireProviderAccess(fs, user);
        const providerId = access.providerId;

        const body = await request.json() as { subject?: string; statementId?: string; message?: string };
        if (!body.subject?.trim() || !body.message?.trim()) {
          return Response.json({ error: "Subject and message are required" }, { status: 400 });
        }

        const disputeId = `disp_${Date.now()}`;
        const newDispute = {
          disputeId,
          providerId,
          subject: body.subject.trim(),
          statementId: body.statementId || null,
          status: "open",
          createdAt: new Date().toISOString(),
          createdByUid: user.uid,
          messages: [
            {
              sender: "provider",
              senderUid: user.uid,
              text: body.message.trim(),
              timestamp: new Date().toISOString(),
            },
          ],
        };

        await fs.setDoc(`providerDisputes/${disputeId}`, newDispute);
        await writeAuditLog(fs, {
          action: "provider_dispute_created",
          actorUid: user.uid,
          targetId: disputeId,
          details: { providerId, subject: body.subject },
        });

        return Response.json({ ok: true, dispute: newDispute }, { status: 201 });
      } catch (err: unknown) {
        return errorBody(err);
      }
    },
  }},
});
