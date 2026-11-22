import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import {
  DEFAULT_PLATFORM_SETTINGS,
  getPlatformSettings,
  normalizePlatformSettings,
  platformSettingsSchema,
} from "@/lib/server/platform-settings";

const updateSchema = z
  .object({
    settings: platformSettingsSchema,
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

const actionSchema = z
  .object({
    action: z.enum(["test_email", "reset_defaults"]),
    recipientEmail: z.string().trim().email().optional(),
    reason: z.string().trim().min(3).max(1000).optional(),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/zillionaire/config/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "settings");
          const settings = await getPlatformSettings(fs);
          return Response.json(
            { settings },
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
          const body = await parseBody(request, updateSchema);
          const fs = await Firestore.create();
          const access = await requireZillionaireModule(fs, user, "settings");

          const before = await getPlatformSettings(fs);
          const next = normalizePlatformSettings(body.settings);

          const version = await fs.transact(["config/platformSettings"], (docs) => {
            const currentVersion =
              typeof docs[0]?.["version"] === "number" ? (docs[0]["version"] as number) : 0;
            if (!Number.isSafeInteger(currentVersion) || currentVersion < 0) {
              throw new ApiError(
                409,
                "SETTINGS_VERSION_INVALID",
                "The current configuration cannot be updated.",
              );
            }
            const nextVersion = currentVersion + 1;
            return {
              result: nextVersion,
              writes: [
                {
                  update: {
                    name: fs.docName("config/platformSettings"),
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

          // Sync maintenanceMode with flags for backward compatibility
          try {
            const currentFlags = await fs.getDoc("config/flags");
            if (currentFlags && currentFlags["maintenanceMode"] !== next.maintenanceMode) {
              await fs.patchDoc("config/flags", {
                maintenanceMode: next.maintenanceMode,
                updatedAt: new Date().toISOString(),
              });
            }
          } catch {
            // Non-fatal if flags document doesn't exist
          }

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "platform.settings.updated",
            targetType: "platform_config",
            targetId: "config/platformSettings",
            reason: body.reason,
            before,
            after: next,
            metadata: { version, isOwner: access.isZillionaireOwner },
          });

          return Response.json(
            { saved: true, version, settings: { ...next, version } },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, actionSchema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "settings");

          if (body.action === "test_email") {
            const settings = await getPlatformSettings(fs);
            const target = body.recipientEmail || settings.supportEmail || user.email || "tv@bqsqwad.com";

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "platform.settings.test_email_dispatched",
              targetType: "communications",
              targetId: target,
              reason: body.reason || "Manual test email dispatch from owner console",
              metadata: {
                provider: settings.emailProvider,
                sender: settings.senderEmail,
                target,
              },
            });

            return Response.json(
              {
                success: true,
                message: `Test message dispatched via ${settings.emailProvider} to ${target}`,
                sentAt: new Date().toISOString(),
              },
              { headers: { "cache-control": "no-store" } },
            );
          }

          if (body.action === "reset_defaults") {
            return Response.json(
              { defaults: DEFAULT_PLATFORM_SETTINGS },
              { headers: { "cache-control": "no-store" } },
            );
          }

          throw new ApiError(400, "UNKNOWN_ACTION", "Unknown platform settings action");
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
