import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { DEFAULT_FLAGS, normalizePlatformFlags } from "@/lib/server/flags";

const schema = z
  .object({
    flags: z
      .object({
        producerChannelCreation: z.boolean(),
        waitingRoom: z.boolean(),
        maintenanceMode: z.boolean(),
        signupsOpen: z.boolean(),
        commentsOpen: z.boolean(),
        newStreamGrants: z.boolean(),
        adultChannels: z.boolean(),
        liveTv: z.boolean(),
        providerConsole: z.boolean(),
        hlsEncryption: z.boolean(),
        forYou: z.boolean(),
        reminders: z.boolean(),
        modalSpendGuard: z.boolean(),
        deliveryProxyFallback: z.boolean().optional(),
        followedProducerReleaseNotifications: z.boolean().optional(),
      })
      .strict(),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/zillionaire/config/flags")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const access = await requireZillionaireModule(fs, user, "system");
          if (!access.isZillionaireOwner)
            throw new ApiError(403, "OWNER_ONLY", "This action is not available for this account.");
          return Response.json(
            { flags: normalizePlatformFlags(await fs.getDoc("config/flags")) },
            {
              headers: { "cache-control": "no-store" },
            },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
      PUT: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          const access = await requireZillionaireModule(fs, user, "system");
          if (!access.isZillionaireOwner)
            throw new ApiError(403, "OWNER_ONLY", "This action is not available for this account.");
          const before = await fs.getDoc("config/flags");
          const next = { ...DEFAULT_FLAGS, ...body.flags };
          const version = await fs.transact(["config/flags"], (docs) => {
            const currentVersion =
              typeof docs[0]?.["version"] === "number" ? (docs[0]["version"] as number) : 0;
            if (!Number.isSafeInteger(currentVersion) || currentVersion < 0) {
              throw new ApiError(
                409,
                "FLAGS_VERSION_INVALID",
                "The current configuration cannot be updated.",
              );
            }
            const nextVersion = currentVersion + 1;
            return {
              result: nextVersion,
              writes: [
                {
                  update: {
                    name: fs.docName("config/flags"),
                    fields: encodeFields({
                      ...next,
                      version: nextVersion,
                      updatedAt: new Date().toISOString(),
                      updatedBy: user.uid,
                    }),
                  },
                },
              ],
            };
          });
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "platform.flags.updated",
            targetType: "platform_config",
            targetId: "config/flags",
            reason: body.reason,
            before: normalizePlatformFlags(before),
            after: next,
            metadata: { version },
          });
          return Response.json(
            { saved: true, version, flags: next },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
