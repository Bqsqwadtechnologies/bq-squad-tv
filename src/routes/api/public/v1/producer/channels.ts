import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requirePlatformRole } from "@/lib/server/roles";
import { requireApprovedKyc } from "@/lib/server/access";
import { encryptProviderCredential } from "@/lib/server/streaming/provider-credentials";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { writeAuditLog } from "@/lib/server/audit";
import { getPricingConfig } from "@/lib/server/pricing";
import { getPlatformFlags } from "@/lib/server/flags";

const schema = z.object({
  title: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(50),
  description: z.string().trim().max(2000).default(""),
  language: z.string().trim().min(2).max(20).default("en"),
  posterUrl: z.string().url().max(2048).optional(),
  deliveryMode: z.enum(["external", "bq_hosted"]),
  providerId: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_-]{1,63}$/)
    .optional(),
  providerKey: z.string().min(12).max(4096).optional(),
});

export const Route = createFileRoute("/api/public/v1/producer/channels")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, user, "producer");
          await requireApprovedKyc(fs, user.uid, "producer");
          const channels = await fs.query("channels", {
            filters: [{ field: "ownerUid", op: "EQUAL", value: user.uid }],
            limit: 100,
          });
          return Response.json(
            channels.map((channel) => ({
              id: channel.__id,
              title: channel["title"] ?? "Untitled channel",
              category: channel["category"] ?? "Channel",
              published: channel["published"] === true,
              status: channel["status"] ?? "DRAFT",
              deliveryMode: channel["deliveryMode"] ?? "bq_hosted",
              providerSetupStatus: channel["providerSetupStatus"] ?? null,
            })),
          );
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async () => {
        return Response.json(
          {
            error: "CHANNEL_CREATION_RESTRICTED",
            message: "Only we can create channels. Contact tv@bqsqwad.com.",
          },
          { status: 403, headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
