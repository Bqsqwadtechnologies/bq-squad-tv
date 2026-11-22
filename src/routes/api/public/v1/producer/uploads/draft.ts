import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requirePlatformRole } from "@/lib/server/roles";
import { z } from "zod";

const draftSchema = z.object({
  step: z.number().int().min(1).max(4).default(1),
  contentType: z.enum(["movie", "series", "video"]).default("movie"),
  title: z.string().max(150).default(""),
  description: z.string().max(3000).default(""),
  genre: z.string().max(60).default("General"),
  language: z.string().max(60).default("English"),
  ageRating: z.string().max(10).default("PG"),
  releaseDate: z.string().max(30).default(""),
  productionYear: z.number().int().optional(),
  cast: z.array(z.string()).default([]),
  crew: z.array(z.string()).default([]),
  posterUrl: z.string().max(2048).default(""),
  backdropUrl: z.string().max(2048).default(""),
  trailerUrl: z.string().max(2048).default(""),
  subtitlesUrl: z.string().max(2048).default(""),
  mediaStoragePath: z.string().max(1024).default(""),
  mediaUploadSessionId: z.string().max(64).default(""),
  seriesTitle: z.string().max(150).default(""),
  seasonNumber: z.number().int().default(1),
  episodeNumber: z.number().int().nullable().default(null),
  episodeTitle: z.string().max(150).default(""),
  ownershipDeclaration: z.boolean().default(false),
  copyrightDeclaration: z.boolean().default(false),
  rightsEvidencePath: z.string().max(1024).default(""),
  evidenceUploadSessionId: z.string().max(64).default(""),
  copyrightHolderName: z.string().max(150).default(""),
  licenseType: z.string().max(50).default("owned"),
});

export const Route = createFileRoute("/api/public/v1/producer/uploads/draft")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, user, "producer");

          const draft = await fs.getDoc(`producerUploadDrafts/${user.uid}`);
          return Response.json({
            draft: draft || null,
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

          const body = await parseBody(request, draftSchema);
          const now = new Date().toISOString();

          const draftData = {
            ...body,
            uid: user.uid,
            savedAt: now,
          };

          await fs.setDoc(`producerUploadDrafts/${user.uid}`, draftData);

          return Response.json({
            success: true,
            savedAt: now,
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      DELETE: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, user, "producer");

          await fs.deleteDoc(`producerUploadDrafts/${user.uid}`);

          return Response.json({
            success: true,
            message: "Draft discarded.",
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
