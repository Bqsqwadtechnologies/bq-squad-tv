import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { ApiError } from "@/lib/server/firebase-admin";
import { writeAuditLog } from "@/lib/server/audit";

export const Route = createFileRoute("/api/public/v1/admin/support/messages")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const { user, fs } = await requireUser(request);
        await requireAdminModule(fs, user, "support");

        const url = new URL(request.url);
        const type = url.searchParams.get("type");

        if (type === "disputes") {
          const disputes = await fs.listCollection("providerDisputes", { limit: 100 });
          return Response.json({
            disputes: disputes.map(d => ({
              id: d["id"] || d["disputeId"],
              providerId: d["providerId"] || "unknown",
              subject: d["subject"] || "General Dispute",
              statementId: d["statementId"] || null,
              channelId: d["channelId"] || null,
              status: d["status"] || "open",
              createdAt: d["createdAt"] || null,
              updatedAt: d["updatedAt"] || d["createdAt"] || null,
              messages: Array.isArray(d["messages"]) ? d["messages"] : [],
            })),
          });
        }

        const messages = await fs.listCollection("supportMessages", { limit: 100 });
        return Response.json({
          messages: messages.map(m => ({
            id: m["id"] || m["messageId"],
            name: m["name"] || "Visitor",
            email: m["email"] || "",
            subject: m["subject"] || "Inquiry",
            message: m["message"] || "",
            status: m["status"] || "new", // new, in_progress, resolved
            notes: m["notes"] || "",
            createdAt: m["createdAt"] || null,
          })),
        });
      } catch (err: unknown) {
        return errorBody(err);
      }
    },
    POST: async ({ request }) => {
      try {
        const { user, fs } = await requireUser(request);
        await requireAdminModule(fs, user, "support");

        const body = await request.json() as {
          messageId?: string;
          disputeId?: string;
          replyMessage?: string;
          status?: string;
          notes?: string;
        };

        // Support responding to a provider dispute
        if (body.disputeId) {
          const disputeDoc = await fs.getDoc(`providerDisputes/${body.disputeId}`);
          if (!disputeDoc) {
            throw new ApiError(404, "DISPUTE_NOT_FOUND", "Dispute not found.");
          }

          const existingMessages = Array.isArray(disputeDoc["messages"])
            ? [...disputeDoc["messages"]]
            : [];

          if (body.replyMessage?.trim()) {
            existingMessages.push({
              sender: "support",
              senderUid: user.uid,
              text: body.replyMessage.trim(),
              timestamp: new Date().toISOString(),
            });
          }

          const newStatus = body.status || "under_review";
          await fs.updateDoc(`providerDisputes/${body.disputeId}`, {
            messages: existingMessages,
            status: newStatus,
            updatedAt: new Date().toISOString(),
            resolvedByUid: newStatus === "resolved" ? user.uid : null,
          });

          await writeAuditLog(fs, {
            action: "admin_dispute_reply",
            actorUid: user.uid,
            targetId: body.disputeId,
            details: { status: newStatus, providerId: disputeDoc["providerId"] },
          });

          return Response.json({ ok: true, disputeId: body.disputeId, status: newStatus });
        }

        if (!body.messageId) {
          return Response.json({ error: "messageId or disputeId is required" }, { status: 400 });
        }

        await fs.updateDoc(`supportMessages/${body.messageId}`, {
          ...(body.status ? { status: body.status } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          updatedAt: new Date().toISOString(),
          updatedByUid: user.uid,
        });

        return Response.json({ ok: true, messageId: body.messageId });
      } catch (err: unknown) {
        return errorBody(err);
      }
    },
  }},
});
