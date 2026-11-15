import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { encryptProviderCredential } from "@/lib/server/streaming/provider-credentials";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({
  platform: z.enum(["android", "web"]),
  providerId: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/),
  publicAppId: z.string().max(200).optional(),
  placements: z.record(z.string().regex(/^[a-z0-9_-]{1,40}$/), z.string().max(200)).default({}),
  secretKey: z.string().min(12).max(4096),
  enabled: z.boolean().default(true),
});

export const Route = createFileRoute("/api/public/v1/admin/ads/providers")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const user = await requireUser(request);
      const body = await parseBody(request, schema);
      const fs = await Firestore.create();
      await requireAdminModule(fs, user, "ads");
      const encrypted = await encryptProviderCredential(body.secretKey, body.platform, body.providerId);
      const now = new Date().toISOString();
      await fs.transact(["adProviders/" + body.platform, "adProviderSecrets/" + body.platform], docs => ({
        result: undefined,
        writes: [
          {
            update: { name: fs.docName("adProviders/" + body.platform), fields: {
              platform: { stringValue: body.platform },
              providerId: { stringValue: body.providerId },
              publicAppId: body.publicAppId ? { stringValue: body.publicAppId } : { nullValue: null },
              placements: { mapValue: { fields: Object.fromEntries(Object.entries(body.placements).map(([key,value]) => [key,{stringValue:value}])) } },
              enabled: { booleanValue: body.enabled },
              updatedAt: { stringValue: now },
              updatedBy: { stringValue: user.uid },
            } },
          },
          {
            update: { name: fs.docName("adProviderSecrets/" + body.platform), fields: {
              providerId: { stringValue: body.providerId },
              credential: { mapValue: { fields: {
                algorithm: { stringValue: encrypted.algorithm },
                keyVersion: { stringValue: encrypted.keyVersion },
                nonce: { stringValue: encrypted.nonce },
                ciphertext: { stringValue: encrypted.ciphertext },
              } } },
              updatedAt: { stringValue: now },
            } },
          },
        ],
      }));
      await writeAuditLog(fs, {
        actorUid: user.uid, action: "ads.provider_configured", targetType: "adProvider",
        targetId: body.platform, reason: "Administrator configured the platform ad provider",
        metadata: { providerId: body.providerId, platform: body.platform, enabled: body.enabled },
      });
      return Response.json({ saved: true, platform: body.platform, providerId: body.providerId, enabled: body.enabled });
    } catch (error) { return errorBody(error); }
  } } },
});
