import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { isSafeStoragePath } from "@/lib/server/storage/security";
import { wakeModalVideoWorker } from "@/lib/server/modal-wake";

const MAX_BYTES = 5_000_000_000; // 5 GB
const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

const allowedExtensions = /\.(mp4|mov|webm|mkv|m3u8|ts)$/i;
const allowedMimes = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "application/x-mpegurl",
  "application/vnd.apple.mpegurl",
  "video/mp2t",
]);

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("INITIATE_UPLOAD"),
    channelId: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).default(""),
    mediaType: z.enum(["Movie", "Series", "Episode", "Trailer", "Live recording"]).default("Movie"),
    genre: z.string().trim().max(100).default("General"),
    language: z.string().trim().max(50).default("English"),
    ageRating: z.enum(["G", "TV-Y7", "PG-13", "16", "18"]).default("PG-13"),
    contentWarnings: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    licenseType: z.enum(["owned", "licensed", "public_domain"]),
    copyrightHolderName: z.string().trim().min(2).max(150),
    productionYear: z.number().int().min(1888).max(new Date().getFullYear()),
    releaseDate: z.string().max(30).default(() => new Date().toISOString().slice(0, 10)),
    cast: z.string().trim().max(500).default(""),
    posterUrl: z.string().trim().max(500).optional(),
    backdropUrl: z.string().trim().max(500).optional(),
    filename: z.string().trim().min(1).max(255),
    sizeBytes: z.number().int().positive().max(MAX_BYTES),
    mimeType: z.string().trim().min(1).max(100),
    checksumSha256: z.string().trim().max(64).optional(),
    subtitles: z
      .array(
        z.object({
          language: z.string().max(50),
          format: z.enum(["vtt", "srt"]),
          label: z.string().max(100),
          url: z.string().max(500).optional(),
        }),
      )
      .default([]),
    audioTracks: z
      .array(
        z.object({
          language: z.string().max(50),
          label: z.string().max(100),
          channels: z.string().max(20).default("Stereo"),
        }),
      )
      .default([]),
  }),
  z.object({
    action: z.literal("UPLOAD_CHUNK"),
    assetId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    chunkIndex: z.number().int().min(0),
    totalChunks: z.number().int().positive(),
    chunkBytesLength: z.number().int().positive().max(CHUNK_SIZE * 2),
  }),
  z.object({
    action: z.literal("COMPLETE_UPLOAD"),
    assetId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    durationSeconds: z.number().int().positive().max(86400).optional(),
    codec: z.string().max(50).optional(),
    resolution: z.string().max(20).optional(),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("ACTION_UPLOAD"),
    assetId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    operation: z.enum(["pause", "resume", "retry", "direct_publish", "approve", "mark_review", "delete"]),
    reason: z.string().trim().min(3).max(500),
  }),
]);

export const Route = createFileRoute("/api/public/v1/zillionaire/upload/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          try {
            await requireZillionaireModule(fs, user, "video");
          } catch {
            await requireZillionaireModule(fs, user, "content");
          }

          const [assets, channelsList] = await Promise.all([
            fs.query("contentAssets", {
              orderByField: "createdAt",
              descending: true,
              limit: 200,
            }),
            fs.query("channels", { limit: 50 }),
          ]);

          const channelMap = new Map<string, string>();
          for (const ch of channelsList) {
            channelMap.set(ch.__id, (ch["title"] as string) || (ch["name"] as string) || ch.__id);
          }

          const uploads = assets.map((a) => {
            const rawStatus = (a["status"] as string) || "unknown";
            const contentStatus = (a["contentStatus"] as string) || "draft";
            let displayState: "Uploading" | "Verifying" | "Processing" | "Needs review" | "Ready" | "Published" | "Failed" = "Needs review";

            if (contentStatus === "published" || (rawStatus === "ready" && a["published"] === true)) {
              displayState = "Published";
            } else if (rawStatus === "ready") {
              displayState = "Ready";
            } else if (rawStatus === "uploading") {
              displayState = "Uploading";
            } else if (rawStatus === "verifying") {
              displayState = "Verifying";
            } else if (rawStatus === "processing" || a["transcodeJobStatus"] === "queued" || a["transcodeJobStatus"] === "processing") {
              displayState = "Processing";
            } else if (rawStatus === "failed" || a["transcodeJobStatus"] === "failed") {
              displayState = "Failed";
            }

            return {
              id: a.__id,
              channelId: a["channelId"] || "",
              channelTitle: channelMap.get(a["channelId"] as string) || a["channelId"] || "Unassigned",
              title: a["title"] || "Untitled Asset",
              description: a["description"] || "",
              mediaType: a["mediaType"] || "Movie",
              genre: a["genre"] || "General",
              language: a["language"] || "English",
              ageRating: a["ageRating"] || a["contentRating"] || "PG",
              ownershipDeclaration: a["ownershipDeclaration"] === true,
              copyrightDeclaration: a["copyrightDeclaration"] === true,
              releaseDate: a["releaseDate"] || null,
              cast: a["cast"] || "",
              posterUrl: a["posterUrl"] || null,
              backdropUrl: a["backdropUrl"] || null,
              directPublish: a["directPublish"] === true,
              displayState,
              rawStatus,
              contentStatus,
              sourceFilename: a["sourceFilename"] || null,
              declaredSizeBytes: typeof a["declaredSizeBytes"] === "number" ? a["declaredSizeBytes"] : null,
              actualSizeBytes: typeof a["actualSizeBytes"] === "number" ? a["actualSizeBytes"] : null,
              durationSeconds: typeof a["durationSeconds"] === "number" ? a["durationSeconds"] : null,
              codec: a["codec"] || (a["sourceMediaKind"] as string) || null,
              resolution: a["resolution"] || null,
              duplicateDetected: a["duplicateDetected"] === true,
              failureReason: a["failureReason"] || a["lastErrorCode"] || null,
              masterPlaylistUrl: a["masterPlaylistUrl"] || a["hlsMasterUrl"] || a["streamUrl"] || null,
              createdAt: a["createdAt"] || null,
              updatedAt: a["updatedAt"] || null,
            };
          });

          const stats = {
            total: uploads.length,
            published: uploads.filter((u) => u.displayState === "Published").length,
            ready: uploads.filter((u) => u.displayState === "Ready").length,
            processing: uploads.filter((u) => u.displayState === "Processing").length,
            needsReview: uploads.filter((u) => u.displayState === "Needs review").length,
            failed: uploads.filter((u) => u.displayState === "Failed").length,
          };

          return Response.json({
            uploads,
            channels: channelsList.filter((ch) => ch["isSystemLibrary"] !== true).map((ch) => ({
              id: ch.__id,
              title: (ch["title"] as string) || (ch["name"] as string) || ch.__id,
              published: ch["published"] === true,
            })),
            stats,
            processingHostConfigured: Boolean(process.env.MODAL_TOKEN_ID && process.env.MODAL_TOKEN_SECRET),
          });
        } catch (err) {
          return errorBody(err);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          try {
            await requireZillionaireModule(fs, user, "video");
          } catch {
            await requireZillionaireModule(fs, user, "content");
          }
          const data = await parseBody(request, actionSchema);
          if (data.action !== "ACTION_UPLOAD") {
            throw new ApiError(410, "LEGACY_UPLOAD_DISABLED", "This legacy upload endpoint is disabled. Use the secure private storage upload flow.");
          }
          const now = new Date().toISOString();

          if (data.action === "INITIATE_UPLOAD") {
            const ext = "." + (data.filename.split(".").pop() || "").toLowerCase();
            if (!allowedExtensions.test(ext)) {
              throw new ApiError(400, "FILE_EXTENSION_NOT_ALLOWED", `File extension ${ext} is not supported. Use MP4, MOV, WebM, MKV, or HLS.`);
            }
            if (!allowedMimes.has(data.mimeType.toLowerCase()) && !data.mimeType.startsWith("video/")) {
              throw new ApiError(400, "MIME_TYPE_NOT_ALLOWED", `MIME type ${data.mimeType} is not a supported video format.`);
            }

            // Check for duplicate by hash or (channelId, filename, sizeBytes)
            let duplicateDetected = false;
            let duplicateAssetId: string | null = null;

            if (data.checksumSha256) {
              const existingByHash = await fs.query("contentAssets", {
                where: [{ field: "checksumSha256", op: "==", value: data.checksumSha256 }],
                limit: 1,
              });
              if (existingByHash.length > 0) {
                duplicateDetected = true;
                duplicateAssetId = existingByHash[0].__id;
              }
            }

            const assetId = "ast_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
            const totalChunks = Math.ceil(data.sizeBytes / CHUNK_SIZE);
            const sourcePath = `producers/${user.uid}/${data.channelId}/${assetId}/${data.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`;

            await fs.setDoc(`contentAssets/${assetId}`, {
              channelId: data.channelId,
              ownerUid: user.uid,
              title: data.title,
              description: data.description,
              mediaType: data.mediaType,
              genre: data.genre,
              language: data.language,
              ageRating: data.ageRating,
              contentRating: data.ageRating,
              contentWarnings: data.contentWarnings,
              licenseType: data.licenseType,
              copyrightHolderName: data.copyrightHolderName,
              productionYear: data.productionYear,
              rightsEvidencePath: null,
              license: { status: "pending", verificationStatus: "pending", licenseType: data.licenseType, submittedBy: user.uid },
              releaseDate: data.releaseDate,
              cast: data.cast,
              posterUrl: data.posterUrl || null,
              backdropUrl: data.backdropUrl || null,
              sourceFilename: data.filename,
              sourcePath,
              declaredSizeBytes: data.sizeBytes,
              mimeType: data.mimeType,
              checksumSha256: data.checksumSha256 || null,
              duplicateDetected,
              duplicateOfAssetId: duplicateAssetId,
              directPublish: false,
              subtitles: data.subtitles,
              audioTracks: data.audioTracks,
              status: "uploading",
              contentStatus: "draft",
              chunksReceived: 0,
              totalChunks,
              chunkSizeBytes: CHUNK_SIZE,
              uploadedBytes: 0,
              createdAt: now,
              updatedAt: now,
            });

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "content.upload_initiated",
              targetType: "contentAsset",
              targetId: assetId,
              reason: `Initiated upload for ${data.title} (${data.mediaType})`,
              metadata: {
                channelId: data.channelId,
                filename: data.filename,
                sizeBytes: data.sizeBytes,
                directPublish: false,
                duplicateDetected,
              },
            });

            return Response.json({
              assetId,
              chunkSizeBytes: CHUNK_SIZE,
              totalChunks,
              duplicateDetected,
              directPublish: false,
            });
          }

          if (data.action === "UPLOAD_CHUNK") {
            const asset = await fs.getDoc(`contentAssets/${data.assetId}`);
            if (!asset) {
              throw new ApiError(404, "ASSET_NOT_FOUND", "Upload asset does not exist.");
            }
            if (asset["status"] !== "uploading" && asset["status"] !== "verifying") {
              throw new ApiError(409, "ASSET_NOT_UPLOADING", "Asset is not currently in uploading state.");
            }

            const currentChunks = (asset["chunksReceived"] as number) || 0;
            const updatedChunks = Math.max(currentChunks, data.chunkIndex + 1);
            const uploadedBytes = Math.min(
              (asset["declaredSizeBytes"] as number) || data.totalChunks * CHUNK_SIZE,
              updatedChunks * CHUNK_SIZE,
            );
            const isLastChunk = data.chunkIndex >= data.totalChunks - 1;

            await fs.patchDoc(`contentAssets/${data.assetId}`, {
              chunksReceived: updatedChunks,
              uploadedBytes,
              status: isLastChunk ? "verifying" : "uploading",
              updatedAt: now,
            });

            const progress = Math.min(100, Math.round((updatedChunks / data.totalChunks) * 100));

            return Response.json({
              assetId: data.assetId,
              progress,
              status: isLastChunk ? "verifying" : "uploading",
            });
          }

          if (data.action === "COMPLETE_UPLOAD") {
            const asset = await fs.getDoc(`contentAssets/${data.assetId}`);
            if (!asset) {
              throw new ApiError(404, "ASSET_NOT_FOUND", "Upload asset does not exist.");
            }

            const processingAvailable = Boolean(process.env.MODAL_TOKEN_ID && process.env.MODAL_TOKEN_SECRET);
            if (!processingAvailable) {
              await fs.patchDoc(`contentAssets/${data.assetId}`, {
                status: "needs_review",
                contentStatus: "draft",
                directPublish: false,
                transcodeJobStatus: "blocked_missing_worker",
                durationSeconds: data.durationSeconds || asset["durationSeconds"] || null,
                codec: data.codec || asset["codec"] || null,
                resolution: data.resolution || asset["resolution"] || null,
                updatedAt: now,
              });
              await writeAuditLog(fs, {
                actorUid: user.uid,
                action: "content.upload_waiting_for_processing",
                targetType: "contentAsset",
                targetId: data.assetId,
                reason: "Upload completed; processing is not configured and publication requires independent approval",
                metadata: { channelId: asset["channelId"], processingAvailable: false },
              });
              return Response.json({
                assetId: data.assetId,
                status: "needs_review",
                contentStatus: "draft",
                approvalRequired: true,
                processingAvailable: false,
              });
            }
            // Queue transcode job
              const jobPath = `videoTranscodeJobs/${data.assetId}`;
              await fs.setDoc(jobPath, {
                assetId: data.assetId,
                channelId: asset["channelId"],
                ownerUid: user.uid,
                sourcePath: asset["sourcePath"],
                sourceFilename: asset["sourceFilename"],
                sourceSizeBytes: asset["declaredSizeBytes"],
                status: "queued",
                workerStatus: "waiting_for_worker",
                attempts: 0,
                createdAt: now,
                updatedAt: now,
              });

              await fs.patchDoc(`contentAssets/${data.assetId}`, {
                status: "processing",
                contentStatus: "draft",
                transcodeJobId: data.assetId,
                transcodeJobStatus: "queued",
                durationSeconds: data.durationSeconds || null,
                codec: data.codec || null,
                resolution: data.resolution || null,
                updatedAt: now,
              });

              await wakeModalVideoWorker();

              await writeAuditLog(fs, {
                actorUid: user.uid,
                action: "content.queued_transcode",
                targetType: "contentAsset",
                targetId: data.assetId,
                reason: data.reason || "Asset queued for video processing host",
                metadata: {
                  channelId: asset["channelId"],
                },
              });

              return Response.json({
                assetId: data.assetId,
                status: "processing",
                contentStatus: "draft",
                transcodeJobId: data.assetId,
              });
          }

          if (data.action === "ACTION_UPLOAD") {
            const asset = await fs.getDoc(`contentAssets/${data.assetId}`);
            if (!asset) {
              throw new ApiError(404, "ASSET_NOT_FOUND", "Upload asset does not exist.");
            }

            if (data.operation === "direct_publish" || data.operation === "approve") {
              throw new ApiError(
                403,
                "APPROVAL_WORKFLOW_REQUIRED",
                "Uploads cannot be published from this legacy action. Complete processing, rights review and the separate approval workflow first.",
              );
            } else if (data.operation === "pause") {
              await fs.patchDoc(`contentAssets/${data.assetId}`, {
                status: "paused",
                updatedAt: now,
              });
            } else if (data.operation === "resume" || data.operation === "retry") {
              await fs.patchDoc(`contentAssets/${data.assetId}`, {
                status: "uploading",
                failureReason: null,
                updatedAt: now,
              });
            } else if (data.operation === "mark_review") {
              await fs.patchDoc(`contentAssets/${data.assetId}`, {
                status: "needs_review",
                contentStatus: "draft",
                updatedAt: now,
              });
            } else if (data.operation === "delete") {
              await fs.deleteDoc(`contentAssets/${data.assetId}`);
            }

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: `content.upload_${data.operation}`,
              targetType: "contentAsset",
              targetId: data.assetId,
              reason: data.reason,
              metadata: { operation: data.operation },
            });

            return Response.json({
              assetId: data.assetId,
              operation: data.operation,
              success: true,
            });
          }

          throw new ApiError(400, "UNKNOWN_ACTION", "The requested action is not supported.");
        } catch (err) {
          return errorBody(err);
        }
      },
    },
  },
});
