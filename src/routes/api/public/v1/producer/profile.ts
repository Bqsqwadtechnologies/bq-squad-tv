import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore, ApiError } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requirePlatformRole } from "@/lib/server/roles";
import { ensurePublicId } from "@/lib/server/universal-ids";
import { writeAuditLog } from "@/lib/server/audit";

const updateSchema = z.object({
  displayName: z.string().trim().min(2).max(100).optional(),
  bio: z.string().trim().max(2000).optional(),
  avatarUrl: z.string().url().max(2048).optional().nullable(),
  bannerUrl: z.string().url().max(2048).optional().nullable(),
  avatarPath: z.string().trim().max(512).optional().nullable(),
  bannerPath: z.string().trim().max(512).optional().nullable(),
  brandOverlayText: z.string().trim().max(32).optional().nullable(),
  brandOverlayLogoPath: z.string().trim().max(512).optional().nullable(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug can only contain lowercase letters, numbers, and single hyphens")
    .min(3)
    .max(50)
    .optional(),
  externalLinks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(50),
        url: z.string().url().max(2048),
      }),
    )
    .max(5)
    .optional(),
});

export const Route = createFileRoute("/api/public/v1/producer/profile")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, user, "producer");

          let producer = await fs.getDoc(`producers/${user.uid}`);
          if (!producer) {
            // Initialize basic producer profile if not already set
            const userDoc = await fs.getDoc(`users/${user.uid}`);
            const initialName = (userDoc?.["displayName"] as string) || (userDoc?.["name"] as string) || "Producer";
            const initialPublicId = await ensurePublicId(fs, user.uid, "producer");
            const initialSlug = `producer-${initialPublicId.slice(-6).toLowerCase()}`;

            producer = {
              uid: user.uid,
              name: initialName,
              displayName: initialName,
              publicId: initialPublicId,
              slug: initialSlug,
              bio: "",
              avatarUrl: userDoc?.["photoURL"] || null,
              bannerUrl: null,
              externalLinks: [],
              verificationStatus: "PENDING",
              planStatus: "ACTIVE",
              followerCount: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            await fs.setDoc(`producers/${user.uid}`, producer);
            await fs.setDoc(`producerSlugs/${initialSlug}`, { uid: user.uid, createdAt: new Date().toISOString() });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const [avatarSigned, bannerSigned, brandLogoSigned] = await Promise.all([
            typeof producer["avatarPath"] === "string"
              ? supabaseAdmin.storage.from("bq-sqwad-source-media").createSignedUrl(producer["avatarPath"] as string, 60 * 60)
              : Promise.resolve({ data: null, error: null }),
            typeof producer["bannerPath"] === "string"
              ? supabaseAdmin.storage.from("bq-sqwad-source-media").createSignedUrl(producer["bannerPath"] as string, 60 * 60)
              : Promise.resolve({ data: null, error: null }),
            typeof producer["brandOverlayLogoPath"] === "string"
              ? supabaseAdmin.storage.from("bq-sqwad-source-media").createSignedUrl(producer["brandOverlayLogoPath"] as string, 60 * 60)
              : Promise.resolve({ data: null, error: null }),
          ]);
          return Response.json({
            profile: {
              uid: user.uid,
              publicId: producer["publicId"] || null,
              slug: producer["slug"] || null,
              name: producer["displayName"] || producer["name"] || "Producer",
              bio: producer["bio"] || "",
              avatarUrl: avatarSigned.data?.signedUrl || producer["avatarUrl"] || null,
              bannerUrl: bannerSigned.data?.signedUrl || producer["bannerUrl"] || null,
              avatarPath: producer["avatarPath"] || null,
              bannerPath: producer["bannerPath"] || null,
              brandOverlayText: producer["brandOverlayText"] || "",
              brandOverlayLogoPath: producer["brandOverlayLogoPath"] || null,
              brandOverlayLogoUrl: brandLogoSigned.data?.signedUrl || null,
              externalLinks: Array.isArray(producer["externalLinks"]) ? producer["externalLinks"] : [],
              followerCount: Math.max(0, Number(producer["followerCount"]) || 0),
              verificationStatus: producer["verificationStatus"] || "PENDING",
              publicVerificationStatus: producer["publicVerificationStatus"] || "INACTIVE",
              publicVerificationUntil: producer["publicVerificationUntil"] || null,
              planStatus: producer["planStatus"] || "ACTIVE",
            },
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      PUT: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, updateSchema);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, user, "producer");

          const producer = await fs.getDoc(`producers/${user.uid}`);
          const currentSlug = (producer?.["slug"] as string) || null;
          const now = new Date().toISOString();

          const updates: Record<string, unknown> = {
            updatedAt: now,
          };

          if (body.displayName !== undefined) updates["displayName"] = body.displayName;
          if (body.bio !== undefined) updates["bio"] = body.bio;
          if (body.avatarUrl !== undefined) updates["avatarUrl"] = body.avatarUrl;
          if (body.bannerUrl !== undefined) updates["bannerUrl"] = body.bannerUrl;
          if (body.avatarPath !== undefined) { updates["avatarPath"] = body.avatarPath; updates["avatarUrl"] = null; }
          if (body.bannerPath !== undefined) { updates["bannerPath"] = body.bannerPath; updates["bannerUrl"] = null; }
          if (body.brandOverlayText !== undefined) updates["brandOverlayText"] = body.brandOverlayText;
          if (body.brandOverlayLogoPath !== undefined) updates["brandOverlayLogoPath"] = body.brandOverlayLogoPath;
          if (body.externalLinks !== undefined) updates["externalLinks"] = body.externalLinks;

          // If updating custom slug
          if (body.slug && body.slug !== currentSlug) {
            const existingSlugDoc = await fs.getDoc(`producerSlugs/${body.slug}`);
            if (existingSlugDoc && existingSlugDoc["uid"] !== user.uid) {
              throw new ApiError(409, "SLUG_TAKEN", "This custom slug is already reserved by another producer.");
            }

            // Reserve new slug
            await fs.setDoc(`producerSlugs/${body.slug}`, {
              uid: user.uid,
              createdAt: now,
            });

            // If changing from an old custom slug, remove the old mapping
            if (currentSlug && currentSlug !== body.slug) {
              await fs.deleteDoc(`producerSlugs/${currentSlug}`).catch(() => {});
            }

            updates["slug"] = body.slug;
          }

          await fs.patchDoc(`producers/${user.uid}`, updates);

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "producer.profile_updated",
            targetType: "producer",
            targetId: user.uid,
            reason: "Producer updated public profile",
          });

          return Response.json({
            success: true,
            message: "Profile updated successfully.",
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
