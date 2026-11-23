import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

export interface EpgProgramme {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  description?: string;
  ageRating?: string;
}

export interface PlaybackHealth {
  bitrateMbps: number;
  bufferingPct: number;
  errorRatePct: number;
  status: "healthy" | "degraded" | "down";
  failoverActive: boolean;
  lastCheckedAt: string;
}

const programmeSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(200),
  startAt: z.string().trim().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  endAt: z.string().trim().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  description: z.string().trim().max(1000).optional(),
  ageRating: z.enum(["G", "PG", "13+", "16+", "18+"]).default("G"),
});

function isLiveChannel(channel: Record<string, unknown>): boolean {
  return channel["deliveryMode"] === "live_hls" || channel["channelType"] === "live" || channel["channelType"] === "live_tv";
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CREATE_LIVE_CHANNEL"),
    name: z.string().trim().min(2).max(100),
    handle: z.string().trim().min(2).max(50).regex(/^@?[A-Za-z0-9_-]+$/).optional(),
    description: z.string().trim().max(2000).optional(),
    logoUrl: z.string().trim().url().optional(),
    streamUrl: z.string().trim().url().refine((url) => url.startsWith("https://") && /\.m3u8(?:$|[?#])/i.test(url), "Use a secure HTTPS HLS playlist URL ending in .m3u8."),
    failoverStreamUrl: z.string().trim().url().refine((url) => url.startsWith("https://") && /\.m3u8(?:$|[?#])/i.test(url), "Use a secure HTTPS HLS playlist URL ending in .m3u8.").optional(),
    category: z.string().trim().min(2).max(60).default("Entertainment"),
    language: z.string().trim().min(2).max(20).default("en"),
    ageRating: z.enum(["G", "PG", "13+", "16+", "18+"]).default("PG"),
    paid: z.boolean().default(false),
    ratePerMinuteMinor: z.number().int().nonnegative().default(0),
    currency: z.string().regex(/^[A-Z]{3}$/).default("NGN"),
    expiryDate: z.string().optional(),
    programmes: z.array(programmeSchema).optional(),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("GO_LIVE"),channelId: z.string().trim().min(1).max(80),
    bitrateMbps: z.number().positive().optional(),
    confirmation: z.literal(true),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("END_LIVE"),
    channelId: z.string().trim().min(1).max(80),
    confirmation: z.literal(true),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("APPROVE_SUBMISSION"),
    channelId: z.string().trim().min(1).max(80),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("REJECT_SUBMISSION"),
    channelId: z.string().trim().min(1).max(80),
    rejectionReason: z.string().trim().min(3).max(500),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("UPDATE_PROGRAMME_GUIDE"),
    channelId: z.string().trim().min(1).max(80),
    programmes: z.array(programmeSchema),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("UPDATE_HEALTH"),
    channelId: z.string().trim().min(1).max(80),
    bitrateMbps: z.number().positive(),
    bufferingPct: z.number().min(0).max(100),
    errorRatePct: z.number().min(0).max(100),
    failoverActive: z.boolean(),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("SCHEDULE_LIVE"),
    channelId: z.string().trim().min(1).max(80),
    scheduledStartAt: z.string().trim().min(4).max(100),
    scheduledEndAt: z.string().trim().max(100).optional(),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("FORCE_STOP"),
    channelId: z.string().trim().min(1).max(80),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("SUSPEND"),
    channelId: z.string().trim().min(1).max(80),
    reason: z.string().trim().min(3).max(1000),
  }),
]);


export const Route = createFileRoute("/api/public/v1/zillionaire/live-channels/")({
  server: {
    handlers: {
      GET: async (event: any) => {
        try {
          const request = event.request;
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "live_approvals");

          const channels = (await fs.query("channels", { limit: 100 })) || [];
          const liveChannels = channels.filter((c) => isLiveChannel(c));

          // Count active viewers per channel from sessions
          const sessions = await fs.query("sessions", { limit: 500 }).catch(() => []);
          const activeSessions = (sessions || []).filter((s) => s["active"] === true);
          const viewersCountByChannel: Record<string, number> = {};
          for (const s of activeSessions) {
            const chId = (s["channelId"] as string) || "";
            if (chId) {
              viewersCountByChannel[chId] = (viewersCountByChannel[chId] || 0) + 1;
            }
          }

          const combinedList = liveChannels;

          const now = Date.now();
          const items = combinedList.map((ch) => {
            const id = (ch.__id || ch["id"]) as string;
            const expiryStr = (ch["expiryDate"] as string) || null;
            let expiryWarning: "none" | "soon_30d" | "urgent_7d" | "expired" = "none";
            if (expiryStr) {
              const expiryMs = new Date(expiryStr).getTime();
              const diffDays = (expiryMs - now) / 86400000;
              if (diffDays <= 0) {
                expiryWarning = "expired";
              } else if (diffDays <= 7) {
                expiryWarning = "urgent_7d";
              } else if (diffDays <= 30) {
                expiryWarning = "soon_30d";
              }
            }

            return {
              id,
              title: ch["title"] || "Untitled Live Channel",
              handle: ch["handle"] || `@${id}`,
              description: ch["description"] || "",
              logoUrl: ch["logoUrl"] || null,
              streamUrl: ch["streamUrl"] || "",
              failoverStreamUrl: ch["failoverStreamUrl"] || "",
              category: ch["category"] || "General",
              language: ch["language"] || "en",
              ageRating: ch["ageRating"] || ch["contentRating"] || "G",
              paid: Boolean(ch["paid"]),
              ratePerMinuteMinor: typeof ch["ratePerMinuteMinor"] === "number" ? ch["ratePerMinuteMinor"] : 0,
              currency: ch["currency"] || "NGN",
              isLive: Boolean(ch["isLive"]),
              streamStatus: ch["streamStatus"] || (ch["isLive"] ? "LIVE" : "OFFLINE"),
              submissionStatus: ch["submissionStatus"] || (ch["ownerUid"] === "platform" ? "APPROVED" : "PENDING_APPROVAL"),
              approvalStatus: (ch["approvalStatus"] as string) || (ch["isLive"] ? "live" : ch["submissionStatus"] === "APPROVED" ? "approved" : "submitted"),
              rightsEvidence: ch["rightsEvidence"] || null,
              scheduledStartAt: ch["scheduledStartAt"] || null,
              submittedBy: ch["submittedBy"] || ch["ownerUid"] || "platform",
              type: ch["type"] || (ch["ownerUid"] === "platform" ? "platform" : "provider"),
              viewerCount: viewersCountByChannel[id] || 0,
              playbackHealth: ch["playbackHealth"] || null,
              expiryDate: expiryStr,
              expiryWarning,
              epgProgrammes: (ch["epgProgrammes"] as EpgProgramme[]) || [],
              createdAt: ch["createdAt"] || null,
            };
          });

          return Response.json({
            success: true,
            channels: items,
            stats: {
              totalLive: items.filter((i) => i.isLive).length,
              totalChannels: items.length,
              pendingApproval: items.filter((i) => i.submissionStatus === "PENDING_APPROVAL").length,
              expiringSoon: items.filter((i) => i.expiryWarning === "soon_30d" || i.expiryWarning === "urgent_7d").length,
            },
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async (event: any) => {
        try {
          const request = event.request;
          const user = await requireUser(request);
          const body = await parseBody(request, actionSchema);
          if (body.action === "CREATE_LIVE_CHANNEL" && body.paid && body.ratePerMinuteMinor < 1) {
            throw new ApiError(400, "PRICE_REQUIRED", "Paid channels need a positive per-minute price.");
          }
          if (body.action === "CREATE_LIVE_CHANNEL" && body.expiryDate && Number.isNaN(Date.parse(body.expiryDate))) {
            throw new ApiError(400, "EXPIRY_DATE_INVALID", "Enter a valid rights expiry date.");
          }
          const programmes = body.action === "CREATE_LIVE_CHANNEL" ? body.programmes : body.action === "UPDATE_PROGRAMME_GUIDE" ? body.programmes : undefined;
          if (programmes) {
            const seen = new Set<string>();
            for (const programme of programmes) {
              if (seen.has(programme.id)) throw new ApiError(400, "DUPLICATE_PROGRAMME_ID", "Programme IDs must be unique.");
              seen.add(programme.id);
              if (programme.startAt >= programme.endAt) throw new ApiError(400, "PROGRAMME_TIME_INVALID", "Each programme must end after it starts.");
            }
          }
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "live_approvals");

          const now = new Date().toISOString();

          if (body.action === "CREATE_LIVE_CHANNEL") {
            const channelId = `ch_live_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const channelDoc = {
              id: channelId,
              title: body.name,
              handle: body.handle || `@${channelId}`,
              description: body.description || "",
              logoUrl: body.logoUrl || null,
              streamUrl: body.streamUrl,
              failoverStreamUrl: body.failoverStreamUrl || null,
              category: body.category,
              language: body.language,
              contentRating: body.ageRating,
              ageRating: body.ageRating,
              paid: body.paid,
              ratePerMinuteMinor: body.ratePerMinuteMinor,
              currency: body.currency,
              expiryDate: body.expiryDate || null,
              epgProgrammes: body.programmes || [],
              deliveryMode: "live_hls",
              channelType: "live_tv",
              type: "platform",
              // Platform channels belong to BQ SQWAD TV, not the owner personal producer identity.
              // Keep the acting owner separately for audit and attribution.
              ownerUid: "platform",
              createdBy: user.uid,
              status: "ACTIVE",
              published: true,
              isLive: false,
              streamStatus: "OFFLINE",
              submissionStatus: "APPROVED",
              playbackHealth: null,
              createdAt: now,
              updatedAt: now,
            };

            await fs.setDoc(`channels/${channelId}`, channelDoc);
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "live_channel.created",
              targetType: "channel",
              targetId: channelId,
              reason: body.reason,
              metadata: { title: body.name, streamUrl: body.streamUrl },
            });

            return Response.json({ success: true, channelId, channel: channelDoc }, { status: 201 });
          }

          if (body.action === "GO_LIVE") {
            const existing = await fs.getDoc(`channels/${body.channelId}`);
            if (!existing) throw new ApiError(404, "CHANNEL_NOT_FOUND", "Live channel not found.");
            if (!isLiveChannel(existing))
              throw new ApiError(409, "NOT_A_LIVE_CHANNEL", "This action is only available for live channels.");
            const appStatus = (existing["approvalStatus"] as string) || "";
            if (appStatus === "suspended" || existing["streamStatus"] === "SUSPENDED") {
              throw new ApiError(403, "CHANNEL_SUSPENDED", "This channel has been suspended and cannot go live.");
            }
            if (
              existing["submissionStatus"] === "PENDING_APPROVAL" ||
              existing["submissionStatus"] === "REJECTED" ||
              appStatus === "submitted" ||
              appStatus === "rejected" ||
              appStatus === "draft"
            ) {
              throw new ApiError(409, "CHANNEL_NOT_APPROVED", "This channel must be approved before going live.");
            }
            if (typeof existing["streamUrl"] !== "string" || !existing["streamUrl"])
              throw new ApiError(409, "STREAM_NOT_CONFIGURED", "A primary stream must be configured before going live.");
            const updated = {
              ...existing,
              id: body.channelId,
              isLive: true,
              streamStatus: "LIVE",
              approvalStatus: "live",
              liveStartedAt: now,
              playbackHealth: existing["playbackHealth"] || null,
              updatedAt: now,
            };
            await fs.setDoc(`channels/${body.channelId}`, updated);
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "live_channel.go_live",
              targetType: "channel",
              targetId: body.channelId,
              reason: body.reason,
              metadata: { liveStartedAt: now },
            });
            return Response.json({ success: true, channelId: body.channelId, isLive: true, streamStatus: "LIVE" });
          }

          if (body.action === "END_LIVE") {
            const existing = await fs.getDoc(`channels/${body.channelId}`);
            if (!existing) throw new ApiError(404, "CHANNEL_NOT_FOUND", "Live channel not found.");
            if (!isLiveChannel(existing))
              throw new ApiError(409, "NOT_A_LIVE_CHANNEL", "This action is only available for live channels.");
            const updated = {
              ...existing,
              id: body.channelId,
              isLive: false,
              streamStatus: "OFFLINE",
              liveEndedAt: now,
              updatedAt: now,
            };
            await fs.setDoc(`channels/${body.channelId}`, updated);
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "live_channel.end_live",
              targetType: "channel",
              targetId: body.channelId,
              reason: body.reason,
              metadata: { liveEndedAt: now },
            });
            return Response.json({ success: true, channelId: body.channelId, isLive: false, streamStatus: "OFFLINE" });
          }

          if (body.action === "APPROVE_SUBMISSION") {
            const existing = await fs.getDoc(`channels/${body.channelId}`);
            if (!existing) throw new ApiError(404, "CHANNEL_NOT_FOUND", "Live channel not found.");
            if (existing["submissionStatus"] !== "PENDING_APPROVAL")
              throw new ApiError(409, "SUBMISSION_NOT_PENDING", "Only pending submissions can be approved.");
            const updated = {
              ...existing,
              id: body.channelId,
              submissionStatus: "APPROVED",
              approvalStatus: "approved",
              approvedBy: user.uid,
              approvedAt: now,
              status: "ACTIVE",
              published: true,
              updatedAt: now,
            };
            await fs.setDoc(`channels/${body.channelId}`, updated);
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "live_channel.submission_approved",
              targetType: "channel",
              targetId: body.channelId,
              reason: body.reason,
              metadata: { approvedBy: user.uid },
            });
            return Response.json({ success: true, channelId: body.channelId, submissionStatus: "APPROVED" });
          }

          if (body.action === "REJECT_SUBMISSION") {
            const existing = await fs.getDoc(`channels/${body.channelId}`);
            if (!existing) throw new ApiError(404, "CHANNEL_NOT_FOUND", "Live channel not found.");
            if (existing["submissionStatus"] !== "PENDING_APPROVAL")
              throw new ApiError(409, "SUBMISSION_NOT_PENDING", "Only pending submissions can be rejected.");
            const updated = {
              ...existing,
              id: body.channelId,
              submissionStatus: "REJECTED",
              approvalStatus: "rejected",
              rejectedReason: body.rejectionReason,
              status: "REJECTED",
              isLive: false,
              streamStatus: "OFFLINE",
              updatedAt: now,
            };
            await fs.setDoc(`channels/${body.channelId}`, updated);
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "live_channel.submission_rejected",
              targetType: "channel",
              targetId: body.channelId,
              reason: body.reason,
              metadata: { rejectionReason: body.rejectionReason },
            });
            return Response.json({ success: true, channelId: body.channelId, submissionStatus: "REJECTED" });
          }

          if (body.action === "UPDATE_PROGRAMME_GUIDE") {
            const existing = await fs.getDoc(`channels/${body.channelId}`);
            if (!existing) throw new ApiError(404, "CHANNEL_NOT_FOUND", "Live channel not found.");
            if (!isLiveChannel(existing))
              throw new ApiError(409, "NOT_A_LIVE_CHANNEL", "This action is only available for live channels.");
            const updated = {
              ...existing,
              id: body.channelId,
              epgProgrammes: body.programmes,
              updatedAt: now,
            };
            await fs.setDoc(`channels/${body.channelId}`, updated);
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "live_channel.epg_updated",
              targetType: "channel",
              targetId: body.channelId,
              reason: body.reason,
              metadata: { programmesCount: body.programmes.length },
            });
            return Response.json({ success: true, channelId: body.channelId, count: body.programmes.length });
          }

          if (body.action === "UPDATE_HEALTH") {
            const existing = await fs.getDoc(`channels/${body.channelId}`);
            if (!existing) throw new ApiError(404, "CHANNEL_NOT_FOUND", "Live channel not found.");
            if (!isLiveChannel(existing))
              throw new ApiError(409, "NOT_A_LIVE_CHANNEL", "This action is only available for live channels.");
            const status = body.errorRatePct > 5 ? "down" : body.bufferingPct > 2 ? "degraded" : "healthy";
            const playbackHealth = {
              bitrateMbps: body.bitrateMbps,
              bufferingPct: body.bufferingPct,
              errorRatePct: body.errorRatePct,
              status,
              failoverActive: body.failoverActive,
              lastCheckedAt: now,
            };
            const updated = {
              ...existing,
              id: body.channelId,
              playbackHealth,
              updatedAt: now,
            };
            await fs.setDoc(`channels/${body.channelId}`, updated);
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "live_channel.health_updated",
              targetType: "channel",
              targetId: body.channelId,
              reason: body.reason,
              metadata: { status, bitrateMbps: body.bitrateMbps, bufferingPct: body.bufferingPct, errorRatePct: body.errorRatePct },
            });
            return Response.json({ success: true, channelId: body.channelId, playbackHealth });
          }

                    if (body.action === "SCHEDULE_LIVE") {
            const existing = await fs.getDoc(`channels/${body.channelId}`);
            if (!existing) throw new ApiError(404, "CHANNEL_NOT_FOUND", "Live channel not found.");
            if (!isLiveChannel(existing))
              throw new ApiError(409, "NOT_A_LIVE_CHANNEL", "This action is only available for live channels.");
            if (existing["submissionStatus"] !== "APPROVED" && existing["approvalStatus"] !== "approved") {
              throw new ApiError(409, "CHANNEL_NOT_APPROVED", "Only approved channels can be scheduled.");
            }
            const updated = {
              ...existing,
              id: body.channelId,
              streamStatus: "SCHEDULED",
              approvalStatus: "scheduled",
              scheduledStartAt: body.scheduledStartAt,
              scheduledEndAt: body.scheduledEndAt || null,
              updatedAt: now,
            };
            await fs.setDoc(`channels/${body.channelId}`, updated);
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "live_channel.scheduled",
              targetType: "channel",
              targetId: body.channelId,
              reason: body.reason,
              metadata: { scheduledStartAt: body.scheduledStartAt },
            });
            return Response.json({ success: true, channelId: body.channelId, approvalStatus: "scheduled" });
          }

          if (body.action === "FORCE_STOP" || body.action === "SUSPEND") {
            const existing = await fs.getDoc(`channels/${body.channelId}`);
            if (!existing) throw new ApiError(404, "CHANNEL_NOT_FOUND", "Live channel not found.");
            if (!isLiveChannel(existing))
              throw new ApiError(409, "NOT_A_LIVE_CHANNEL", "This action is only available for live channels.");
            const updated = {
              ...existing,
              id: body.channelId,
              isLive: false,
              streamStatus: "SUSPENDED",
              approvalStatus: "suspended",
              suspendedReason: body.reason,
              forceStoppedAt: now,
              forceStoppedBy: user.uid,
              updatedAt: now,
            };
            await fs.setDoc(`channels/${body.channelId}`, updated);
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "live_channel.force_stopped",
              targetType: "channel",
              targetId: body.channelId,
              reason: body.reason,
              metadata: { forceStoppedBy: user.uid, forceStoppedAt: now },
            });

            // Notify submitter immediately
            const submitter = String(existing["ownerUid"] || existing["submittedBy"] || "");
            if (submitter && submitter !== "platform" && submitter !== user.uid) {
              const notificationId = crypto.randomUUID().replace(/-/g, "");
              await fs.setDoc(`users/${submitter}/notifications/${notificationId}`, {
                notificationId,
                title: `Broadcast Suspended: ${existing["title"] || body.channelId}`,
                body: `Your live stream was force-stopped by platform operations: ${body.reason}`,
                deepLink: "/provider/channels",
                read: false,
                deliveryStatus: "queued",
                createdAt: now,
              }).catch(() => null);
            }

            return Response.json({ success: true, channelId: body.channelId, isLive: false, streamStatus: "SUSPENDED", approvalStatus: "suspended" });
          }

          throw new ApiError(400, "INVALID_ACTION", "Unknown action provided.");
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
