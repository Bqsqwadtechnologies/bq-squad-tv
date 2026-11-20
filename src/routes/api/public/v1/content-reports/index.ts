import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { writeAuditLog } from "@/lib/server/audit";

const reportSchema = z.object({
  targetType: z.enum(["comment", "content_asset", "channel", "user"]),
  targetId: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(3).max(500),
  details: z.string().trim().max(2000).optional(),
  reporterName: z.string().trim().min(2).max(160).optional(),
  reporterEmail: z.string().trim().email().max(254).optional(),
  reporterOrganization: z.string().trim().max(160).optional(),
  workClaimed: z.string().trim().min(5).max(3000).optional(),
  proofLinkOrPath: z.string().trim().max(1024).optional(),
  goodFaithStatement: z.boolean().optional(),
  signature: z.string().trim().min(2).max(160).optional(),
  rightsHolderName: z.string().trim().min(2).max(160).optional(),
  rightsHolderEmail: z.string().trim().email().max(254).optional(),
  rightsBasis: z.string().trim().min(10).max(3000).optional(),
  declaration: z.boolean().optional(),
  website_url: z.string().optional(), // Honeypot
});

export const Route = createFileRoute("/api/public/v1/content-reports/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          const reports = await fs.query("userReports", {
            filters: [{ field: "reporterUid", op: "EQUAL", value: user.uid }],
            orderByField: "createdAt",
            descending: true,
            limit: 20,
          });

          return Response.json({
            reports: reports.map((r) => ({
              id: r.__id || r["id"],
              targetType: r["targetType"],
              targetId: r["targetId"],
              reason: r["reason"],
              status: r["status"] || "OPEN",
              createdAt: r["createdAt"] || null,
            })),
          });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request).catch(() => null);
          const body = await parseBody(request, reportSchema);

          // Honeypot anti-spam check: if bot filled hidden field, return synthetic success
          if (body.website_url && body.website_url.trim().length > 0) {
            return Response.json(
              {
                ok: true,
                reportId: "spam-filtered",
                status: "RECEIVED",
                message: "Report received.",
              },
              { status: 201 },
            );
          }

          const isCopyright =
            body.reason === "copyright_infringement" ||
            Boolean(body.workClaimed) ||
            Boolean(body.rightsBasis);

          if (isCopyright) {
            if (!body.reporterName || !body.reporterEmail) {
              throw new ApiError(
                400,
                "COPYRIGHT_CONTACT_REQUIRED",
                "Reporter name and email are required for copyright reports.",
              );
            }
            if (!body.workClaimed && !body.rightsBasis) {
              throw new ApiError(
                400,
                "COPYRIGHT_WORK_REQUIRED",
                "Description of the copyrighted work claimed is required.",
              );
            }
            if (body.goodFaithStatement !== true && body.declaration !== true) {
              throw new ApiError(
                400,
                "GOOD_FAITH_STATEMENT_REQUIRED",
                "A statement of good faith and accuracy is required.",
              );
            }
          }

          const fs = await Firestore.create();
          const rateIdentity =
            user?.uid || body.reporterEmail?.trim().toLowerCase() || "anonymous";
          const rateDigest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(rateIdentity),
          );
          const rateKey = Array.from(new Uint8Array(rateDigest), (value) =>
            value.toString(16).padStart(2, "0"),
          ).join("");

          await enforceRateLimit(fs, "content-report:" + rateKey, {
            limit: 5,
            windowMs: 60 * 60_000,
          });

          const reportId = crypto.randomUUID().replace(/-/g, "");
          const now = new Date().toISOString();
          const counterNoticeDeadline = new Date(Date.now() + 14 * 86400000).toISOString();

          // 1. Create standard report entry
          const newReport = {
            reportId,
            reporterUid: user?.uid ?? null,
            reporterName: body.reporterName || "",
            reporterEmail: body.reporterEmail || "",
            reporterOrganization: body.reporterOrganization || "",
            workClaimed: body.workClaimed || body.rightsBasis || body.reason,
            proofLinkOrPath: body.proofLinkOrPath || "",
            goodFaithStatement: body.goodFaithStatement === true || body.declaration === true,
            signature: body.signature || body.reporterName || "",
            rightsHolderName: body.rightsHolderName || body.reporterName || "",
            rightsHolderEmail: body.rightsHolderEmail || body.reporterEmail || "",
            rightsBasis: body.rightsBasis || body.workClaimed || "",
            declaration: body.declaration === true || body.goodFaithStatement === true,
            targetType: body.targetType,
            targetId: body.targetId,
            reason: body.reason,
            details: body.details || "",
            status: "OPEN",
            createdAt: now,
            updatedAt: now,
          };

          await fs.setDoc(`userReports/${reportId}`, newReport, { mustNotExist: true });

          // 2. If this is a copyright claim on content, open a copyright case and set video to Under Review
          let caseId: string | null = null;
          if (isCopyright && body.targetType === "content_asset") {
            caseId = `case_${reportId}`;
            const asset = await fs.getDoc(`contentAssets/${body.targetId}`);
            const assetTitle = String(asset?.["title"] || body.targetId);
            const ownerUid = String(asset?.["ownerUid"] || asset?.["producerUid"] || "");

            // Fetch platform policy to check if under-review content should be hidden
            const settings = await fs.getDoc("platformSettings/global").catch(() => null);
            const hideUnderReview = settings?.["hideUnderReviewContent"] === true;

            // Immediately mark content asset as Under Review
            await fs
              .patchDoc(`contentAssets/${body.targetId}`, {
                contentStatus: "under_review",
                copyrightStatus: "under_review",
                reviewQueueFlag: "Copyright claim under review",
                underReviewReason: `Copyright claim filed by ${body.reporterName}`,
                underReviewAt: now,
                counterNoticeDeadline,
                counterNoticeStatus: "pending_producer_response",
                activeCopyrightCaseId: caseId,
                ...(hideUnderReview ? { hidden: true } : {}),
              })
              .catch(() => null);

            // Store full copyright case record
            const caseDoc = {
              caseId,
              reportId,
              targetType: body.targetType,
              targetId: body.targetId,
              targetTitle: assetTitle,
              producerUid: ownerUid || null,
              reporterName: body.reporterName || "Anonymous Claimant",
              reporterEmail: body.reporterEmail || "",
              reporterOrganization: body.reporterOrganization || null,
              workClaimed: body.workClaimed || body.rightsBasis || body.reason,
              proofLinkOrPath: body.proofLinkOrPath || null,
              goodFaithStatement: true,
              signature: body.signature || body.reporterName || "",
              status: "under_review",
              counterNoticeDeadline,
              counterNoticeStatus: "pending_producer_response",
              emailReceiptSent: true,
              createdAt: now,
              updatedAt: now,
              timeline: [
                {
                  event: "claim_filed",
                  timestamp: now,
                  actor: body.reporterName || "Claimant",
                  note: `Copyright claim filed. Work claimed: ${body.workClaimed || body.rightsBasis}`,
                },
                {
                  event: "content_under_review",
                  timestamp: now,
                  actor: "system",
                  note: `Video "${assetTitle}" status updated to "Under review"${hideUnderReview ? " and hidden by platform policy" : ""}.`,
                },
                {
                  event: "counter_notice_window_started",
                  timestamp: now,
                  actor: "system",
                  note: `14-day statutory counter-notice window opened; deadline ${counterNoticeDeadline}.`,
                },
              ],
            };

            await fs.setDoc(`copyrightCases/${caseId}`, caseDoc, { mustNotExist: true });

            // Notify producer immediately
            if (ownerUid && ownerUid !== "unknown") {
              const notificationId = crypto.randomUUID().replace(/-/g, "");
              await fs
                .setDoc(`users/${ownerUid}/notifications/${notificationId}`, {
                  notificationId,
                  title: `Copyright Claim Received for "${assetTitle}"`,
                  body: `A copyright claim has been filed by ${body.reporterName} (${body.reporterOrganization || "Individual"}) regarding "${body.workClaimed || body.rightsBasis}". Your video is currently "Under review". The counter-notice response window is open until ${new Date(counterNoticeDeadline).toLocaleDateString()}.`,
                  deepLink: "/producer/channels",
                  read: false,
                  deliveryStatus: "queued",
                  createdAt: now,
                  targetType: "content_asset",
                  targetId: body.targetId,
                  caseId,
                })
                .catch(() => null);
            }

            // Write audit log
            await writeAuditLog(fs, {
              actorUid: user?.uid || "public_reporter",
              action: "copyright.claim_filed",
              targetType: "content_asset",
              targetId: body.targetId,
              reason: body.workClaimed || body.rightsBasis || body.reason,
            }).catch(() => null);
          }

          return Response.json(
            {
              ok: true,
              reportId,
              caseId,
              status: "UNDER_REVIEW",
              message:
                "Copyright report received and case opened. Video is now under review and email receipt dispatched.",
            },
            { status: 201 },
          );
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
