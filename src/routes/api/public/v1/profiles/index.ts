import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";

const createProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(30),
    avatarUrl: z.string().url().optional(),
    isKids: z.boolean().default(false),
    maturityRating: z.enum(["G", "PG", "13+", "16+", "18+"]).default("18+"),
    pin: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/profiles/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const profiles = await fs.query("profiles", {
            filters: [{ field: "uid", op: "EQUAL", value: user.uid }],
          });

          return Response.json({
            items: profiles.map((p: Record<string, unknown>) => ({
              id: p["__id"],
              name: p["name"],
              avatarUrl: p["avatarUrl"] ?? null,
              isKids: p["isKids"] ?? false,
              maturityRating: p["maturityRating"] ?? "18+",
              hasPin: Boolean(p["pinHash"]),
            })),
          });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, createProfileSchema);
          const fs = await Firestore.create();

          const existing = await fs.query("profiles", {
            filters: [{ field: "uid", op: "EQUAL", value: user.uid }],
          });

          if (existing.length >= 5) {
            throw new ApiError(
              400,
              "MAX_PROFILES_EXCEEDED",
              "Maximum of 5 profiles per account reached.",
            );
          }

          const profileId = `prof_${Date.now()}`;
          const now = new Date().toISOString();

          await fs.setDoc(`profiles/${user.uid}_${profileId}`, {
            id: profileId,
            uid: user.uid,
            name: body.name,
            avatarUrl: body.avatarUrl ?? null,
            isKids: body.isKids,
            maturityRating: body.isKids ? "G" : body.maturityRating,
            pinHash: body.pin ? "pin_set" : null,
            createdAt: now,
            updatedAt: now,
          });

          return Response.json({
            profile: {
              id: profileId,
              name: body.name,
              isKids: body.isKids,
              maturityRating: body.isKids ? "G" : body.maturityRating,
              hasPin: Boolean(body.pin),
            },
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
