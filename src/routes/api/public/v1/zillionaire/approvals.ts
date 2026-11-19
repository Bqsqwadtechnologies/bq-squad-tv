import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

export type ApprovalType =
  | "channel"
  | "producer"
  | "provider"
  | "payout"
  | "content_report"
  | "ad_creative"
  | "legal_issue";

export type ApprovalPriority = "urgent" | "high" | "medium" | "normal";

export type ApprovalItem = {
  id: string;
  itemType: ApprovalType;
  rawId: string;
  title: string;
  submitterUid: string;
  submitterName: string;
  submitterEmail?: string;
  submittedAt: string;
  slaDeadline: string;
  slaHours: number;
  isOverdue: boolean;
  status: "pending" | "approved" | "rejected";
  assignedTo: string | null;
  priority: ApprovalPriority;
  details: Record<string, unknown>;
};

export const Route = createFileRoute("/api/public/v1/zillionaire/approvals")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "moderation");

          const url = new URL(request.url);
          const typeFilter = url.searchParams.get("type");
          const statusFilter = url.searchParams.get("status") || "pending";
          const now = Date.now();

          const [
            channels,
            producers,
            providers,
            payouts,
            reports,
            customApprovals,
            adCampaigns,
            legalIssues,
          ] = await Promise.all([
            fs.query("channels", { limit: 100 }).catch(() => []),
            fs.query("producers", { limit: 100 }).catch(() => []),
            fs.query("providerAllowlist", { limit: 100 }).catch(() => []),
            fs.query("payouts", { limit: 100 }).catch(() => []),
            fs.query("contentReports", { limit: 100 }).catch(() => []),
            fs.query("approvals", { limit: 100 }).catch(() => []),
            fs.query("adCampaigns", { limit: 100 }).catch(() => []),
            fs.query("legalAcceptanceIssues", { limit: 100 }).catch(() => []),
          ]);

          const items: ApprovalItem[] = [];

          // 1. Channel submissions
          for (const ch of channels) {
            const status = String(ch["status"] || "").toLowerCase();
            const verification = String(ch["verificationStatus"] || "").toLowerCase();
            const isPending = status === "pending" || verification === "pending";
            if (statusFilter === "pending" && !isPending) continue;

            const submittedAt = typeof ch["createdAt"] === "string" ? ch["createdAt"] : new Date(now - 86400000).toISOString();
            const slaHours = 48;
            const slaDeadline = new Date(new Date(submittedAt).getTime() + slaHours * 3600000).toISOString();
            const isOverdue = now > new Date(slaDeadline).getTime() && isPending;

            items.push({
              id: `channel:${ch.__id}`,
              itemType: "channel",
              rawId: String(ch.__id),
              title: `Channel Submission: ${ch["name"] || ch["title"] || ch.__id}`,
              submitterUid: String(ch["ownerUid"] || ch["producerUid"] || "unknown"),
              submitterName: String(ch["ownerName"] || ch["name"] || "Creator"),
              submitterEmail: typeof ch["ownerEmail"] === "string" ? ch["ownerEmail"] : undefined,
              submittedAt,
              slaDeadline,
              slaHours,
              isOverdue,
              status: isPending ? "pending" : (status === "active" || verification === "verified") ? "approved" : "rejected",
              assignedTo: typeof ch["assignedTo"] === "string" ? ch["assignedTo"] : null,
              priority: isOverdue ? "urgent" : "high",
              details: {
                handle: ch["handle"],
                category: ch["category"] || "General Entertainment",
                streamUrl: ch["streamUrl"] || "HLS Source Configured",
              },
            });
          }

          // 2. Producer Verifications
          for (const prod of producers) {
            const verification = String(prod["verificationStatus"] || "").toLowerCase();
            const verified = Boolean(prod["verified"]);
            const isPending = verification === "pending" || (!verified && Boolean(prod["hasEvidence"]));
            if (statusFilter === "pending" && !isPending) continue;

            const submittedAt = typeof prod["updatedAt"] === "string" ? prod["updatedAt"] : new Date(now - 43200000).toISOString();
            const slaHours = 24;
            const slaDeadline = new Date(new Date(submittedAt).getTime() + slaHours * 3600000).toISOString();
            const isOverdue = now > new Date(slaDeadline).getTime() && isPending;

            items.push({
              id: `producer:${prod.__id}`,
              itemType: "producer",
              rawId: String(prod.__id),
              title: `Producer Identity Verification: ${prod["displayName"] || prod["companyName"] || prod.__id}`,
              submitterUid: String(prod.__id),
              submitterName: String(prod["displayName"] || prod["companyName"] || "Producer"),
              submitterEmail: typeof prod["email"] === "string" ? prod["email"] : undefined,
              submittedAt,
              slaDeadline,
              slaHours,
              isOverdue,
              status: isPending ? "pending" : verified ? "approved" : "rejected",
              assignedTo: typeof prod["assignedTo"] === "string" ? prod["assignedTo"] : null,
              priority: isOverdue ? "urgent" : "medium",
              details: {
                idDocumentType: prod["idType"] || "National ID / CAC Registration",
                bankAccount: prod["payoutAccount"] ? "Configured" : "Pending",
              },
            });
          }

          // 3. Provider Access Requests
          for (const prov of providers) {
            const status = String(prov["status"] || "").toLowerCase();
            const isPending = status === "pending" || status === "unverified";
            if (statusFilter === "pending" && !isPending) continue;

            const submittedAt = typeof prov["createdAt"] === "string" ? prov["createdAt"] : new Date(now - 36000000).toISOString();
            const slaHours = 24;
            const slaDeadline = new Date(new Date(submittedAt).getTime() + slaHours * 3600000).toISOString();
            const isOverdue = now > new Date(slaDeadline).getTime() && isPending;

            items.push({
              id: `provider:${prov.__id}`,
              itemType: "provider",
              rawId: String(prov.__id),
              title: `Provider Stream Access: ${prov["email"] || prov.__id}`,
              submitterUid: String(prov.__id),
              submitterName: String(prov["organization"] || prov["email"] || "Provider Partner"),
              submitterEmail: typeof prov["email"] === "string" ? prov["email"] : undefined,
              submittedAt,
              slaDeadline,
              slaHours,
              isOverdue,
              status: isPending ? "pending" : status === "approved" ? "approved" : "rejected",
              assignedTo: typeof prov["assignedTo"] === "string" ? prov["assignedTo"] : null,
              priority: "high",
              details: {
                email: prov["email"],
                organization: prov["organization"] || "Broadcasting Network",
              },
            });
          }

          // 4. Payout Requests
          for (const pay of payouts) {
            const status = String(pay["status"] || "").toLowerCase();
            const isPending = status === "pending" || status === "submitted" || status === "requested";
            if (statusFilter === "pending" && !isPending) continue;

            const submittedAt = typeof pay["createdAt"] === "string" ? pay["createdAt"] : new Date(now - 18000000).toISOString();
            const slaHours = 24;
            const slaDeadline = new Date(new Date(submittedAt).getTime() + slaHours * 3600000).toISOString();
            const isOverdue = now > new Date(slaDeadline).getTime() && isPending;
            const amountMinor = Number(pay["netAmountMinor"] || pay["amountMinor"] || 0);

            items.push({
              id: `payout:${pay.__id}`,
              itemType: "payout",
              rawId: String(pay.__id),
              title: `Settlement Payout: ₦${(amountMinor / 100).toLocaleString()}`,
              submitterUid: String(pay["creatorUid"] || pay["producerUid"] || "unknown"),
              submitterName: String(pay["creatorName"] || pay["recipientName"] || "Producer"),
              submitterEmail: typeof pay["recipientEmail"] === "string" ? pay["recipientEmail"] : undefined,
              submittedAt,
              slaDeadline,
              slaHours,
              isOverdue,
              status: isPending ? "pending" : status === "paid" || status === "approved" ? "approved" : "rejected",
              assignedTo: typeof pay["assignedTo"] === "string" ? pay["assignedTo"] : null,
              priority: isOverdue || amountMinor > 50000000 ? "urgent" : "high",
              details: {
                amountMinor,
                bankName: pay["bankName"] || "Settlement Bank",
                accountNumber: pay["accountNumber"] ? `***${String(pay["accountNumber"]).slice(-4)}` : "Masked",
              },
            });
          }

          // 5. Content Takedown & Copyright Reports
          for (const rep of reports) {
            const status = String(rep["status"] || "").toLowerCase();
            const isPending = status === "open" || status === "pending";
            if (statusFilter === "pending" && !isPending) continue;

            const submittedAt = typeof rep["createdAt"] === "string" ? rep["createdAt"] : new Date(now - 7200000).toISOString();
            const slaHours = 12;
            const slaDeadline = new Date(new Date(submittedAt).getTime() + slaHours * 3600000).toISOString();
            const isOverdue = now > new Date(slaDeadline).getTime() && isPending;

            items.push({
              id: `content_report:${rep.__id}`,
              itemType: "content_report",
              rawId: String(rep.__id),
              title: `Content Moderation: ${rep["reason"] || "Copyright / Guidelines Flag"}`,
              submitterUid: String(rep["reporterUid"] || "anonymous"),
              submitterName: String(rep["reporterName"] || "Viewer Flag"),
              submitterEmail: typeof rep["reporterEmail"] === "string" ? rep["reporterEmail"] : undefined,
              submittedAt,
              slaDeadline,
              slaHours,
              isOverdue,
              status: isPending ? "pending" : status === "resolved" ? "approved" : "rejected",
              assignedTo: typeof rep["assignedTo"] === "string" ? rep["assignedTo"] : null,
              priority: "urgent",
              details: {
                assetId: rep["assetId"],
                targetType: rep["targetType"] || "video",
                reason: rep["reason"] || "Community standard review",
              },
            });
          }

          // 6. Custom Ad Creatives / Legal Approvals
          for (const ca of customApprovals) {
            const status = String(ca["status"] || "pending").toLowerCase();
            if (statusFilter === "pending" && status !== "pending") continue;

            const submittedAt = typeof ca["createdAt"] === "string" ? ca["createdAt"] : new Date(now).toISOString();
            const slaHours = 24;
            const slaDeadline = new Date(new Date(submittedAt).getTime() + slaHours * 3600000).toISOString();
            const isOverdue = now > new Date(slaDeadline).getTime() && status === "pending";

            items.push({
              id: `approvals:${ca.__id}`,
              itemType: (ca["itemType"] as ApprovalType) || "ad_creative",
              rawId: String(ca.__id),
              title: String(ca["title"] || "Ad Creative Review"),
              submitterUid: String(ca["submitterUid"] || "advertiser"),
              submitterName: String(ca["submitterName"] || "Partner"),
              submitterEmail: typeof ca["submitterEmail"] === "string" ? ca["submitterEmail"] : undefined,
              submittedAt,
              slaDeadline,
              slaHours,
              isOverdue,
              status: status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending",
              assignedTo: typeof ca["assignedTo"] === "string" ? ca["assignedTo"] : null,
              priority: isOverdue ? "urgent" : "medium",
              details: (ca["details"] as Record<string, unknown>) || {},
            });
          }

          for (const ad of adCampaigns) {
            const status = String(ad["creativeReviewStatus"] || ad["status"] || "pending").toLowerCase();
            const isPending = status === "pending" || status === "review";
            if (statusFilter === "pending" && !isPending) continue;
            const submittedAt = typeof ad["createdAt"] === "string" ? ad["createdAt"] : new Date(now).toISOString();
            const slaHours = 24;
            const slaDeadline = new Date(new Date(submittedAt).getTime() + slaHours * 3600000).toISOString();
            items.push({
              id: `ad_creative:${ad.__id}`,
              itemType: "ad_creative",
              rawId: String(ad.__id),
              title: `Ad Creative Review: ${ad["name"] || ad["title"] || ad.__id}`,
              submitterUid: String(ad["advertiserUid"] || ad["ownerUid"] || "unknown"),
              submitterName: String(ad["advertiserName"] || ad["companyName"] || "Advertiser"),
              submitterEmail: typeof ad["email"] === "string" ? ad["email"] : undefined,
              submittedAt,
              slaDeadline,
              slaHours,
              isOverdue: now > new Date(slaDeadline).getTime() && isPending,
              status: isPending ? "pending" : status === "approved" || status === "active" ? "approved" : "rejected",
              assignedTo: typeof ad["assignedTo"] === "string" ? ad["assignedTo"] : null,
              priority: "medium",
              details: { campaignId: ad.__id, creativeStatus: ad["creativeReviewStatus"] || status },
            });
          }

          for (const issue of legalIssues) {
            const status = String(issue["status"] || "pending").toLowerCase();
            const isPending = status === "pending" || status === "open";
            if (statusFilter === "pending" && !isPending) continue;
            const submittedAt = typeof issue["createdAt"] === "string" ? issue["createdAt"] : new Date(now).toISOString();
            const slaHours = 48;
            const slaDeadline = new Date(new Date(submittedAt).getTime() + slaHours * 3600000).toISOString();
            items.push({
              id: `legal_issue:${issue.__id}`,
              itemType: "legal_issue",
              rawId: String(issue.__id),
              title: `Legal Acceptance Issue: ${issue["documentName"] || issue["policyName"] || issue.__id}`,
              submitterUid: String(issue["userUid"] || "unknown"),
              submitterName: String(issue["userName"] || "Viewer"),
              submitterEmail: typeof issue["email"] === "string" ? issue["email"] : undefined,
              submittedAt,
              slaDeadline,
              slaHours,
              isOverdue: now > new Date(slaDeadline).getTime() && isPending,
              status: isPending ? "pending" : status === "resolved" || status === "accepted" ? "approved" : "rejected",
              assignedTo: typeof issue["assignedTo"] === "string" ? issue["assignedTo"] : null,
              priority: "high",
              details: { userUid: issue["userUid"], reason: issue["reason"] || "Acceptance mismatch" },
            });
          }

          // Filter by type if requested
          const filtered = items.filter((it) =>
            (!typeFilter || it.itemType === typeFilter) &&
            (!statusFilter || it.status === statusFilter),
          );

          // Sort by overdue first, then priority, then submission date
          filtered.sort((a, b) => {
            if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
            const prioRank = { urgent: 0, high: 1, medium: 2, normal: 3 };
            if (prioRank[a.priority] !== prioRank[b.priority]) {
              return prioRank[a.priority] - prioRank[b.priority];
            }
            return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
          });

          return Response.json({
            items: filtered,
            counts: {
              total: items.length,
              pending: items.filter((i) => i.status === "pending").length,
              overdue: items.filter((i) => i.isOverdue).length,
              urgent: items.filter((i) => i.priority === "urgent").length,
            },
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "moderation");

          const body = (await request.json()) as {
            action: "approve" | "reject" | "assign";
            itemIds: string[];
            notes: string;
            assignedTo?: string;
          };

          if (!body.action || !["approve", "reject", "assign"].includes(body.action)) {
            return Response.json({ error: "Invalid action. Must be approve, reject, or assign." }, { status: 400 });
          }

          if (!Array.isArray(body.itemIds) || body.itemIds.length === 0) {
            return Response.json({ error: "itemIds must be a non-empty array." }, { status: 400 });
          }

          const notes = String(body.notes || "").trim();
          if (notes.length < 3) {
            return Response.json({ error: "A clear reason/note (minimum 3 characters) is required for every action." }, { status: 400 });
          }
          if (body.action === "assign" && !String(body.assignedTo || "").trim()) {
            return Response.json({ error: "assignedTo is required for assignment." }, { status: 400 });
          }

          const results: Array<{ id: string; success: boolean; error?: string }> = [];

          for (const compoundId of body.itemIds) {
            const [type, rawId] = compoundId.split(":");
            if (!type || !rawId) {
              results.push({ id: compoundId, success: false, error: "Invalid ID format" });
              continue;
            }

            try {
              if (body.action === "assign") {
                const assignee = body.assignedTo!.trim();
                if (type === "channel") await fs.patchDoc("channels", rawId, { assignedTo: assignee });
                else if (type === "producer") await fs.patchDoc("producers", rawId, { assignedTo: assignee });
                else if (type === "provider") await fs.patchDoc("providerAllowlist", rawId, { assignedTo: assignee });
                else if (type === "payout") await fs.patchDoc("payouts", rawId, { assignedTo: assignee });
                else if (type === "content_report") await fs.patchDoc("contentReports", rawId, { assignedTo: assignee });
                else if (type === "ad_creative") await fs.patchDoc("adCampaigns", rawId, { assignedTo: assignee });
                else if (type === "legal_issue") await fs.patchDoc("legalAcceptanceIssues", rawId, { assignedTo: assignee });
                else await fs.patchDoc("approvals", rawId, { assignedTo: assignee });
              } else {
                const isApprove = body.action === "approve";
                if (type === "channel") {
                  await fs.patchDoc("channels", rawId, {
                    status: isApprove ? "active" : "rejected",
                    verificationStatus: isApprove ? "verified" : "rejected",
                    reviewNotes: notes,
                    reviewedAt: new Date().toISOString(),
                    reviewedBy: user.uid,
                  });
                } else if (type === "producer") {
                  await fs.patchDoc("producers", rawId, {
                    verified: isApprove,
                    verificationStatus: isApprove ? "approved" : "rejected",
                    reviewNotes: notes,
                    rejectionReason: isApprove ? null : notes,
                    reviewedAt: new Date().toISOString(),
                    reviewedBy: user.uid,
                  });
                } else if (type === "provider") {
                  await fs.patchDoc("providerAllowlist", rawId, {
                    status: isApprove ? "approved" : "rejected",
                    notes,
                    reviewedAt: new Date().toISOString(),
                    reviewedBy: user.uid,
                  });
                } else if (type === "payout") {
                  await fs.patchDoc("payouts", rawId, {
                    status: isApprove ? "approved" : "rejected",
                    auditNote: notes,
                    reviewedAt: new Date().toISOString(),
                    reviewedBy: user.uid,
                  });
                } else if (type === "content_report") {
                  await fs.patchDoc("contentReports", rawId, {
                    status: isApprove ? "resolved" : "dismissed",
                    resolutionNotes: notes,
                    resolvedAt: new Date().toISOString(),
                    resolvedBy: user.uid,
                  });
                } else if (type === "ad_creative") {
                  await fs.patchDoc("adCampaigns", rawId, {
                    creativeReviewStatus: isApprove ? "approved" : "rejected",
                    reviewNotes: notes,
                    reviewedAt: new Date().toISOString(),
                    reviewedBy: user.uid,
                  });
                } else if (type === "legal_issue") {
                  await fs.patchDoc("legalAcceptanceIssues", rawId, {
                    status: isApprove ? "resolved" : "rejected",
                    resolutionNotes: notes,
                    resolvedAt: new Date().toISOString(),
                    resolvedBy: user.uid,
                  });
                } else {
                  await fs.patchDoc("approvals", rawId, {
                    status: isApprove ? "approved" : "rejected",
                    decisionNotes: notes,
                    resolvedAt: new Date().toISOString(),
                    resolvedBy: user.uid,
                  });
                }
              }

              // Audit logging for each decision
              await writeAuditLog(fs, {
                actorUid: user.uid,
                action: `approval.${body.action}`,
                targetType: type,
                targetId: rawId,
                reason: notes,
              }).catch(() => null);

              if (body.action !== "assign") {
                const recipientUid = type === "channel"
                  ? String((await fs.getDoc(`channels/${rawId}`))?.["ownerUid"] || (await fs.getDoc(`channels/${rawId}`))?.["producerUid"] || "")
                  : type === "producer"
                    ? rawId
                    : type === "payout"
                      ? String((await fs.getDoc(`payouts/${rawId}`))?.["creatorUid"] || (await fs.getDoc(`payouts/${rawId}`))?.["producerUid"] || "")
                      : type === "content_report"
                        ? String((await fs.getDoc(`contentReports/${rawId}`))?.["reporterUid"] || "")
                        : type === "ad_creative"
                          ? String((await fs.getDoc(`adCampaigns/${rawId}`))?.["advertiserUid"] || (await fs.getDoc(`adCampaigns/${rawId}`))?.["ownerUid"] || "")
                          : type === "legal_issue"
                            ? String((await fs.getDoc(`legalAcceptanceIssues/${rawId}`))?.["userUid"] || "")
                            : String((await fs.getDoc(`approvals/${rawId}`))?.["submitterUid"] || "");
                if (recipientUid && recipientUid !== "unknown" && recipientUid !== "anonymous") {
                  const notificationId = crypto.randomUUID().replace(/-/g, "");
                  const decision = body.action === "approve" ? "approved" : "rejected";
                  await fs.setDoc(`users/${recipientUid}/notifications/${notificationId}`, {
                    notificationId,
                    title: `Your ${type.replace("_", " ")} request was ${decision}`,
                    body: notes,
                    deepLink: null,
                    read: false,
                    deliveryStatus: "queued",
                    createdAt: new Date().toISOString(),
                    createdBy: user.uid,
                    targetType: type,
                    targetId: rawId,
                  }).catch(() => null);
                }
              }

              results.push({ id: compoundId, success: true });
            } catch (err) {
              results.push({
                id: compoundId,
                success: false,
                error: err instanceof Error ? err.message : "Update failed",
              });
            }
          }

          return Response.json({
            action: body.action,
            processedCount: results.filter((r) => r.success).length,
            results,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
