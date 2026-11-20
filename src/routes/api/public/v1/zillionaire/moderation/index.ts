import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";
import { Firestore } from "@/lib/server/firebase-admin";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

export const Route = createFileRoute("/api/public/v1/zillionaire/moderation/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "moderation");

          const [commentsDocs, reportsDocs, configDoc, abuseDocs, assetsDocs] = await Promise.all([
            fs.query("contentComments", { limit: 150 }),
            fs.query("userReports", { limit: 100 }),
            fs.getDoc("moderationConfig/keywords"),
            fs.query("ratingAbuseAlerts", { limit: 50 }),
            fs.query("contentAssets", { limit: 100 }),
          ]);

          const keywords = Array.isArray(configDoc?.["keywords"])
            ? (configDoc["keywords"] as string[])
            : [];

          return Response.json({
            comments: commentsDocs.map((c) => ({
              id: c.__id || c["id"] || c["commentId"],
              assetId: c["assetId"] || "",
              authorUid: c["authorUid"] || "",
              viewerNumber: c["viewerNumber"] || "Viewer",
              body: c["body"] || c["text"] || "",
              status: c["status"] || "PENDING",
              flaggedKeywords: Array.isArray(c["flaggedKeywords"]) ? c["flaggedKeywords"] : [],
              createdAt: c["createdAt"] || null,
              moderatedAt: c["moderatedAt"] || null,
              moderationReason: c["moderationReason"] || null,
            })),
            reports: reportsDocs.map((r) => ({
              id: r.__id || r["id"] || r["reportId"],
              reporterUid: r["reporterUid"] || "",
              reporterName: r["reporterName"] || "",
              reporterEmail: r["reporterEmail"] || "",
              rightsHolderName: r["rightsHolderName"] || "",
              rightsHolderEmail: r["rightsHolderEmail"] || "",
              rightsBasis: r["rightsBasis"] || "",
              targetType: r["targetType"] || "comment",
              targetId: r["targetId"] || "",
              reason: r["reason"] || "",
              details: r["details"] || "",
              status: r["status"] || "OPEN",
              resolution: r["resolution"] || null,
              createdAt: r["createdAt"] || null,
            })),
            keywordFilters: keywords,
            ratingAbuseEvents: abuseDocs.map((a) => ({
              id: a.__id || a["id"] || a["alertId"],
              uid: a["uid"] || "",
              assetId: a["assetId"] || "",
              stars: Number(a["stars"] || 1),
              type: a["type"] || "HIGH_VELOCITY_RATING",
              status: a["status"] || "OPEN",
              createdAt: a["createdAt"] || null,
            })),
            assets: assetsDocs.map((ast) => ({
              id: ast.__id || ast["id"] || ast["assetId"],
              title: ast["title"] || "Untitled Video",
              channelId: ast["channelId"] || "",
              commentsOpen: ast["commentsOpen"] !== false,
            })),
          });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "moderation");

          const body = (await request.json().catch(() => ({}))) as {
            action?:
              | "approve_comment"
              | "hide_comment"
              | "delete_comment"
              | "ban_commenter"
              | "shadow_ban_commenter"
              | "unshadow_ban_commenter"
              | "resolve_report"
              | "dismiss_report"
              | "update_keywords"
              | "toggle_asset_comments"
              | "dismiss_rating_abuse";
            commentId?: string;
            authorUid?: string;
            reportId?: string;
            alertId?: string;
            assetId?: string;
            commentsOpen?: boolean;
            keywords?: string[];
            reason?: string;
          };

          const action = body.action;
          const reason = body.reason?.trim() || "Console moderator action";
          const now = new Date().toISOString();

          if (action === "approve_comment" && body.commentId) {
            await fs.patchDoc(`contentComments/${body.commentId}`, {
              status: "APPROVED",
              moderatedAt: now,
              moderatedBy: user.uid,
              moderationReason: reason,
            });
            await writeAuditLog(fs, {
              action: "moderation_comment_approved",
              actorUid: user.uid,
              targetType: "contentComment",
              targetId: body.commentId,
              reason,
            });
            return Response.json({ ok: true, status: "APPROVED" });
          }

          if (action === "hide_comment" && body.commentId) {
            await fs.patchDoc(`contentComments/${body.commentId}`, {
              status: "HIDDEN",
              moderatedAt: now,
              moderatedBy: user.uid,
              moderationReason: reason,
            });
            await writeAuditLog(fs, {
              action: "moderation_comment_hidden",
              actorUid: user.uid,
              targetType: "contentComment",
              targetId: body.commentId,
              reason,
            });
            return Response.json({ ok: true, status: "HIDDEN" });
          }

          if (action === "delete_comment" && body.commentId) {
            await fs.patchDoc(`contentComments/${body.commentId}`, {
              status: "DELETED",
              deletedAt: now,
              deletedBy: user.uid,
              moderationReason: reason,
            });
            await writeAuditLog(fs, {
              action: "moderation_comment_deleted",
              actorUid: user.uid,
              targetType: "contentComment",
              targetId: body.commentId,
              reason,
            });
            return Response.json({ ok: true, status: "DELETED" });
          }

          if (action === "ban_commenter" && body.authorUid) {
            await fs.patchDoc(`users/${body.authorUid}`, {
              banned: true,
              bannedAt: now,
              bannedBy: user.uid,
              banReason: reason,
            });
            await writeAuditLog(fs, {
              action: "moderation_commenter_banned",
              actorUid: user.uid,
              targetType: "user",
              targetId: body.authorUid,
              reason,
            });
            return Response.json({ ok: true, banned: true });
          }

          if (action === "shadow_ban_commenter" && body.authorUid) {
            await fs.patchDoc(`users/${body.authorUid}`, {
              shadowBanned: true,
              shadowBannedAt: now,
              shadowBannedBy: user.uid,
              shadowBanReason: reason,
            });
            await writeAuditLog(fs, {
              action: "moderation_commenter_shadow_banned",
              actorUid: user.uid,
              targetType: "user",
              targetId: body.authorUid,
              reason,
            });
            return Response.json({ ok: true, shadowBanned: true });
          }

          if (action === "unshadow_ban_commenter" && body.authorUid) {
            await fs.patchDoc(`users/${body.authorUid}`, {
              shadowBanned: false,
              unshadowBannedAt: now,
              unshadowBannedBy: user.uid,
              unshadowBanReason: reason,
            });
            await writeAuditLog(fs, {
              action: "moderation_commenter_unshadow_banned",
              actorUid: user.uid,
              targetType: "user",
              targetId: body.authorUid,
              reason,
            });
            return Response.json({ ok: true, shadowBanned: false });
          }

          if (action === "resolve_report" && body.reportId) {
            await fs.patchDoc(`userReports/${body.reportId}`, {
              status: "RESOLVED",
              resolvedAt: now,
              resolvedBy: user.uid,
              resolution: reason,
            });
            await writeAuditLog(fs, {
              action: "moderation_report_resolved",
              actorUid: user.uid,
              targetType: "userReport",
              targetId: body.reportId,
              reason,
            });
            return Response.json({ ok: true, status: "RESOLVED" });
          }

          if (action === "dismiss_report" && body.reportId) {
            await fs.patchDoc(`userReports/${body.reportId}`, {
              status: "DISMISSED",
              dismissedAt: now,
              dismissedBy: user.uid,
              dismissalReason: reason,
            });
            await writeAuditLog(fs, {
              action: "moderation_report_dismissed",
              actorUid: user.uid,
              targetType: "userReport",
              targetId: body.reportId,
              reason,
            });
            return Response.json({ ok: true, status: "DISMISSED" });
          }

          if (action === "update_keywords" && Array.isArray(body.keywords)) {
            const cleanKeywords = body.keywords
              .map((k) => String(k).trim().toLowerCase())
              .filter(Boolean);
            await fs.setDoc(`moderationConfig/keywords`, {
              keywords: cleanKeywords,
              updatedAt: now,
              updatedBy: user.uid,
            });
            await writeAuditLog(fs, {
              action: "moderation_keywords_updated",
              actorUid: user.uid,
              targetType: "moderationConfig",
              targetId: "keywords",
              reason,
              metadata: { count: cleanKeywords.length },
            });
            return Response.json({ ok: true, keywords: cleanKeywords });
          }

          if (action === "toggle_asset_comments" && body.assetId) {
            const commentsOpen = Boolean(body.commentsOpen);
            await fs.patchDoc(`contentAssets/${body.assetId}`, {
              commentsOpen,
              commentsOpenUpdatedAt: now,
              commentsOpenUpdatedBy: user.uid,
            });
            await writeAuditLog(fs, {
              action: "moderation_asset_comments_toggled",
              actorUid: user.uid,
              targetType: "contentAsset",
              targetId: body.assetId,
              reason,
              metadata: { commentsOpen },
            });
            return Response.json({ ok: true, assetId: body.assetId, commentsOpen });
          }

          if (action === "dismiss_rating_abuse" && body.alertId) {
            await fs.patchDoc(`ratingAbuseAlerts/${body.alertId}`, {
              status: "DISMISSED",
              dismissedAt: now,
              dismissedBy: user.uid,
            });
            return Response.json({ ok: true, status: "DISMISSED" });
          }

          return Response.json({ error: "Invalid moderation action" }, { status: 400 });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
