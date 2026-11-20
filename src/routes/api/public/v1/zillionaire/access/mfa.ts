import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { requireViewer } from "@/lib/server/access";
import {
  checkLockout,
  clearFailure,
  getProgressiveDelayMs,
  recordFailure,
  verifyPasswordConstantTime,
} from "@/lib/server/zillionaire-access";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  isTotpEncryptionConfigured,
  verifyTotp,
} from "@/lib/server/zillionaire-totp";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ENROLL"),
    password: z.string().min(1),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({
    action: z.literal("CONFIRM"),
    code: z.string().regex(/^\d{6}$/),
    reason: z.string().trim().min(3).max(500),
  }),
]);
export const Route = createFileRoute("/api/public/v1/zillionaire/access/mfa")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { user, fs, access } = await requireViewer(request);
          if (!access.isZillionaireOwner || user.emailVerified !== true)
            throw new ApiError(403, "OWNER_REQUIRED", "Verified owner access required.");
          const body = await parseBody(request, schema);
          const lockout = checkLockout(user.uid);
          if (lockout.locked)
            throw new ApiError(
              429,
              "ZILLIONAIRE_LOCKED_OUT",
              "Too many failed attempts. Dashboard locked for 15 minutes.",
            );
          if (!isTotpEncryptionConfigured())
            throw new ApiError(
              503,
              "OWNER_MFA_KEY_NOT_CONFIGURED",
              "Owner authenticator encryption is not configured. Contact the platform administrator.",
            );
          const live = await fs.getDoc(`zillionaireMfa/${user.uid}`);
          if (live?.["enabled"] === true)
            throw new ApiError(
              409,
              "MFA_ALREADY_ENABLED",
              "Authenticator verification is already enabled.",
            );
          if (body.action === "ENROLL") {
            if (!verifyPasswordConstantTime(body.password)) {
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
              throw new ApiError(401, "INVALID_PASSWORD", "Owner verification failed.");
            }
            clearFailure(user.uid);
            const secret = generateTotpSecret();
            await fs.setDoc(`zillionaireMfaPending/${user.uid}`, {
              secret: encryptTotpSecret(secret),
              expiresAt: Date.now() + 10 * 60_000,
              createdAt: new Date().toISOString(),
            });
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "owner.mfa_enrollment_started",
              targetType: "owner_security",
              targetId: user.uid,
              reason: body.reason,
            });
            const label = encodeURIComponent(user.email || "BQ SQWAD TV Owner");
            return Response.json({
              secret,
              otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=BQ%20SQWAD%20TV&algorithm=SHA1&digits=6&period=30`,
            });
          }
          const pending = await fs.getDoc(`zillionaireMfaPending/${user.uid}`);
          if (!pending || Number(pending["expiresAt"]) < Date.now())
            throw new ApiError(400, "MFA_ENROLLMENT_EXPIRED", "Start authenticator setup again.");
          const secret = decryptTotpSecret(String(pending["secret"]));
          if (!verifyTotp(secret, body.code)) {
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
            throw new ApiError(
              401,
              "MFA_CODE_INVALID",
              "Authenticator code could not be verified.",
            );
          }
          const recoveryCodes = generateRecoveryCodes();
          const mfaPath = `zillionaireMfa/${user.uid}`;
          const pendingPath = `zillionaireMfaPending/${user.uid}`;
          const enabled = await fs.transact([mfaPath, pendingPath], (docs) => {
            const [current, currentPending] = docs;
            if (
              current?.["enabled"] === true ||
              !currentPending ||
              Number(currentPending["expiresAt"]) < Date.now()
            )
              return { result: false, writes: [] };
            return {
              result: true,
              writes: [
                {
                  update: {
                    name: fs.docName(mfaPath),
                    fields: encodeFields({
                      enabled: true,
                      secret: encryptTotpSecret(secret),
                      recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
                      enrolledAt: new Date().toISOString(),
                    }),
                  },
                },
                { delete: fs.docName(pendingPath) },
              ],
            };
          });
          if (!enabled)
            throw new ApiError(
              409,
              "MFA_ENROLLMENT_EXPIRED",
              "Authenticator setup expired or was already completed. Start setup again.",
            );
          clearFailure(user.uid);
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "owner.mfa_enabled",
            targetType: "owner_security",
            targetId: user.uid,
            reason: body.reason,
            after: { enabled: true, recoveryCodeCount: recoveryCodes.length },
          });
          return Response.json({ enabled: true, recoveryCodes });
        } catch (e) {
          return errorBody(e);
        }
      },
    },
  },
});
