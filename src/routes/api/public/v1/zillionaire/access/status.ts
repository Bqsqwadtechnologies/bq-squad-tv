import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { requireViewer } from "@/lib/server/access";
import {
  isAccessPasswordConfigured,
  checkLockout,
  extractUnlockToken,
  parseAndVerifyUnlockToken,
} from "@/lib/server/zillionaire-access";
import { ApiError } from "@/lib/server/firebase-admin";

export const Route = createFileRoute("/api/public/v1/zillionaire/access/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { user, fs, access } = await requireViewer(request);

          if (!access.isZillionaireOwner && access.zillionaireModules.length === 0) {
            throw new ApiError(403, "ACCESS_DENIED", "Access denied.");
          }

          // Team members with delegated modules don't use the owner access password
          if (!access.isZillionaireOwner) {
            return Response.json({
              isOwner: false,
              configured: true,
              unlocked: true,
              lockedOut: false,
              delegated: true,
            });
          }

          const configured = isAccessPasswordConfigured();
          const mfa = await fs.getDoc(`zillionaireMfa/${user.uid}`);
          const mfaEnabled = mfa?.["enabled"] === true;
          if (!configured) {
            return Response.json({
              isOwner: true,
              configured: false,
              mfaEnabled,
              unlocked: false,
              lockedOut: false,
              legacySecretWarning: access.legacySecretWarning === true,
            });
          }

          const lockout = checkLockout(user.uid);
          if (lockout.locked) {
            return Response.json({
              isOwner: true,
              configured: true,
              mfaEnabled,
              unlocked: false,
              lockedOut: true,
              remainingLockSeconds: lockout.remainingLockSeconds,
              legacySecretWarning: access.legacySecretWarning === true,
            });
          }

          const token = extractUnlockToken(request);
          const verifyResult = parseAndVerifyUnlockToken(token, user.uid);

          return Response.json({
            isOwner: true,
            configured: true,
            mfaEnabled,
            unlocked: verifyResult.valid && mfaEnabled,
            expiresAt: verifyResult.expiresAt,
            lockedOut: false,
            legacySecretWarning: access.legacySecretWarning === true,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
