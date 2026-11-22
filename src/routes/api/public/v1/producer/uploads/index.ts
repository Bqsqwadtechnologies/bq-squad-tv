import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requirePlatformRole } from "@/lib/server/roles";
import { requireApprovedKyc } from "@/lib/server/access";
import { writeAuditLog } from "@/lib/server/audit";
import { isSafeStoragePath } from "@/lib/server/storage/security";

const submitSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(150),
  description: z.string().trim().max(3000).default(""),
  category: z.string().trim().min(2).max(60).default("Entertainment"),
  contentType: z.enum(["movie", "series", "video"]).default("movie"),
  genre: z.string().trim().min(2).max(60).default("General"),
  language: z.string().trim().min(2).max(60).default("English"),
  ageRating: z.enum(["G", "PG", "TV-Y7", "PG-13", "16", "18"]).default("PG"),
  releaseDate: z.string().trim().optional(),
  productionYear: z.number().int().min(1888).max(new Date().getFullYear() + 2).default(2026),
  cast: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  crew: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  posterUrl: z.string().url().max(2048).optional().nullable(),
  backdropUrl: z.string().url().max(2048).optional().nullable(),
  trailerUrl: z.string().url().max(2048).optional().nullable(),
  subtitlesUrl: z.string().url().max(2048).optional().nullable(),
  mediaUploadSessionId: z.string().regex(/^[A-Fa-f0-9]{32}$/),
  evidenceUploadSessionId: z.string().regex(/^[A-Fa-f0-9]{32}$/),

  // Series metadata (grouped under seriesTitle)
  seriesTitle: z.string().trim().max(150).optional().nullable(),
  seasonNumber: z.number().int().min(1).default(1),
  episodeNumber: z.number().int().min(1).optional().nullable(),
  episodeTitle: z.string().trim().max(150).optional().nullable(),

  // Rights & declarations (Rule N5 step 3)
  ownershipDeclaration: z.literal(true, {
    errorMap: () => ({ message: "You must confirm you own or have full legal rights to distribute this title." }),
  }),
  copyrightDeclaration: z.literal(true, {
    errorMap: () => ({ message: "You must confirm this submission does not infringe any third-party rights." }),
  }),
  rightsEvidencePath: z.string().trim().min(1, "Proof of rights document is required before review").max(1024),
  copyrightHolderName: z.string().trim().min(2).max(150).default("Producer"),
  licenseType: z.enum(["owned", "licensed", "public_domain"]).default("owned"),
  territoryCodes: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1).max(250).default(["US", "NG", "GB", "GH", "KE", "ZA", "CA"]),
  platforms: z.array(z.enum(["android", "web", "android_tv"])).min(1).max(3).default(["android", "web", "android_tv"]),
});

export const Route = createFileRoute("/api/public/v1/producer/uploads/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, user, "producer");

          // Query assets owned by this producer
          const [ownedAssets, producerDoc] = await Promise.all([
            fs.query("contentAssets", {
              filters: [{ field: "ownerUid", op: "EQUAL", value: user.uid }],
              limit: 200,
            }),
            fs.getDoc("producers/" + user.uid),
          ]);

          const titles = ownedAssets.map((a) => {
            const rawStatus = a["status"] || a["contentStatus"] || "pending";
            let displayStatus: "draft" | "pending" | "approved" | "rejected" = "pending";
            if (rawStatus === "draft") displayStatus = "draft";
            else if (rawStatus === "ready" || rawStatus === "published" || rawStatus === "ACTIVE") displayStatus = "approved";
            else if (rawStatus === "rejected" || rawStatus === "BLOCKED" || rawStatus === "flagged") displayStatus = "rejected";

            return {
              id: a.__id || a["id"] || a["assetId"],
              assetId: a["assetId"] || a.__id,
              title: a["title"] || "Untitled",
              description: a["description"] || "",
              category: a["category"] || "Entertainment",
              contentType: a["contentType"] || (a["episodeNumber"] ? "series" : "movie"),
              genre: a["genre"] || "General",
              language: a["language"] || "English",
              ageRating: a["ageRating"] || "PG",
              releaseDate: a["releaseDate"] || null,
              productionYear: a["productionYear"] || null,
              cast: Array.isArray(a["cast"]) ? a["cast"] : [],
              crew: Array.isArray(a["crew"]) ? a["crew"] : [],
              posterUrl: a["posterUrl"] || null,
              backdropUrl: a["backdropUrl"] || null,
              trailerUrl: a["trailerUrl"] || null,
              subtitlesUrl: a["subtitlesUrl"] || null,
              status: displayStatus,
              rawStatus,
              rejectionReason: a["rejectionMessage"] || a["rejectionReasonLabel"] || null,
              // Grouped series info
              seriesTitle: a["seriesTitle"] || null,
              seasonNumber: typeof a["seasonNumber"] === "number" ? a["seasonNumber"] : 1,
              episodeNumber: typeof a["episodeNumber"] === "number" ? a["episodeNumber"] : null,
              episodeTitle: a["episodeTitle"] || null,
              createdAt: a["createdAt"] || null,
              updatedAt: a["updatedAt"] || null,
            };
          });

          // Group episodes under their series titles
          const movies: typeof titles = [];
          const seriesMap: Record<string, { seriesTitle: string; episodes: typeof titles }> = {};

          for (const item of titles) {
            if (item.contentType === "series" || item.seriesTitle || item.episodeNumber !== null) {
              const sKey = String(item.seriesTitle || item.title || "Untitled Series").trim();
              if (!seriesMap[sKey]) {
                seriesMap[sKey] = { seriesTitle: sKey, episodes: [] };
              }
              seriesMap[sKey].episodes.push(item);
            } else {
              movies.push(item);
            }
          }

          // Sort episodes inside each series by season and episode number
          for (const s of Object.values(seriesMap)) {
            s.episodes.sort((a, b) => {
              if (a.seasonNumber !== b.seasonNumber) return a.seasonNumber - b.seasonNumber;
              return (a.episodeNumber || 0) - (b.episodeNumber || 0);
            });
          }

          return Response.json({
            producer: {
              uid: user.uid,
              publicId: producerDoc?.["publicId"] || null,
              slug: producerDoc?.["slug"] || null,
              name: producerDoc?.["name"] || producerDoc?.["displayName"] || "Producer",
            },
            titles,
            grouped: {
              movies,
              series: Object.values(seriesMap),
            },
            totalCount: titles.length,
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, user, "producer");
          await requireApprovedKyc(fs, user.uid, "producer");

          const body = await parseBody(request, submitSchema);

          const [mediaSession, evidenceSession] = await Promise.all([
            fs.getDoc(`producerUploadSessions/${body.mediaUploadSessionId}`),
            fs.getDoc(`producerUploadSessions/${body.evidenceUploadSessionId}`),
          ]);
          const nowMs = Date.now();
          const validSession = (session: Record<string, unknown> | null, kind: string) =>
            Boolean(session && session["uid"] === user.uid && session["mediaKind"] === kind &&
              session["status"] === "uploaded" && typeof session["storagePath"] === "string" &&
              typeof session["expiresAt"] === "string" && Date.parse(session["expiresAt"] as string) > nowMs);
          if (!validSession(mediaSession, "video") || !validSession(evidenceSession, "evidence")) {
            throw new ApiError(400, "UPLOAD_NOT_VERIFIED", "Upload both the title video and rights evidence before submitting.");
          }
          const mediaStoragePath = mediaSession!["storagePath"] as string;
          const rightsEvidencePath = evidenceSession!["storagePath"] as string;
          if (!isSafeStoragePath(mediaStoragePath) || !isSafeStoragePath(rightsEvidencePath)) {
            throw new ApiError(400, "INVALID_STORAGE_PATH", "The uploaded file path is invalid.");
          }

          const now = new Date().toISOString();
          const assetId = `title_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

          const producerDoc = await fs.getDoc("producers/" + user.uid);
          const producerPublicId = producerDoc?.["publicId"] || null;
          const producerSlug = producerDoc?.["slug"] || null;

          const titleDoc = {
            id: assetId,
            assetId,
            ownerUid: user.uid,
            producerUid: user.uid,
            producerPublicId,
            producerSlug,
            title: body.title,
            description: body.description,
            category: body.category,
            contentType: body.contentType,
            genre: body.genre,
            language: body.language,
            ageRating: body.ageRating,
            releaseDate: body.releaseDate || null,
            productionYear: body.productionYear,
            cast: body.cast,
            crew: body.crew,
            posterUrl: body.posterUrl || null,
            backdropUrl: body.backdropUrl || null,
            trailerUrl: body.trailerUrl || null,
            subtitlesUrl: body.subtitlesUrl || null,
            mediaStoragePath,

            // Series grouping
            seriesTitle: body.contentType === "series" ? (body.seriesTitle || body.title) : null,
            seasonNumber: body.seasonNumber,
            episodeNumber: body.episodeNumber || null,
            episodeTitle: body.episodeTitle || null,

            // Status: Pending submission for review (Rule N5)
            status: "pending",
            contentStatus: "pending_review",
            rightsReviewStatus: "pending",

            // Rights & Declarations
            license: {
              status: "pending",
              verificationStatus: "pending",
              licenseType: body.licenseType,
              copyrightHolderName: body.copyrightHolderName,
              ownershipDeclaration: true,
              copyrightDeclaration: true,
              evidencePath: rightsEvidencePath,
              territoryCodes: body.territoryCodes,
              platforms: body.platforms,
              submittedAt: now,
            },

            // No price field for producers (Batch N5 Rule 3)
            ratePerMinuteMinor: 0,
            currency: producerDoc?.["currency"] || "USD",

            createdAt: now,
            updatedAt: now,
          };

          await fs.setDoc(`contentAssets/${assetId}`, titleDoc);

          // Clear any active draft for this producer
          await fs.deleteDoc(`producerUploadDrafts/${user.uid}`).catch(() => {});

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "producer.title_submitted",
            targetType: "contentAsset",
            targetId: assetId,
            reason: "Producer submitted title for review via Upload Studio",
            metadata: {
              title: body.title,
              contentType: body.contentType,
              seriesTitle: body.seriesTitle,
              seasonNumber: body.seasonNumber,
              episodeNumber: body.episodeNumber,
            },
          });

          return Response.json(
            {
              success: true,
              assetId,
              status: "pending",
              message: "Title submitted successfully. Review is now pending.",
            },
            { status: 201 },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
