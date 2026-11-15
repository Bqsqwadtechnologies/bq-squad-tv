import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requirePlatformRole } from "@/lib/server/roles";
import { encryptProviderCredential } from "@/lib/server/streaming/provider-credentials";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { writeAuditLog } from "@/lib/server/audit";
import { getPricingConfig } from "@/lib/server/pricing";

const schema = z.object({
  title: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(50),
  description: z.string().trim().max(2000).default(""),
  language: z.string().trim().min(2).max(20).default("en"),
  posterUrl: z.string().url().max(2048).optional(),
  deliveryMode: z.enum(["external", "bq_hosted"]),
  providerId: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/).optional(),
  providerKey: z.string().min(12).max(4096).optional(),
});

export const Route = createFileRoute("/api/public/v1/producer/channels")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const fs = await Firestore.create();
        await requirePlatformRole(fs, user, "producer");
        const channels = await fs.query("channels", {
          filters: [{ field: "ownerUid", op: "EQUAL", value: user.uid }],
          limit: 100,
        });
        return Response.json(channels.map(channel => ({
          id: channel.__id, title: channel["title"] ?? "Untitled channel",
          category: channel["category"] ?? "Channel", published: channel["published"] === true,
          status: channel["status"] ?? "DRAFT",
          deliveryMode: channel["deliveryMode"] ?? "bq_hosted",
          providerSetupStatus: channel["providerSetupStatus"] ?? null,
        })));
      } catch (error) { return errorBody(error); }
    },
    POST: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const body = await parseBody(request, schema);
        const fs = await Firestore.create();
        await requirePlatformRole(fs, user, "producer");
        await enforceRateLimit(fs, "channel-create:" + user.uid, { limit: 5, windowMs: 60 * 60_000 });
        const pricing = await getPricingConfig(fs);
        const channelId = crypto.randomUUID().replace(/-/g, "");
        let encryptedCredential: Awaited<ReturnType<typeof encryptProviderCredential>> | null = null;
        if (body.deliveryMode === "external") {
          if (!body.providerId || !body.providerKey) {
            throw new ApiError(400, "PROVIDER_DETAILS_REQUIRED", "Enter the streaming provider ID and API key for an external channel.");
          }
          encryptedCredential = await encryptProviderCredential(body.providerKey, channelId, body.providerId);
        } else if (body.providerId || body.providerKey) {
          throw new ApiError(400, "PROVIDER_DETAILS_NOT_ALLOWED", "Provider credentials are only used for external streaming channels.");
        }

        const now = new Date().toISOString();
        await fs.setDoc("channels/" + channelId, {
          ownerUid: user.uid,
          title: body.title,
          category: body.category,
          description: body.description,
          language: body.language,
          posterUrl: body.posterUrl ?? null,
          published: false,
          status: "DRAFT",
          adultOnly: false,
          deliveryMode: body.deliveryMode,
          providerId: body.deliveryMode === "external" ? body.providerId : "bq-storage",
          providerSetupStatus: body.deliveryMode === "external" ? "CREDENTIALS_SAVED_ADAPTER_PENDING" : "AWAITING_CONTENT",
          producerShareBps: null,
          pricingVersion: pricing.version,
          createdAt: now,
          updatedAt: now,
        }, { mustNotExist: true });
        if (encryptedCredential && body.providerId) {
          await fs.setDoc("channelProviderSecrets/" + channelId, {
            providerId: body.providerId,
            credential: encryptedCredential,
            updatedBy: user.uid,
            updatedAt: now,
          }, { mustNotExist: true });
        }
        await writeAuditLog(fs, {
          actorUid: user.uid, action: "channel.created", targetType: "channel", targetId: channelId,
          reason: "Producer created a channel",
          metadata: { deliveryMode: body.deliveryMode, providerId: body.providerId ?? null },
        });
        return Response.json({
          channelId, status: "DRAFT", published: false,
          providerSetupStatus: body.deliveryMode === "external" ? "CREDENTIALS_SAVED_ADAPTER_PENDING" : "AWAITING_CONTENT",
        }, { status: 201 });
      } catch (error) { return errorBody(error); }
    },
  } },
});
