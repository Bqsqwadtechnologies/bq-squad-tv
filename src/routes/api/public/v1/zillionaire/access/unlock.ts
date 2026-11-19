import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { requireViewer } from "@/lib/server/access";
import {
  isAccessPasswordConfigured,
  checkLockout,
  recordFailure,
  clearFailure,
  getProgressiveDelayMs,
  verifyPasswordConstantTime,
  createUnlockToken,
  ZILLIONAIRE_UNLOCK_COOKIE,
  UNLOCK_TTL_SECONDS,
} from "@/lib/server/zillionaire-access";
import { recordAccessDenial } from "@/lib/server/access-denials";
import { ApiError } from "@/lib/server/firebase-admin";

export const Route = createFileRoute("/api/public/v1/zillionaire/access/unlock")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { user, fs, access } = await requireViewer(request);

          // 1. Must be verified owner
          if (!access.isZillionaireOwner) {
            await recordAccessDenial(fs, {
              actorUid: user.uid,
              actorRoleClass: "viewer",
              routePattern: "/api/public/v1/zillionaire/access/unlock",
              method: "POST",
              requiredRole: "owner",
              resourceKind: "zillionaire_dashboard",
              reasonCode: "ZILLIONAIRE_NON_OWNER_ATTEMPT",
            });
            throw new ApiError(403, "OWNER_REQUIRED", "Access restricted to owner.");
          }

          // 2. Secret must be configured
          if (!isAccessPasswordConfigured()) {
            throw new ApiError(
              423,
              "ZILLIONAIRE_PASSWORD_NOT_CONFIGURED",
              "ZILLIONAIRE_ACCESS_PASSWORD secret is not set.",
            );
          }

          // 3. Check lockout
          const lockout = checkLockout(user.uid);
          if (lockout.locked) {
            throw new ApiError(
              429,
              "ZILLIONAIRE_LOCKED_OUT",
              `Too many failed attempts. Locked for ${lockout.remainingLockSeconds} seconds.`,
            );
          }

          const body = (await request.json().catch(() => ({}))) as { password?: string };
          const password = typeof body.password === "string" ? body.password : "";

          const isMatch = verifyPasswordConstantTime(password);

          if (!isMatch) {
            const failResult = recordFailure(user.uid);
            const delayMs = getProgressiveDelayMs(failResult.attempts);

            await recordAccessDenial(fs, {
              actorUid: user.uid,
              actorRoleClass: "admin",
              routePattern: "/api/public/v1/zillionaire/access/unlock",
              method: "POST",
              requiredRole: "owner",
              resourceKind: "zillionaire_dashboard",
              reasonCode: failResult.locked
                ? "ZILLIONAIRE_LOCKED_OUT"
                : "ZILLIONAIRE_PASSWORD_FAILED",
            });

            if (delayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }

            if (failResult.locked) {
              throw new ApiError(
                429,
                "ZILLIONAIRE_LOCKED_OUT",
                "Too many failed attempts. Dashboard locked for 15 minutes.",
              );
            }

            throw new ApiError(
              401,
              "INVALID_PASSWORD",
              `Incorrect access password. ${failResult.remainingAttempts} attempt(s) remaining.`,
            );
          }

          // Successful unlock
          clearFailure(user.uid);
          const { token, expiresAt } = createUnlockToken(user.uid);

          const isProd = process.env["NODE_ENV"] === "production";
          const cookieHeader = `${ZILLIONAIRE_UNLOCK_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${UNLOCK_TTL_SECONDS}; HttpOnly; SameSite=Lax${isProd ? "; Secure" : ""}`;

          return new Response(
            JSON.stringify({
              ok: true,
              token,
              expiresAt,
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
                "set-cookie": cookieHeader,
              },
            },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
