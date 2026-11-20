import crypto from "crypto";
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
import { ApiError, encodeFields } from "@/lib/server/firebase-admin";
import { decryptTotpSecret, hashRecoveryCode, verifyTotp } from "@/lib/server/zillionaire-totp";
import { writeAuditLog } from "@/lib/server/audit";

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

          const body = (await request.json().catch(() => ({}))) as {
            password?: string;
            code?: string;
            recoveryCode?: string;
          };
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

          const mfa = await fs.getDoc(`zillionaireMfa/${user.uid}`);
          if (!mfa?.["enabled"] || typeof mfa["secret"] !== "string") {
            throw new ApiError(
              423,
              "OWNER_MFA_REQUIRED",
              "Complete authenticator setup before unlocking the dashboard.",
            );
          }
          let verifiedFactor = false;
          if (typeof body.code === "string") {
            verifiedFactor = verifyTotp(decryptTotpSecret(mfa["secret"]), body.code);
          } else if (typeof body.recoveryCode === "string") {
            const codeHash = hashRecoveryCode(body.recoveryCode);
            const path = `zillionaireMfa/${user.uid}`;
            verifiedFactor = await fs.transact([path], (docs) => {
              const current = docs[0];
              const hashes = Array.isArray(current?.["recoveryCodeHashes"])
                ? (current!["recoveryCodeHashes"] as string[])
                : [];
              const index = hashes.indexOf(codeHash);
              if (index < 0) return { result: false, writes: [] };
              const next = hashes.filter((_, i) => i !== index);
              return {
                result: true,
                writes: [
                  {
                    update: {
                      name: fs.docName(path),
                      fields: encodeFields({ ...current, recoveryCodeHashes: next }),
                    },
                  },
                ],
              };
            });
            if (verifiedFactor)
              await writeAuditLog(fs, {
                actorUid: user.uid,
                action: "owner.mfa_recovery_code_used",
                targetType: "owner_security",
                targetId: user.uid,
                reason: "One-time owner recovery code used",
                metadata: {
                  remainingCodes: Array.isArray(mfa["recoveryCodeHashes"])
                    ? Math.max(0, (mfa["recoveryCodeHashes"] as string[]).length - 1)
                    : 0,
                },
              });
          }
          if (!verifiedFactor) {
            const failure = recordFailure(user.uid);
            if (failure.locked)
              throw new ApiError(
                429,
                "ZILLIONAIRE_LOCKED_OUT",
                "Too many failed attempts. Dashboard locked for 15 minutes.",
              );
            await new Promise((resolve) =>
              setTimeout(resolve, getProgressiveDelayMs(failure.attempts)),
            );
            throw new ApiError(401, "MFA_CODE_INVALID", "Authenticator verification failed.");
          }

          // Successful unlock
          clearFailure(user.uid);
          const userAgent = request.headers.get("user-agent") || "Unknown browser";
          const forwarded =
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
          const deviceFingerprint = crypto.createHash("sha256").update(userAgent).digest("hex");
          const { token, expiresAt, sessionId } = createUnlockToken(user.uid, deviceFingerprint);
          const browser = userAgent.includes("Firefox")
            ? "Firefox"
            : userAgent.includes("Edg/")
              ? "Edge"
              : userAgent.includes("Chrome")
                ? "Chrome"
                : userAgent.includes("Safari")
                  ? "Safari"
                  : "Other";
          const deviceHash = crypto
            .createHash("sha256")
            .update(`${userAgent}|${forwarded}`)
            .digest("hex");
          await fs.setDoc(
            `zillionaireOwnerSessions/${user.uid}_${sessionId}`,
            {
              uid: user.uid,
              sessionId,
              browser,
              deviceHash,
              lastSeenAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              revoked: false,
            },
            { mustNotExist: true },
          );

          const isProd = process.env["NODE_ENV"] === "production";
          const cookieHeader = `${ZILLIONAIRE_UNLOCK_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${UNLOCK_TTL_SECONDS}; HttpOnly; SameSite=Lax${isProd ? "; Secure" : ""}`;

          return new Response(
            JSON.stringify({
              ok: true,
              token,
              expiresAt,
              sessionId,
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
