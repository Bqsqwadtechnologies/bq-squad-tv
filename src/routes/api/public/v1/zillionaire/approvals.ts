import { applyChangeRequestGoLive } from "@/lib/server/change-requests";
import { createInAppNotification } from "@/lib/server/notifications";
import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

export type ApprovalType =
  | "video"
  | "episode"
  | "channel"
  | "live_stream"
  | "artwork"
  | "ad_creative"
  | "producer"
  | "provider"
  | "payout"
  | "content_report"
  | "legal_issue"
  | "change_request";

export type ApprovalPriority = "urgent" | "high" | "medium" | "normal";

export type ApprovalItem = {
  id: string;
  itemType: ApprovalType;
  rawId: string;
  title: string;
  submitterUid: string;
  submitterName: string;
  submitterEmail?: string | undefined;
  submittedAt: string;
  slaDeadline: string;
  slaHours: number;
  isOverdue: boolean;
  status: "pending" | "approved" | "rejected" | "changes_requested";
  assignedTo: string | null;
  priority: ApprovalPriority;
  details: Record<string, unknown>;
};

async function requireApprovalsReviewer(
  fs: Firestore,
  user: {
    uid: string;
    email: string | null;
    emailVerified?: boolean;
    customClaims?: Record<string, unknown>;
  },
) {
  try {
    return await requireZillionaireModule(fs, user, "content");
  } catch {
    return await requireZillionaireModule(fs, user, "moderation");
  }
}

export const Route = createFileRoute("/api/public/v1/zillionaire/approvals")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireApprovalsReviewer(fs, user);

          const url = new URL(request.url);
          const typeFilter = url.searchParams.get("type");
          const statusFilter = url.searchParams.get("status") || "pending";
          const now = Date.now();

          const [
            contentAssets,
            channels,
            producers,
            providers,
            payouts,
            reports,
            customApprovals,
            adCampaigns,
            legalIssues,
            changeRequests,
          ] = await Promise.all([
            fs.query("contentAssets", { limit: 100 }).catch(() => []),
            fs.query("channels", { limit: 100 }).catch(() => []),
            fs.query("producers", { limit: 100 }).catch(() => []),
            fs.query("providerAllowlist", { limit: 100 }).catch(() => []),
            fs.query("payouts", { limit: 100 }).catch(() => []),
            fs.query("contentReports", { limit: 100 }).catch(() => []),
            fs.query("approvals", { limit: 100 }).catch(() => []),
            fs.query("adCampaigns", { limit: 100 }).catch(() => []),
            fs.query("legalAcceptanceIssues", { limit: 100 }).catch(() => []),
            fs.query("changeRequests", { limit: 100 }).catch(() => []),
          ]);

          const items: ApprovalItem[] = [];

          // 0. Content Assets: Videos, Series Episodes, Artwork
          for (const asset of contentAssets) {
            const isSeries =
              asset["contentType"] === "series" ||
              Boolean(asset["seriesId"]) ||
              typeof asset["episodeNumber"] === "number";
            const isArtwork =
              asset["contentType"] === "artwork" || asset["mediaKind"] === "image";
            const itemType: ApprovalType = isArtwork ? "artwork" : isSeries ? "episode" : "video";

            const rawStatus = String(
              asset["status"] || asset["contentStatus"] || "pending",
            ).toLowerCase();
            const rightsStatus = String(asset["rightsReviewStatus"] || "").toLowerCase();
            const ownerReviewReq = asset["ownerReviewRequired"] === true;
            const isDuplicate = asset["duplicateDetected"] === true;

            const isPending =
              rawStatus === "pending" ||
              rawStatus === "ready" ||
              rightsStatus === "pending" ||
              rightsStatus === "flagged" ||
              ownerReviewReq ||
              isDuplicate;
            const isChangesRequested =
              rawStatus === "changes_requested" || rightsStatus === "changes_requested";
            const isApproved =
              (rawStatus === "published" || rightsStatus === "verified") &&
              !isPending &&
              !isChangesRequested;
            const isRejected =
              (rawStatus === "rejected" || rightsStatus === "rejected") && !isPending;

            const currentStatus = isPending
              ? "pending"
              : isChangesRequested
                ? "changes_requested"
                : isApproved
                  ? "approved"
                  : "rejected";

            if (statusFilter && statusFilter !== "all" && currentStatus !== statusFilter) continue;

            const submittedAt =
              typeof asset["createdAt"] === "string"
                ? asset["createdAt"]
                : typeof asset["updatedAt"] === "string"
                  ? asset["updatedAt"]
                  : new Date(now - 14400000).toISOString();
            const slaHours = isDuplicate ? 12 : 24;
            const slaDeadline = new Date(
              new Date(submittedAt).getTime() + slaHours * 3600000,
            ).toISOString();
            const isOverdue = now > new Date(slaDeadline).getTime() && isPending;

            const license =
              (asset["license"] as Record<string, unknown> | undefined) || {};
            const declaration = {
              ownershipDeclared: asset["ownershipDeclared"] ?? true,
              licenseType:
                license["licenseType"] ||
                asset["licenseType"] ||
                "Commercial Streaming License",
              copyrightHolderName:
                license["copyrightHolderName"] ||
                asset["copyrightHolderName"] ||
                asset["ownerName"] ||
                "Producer",
              productionYear:
                license["productionYear"] ||
                asset["productionYear"] ||
                new Date().getFullYear(),
              territoryCodes: license["territoryCodes"] || ["GLOBAL"],
            };

            const proofOfRights = {
              evidencePath: license["evidencePath"] || asset["rightsEvidencePath"] || null,
              hasProof: Boolean(license["evidencePath"] || asset["rightsEvidencePath"]),
              verificationStatus: license["verificationStatus"] || rightsStatus || "pending",
            };

            const ageLimit = {
              ageRating: asset["ageRating"] || "PG",
              contentWarnings: Array.isArray(asset["contentWarnings"])
                ? asset["contentWarnings"]
                : [],
              language: asset["language"] || "English",
            };

            const duplicateResult = {
              duplicateDetected: isDuplicate,
              duplicateOfTitle: asset["duplicateOfTitle"] || null,
              duplicateOfAssetId: asset["duplicateOfAssetId"] || null,
              duplicateType: asset["duplicateType"] || null,
              reviewQueueFlag:
                asset["reviewQueueFlag"] ||
                (isDuplicate
                  ? `Possible duplicate of ${asset["duplicateOfTitle"] || "catalog"}`
                  : "Unique Fingerprint"),
              fileHash: asset["fileHash"] || asset["checksumSha256"] || null,
              perceptualFingerprint: asset["perceptualFingerprint"] || null,
            };

            const previewPlayer = {
              mediaKind: asset["mediaKind"] || (isArtwork ? "image" : "video"),
              previewUrl:
                asset["previewUrl"] ||
                asset["hlsUrl"] ||
                asset["playbackUrl"] ||
                asset["storageUrl"] ||
                null,
              posterUrl: asset["posterUrl"] || asset["thumbnailUrl"] || null,
              durationSeconds: Number(asset["durationSeconds"] || 0),
            };

            items.push({
              id: `${itemType}:${asset.__id}`,
              itemType,
              rawId: String(asset.__id),
              title: String(asset["title"] || (isArtwork ? "Artwork Asset" : "Untitled Media")),
              submitterUid: String(asset["ownerUid"] || asset["producerUid"] || "unknown"),
              submitterName: String(asset["ownerName"] || "Channel Producer"),
              ...(typeof asset["ownerEmail"] === "string" && asset["ownerEmail"] ? { submitterEmail: asset["ownerEmail"] } : {}),
              submittedAt,
              slaDeadline,
              slaHours,
              isOverdue,
              status: currentStatus,
              assignedTo: typeof asset["assignedTo"] === "string" ? asset["assignedTo"] : null,
              priority: isOverdue || isDuplicate ? "urgent" : "high",
              details: {
                declaration,
                proofOfRights,
                ageLimit,
                duplicateResult,
                previewPlayer,
                contentType: asset["contentType"] || "video",
                channelId: asset["channelId"] || null,
                channelTitle: asset["channelTitle"] || null,
                seriesId: asset["seriesId"] || null,
                seasonNumber: asset["seasonNumber"] ?? null,
                episodeNumber: asset["episodeNumber"] ?? null,
                requestChangesNotes: asset["requestChangesNotes"] || null,
                rejectionReasonCode: asset["rejectionReasonCode"] || null,
                rejectionMessage: asset["rejectionMessage"] || null,
              },
            });
          }

          // 1. Channel submissions and Live Streams
          for (const ch of channels) {
            const status = String(ch["status"] || "").toLowerCase();
            const verification = String(ch["verificationStatus"] || "").toLowerCase();
            const liveApproval = String(ch["liveApprovalStatus"] || "").toLowerCase();
            const isLive =
              ch["deliveryMode"] === "live" || Boolean(ch["streamUrl"]) || Boolean(ch["streamKey"]);

            // Live stream approval entry if channel has live streaming configured
            if (isLive) {
              const isLivePending = liveApproval === "pending" || liveApproval === "unverified";
              const isLiveChanges = liveApproval === "changes_requested";
              const isLiveApproved = liveApproval === "approved";
              const liveCurrentStatus = isLivePending
                ? "pending"
                : isLiveChanges
                  ? "changes_requested"
                  : isLiveApproved
                    ? "approved"
                    : "rejected";

              if (!statusFilter || statusFilter === "all" || liveCurrentStatus === statusFilter) {
                const submittedAt =
                  typeof ch["createdAt"] === "string"
                    ? ch["createdAt"]
                    : new Date(now - 7200000).toISOString();
                const slaHours = 12;
                const slaDeadline = new Date(
                  new Date(submittedAt).getTime() + slaHours * 3600000,
                ).toISOString();
                const isOverdue = now > new Date(slaDeadline).getTime() && isLivePending;

                items.push({
                  id: `live_stream:${ch.__id}`,
                  itemType: "live_stream",
                  rawId: String(ch.__id),
                  title: `Live Stream: ${ch["name"] || ch["title"] || ch.__id}`,
                  submitterUid: String(ch["ownerUid"] || ch["producerUid"] || "unknown"),
                  submitterName: String(ch["ownerName"] || ch["name"] || "Broadcaster"),
                  ...(typeof ch["ownerEmail"] === "string" && ch["ownerEmail"] ? { submitterEmail: ch["ownerEmail"] } : {}),
                  submittedAt,
                  slaDeadline,
                  slaHours,
                  isOverdue,
                  status: liveCurrentStatus,
                  assignedTo: typeof ch["assignedTo"] === "string" ? ch["assignedTo"] : null,
                  priority: "urgent",
                  details: {
                    streamUrl: ch["streamUrl"] || null,
                    streamKey: ch["streamKey"] ? "Configured" : "Pending",
                    declaration: {
                      ownershipDeclared: true,
                      licenseType: "Live Broadcasting Rights",
                      copyrightHolderName: ch["ownerName"] || ch["name"] || "Broadcaster",
                      productionYear: new Date().getFullYear(),
                    },
                    proofOfRights: {
                      evidencePath: null,
                      hasProof: true,
                      verificationStatus: isLiveApproved ? "verified" : "pending",
                    },
                    ageLimit: {
                      ageRating: ch["ageRating"] || "PG",
                      contentWarnings: [],
                      language: ch["language"] || "English",
                    },
                    duplicateResult: {
                      duplicateDetected: false,
                      reviewQueueFlag: "Live Feed Monitored",
                      fileHash: null,
                      perceptualFingerprint: null,
                    },
                    previewPlayer: {
                      mediaKind: "live_hls",
                      previewUrl: ch["streamUrl"] || null,
                      posterUrl: ch["posterUrl"] || ch["bannerUrl"] || null,
                      durationSeconds: 0,
                    },
                  },
                });
              }
            }

            // Standard Channel submission entry
            const isPending = status === "pending" || verification === "pending";
            const isChanges = status === "changes_requested";
            const isApproved = status === "active" || verification === "verified";
            const chStatus = isPending
              ? "pending"
              : isChanges
                ? "changes_requested"
                : isApproved
                  ? "approved"
                  : "rejected";

            if (statusFilter && statusFilter !== "all" && chStatus !== statusFilter) continue;

            const submittedAt =
              typeof ch["createdAt"] === "string"
                ? ch["createdAt"]
                : new Date(now - 86400000).toISOString();
            const slaHours = 48;
            const slaDeadline = new Date(
              new Date(submittedAt).getTime() + slaHours * 3600000,
            ).toISOString();
            const isOverdue = now > new Date(slaDeadline).getTime() && isPending;

            items.push({
              id: `channel:${ch.__id}`,
              itemType: "channel",
              rawId: String(ch.__id),
              title: `Channel Submission: ${ch["name"] || ch["title"] || ch.__id}`,
              submitterUid: String(ch["ownerUid"] || ch["producerUid"] || "unknown"),
              submitterName: String(ch["ownerName"] || ch["name"] || "Creator"),
              ...(typeof ch["ownerEmail"] === "string" && ch["ownerEmail"] ? { submitterEmail: ch["ownerEmail"] } : {}),
              submittedAt,
              slaDeadline,
              slaHours,
              isOverdue,
              status: chStatus,
              assignedTo: typeof ch["assignedTo"] === "string" ? ch["assignedTo"] : null,
              priority: isOverdue ? "urgent" : "high",
              details: {
                handle: ch["handle"],
                category: ch["category"] || "General Entertainment",
                streamUrl: ch["streamUrl"] || "HLS Source Configured",
                declaration: {
                  ownershipDeclared: true,
                  licenseType: "Platform Channel Agreement",
                  copyrightHolderName: ch["ownerName"] || ch["name"] || "Channel Operator",
                  productionYear: new Date().getFullYear(),
                },
                proofOfRights: {
                  evidencePath: null,
                  hasProof: true,
                  verificationStatus: isApproved ? "verified" : "pending",
                },
                ageLimit: {
                  ageRating: ch["ageRating"] || "PG",
                  contentWarnings: [],
                  language: ch["language"] || "English",
                },
                duplicateResult: {
                  duplicateDetected: false,
                  reviewQueueFlag: "Channel Profile Clean",
                },
                previewPlayer: {
                  mediaKind: "image",
                  previewUrl: null,
                  posterUrl: ch["bannerUrl"] || ch["avatarUrl"] || null,
                  durationSeconds: 0,
                },
              },
            });
          }

          // 2. Producer Verifications
          for (const prod of producers) {
            const verification = String(prod["verificationStatus"] || "").toLowerCase();
            const verified = Boolean(prod["verified"]);
            const isPending =
              verification === "pending" || (!verified && Boolean(prod["hasEvidence"]));
            const isChanges = verification === "changes_requested";
            const prodStatus = isPending
              ? "pending"
              : isChanges
                ? "changes_requested"
                : verified
                  ? "approved"
                  : "rejected";

            if (statusFilter && statusFilter !== "all" && prodStatus !== statusFilter) continue;

            const submittedAt =
              typeof prod["updatedAt"] === "string"
                ? prod["updatedAt"]
                : new Date(now - 43200000).toISOString();
            const slaHours = 24;
            const slaDeadline = new Date(
              new Date(submittedAt).getTime() + slaHours * 3600000,
            ).toISOString();
            const isOverdue = now > new Date(slaDeadline).getTime() && isPending;

            items.push({
              id: `producer:${prod.__id}`,
              itemType: "producer",
              rawId: String(prod.__id),
              title: `Producer Identity Verification: ${prod["displayName"] || prod["companyName"] || prod.__id}`,
              submitterUid: String(prod.__id),
              submitterName: String(prod["displayName"] || prod["companyName"] || "Producer"),
              ...(typeof prod["email"] === "string" && prod["email"] ? { submitterEmail: prod["email"] } : {}),
              submittedAt,
              slaDeadline,
              slaHours,
              isOverdue,
              status: prodStatus,
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
            const isChanges = status === "changes_requested";
            const provStatus = isPending
              ? "pending"
              : isChanges
                ? "changes_requested"
                : status === "approved"
                  ? "approved"
                  : "rejected";

            if (statusFilter && statusFilter !== "all" && provStatus !== statusFilter) continue;

            const submittedAt =
              typeof prov["createdAt"] === "string"
                ? prov["createdAt"]
                : new Date(now - 36000000).toISOString();
            const slaHours = 24;
            const slaDeadline = new Date(
              new Date(submittedAt).getTime() + slaHours * 3600000,
            ).toISOString();
            const isOverdue = now > new Date(slaDeadline).getTime() && isPending;

            items.push({
              id: `provider:${prov.__id}`,
              itemType: "provider",
              rawId: String(prov.__id),
              title: `Provider Stream Access: ${prov["email"] || prov.__id}`,
              submitterUid: String(prov.__id),
              submitterName: String(prov["organization"] || prov["email"] || "Provider Partner"),
              ...(typeof prov["email"] === "string" && prov["email"] ? { submitterEmail: prov["email"] } : {}),
              submittedAt,
              slaDeadline,
              slaHours,
              isOverdue,
              status: provStatus,
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
            const isPending =
              status === "pending" || status === "submitted" || status === "requested";
            const isChanges = status === "changes_requested";
            const payStatus = isPending
              ? "pending"
              : isChanges
                ? "changes_requested"
                : status === "approved" || status === "settled"
                  ? "approved"
                  : "rejected";

            if (statusFilter && statusFilter !== "all" && payStatus !== statusFilter) continue;

            const submittedAt =
              typeof pay["createdAt"] === "string"
                ? pay["createdAt"]
                : new Date(now - 18000000).toISOString();
            const slaHours = 24;
            const slaDeadline = new Date(
              new Date(submittedAt).getTime() + slaHours * 3600000,
            ).toISOString();
            const isOverdue = now > new Date(slaDeadline).getTime() && isPending;
            const amountMinor = Number(pay["amountMinor"] || 0);

            items.push({
              id: `payout:${pay.__id}`,
              itemType: "payout",
              rawId: String(pay.__id),
              title: `Payout Settlement: ${(amountMinor / 100).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}`,
              submitterUid: String(pay["creatorUid"] || pay["producerUid"] || "unknown"),
              submitterName: String(pay["beneficiaryName"] || "Creator Partner"),
              submittedAt,
              slaDeadline,
              slaHours,
              isOverdue,
              status: payStatus,
              assignedTo: typeof pay["assignedTo"] === "string" ? pay["assignedTo"] : null,
              priority: isOverdue || amountMinor > 50000000 ? "urgent" : "high",
              details: {
                amountMinor,
                bankName: pay["bankName"] || "Settlement Bank",
                accountNumber: pay["accountNumber"]
                  ? `***${String(pay["accountNumber"]).slice(-4)}`
                  : "Masked",
              },
            });
          }

          // 5. Content Takedown & Copyright Reports
          for (const rep of reports) {
            const status = String(rep["status"] || "").toLowerCase();
            const isPending = status === "open" || status === "pending";
            const isChanges = status === "changes_requested";
            const repStatus = isPending
              ? "pending"
              : isChanges
                ? "changes_requested"
                : status === "resolved"
                  ? "approved"
                  : "rejected";

            if (statusFilter && statusFilter !== "all" && repStatus !== statusFilter) continue;

            const submittedAt =
              typeof rep["createdAt"] === "string"
                ? rep["createdAt"]
                : new Date(now - 7200000).toISOString();
            const slaHours = 12;
            const slaDeadline = new Date(
              new Date(submittedAt).getTime() + slaHours * 3600000,
            ).toISOString();
            const isOverdue = now > new Date(slaDeadline).getTime() && isPending;

            items.push({
              id: `content_report:${rep.__id}`,
              itemType: "content_report",
              rawId: String(rep.__id),
              title: `Content Moderation: ${rep["reason"] || "Copyright / Guidelines Flag"}`,
              submitterUid: String(rep["reporterUid"] || "anonymous"),
              submitterName: String(rep["reporterName"] || "Viewer Flag"),
              submitterEmail:
                typeof rep["reporterEmail"] === "string" ? rep["reporterEmail"] : undefined,
              submittedAt,
              slaDeadline,
              slaHours,
              isOverdue,
              status: repStatus,
              assignedTo: typeof rep["assignedTo"] === "string" ? rep["assignedTo"] : null,
              priority: "urgent",
              details: {
                assetId: rep["assetId"],
                targetType: rep["targetType"] || "video",
                reason: rep["reason"] || "Community standard review",
              },
            });
          }

          // 6. Ad Creatives
          for (const ad of adCampaigns) {
            const status = String(
              ad["creativeReviewStatus"] || ad["status"] || "pending",
            ).toLowerCase();
            const isPending = status === "pending" || status === "review";
            const isChanges = status === "changes_requested";
            const adStatus = isPending
              ? "pending"
              : isChanges
                ? "changes_requested"
                : status === "approved" || status === "active"
                  ? "approved"
                  : "rejected";

            if (statusFilter && statusFilter !== "all" && adStatus !== statusFilter) continue;
            const submittedAt =
              typeof ad["createdAt"] === "string" ? ad["createdAt"] : new Date(now).toISOString();
            const slaHours = 24;
            const slaDeadline = new Date(
              new Date(submittedAt).getTime() + slaHours * 3600000,
            ).toISOString();
            items.push({
              id: `ad_creative:${ad.__id}`,
              itemType: "ad_creative",
              rawId: String(ad.__id),
              title: `Ad Creative Review: ${ad["name"] || ad["title"] || ad.__id}`,
              submitterUid: String(ad["advertiserUid"] || ad["ownerUid"] || "unknown"),
              submitterName: String(ad["advertiserName"] || ad["companyName"] || "Advertiser"),
              ...(typeof ad["email"] === "string" && ad["email"] ? { submitterEmail: ad["email"] } : {}),
              submittedAt,
              slaDeadline,
              slaHours,
              isOverdue: now > new Date(slaDeadline).getTime() && isPending,
              status: adStatus,
              assignedTo: typeof ad["assignedTo"] === "string" ? ad["assignedTo"] : null,
              priority: "medium",
              details: {
                campaignId: ad.__id,
                creativeStatus: ad["creativeReviewStatus"] || status,
                declaration: {
                  ownershipDeclared: true,
                  licenseType: "Commercial Advertising Agreement",
                  copyrightHolderName: ad["advertiserName"] || "Advertiser",
                  productionYear: new Date().getFullYear(),
                },
                proofOfRights: {
                  evidencePath: null,
                  hasProof: true,
                  verificationStatus: adStatus === "approved" ? "verified" : "pending",
                },
                ageLimit: {
                  ageRating: "All ages",
                  contentWarnings: [],
                },
                duplicateResult: {
                  duplicateDetected: false,
                  reviewQueueFlag: "Ad Creative Clear",
                },
                previewPlayer: {
                  mediaKind: ad["videoUrl"] ? "video" : "image",
                  previewUrl: ad["videoUrl"] || ad["creativeUrl"] || null,
                  posterUrl: ad["bannerUrl"] || ad["thumbnailUrl"] || null,
                  durationSeconds: Number(ad["durationSeconds"] || 15),
                },
              },
            });
          }

          // 7. Legal Acceptance Issues
          for (const issue of legalIssues) {
            const status = String(issue["status"] || "pending").toLowerCase();
            const isPending = status === "pending" || status === "open";
            const isChanges = status === "changes_requested";
            const issueStatus = isPending
              ? "pending"
              : isChanges
                ? "changes_requested"
                : status === "resolved" || status === "accepted"
                  ? "approved"
                  : "rejected";

            if (statusFilter && statusFilter !== "all" && issueStatus !== statusFilter) continue;
            const submittedAt =
              typeof issue["createdAt"] === "string"
                ? issue["createdAt"]
                : new Date(now).toISOString();
            const slaHours = 48;
            const slaDeadline = new Date(
              new Date(submittedAt).getTime() + slaHours * 3600000,
            ).toISOString();
            items.push({
              id: `legal_issue:${issue.__id}`,
              itemType: "legal_issue",
              rawId: String(issue.__id),
              title: `Legal Acceptance Issue: ${issue["documentName"] || issue["policyName"] || issue.__id}`,
              submitterUid: String(issue["userUid"] || "unknown"),
              submitterName: String(issue["userName"] || "Viewer"),
              ...(typeof issue["email"] === "string" && issue["email"] ? { submitterEmail: issue["email"] } : {}),
              submittedAt,
              slaDeadline,
              slaHours,
              isOverdue: now > new Date(slaDeadline).getTime() && isPending,
              status: issueStatus,
              assignedTo: typeof issue["assignedTo"] === "string" ? issue["assignedTo"] : null,
              priority: "high",
              details: {
                userUid: issue["userUid"],
                reason: issue["reason"] || "Acceptance mismatch",
              },
            });
          }

          // 8. Custom General Approvals
          for (const ca of customApprovals) {
            const status = String(ca["status"] || "pending").toLowerCase();
            const isPending = status === "pending";
            const isChanges = status === "changes_requested";
            const caStatus = isPending
              ? "pending"
              : isChanges
                ? "changes_requested"
                : status === "approved"
                  ? "approved"
                  : "rejected";

            if (statusFilter && statusFilter !== "all" && caStatus !== statusFilter) continue;

            const submittedAt =
              typeof ca["createdAt"] === "string" ? ca["createdAt"] : new Date(now).toISOString();
            const slaHours = 24;
            const slaDeadline = new Date(
              new Date(submittedAt).getTime() + slaHours * 3600000,
            ).toISOString();
            const isOverdue = now > new Date(slaDeadline).getTime() && isPending;

            items.push({
              id: `approvals:${ca.__id}`,
              itemType: (ca["itemType"] as ApprovalType) || "ad_creative",
              rawId: String(ca.__id),
              title: String(ca["title"] || "General Approval Review"),
              submitterUid: String(ca["submitterUid"] || "creator"),
              submitterName: String(ca["submitterName"] || "Partner"),
              ...(typeof ca["submitterEmail"] === "string" && ca["submitterEmail"] ? { submitterEmail: ca["submitterEmail"] } : {}),
              submittedAt,
              slaDeadline,
              slaHours,
              isOverdue,
              status: caStatus,
              assignedTo: typeof ca["assignedTo"] === "string" ? ca["assignedTo"] : null,
              priority: isOverdue ? "urgent" : "medium",
              details: (ca["details"] as Record<string, unknown>) || {},
            });
          }

          // 9. Change Requests (Batch N19 & Rule A5)
          for (const cr of ((changeRequests as Array<Record<string, unknown>>) || [])) {
            const status = String(cr["status"] || "submitted").toLowerCase();
            const isPending = status === "submitted";
            const isChanges = status === "changes_requested";
            const isApproved = status === "approved";
            const isLive = status === "live";
            const crStatus = isPending
              ? "pending"
              : isChanges
                ? "changes_requested"
                : isApproved || isLive
                  ? "approved"
                  : "rejected";

            if (statusFilter && statusFilter !== "all" && crStatus !== statusFilter) continue;

            const crId = String(cr["id"] || cr["__id"] || "");
            const submittedAt =
              typeof cr["createdAt"] === "string" ? cr["createdAt"] : new Date(now).toISOString();
            const slaHours = 24;
            const slaDeadline = new Date(
              new Date(submittedAt).getTime() + slaHours * 3600000,
            ).toISOString();
            const isOverdue = now > new Date(slaDeadline).getTime() && isPending;

            items.push({
              id: `change_request:${crId}`,
              itemType: "change_request",
              rawId: crId,
              title: `Change Request: ${String(cr["scope"] || "Configuration")}`,
              submitterUid: String(cr["submitterUid"] || "partner"),
              submitterName: String(cr["partnerId"] || cr["submitterRole"] || "Partner"),
              submittedAt,
              slaDeadline,
              slaHours,
              isOverdue,
              status: crStatus,
              assignedTo: typeof cr["assignedTo"] === "string" ? cr["assignedTo"] : null,
              priority: isOverdue ? "urgent" : "high",
              details: {
                scope: cr["scope"],
                targetType: cr["targetType"],
                targetId: cr["targetId"],
                partnerId: cr["partnerId"],
                channelId: cr["channelId"],
                before: cr["before"],
                after: cr["after"],
                autoTestResults: cr["autoTestResults"],
                status: cr["status"],
              },
            });
          }

          // Filter by type if requested
          const filtered = items.filter(
            (it) => !typeFilter || typeFilter === "all" || it.itemType === typeFilter,
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
              changes_requested: items.filter((i) => i.status === "changes_requested").length,
              approved: items.filter((i) => i.status === "approved").length,
              rejected: items.filter((i) => i.status === "rejected").length,
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
          await requireApprovalsReviewer(fs, user);

          const body = (await request.json()) as {
            action: "approve" | "reject" | "request_changes" | "assign" | "go_live";
            pricingRule?: "global" | "custom" | "exempt";
            pricePerMinuteMinor?: number;
            countryPricingOverrides?: Record<string, number>;
            itemIds: string[];
            notes: string;
            reasonCode?: string;
            assignedTo?: string;
          };

          if (
            !body.action ||
            !["approve", "reject", "request_changes", "assign", "go_live"].includes(body.action)
          ) {
            return Response.json(
              { error: "Invalid action. Must be approve, reject, request_changes, assign, or go_live." },
              { status: 400 },
            );
          }

          if (!Array.isArray(body.itemIds) || body.itemIds.length === 0) {
            return Response.json({ error: "itemIds must be a non-empty array." }, { status: 400 });
          }

          const notes = String(body.notes || "").trim();
          if (notes.length < 3) {
            return Response.json(
              { error: "A clear reason/note (minimum 3 characters) is required for every action." },
              { status: 400 },
            );
          }
          if (body.action === "assign" && !String(body.assignedTo || "").trim()) {
            return Response.json(
              { error: "assignedTo is required for assignment." },
              { status: 400 },
            );
          }

          const results: Array<{ id: string; success: boolean; error?: string }> = [];
          const now = new Date().toISOString();

          for (const compoundId of body.itemIds) {
            const [type, rawId] = compoundId.split(":");
            if (!type || !rawId) {
              results.push({ id: compoundId, success: false, error: "Invalid ID format" });
              continue;
            }

            try {
              if (body.action === "assign") {
                const assignee = body.assignedTo!.trim();
                if (type === "video" || type === "episode" || type === "artwork") {
                  await fs.patchDoc(`contentAssets/${rawId}`, { assignedTo: assignee });
                } else if (type === "channel" || type === "live_stream") {
                  await fs.patchDoc(`channels/${rawId}`, { assignedTo: assignee });
                } else if (type === "producer") {
                  await fs.patchDoc(`producers/${rawId}`, { assignedTo: assignee });
                } else if (type === "provider") {
                  await fs.patchDoc(`providerAllowlist/${rawId}`, { assignedTo: assignee });
                } else if (type === "payout") {
                  await fs.patchDoc(`payouts/${rawId}`, { assignedTo: assignee });
                } else if (type === "content_report") {
                  await fs.patchDoc(`contentReports/${rawId}`, { assignedTo: assignee });
                } else if (type === "ad_creative") {
                  await fs.patchDoc(`adCampaigns/${rawId}`, { assignedTo: assignee });
                } else if (type === "legal_issue") {
                  await fs.patchDoc(`legalAcceptanceIssues/${rawId}`, { assignedTo: assignee });
                } else if (type === "change_request") {
                  await fs.patchDoc(`changeRequests/${rawId}`, { assignedTo: assignee });
                } else {
                  await fs.patchDoc(`approvals/${rawId}`, { assignedTo: assignee });
                }
              } else if (body.action === "request_changes") {
                if (type === "video" || type === "episode" || type === "artwork") {
                  await fs.patchDoc(`contentAssets/${rawId}`, {
                    status: "changes_requested",
                    contentStatus: "changes_requested",
                    rightsReviewStatus: "changes_requested",
                    approvalStatus: "changes_requested",
                    requestChangesNotes: notes,
                    reviewQueueFlag: "Changes requested by reviewer",
                    changesRequestedAt: now,
                    changesRequestedBy: user.uid,
                  });
                } else if (type === "channel") {
                  await fs.patchDoc(`channels/${rawId}`, {
                    status: "changes_requested",
                    verificationStatus: "changes_requested",
                    requestChangesNotes: notes,
                    changesRequestedAt: now,
                    changesRequestedBy: user.uid,
                  });
                } else if (type === "live_stream") {
                  await fs.patchDoc(`channels/${rawId}`, {
                    liveApprovalStatus: "changes_requested",
                    requestChangesNotes: notes,
                    changesRequestedAt: now,
                    changesRequestedBy: user.uid,
                  });
                } else if (type === "producer") {
                  await fs.patchDoc(`producers/${rawId}`, {
                    verificationStatus: "changes_requested",
                    requestChangesNotes: notes,
                    changesRequestedAt: now,
                    changesRequestedBy: user.uid,
                  });
                } else if (type === "ad_creative") {
                  await fs.patchDoc(`adCampaigns/${rawId}`, {
                    creativeReviewStatus: "changes_requested",
                    status: "changes_requested",
                    requestChangesNotes: notes,
                    changesRequestedAt: now,
                    changesRequestedBy: user.uid,
                  });
                } else if (type === "change_request") {
                  await fs.patchDoc(`changeRequests/${rawId}`, {
                    status: "changes_requested",
                    requestChangesNotes: notes,
                    changesRequestedAt: now,
                    changesRequestedBy: user.uid,
                    updatedAt: now,
                  });
                } else {
                  await fs.patchDoc(`approvals/${rawId}`, {
                    status: "changes_requested",
                    requestChangesNotes: notes,
                    changesRequestedAt: now,
                    changesRequestedBy: user.uid,
                  });
                }
              } else if (body.action === "go_live") {
                if (type === "change_request") {
                  await applyChangeRequestGoLive(fs, rawId, user.uid);
                } else if (type === "video" || type === "episode" || type === "artwork") {
                  await fs.patchDoc(`contentAssets/${rawId}`, {
                    status: "published",
                    contentStatus: "published",
                    published: true,
                    liveAt: now,
                    publishedAt: now,
                    publishedBy: user.uid,
                  });
                } else if (type === "channel" || type === "live_stream") {
                  await fs.patchDoc(`channels/${rawId}`, {
                    status: "active",
                    streamStatus: "active",
                    published: true,
                    liveAt: now,
                  });
                }
              } else {
                // approve or reject
                const isApprove = body.action === "approve";

                if (type === "video" || type === "episode" || type === "artwork") {
                  if (isApprove) {
                    await fs.patchDoc(`contentAssets/${rawId}`, {
                      contentStatus: "ready",
                      rightsReviewStatus: "verified",
                      approvalStatus: "approved",
                      pricingRule: body.pricingRule || "global",
                      pricePerMinuteMinor: body.pricePerMinuteMinor,
                      countryPricingOverrides: body.countryPricingOverrides,
                      published: false,
                      ownerReviewRequired: false,
                      duplicateDetected: false,
                      reviewQueueFlag: null,
                      reviewedBy: user.uid,
                      reviewedAt: now,
                      reviewNotes: notes,
                    });
                  } else {
                    await fs.patchDoc(`contentAssets/${rawId}`, {
                      status: "rejected",
                      contentStatus: "rejected",
                      rightsReviewStatus: "rejected",
                      approvalStatus: "rejected",
                      rejectionReasonCode: body.reasonCode || "other",
                      rejectionMessage: notes,
                      rejectedAt: now,
                      rejectedBy: user.uid,
                      appealAllowed: true,
                      appealSubmitted: false,
                    });
                  }
                } else if (type === "channel") {
                  await fs.patchDoc(`channels/${rawId}`, {
                    status: isApprove ? "active" : "rejected",
                    verificationStatus: isApprove ? "verified" : "rejected",
                    reviewNotes: notes,
                    reviewedAt: now,
                    reviewedBy: user.uid,
                  });
                } else if (type === "live_stream") {
                  await fs.patchDoc(`channels/${rawId}`, {
                    liveApprovalStatus: isApprove ? "approved" : "rejected",
                    streamStatus: isApprove ? "active" : "disabled",
                    liveReviewNotes: notes,
                    liveReviewedAt: now,
                    liveReviewedBy: user.uid,
                  });
                } else if (type === "producer") {
                  await fs.patchDoc(`producers/${rawId}`, {
                    verified: isApprove,
                    verificationStatus: isApprove ? "approved" : "rejected",
                    reviewNotes: notes,
                    rejectionReason: isApprove ? null : notes,
                    reviewedAt: now,
                    reviewedBy: user.uid,
                  });
                } else if (type === "provider") {
                  await fs.patchDoc(`providerAllowlist/${rawId}`, {
                    status: isApprove ? "approved" : "rejected",
                    notes,
                    reviewedAt: now,
                    reviewedBy: user.uid,
                  });
                } else if (type === "payout") {
                  await fs.patchDoc(`payouts/${rawId}`, {
                    status: isApprove ? "approved" : "rejected",
                    auditNote: notes,
                    reviewedAt: now,
                    reviewedBy: user.uid,
                  });
                } else if (type === "content_report") {
                  await fs.patchDoc(`contentReports/${rawId}`, {
                    status: isApprove ? "resolved" : "dismissed",
                    resolutionNotes: notes,
                    resolvedAt: now,
                    resolvedBy: user.uid,
                  });
                } else if (type === "ad_creative") {
                  await fs.patchDoc(`adCampaigns/${rawId}`, {
                    creativeReviewStatus: isApprove ? "approved" : "rejected",
                    status: isApprove ? "active" : "rejected",
                    reviewNotes: notes,
                    reviewedAt: now,
                    reviewedBy: user.uid,
                  });
                } else if (type === "legal_issue") {
                  await fs.patchDoc(`legalAcceptanceIssues/${rawId}`, {
                    status: isApprove ? "resolved" : "rejected",
                    resolutionNotes: notes,
                    resolvedAt: now,
                    resolvedBy: user.uid,
                  });
                } else if (type === "change_request") {
                  await fs.patchDoc(`changeRequests/${rawId}`, {
                    status: isApprove ? "approved" : "rejected",
                    reviewedBy: user.uid,
                    reviewedAt: now,
                    reviewNotes: notes,
                    rejectionReason: isApprove ? null : notes,
                    updatedAt: now,
                  });
                } else {
                  await fs.patchDoc(`approvals/${rawId}`, {
                    status: isApprove ? "approved" : "rejected",
                    decisionNotes: notes,
                    resolvedAt: now,
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

              // Notification dispatch to submitter / producer on every decision
              if (body.action !== "assign") {
                let recipientUid = "";
                let itemTitle = "";

                if (type === "video" || type === "episode" || type === "artwork") {
                  const doc = await fs.getDoc(`contentAssets/${rawId}`);
                  recipientUid = String(doc?.["ownerUid"] || doc?.["producerUid"] || "");
                  itemTitle = String(doc?.["title"] || type);
                } else if (type === "channel" || type === "live_stream") {
                  const doc = await fs.getDoc(`channels/${rawId}`);
                  recipientUid = String(doc?.["ownerUid"] || doc?.["producerUid"] || "");
                  itemTitle = String(doc?.["name"] || doc?.["title"] || type);
                } else if (type === "producer") {
                  recipientUid = rawId;
                  itemTitle = "Producer verification";
                } else if (type === "payout") {
                  const doc = await fs.getDoc(`payouts/${rawId}`);
                  recipientUid = String(doc?.["creatorUid"] || doc?.["producerUid"] || "");
                  itemTitle = "Payout request";
                } else if (type === "ad_creative") {
                  const doc = await fs.getDoc(`adCampaigns/${rawId}`);
                  recipientUid = String(doc?.["advertiserUid"] || doc?.["ownerUid"] || "");
                  itemTitle = String(doc?.["name"] || "Ad Creative");
                } else if (type === "content_report") {
                  const doc = await fs.getDoc(`contentReports/${rawId}`);
                  recipientUid = String(doc?.["reporterUid"] || "");
                  itemTitle = "Content report";
                } else if (type === "legal_issue") {
                  const doc = await fs.getDoc(`legalAcceptanceIssues/${rawId}`);
                  recipientUid = String(doc?.["userUid"] || "");
                  itemTitle = "Legal issue";
                } else {
                  const doc = await fs.getDoc(`approvals/${rawId}`);
                  recipientUid = String(doc?.["submitterUid"] || "");
                  itemTitle = String(doc?.["title"] || "Submission");
                }

                if (recipientUid && recipientUid !== "unknown" && recipientUid !== "anonymous") {
                  const notificationId = crypto.randomUUID().replace(/-/g, "");
                  const actionVerb =
                    body.action === "approve"
                      ? "approved"
                      : body.action === "reject"
                        ? "rejected"
                        : "returned for revisions";
                  const displayType = type.replace("_", " ");
                  const notificationTitle = `Your ${displayType} "${itemTitle}" was ${actionVerb}`;

                  await fs
                    .setDoc(`users/${recipientUid}/notifications/${notificationId}`, {
                      notificationId,
                      title: notificationTitle,
                      body: notes,
                      deepLink:
                        type === "video" || type === "episode" || type === "artwork"
                          ? "/producer/channels"
                          : type === "live_stream"
                            ? "/producer/channels"
                            : null,
                      read: false,
                      deliveryStatus: "queued",
                      createdAt: now,
                      createdBy: user.uid,
                      targetType: type,
                      targetId: rawId,
                      action: body.action,
                    })
                    .catch(() => null);
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
            success: results.every((r) => r.success),
            results,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
