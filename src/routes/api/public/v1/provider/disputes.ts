import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireProviderAccess } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { ApiError } from "@/lib/server/firebase-admin";

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
            updatedAt: d["updatedAt"] || d["createdAt"] || new Date().toISOString(),
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

        const body = await request.json() as {
          disputeId?: string;
          subject?: string;
          statementId?: string;
          channelId?: string;
          message?: string;
        };

        if (!body.message?.trim()) {
          return Response.json({ error: "Message content is required." }, { status: 400 });
        }

        // Thread reply scenario
        if (body.disputeId) {
          const disputeDoc = await fs.getDoc(`providerDisputes/${body.disputeId}`);
          if (!disputeDoc) {
            throw new ApiError(404, "DISPUTE_NOT_FOUND", "Dispute thread not found.");
          }
          if (disputeDoc["providerId"] !== providerId && !access.isZillionaireOwner) {
            throw new ApiError(403, "PROVIDER_ISOLATION_VIOLATION", "You can only participate in your own provider organisation's dispute threads.");
          }

          const existingMessages = Array.isArray(disputeDoc["messages"])
            ? [...disputeDoc["messages"]]
            : [];

          const newMsg = {
            sender: "provider",
            senderUid: user.uid,
            text: body.message.trim(),
            timestamp: new Date().toISOString(),
          };

          existingMessages.push(newMsg);

          await fs.updateDoc(`providerDisputes/${body.disputeId}`, {
            messages: existingMessages,
            updatedAt: new Date().toISOString(),
            status: disputeDoc["status"] === "resolved" ? "open" : (disputeDoc["status"] || "open"),
          });

          await writeAuditLog(fs, {
            action: "provider_dispute_reply",
            actorUid: user.uid,
            targetId: body.disputeId,
            details: { providerId, messageLength: body.message.trim().length },
          });

          return Response.json({ ok: true, disputeId: body.disputeId, message: newMsg });
        }

        // New dispute creation
        if (!body.subject?.trim()) {
          return Response.json({ error: "Subject is required for new disputes." }, { status: 400 });
        }

        const disputeId = `disp_${Date.now()}`;
        const newDispute = {
          disputeId,
          providerId,
          subject: body.subject.trim(),
          statementId: body.statementId || null,
          channelId: body.channelId || null,
          status: "open",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
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
          details: { providerId, subject: body.subject.trim() },
        });

        return Response.json({ ok: true, dispute: newDispute }, { status: 201 });
      } catch (err: unknown) {
        return errorBody(err);
      }
    },
  }},
});
