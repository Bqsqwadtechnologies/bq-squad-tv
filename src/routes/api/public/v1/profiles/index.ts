import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";

const schema = z.object({
  name: z.string().trim().min(1).max(50),
  avatarUrl: z.string().url().optional(),
  isKids: z.boolean().default(false),
  ratingCeiling: z.enum(["G", "PG", "PG-13", "16+", "18+"]).default("18+"),
  screenTimeLimitMinutes: z.number().int().min(0).max(1440).default(0), // 0 = unlimited
}).strict();

export const Route = createFileRoute("/api/public/v1/profiles/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const profiles = await fs.listDocs(`users/${user.uid}/profiles`);
          return Response.json({ items: profiles });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();

          const existing = await fs.listDocs(`users/${user.uid}/profiles`);
          if (existing.length >= 5) {
            throw new ApiError(400, "PROFILE_LIMIT_REACHED", "Maximum 5 profiles per account.");
          }

          const profileId = `p_${Date.now()}`;
          const now = new Date().toISOString();

          const profile = {
            id: profileId,
            name: body.name,
            avatarUrl: body.avatarUrl ?? "",
            isKids: body.isKids,
            ratingCeiling: body.isKids ? "PG" : body.ratingCeiling,
            screenTimeLimitMinutes: body.screenTimeLimitMinutes,
            createdAt: now,
            updatedAt: now,
          };

          await fs.setDoc(`users/${user.uid}/profiles/${profileId}`, profile);
          return Response.json({ profile });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
