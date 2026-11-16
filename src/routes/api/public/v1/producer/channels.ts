import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requirePlatformRole } from "@/lib/server/roles";
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
        const flags = await getPlatformFlags(fs);
        if (!flags.producerChannelCreation) {
          throw new ApiError(403, "CHANNEL_CREATION_UNAVAILABLE", "Channel creation is currently unavailable.");
        }
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
        await fs.transact([], () => ({
          result: undefined,
          writes: [
            {
              update: { name: fs.docName("channels/" + channelId), fields: {
                ownerUid: { stringValue: user.uid },
                title: { stringValue: body.title },
                category: { stringValue: body.category },
                description: { stringValue: body.description },
                language: { stringValue: body.language },
                posterUrl: body.posterUrl ? { stringValue: body.posterUrl } : { nullValue: null },
                published: { booleanValue: false },
                status: { stringValue: "DRAFT" },
                adultOnly: { booleanValue: false },
                deliveryMode: { stringValue: body.deliveryMode },
                providerId: { stringValue: body.deliveryMode === "external" ? body.providerId! : "bq-storage" },
                providerSetupStatus: { stringValue: body.deliveryMode === "external" ? "CREDENTIALS_SAVED_ADAPTER_PENDING" : "AWAITING_CONTENT" },
                producerShareBps: { nullValue: null },
                pricingVersion: { integerValue: String(pricing.version) },
                createdAt: { stringValue: now },
                updatedAt: { stringValue: now },
              } },
              currentDocument: { exists: false },
            },
            ...(encryptedCredential && body.providerId ? [{
              update: { name: fs.docName("channelProviderSecrets/" + channelId), fields: {
                providerId: { stringValue: body.providerId },
                credential: { mapValue: { fields: {
                  algorithm: { stringValue: encryptedCredential.algorithm },
                  keyVersion: { stringValue: encryptedCredential.keyVersion },
                  nonce: { stringValue: encryptedCredential.nonce },
                  ciphertext: { stringValue: encryptedCredential.ciphertext },
                } } },
                updatedBy: { stringValue: user.uid },
                updatedAt: { stringValue: now },
              } },
              currentDocument: { exists: false },
            }] : []),
          ],
        }));
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
