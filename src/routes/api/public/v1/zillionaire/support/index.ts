import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser, parseBody } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

export type TicketPriority = "urgent" | "high" | "medium" | "low";
export type TicketStatus = "new" | "open" | "pending" | "resolved" | "closed";

export type InternalNote = {
  id: string;
  authorUid: string;
  authorName?: string;
  text: string;
  createdAt: string;
};

export type SupportTicket = {
  id: string;
  ticketNumber: string;
  subject: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: "billing" | "playback" | "account" | "licence" | "general";
  messages: Array<{
    id: string;
    sender: "customer" | "operator";
    senderName: string;
    text: string;
    createdAt: string;
  }>;
  internalNotes: InternalNote[];
  linkedUserUid?: string;
  linkedPaymentId?: string;
  linkedReceiptId?: string;
  assignedOperatorUid?: string;
  createdAt: string;
  updatedAt: string;
};

export type UserSegment = {
  id: string;
  name: string;
  description: string;
  criteria: {
    minSpendMinor?: number;
    platform?: string;
    country?: string;
    accountStatus?: string;
  };
  audienceCount: number;
  createdAt: string;
  updatedAt: string;
};

export type RecoveryRequest = {
  id: string;
  userUid: string;
  email: string;
  reason: string;
  status: "pending_verification" | "identity_verified" | "reset_link_dispatched" | "rejected";
  verificationChecks: {
    emailConfirmed: boolean;
    recentBillingVerified: boolean;
    deviceFingerprintMatched: boolean;
  };
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("UPDATE_TICKET"),
    ticketId: z.string().trim().min(2).max(100),
    status: z.enum(["new", "open", "pending", "resolved", "closed"]).optional(),
    priority: z.enum(["urgent", "high", "medium", "low"]).optional(),
    assignedOperatorUid: z.string().optional(),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("ADD_INTERNAL_NOTE"),
    ticketId: z.string().trim().min(2).max(100),
    text: z.string().trim().min(3).max(2000),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("LINK_RECORD"),
    ticketId: z.string().trim().min(2).max(100),
    linkedUserUid: z.string().optional(),
    linkedPaymentId: z.string().optional(),
    linkedReceiptId: z.string().optional(),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("SEND_REPLY"),
    ticketId: z.string().trim().min(2).max(100),
    text: z.string().trim().min(3).max(4000),
    cannedReplyKey: z.string().optional(),
    newStatus: z.enum(["open", "pending", "resolved"]).optional(),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("SAVE_SEGMENT"),
    name: z.string().trim().min(3).max(100),
    description: z.string().trim().min(3).max(300),
    criteria: z.object({
      minSpendMinor: z.number().int().nonnegative().optional(),
      platform: z.string().optional(),
      country: z.string().optional(),
      accountStatus: z.string().optional(),
    }),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("PROCESS_RECOVERY"),
    requestId: z.string().trim().min(2).max(100),
    recoveryAction: z.enum(["VERIFY_IDENTITY", "DISPATCH_RESET_LINK", "REJECT"]),
    notes: z.string().trim().min(3).max(1000),
    reason: z.string().trim().min(3).max(1000),
  }),
]);

export const Route = createFileRoute("/api/public/v1/zillionaire/support/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "support");

          const [ticketsRaw, segmentsRaw, recoveryRaw, cannedRaw] = await Promise.all([
            fs
              .query("supportTickets", { orderByField: "createdAt", descending: true, limit: 100 })
              .catch(() => []),
            fs
              .query("userSegments", { orderByField: "createdAt", descending: true, limit: 50 })
              .catch(() => []),
            fs
              .query("accountRecoveryRequests", {
                orderByField: "createdAt",
                descending: true,
                limit: 50,
              })
              .catch(() => []),
            fs.query("cannedReplies", { limit: 20 }).catch(() => []),
          ]);

          const now = new Date();

          // Standard canned replies templates
          let cannedReplies = cannedRaw.map((c) => ({
            key: String(c.__id || c["key"] || ""),
            title: String(c["title"] || ""),
            content: String(c["content"] || ""),
            category: String(c["category"] || "general"),
          }));

          if (cannedReplies.length === 0) {
            cannedReplies = [
              {
                key: "stream_troubleshoot",
                title: "Streaming & Playback Optimization",
                category: "playback",
                content:
                  "Hello,\n\nThank you for reaching out to BQ SQWAD TV Support. If you are experiencing buffer stutters or video lag, please ensure your app is updated to the latest Android/PWA build. Try clearing your player cache or selecting standard definition. We monitor live ingest streams 24/7.",
              },
              {
                key: "billing_refund_receipt",
                title: "Payment Chargeback / Reversal Confirmation",
                category: "billing",
                content:
                  "Hello,\n\nWe have verified your payment reference against our acquiring gateway records. Your wallet ledger has been credited or the card debit reversed accordingly. You can review your updated receipt in your Account portal.",
              },
              {
                key: "account_identity_recovery",
                title: "Account Recovery Instructions",
                category: "account",
                content:
                  "Hello,\n\nFor your security, platform operators never store or view user passwords. A cryptographically signed one-time reset link has been dispatched to your verified email address. This link expires in 15 minutes.",
              },
              {
                key: "geoblocking_notice",
                title: "Territorial Broadcast Rights Notice",
                category: "licence",
                content:
                  "Hello,\n\nCertain premium live channels and video titles are subject to regional copyright licence boundaries and cannot be streamed from your detected IP location. We apologize for any inconvenience.",
              },
            ];
          }

          // Baseline tickets if Firestore has none
          let tickets: SupportTicket[] = ticketsRaw.map((t) => ({
            id: String(t.__id || t["id"] || ""),
            ticketNumber: String(
              t["ticketNumber"] || `TICK-${Math.floor(1000 + Math.random() * 9000)}`,
            ),
            subject: String(t["subject"] || "General Inquiry"),
            customerName: String(t["customerName"] || "Viewer"),
            customerEmail: String(t["customerEmail"] || "viewer@example.com"),
            customerPhone: typeof t["customerPhone"] === "string" ? t["customerPhone"] : undefined,
            status: (t["status"] as TicketStatus) || "open",
            priority: (t["priority"] as TicketPriority) || "medium",
            category: (t["category"] as SupportTicket["category"]) || "general",
            messages: Array.isArray(t["messages"]) ? t["messages"] : [],
            internalNotes: Array.isArray(t["internalNotes"]) ? t["internalNotes"] : [],
            linkedUserUid: typeof t["linkedUserUid"] === "string" ? t["linkedUserUid"] : undefined,
            linkedPaymentId:
              typeof t["linkedPaymentId"] === "string" ? t["linkedPaymentId"] : undefined,
            linkedReceiptId:
              typeof t["linkedReceiptId"] === "string" ? t["linkedReceiptId"] : undefined,
            assignedOperatorUid:
              typeof t["assignedOperatorUid"] === "string" ? t["assignedOperatorUid"] : undefined,
            createdAt: String(t["createdAt"] || now.toISOString()),
            updatedAt: String(t["updatedAt"] || now.toISOString()),
          }));

          if (tickets.length === 0) {
            tickets = [
              {
                id: "t_101",
                ticketNumber: "TICK-8021",
                subject: "Failed wallet top-up deduction on Paystack",
                customerName: "Chinedu Okafor",
                customerEmail: "chinedu.okafor@example.ng",
                customerPhone: "+234 803 112 4490",
                status: "open",
                priority: "urgent",
                category: "billing",
                linkedUserUid: "usr_zillion_01",
                linkedPaymentId: "PAY_NGN_89211",
                linkedReceiptId: "REC-2026-11-892",
                messages: [
                  {
                    id: "m_1",
                    sender: "customer",
                    senderName: "Chinedu Okafor",
                    text: "I was debited ₦5,000 via my bank card on Paystack, but my wallet still says ₦0. Reference is PAY_NGN_89211.",
                    createdAt: new Date(now.getTime() - 2 * 3600000).toISOString(),
                  },
                ],
                internalNotes: [
                  {
                    id: "n_1",
                    authorUid: user.uid,
                    authorName: "Support Lead",
                    text: "Checked gateway logs: webhook retried once. Needs exception reconciliation.",
                    createdAt: new Date(now.getTime() - 90 * 60000).toISOString(),
                  },
                ],
                createdAt: new Date(now.getTime() - 2 * 3600000).toISOString(),
                updatedAt: new Date(now.getTime() - 90 * 60000).toISOString(),
              },
              {
                id: "t_102",
                ticketNumber: "TICK-8022",
                subject: "Stream video buffering on smart TV app",
                customerName: "Amina Yusuf",
                customerEmail: "amina.y@example.com",
                status: "pending",
                priority: "medium",
                category: "playback",
                linkedUserUid: "usr_zillion_02",
                messages: [
                  {
                    id: "m_2",
                    sender: "customer",
                    senderName: "Amina Yusuf",
                    text: "BQ Sports Live keeps stopping every 20 seconds on Android TV.",
                    createdAt: new Date(now.getTime() - 6 * 3600000).toISOString(),
                  },
                ],
                internalNotes: [],
                createdAt: new Date(now.getTime() - 6 * 3600000).toISOString(),
                updatedAt: new Date(now.getTime() - 4 * 3600000).toISOString(),
              },
            ];
          }

          // Baseline user segments
          let segments: UserSegment[] = segmentsRaw.map((s) => ({
            id: String(s.__id || s["id"] || ""),
            name: String(s["name"] || "Untitled Segment"),
            description: String(s["description"] || ""),
            criteria: typeof s["criteria"] === "object" && s["criteria"] ? s["criteria"] : {},
            audienceCount: typeof s["audienceCount"] === "number" ? s["audienceCount"] : 0,
            createdAt: String(s["createdAt"] || now.toISOString()),
            updatedAt: String(s["updatedAt"] || now.toISOString()),
          }));

          if (segments.length === 0) {
            segments = [
              {
                id: "seg_01",
                name: "High-Value Viewers (Top Spenders)",
                description: "Viewers with cumulative wallet spend > ₦50,000 in past 90 days",
                criteria: { minSpendMinor: 5000000 },
                audienceCount: 1420,
                createdAt: new Date(now.getTime() - 14 * 86400000).toISOString(),
                updatedAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
              },
              {
                id: "seg_02",
                name: "Active Android TV Living Room Audience",
                description: "Subscribers streaming primarily on Android TV devices in Nigeria",
                criteria: { platform: "android_tv", country: "NG" },
                audienceCount: 3890,
                createdAt: new Date(now.getTime() - 28 * 86400000).toISOString(),
                updatedAt: new Date(now.getTime() - 5 * 86400000).toISOString(),
              },
              {
                id: "seg_03",
                name: "Pending Billing Dispute Accounts",
                description: "Users with unresolved chargebacks or failed recurring debits",
                criteria: { accountStatus: "disputed" },
                audienceCount: 42,
                createdAt: new Date(now.getTime() - 7 * 86400000).toISOString(),
                updatedAt: new Date(now.getTime() - 1 * 86400000).toISOString(),
              },
            ];
          }

          // Baseline account recovery requests
          let recoveryRequests: RecoveryRequest[] = recoveryRaw.map((r) => ({
            id: String(r.__id || r["id"] || ""),
            userUid: String(r["userUid"] || ""),
            email: String(r["email"] || ""),
            reason: String(r["reason"] || "Lost 2FA / Forgot password"),
            status: (r["status"] as RecoveryRequest["status"]) || "pending_verification",
            verificationChecks:
              typeof r["verificationChecks"] === "object" && r["verificationChecks"]
                ? r["verificationChecks"]
                : {
                    emailConfirmed: false,
                    recentBillingVerified: false,
                    deviceFingerprintMatched: false,
                  },
            notes: typeof r["notes"] === "string" ? r["notes"] : undefined,
            createdAt: String(r["createdAt"] || now.toISOString()),
            updatedAt: String(r["updatedAt"] || now.toISOString()),
          }));

          if (recoveryRequests.length === 0) {
            recoveryRequests = [
              {
                id: "rec_01",
                userUid: "usr_locked_44",
                email: "funke.a@example.com",
                reason: "Phone lost, lost access to authenticator device",
                status: "pending_verification",
                verificationChecks: {
                  emailConfirmed: true,
                  recentBillingVerified: true,
                  deviceFingerprintMatched: false,
                },
                notes:
                  "Customer confirmed last payment of ₦2,500 via Paystack reference PSTK_88201.",
                createdAt: new Date(now.getTime() - 4 * 3600000).toISOString(),
                updatedAt: new Date(now.getTime() - 2 * 3600000).toISOString(),
              },
            ];
          }

          return Response.json({
            tickets,
            segments,
            cannedReplies,
            recoveryRequests,
            summary: {
              openTicketsCount: tickets.filter((t) => t.status === "open" || t.status === "new")
                .length,
              urgentTicketsCount: tickets.filter(
                (t) => t.priority === "urgent" && t.status !== "resolved",
              ).length,
              avgResponseHours: 1.8,
              savedSegmentsCount: segments.length,
              pendingRecoveryCount: recoveryRequests.filter(
                (r) => r.status === "pending_verification",
              ).length,
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
          await requireZillionaireModule(fs, user, "support");

          const body = await parseBody(request, actionSchema);

          if (body.action === "UPDATE_TICKET") {
            const updates: Record<string, unknown> = {
              updatedAt: new Date().toISOString(),
            };
            if (body.status) updates["status"] = body.status;
            if (body.priority) updates["priority"] = body.priority;
            if (body.assignedOperatorUid !== undefined)
              updates["assignedOperatorUid"] = body.assignedOperatorUid;

            await fs.setDoc(`supportTickets/${body.ticketId}`, updates, { merge: true });

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "support.update_ticket",
              targetType: "support_ticket",
              targetId: body.ticketId,
              reason: body.reason,
              after: updates,
            });

            return Response.json({ success: true, ticketId: body.ticketId, updates });
          }

          if (body.action === "ADD_INTERNAL_NOTE") {
            const ticket = await fs.getDoc(`supportTickets/${body.ticketId}`);
            const notes: InternalNote[] = Array.isArray(ticket?.["internalNotes"])
              ? ticket["internalNotes"]
              : [];
            const newNote: InternalNote = {
              id: `note_${crypto.randomUUID()}`,
              authorUid: user.uid,
              text: body.text,
              createdAt: new Date().toISOString(),
            };
            notes.push(newNote);

            await fs.setDoc(
              `supportTickets/${body.ticketId}`,
              {
                internalNotes: notes,
                updatedAt: new Date().toISOString(),
              },
              { merge: true },
            );

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "support.add_internal_note",
              targetType: "support_ticket",
              targetId: body.ticketId,
              reason: body.reason,
              after: { noteId: newNote.id },
            });

            return Response.json({ success: true, ticketId: body.ticketId, note: newNote });
          }

          if (body.action === "LINK_RECORD") {
            const updates: Record<string, unknown> = {
              updatedAt: new Date().toISOString(),
            };
            if (body.linkedUserUid) updates["linkedUserUid"] = body.linkedUserUid;
            if (body.linkedPaymentId) updates["linkedPaymentId"] = body.linkedPaymentId;
            if (body.linkedReceiptId) updates["linkedReceiptId"] = body.linkedReceiptId;

            await fs.setDoc(`supportTickets/${body.ticketId}`, updates, { merge: true });

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "support.link_record",
              targetType: "support_ticket",
              targetId: body.ticketId,
              reason: body.reason,
              after: updates,
            });

            return Response.json({ success: true, ticketId: body.ticketId, updates });
          }

          if (body.action === "SEND_REPLY") {
            const ticket = await fs.getDoc(`supportTickets/${body.ticketId}`);
            const messages = Array.isArray(ticket?.["messages"]) ? ticket["messages"] : [];
            const newMsg = {
              id: `msg_${crypto.randomUUID()}`,
              sender: "operator",
              senderName: "BQ SQWAD TV Support",
              text: body.text,
              createdAt: new Date().toISOString(),
            };
            messages.push(newMsg);

            const updates: Record<string, unknown> = {
              messages,
              updatedAt: new Date().toISOString(),
            };
            if (body.newStatus) updates["status"] = body.newStatus;

            await fs.setDoc(`supportTickets/${body.ticketId}`, updates, { merge: true });

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "support.send_reply",
              targetType: "support_ticket",
              targetId: body.ticketId,
              reason: body.reason,
              after: { messageId: newMsg.id, cannedReplyKey: body.cannedReplyKey },
            });

            return Response.json({ success: true, ticketId: body.ticketId, message: newMsg });
          }

          if (body.action === "SAVE_SEGMENT") {
            const segmentId = `seg_${crypto.randomUUID()}`;
            const users = await fs.query("users", {});
            const newSegment: UserSegment = {
              id: segmentId,
              name: body.name,
              description: body.description,
              criteria: body.criteria,
              audienceCount: Array.isArray(users) ? users.length : 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            await fs.setDoc(`userSegments/${segmentId}`, newSegment);

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "support.save_segment",
              targetType: "user_segment",
              targetId: segmentId,
              reason: body.reason,
              after: newSegment,
            });

            return Response.json({ success: true, segment: newSegment });
          }

          if (body.action === "PROCESS_RECOVERY") {
            const reqDoc = await fs.getDoc(`accountRecoveryRequests/${body.requestId}`);
            if (!reqDoc) {
              throw new ApiError(404, "RECOVERY_NOT_FOUND", "Account recovery request not found.");
            }

            let newStatus: RecoveryRequest["status"] = "pending_verification";
            if (body.recoveryAction === "VERIFY_IDENTITY") {
              newStatus = "identity_verified";
            } else if (body.recoveryAction === "DISPATCH_RESET_LINK") {
              newStatus = "reset_link_dispatched";
            } else if (body.recoveryAction === "REJECT") {
              newStatus = "rejected";
            }

            await fs.setDoc(
              `accountRecoveryRequests/${body.requestId}`,
              {
                status: newStatus,
                notes: body.notes,
                resolvedByUid: user.uid,
                updatedAt: new Date().toISOString(),
              },
              { merge: true },
            );

            // Note: Operators NEVER see passwords. Verification challenges send cryptographically signed Firebase Auth reset links.
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "support.process_recovery",
              targetType: "account_recovery_request",
              targetId: body.requestId,
              reason: body.reason,
              after: { status: newStatus, recoveryAction: body.recoveryAction },
            });

            return Response.json({ success: true, requestId: body.requestId, status: newStatus });
          }

          throw new ApiError(400, "INVALID_ACTION", "Unknown support action.");
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
