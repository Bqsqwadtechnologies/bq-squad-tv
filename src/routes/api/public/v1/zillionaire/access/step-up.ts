import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { requireViewer } from "@/lib/server/access";
import {
  checkLockout,
  createStepUpToken,
  getProgressiveDelayMs,
  recordFailure,
  clearFailure,
  verifyPasswordConstantTime,
} from "@/lib/server/zillionaire-access";
import { decryptTotpSecret, hashRecoveryCode, verifyTotp } from "@/lib/server/zillionaire-totp";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({
  password: z.string().min(1).max(256),
  code: z.string().regex(/^\d{6}$/),
  scope: z.enum([
    "wallet_adjust",
    "payment_reversal",
    "permanent_delete",
    "team_manage",
    "payout_settlement",
  ]),
  reason: z.string().trim().min(3).max(500),
});
export const Route = createFileRoute("/api/public/v1/zillionaire/access/step-up")({
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
            throw new ApiError(429, "ZILLIONAIRE_LOCKED_OUT", "Too many failed attempts.");
          if (!verifyPasswordConstantTime(body.password)) {
            const result = recordFailure(user.uid);
            await new Promise((resolve) =>
              setTimeout(resolve, getProgressiveDelayMs(result.attempts)),
            );
            throw new ApiError(
              result.locked ? 429 : 401,
              result.locked ? "ZILLIONAIRE_LOCKED_OUT" : "STEP_UP_INVALID",
              "Owner verification failed.",
            );
          }
          const mfa = await fs.getDoc(`zillionaireMfa/${user.uid}`);
          if (mfa?.["enabled"] !== true || typeof mfa["secret"] !== "string")
            throw new ApiError(
              423,
              "OWNER_MFA_REQUIRED",
              "Complete owner authenticator setup before continuing.",
            );
          const secret = decryptTotpSecret(mfa["secret"]);
          if (!verifyTotp(secret, body.code)) {
            const result = recordFailure(user.uid);
            await new Promise((resolve) =>
              setTimeout(resolve, getProgressiveDelayMs(result.attempts)),
            );
            throw new ApiError(
              result.locked ? 429 : 401,
              result.locked ? "ZILLIONAIRE_LOCKED_OUT" : "STEP_UP_INVALID",
              "Owner verification failed.",
            );
          }
          clearFailure(user.uid);
          const grant = createStepUpToken(user.uid, body.scope);
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "owner.step_up_granted",
            targetType: "owner_security",
            targetId: user.uid,
            reason: body.reason,
            metadata: { scope: body.scope, expiresAt: grant.expiresAt },
          });
          return Response.json({
            token: grant.token,
            scope: body.scope,
            expiresAt: grant.expiresAt,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
