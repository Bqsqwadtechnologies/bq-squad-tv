import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { requireProvider } from "@/lib/server/access";
import { writeAuditLog } from "@/lib/server/audit";
import { ApiError } from "@/lib/server/firebase-admin";

export const Route = createFileRoute("/api/public/v1/provider/disputes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { fs, providerId, access } = await requireProvider(request);

          const queryFilters = access.isZillionaireOwner
            ? []
            : [{ field: "providerId", op: "EQUAL" as const, value: providerId }];

          const disputeDocs = await fs.query("providerDisputes", {
            filters: queryFilters,
            limit: 50,
          });

          const disputes = disputeDocs.map((d) => ({
            id: d.__id || d["disputeId"] || d["id"],
            subject: d["subject"] || "General Dispute",
            category: d["category"] || "Revenue Share Calculation",
            statementId: d["statementId"] || null,
            channelId: d["channelId"] || null,
            claimedAmountMinor: Number(d["claimedAmountMinor"] || 0),
            claimedAmountCurrency: d["claimedAmountCurrency"] || "USD",
            evidenceFileName: d["evidenceFileName"] || null,
            status: d["status"] || "open",
            createdAt: d["createdAt"] || new Date().toISOString(),
            updatedAt: d["updatedAt"] || d["createdAt"] || new Date().toISOString(),
            messages: Array.isArray(d["messages"]) ? d["messages"] : [],
            resolution: d["resolution"] || null,
          }));

          return Response.json({ disputes });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
      POST: async ({ request }) => {
        try {
          const { user, fs, access, providerId } = await requireProvider(request);

          const body = (await request.json()) as {
            disputeId?: string;
            subject?: string;
            category?: string;
            statementId?: string;
            channelId?: string;
            claimedAmountMinor?: number;
            claimedAmountCurrency?: string;
            evidenceFileName?: string;
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
              throw new ApiError(
                403,
                "PROVIDER_ISOLATION_VIOLATION",
                "You can only participate in your own provider organisation's dispute threads.",
              );
            }

            const existingMessages = Array.isArray(disputeDoc["messages"])
              ? [...disputeDoc["messages"]]
              : [];

            const senderRole = access.isZillionaireOwner ? "platform" : "provider";
            const newMsg = {
              sender: senderRole,
              senderUid: user.uid,
              text: body.message.trim(),
              timestamp: new Date().toISOString(),
            };

            existingMessages.push(newMsg);

            await fs.patchDoc(`providerDisputes/${body.disputeId}`, {
              messages: existingMessages,
              updatedAt: new Date().toISOString(),
              status:
                disputeDoc["status"] === "resolved"
                  ? "open"
                  : disputeDoc["status"] || "open",
            });

            await writeAuditLog(fs, {
              action: "provider_dispute_reply",
              actorUid: user.uid,
              targetType: "provider_dispute",
              targetId: body.disputeId,
              reason: `Dispute reply to ${body.disputeId} from ${senderRole}`,
              metadata: { providerId, messageLength: body.message.trim().length },
            });

            return Response.json({ ok: true, disputeId: body.disputeId, message: newMsg });
          }

          // New dispute creation
          if (!body.subject?.trim()) {
            return Response.json(
              { error: "Subject is required for new disputes." },
              { status: 400 },
            );
          }

          const disputeId = `disp_${Date.now()}`;
          const newDispute = {
            disputeId,
            providerId,
            subject: body.subject.trim(),
            category: body.category || "Revenue Share Calculation",
            statementId: body.statementId || null,
            channelId: body.channelId || null,
            claimedAmountMinor: Number(body.claimedAmountMinor || 0),
            claimedAmountCurrency: body.claimedAmountCurrency || "USD",
            evidenceFileName: body.evidenceFileName || null,
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
            resolution: null,
          };

          await fs.setDoc(`providerDisputes/${disputeId}`, newDispute);
          await writeAuditLog(fs, {
            action: "provider_dispute_created",
            actorUid: user.uid,
            targetType: "provider_dispute",
            targetId: disputeId,
            reason: `Created dispute: ${body.subject.trim()}`,
            metadata: { providerId, subject: body.subject.trim() },
          });

          return Response.json({ ok: true, dispute: newDispute }, { status: 201 });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
      PATCH: async ({ request }) => {
        try {
          const { user, fs, access, providerId } = await requireProvider(request);

          const body = (await request.json()) as {
            disputeId: string;
            decision: "accept" | "reject" | "counter_offer";
            acceptedAmountMinor?: number;
            adjustmentStatementPeriod?: string;
            resolutionNotes: string;
          };

          if (!body.disputeId || !body.decision || !body.resolutionNotes?.trim()) {
            return Response.json(
              { error: "disputeId, decision, and resolutionNotes are required." },
              { status: 400 },
            );
          }

          const disputeDoc = await fs.getDoc(`providerDisputes/${body.disputeId}`);
          if (!disputeDoc) {
            throw new ApiError(404, "DISPUTE_NOT_FOUND", "Dispute not found.");
          }

          if (disputeDoc["providerId"] !== providerId && !access.isZillionaireOwner) {
            throw new ApiError(403, "ACCESS_DENIED", "Unauthorized to resolve this dispute.");
          }

          const resolutionStatus =
            body.decision === "accept"
              ? "resolved"
              : body.decision === "reject"
                ? "rejected"
                : "under_review";

          const resolution = {
            decision: body.decision,
            acceptedAmountMinor: Number(body.acceptedAmountMinor || 0),
            adjustmentStatementPeriod: body.adjustmentStatementPeriod || "Next Monthly Settlement",
            resolutionNotes: body.resolutionNotes.trim(),
            resolvedAt: new Date().toISOString(),
            resolvedByUid: user.uid,
          };

          const existingMessages = Array.isArray(disputeDoc["messages"])
            ? [...disputeDoc["messages"]]
            : [];

          existingMessages.push({
            sender: "platform",
            senderUid: user.uid,
            text: `[Formal Resolution - ${body.decision.toUpperCase()}] ${body.resolutionNotes.trim()}${
              body.acceptedAmountMinor
                ? ` • Accepted Adjustment: ${(body.acceptedAmountMinor / 100).toFixed(2)}`
                : ""
            }`,
            timestamp: new Date().toISOString(),
          });

          await fs.patchDoc(`providerDisputes/${body.disputeId}`, {
            status: resolutionStatus,
            resolution,
            messages: existingMessages,
            updatedAt: new Date().toISOString(),
          });

          await writeAuditLog(fs, {
            action: "dispute_resolution_decision",
            actorUid: user.uid,
            targetType: "provider_dispute",
            targetId: body.disputeId,
            reason: `Dispute decision: ${body.decision}`,
            metadata: { decision: body.decision, disputeId: body.disputeId },
          });

          return Response.json({ ok: true, status: resolutionStatus, resolution });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
