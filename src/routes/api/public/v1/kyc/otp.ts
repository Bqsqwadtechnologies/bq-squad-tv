import { createFileRoute } from "@tanstack/react-router";
import * as crypto from "node:crypto";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { writeAuditLog } from "@/lib/server/audit";
import { sendKycOtpCode } from "@/lib/server/kyc/sms-brevo";

const otpRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("send_otp"),
    phone: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, "Must be valid international E.164 phone number"),
    preferEmailFallback: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("verify_otp"),
    phone: z.string().trim().regex(/^\+[1-9]\d{6,14}$/),
    code: z.string().trim().regex(/^\d{6}$/, "Code must be 6 digits"),
  }),
  z.object({
    action: z.literal("status"),
  }),
]);

function hashPhone(phone: string): string {
  return crypto.createHash("sha256").update(phone.trim()).digest("hex");
}

export const Route = createFileRoute("/api/public/v1/kyc/otp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          const userDoc = await fs.getDoc(`users/${user.uid}`);
          const isVerified = Boolean(userDoc?.["phoneVerified"]);
          const verifiedPhone = (userDoc?.["phone"] as string) || null;

          return Response.json({
            phoneVerified: isVerified,
            phone: verifiedPhone,
            phoneVerifiedAt: userDoc?.["phoneVerifiedAt"] || null,
          });
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const body = await parseBody(request, otpRequestSchema);

          if (body.action === "status") {
            const userDoc = await fs.getDoc(`users/${user.uid}`);
            return Response.json({
              phoneVerified: Boolean(userDoc?.["phoneVerified"]),
              phone: userDoc?.["phone"] || null,
            });
          }

          const phone = body.phone;
          const phoneHash = hashPhone(phone);
          const existing = await fs.getDoc(`kycPhoneVerifications/${phoneHash}`);
          const nowMs = Date.now();

          // Check if locked to another account
          if (existing?.["lockedUid"] && existing["lockedUid"] !== user.uid) {
            throw new ApiError(
              409,
              "PHONE_ALREADY_REGISTERED",
              "This phone number is already verified on another account. Contact support to release it."
            );
          }

          if (body.action === "send_otp") {
            // Rate limiting: 5 sends per hour per user and per phone
            await enforceRateLimit(fs, `kyc-otp-user:${user.uid}`, {
              limit: 5,
              windowMs: 60 * 60 * 1000,
            });
            await enforceRateLimit(fs, `kyc-otp-phone:${phoneHash}`, {
              limit: 5,
              windowMs: 60 * 60 * 1000,
            });

            // Resend delay check: 60s base with backoff
            const resendCount = (existing?.["resendCount"] as number) || 0;
            const lastSentAt = (existing?.["lastSentAt"] as number) || 0;
            const minDelaySeconds = Math.min(300, 60 * Math.pow(1.5, Math.min(resendCount, 4)));

            if (lastSentAt && nowMs - lastSentAt < minDelaySeconds * 1000) {
              const remainingSeconds = Math.ceil((minDelaySeconds * 1000 - (nowMs - lastSentAt)) / 1000);
              throw new ApiError(
                429,
                "RESEND_TOO_SOON",
                `Please wait ${remainingSeconds} seconds before requesting a new code.`
              );
            }

            // Generate cryptographically random 6-digit code
            const code = crypto.randomInt(100000, 1000000).toString();
            const salt = crypto.randomBytes(16).toString("hex");
            const codeHash = crypto.createHash("sha256").update(code + salt).digest("hex");

            // Dispatch via Brevo SMS (with email fallback if requested/needed)
            const sendResult = await sendKycOtpCode({
              recipientPhone: phone,
              code,
              userEmail: user.email || undefined,
            });

            // Persist record
            await fs.setDoc(`kycPhoneVerifications/${phoneHash}`, {
              phoneHash,
              lockedUid: user.uid,
              codeHash,
              salt,
              attemptsRemaining: 5,
              codeExpiresAt: nowMs + 10 * 60 * 1000, // 10 minutes
              lastSentAt: nowMs,
              resendCount: resendCount + 1,
              abuseFlag: false,
              verified: false,
            });

            return Response.json({
              ok: true,
              method: sendResult.method,
              fallbackUsed: sendResult.fallbackUsed,
              expiresInSeconds: 600,
              resendDelaySeconds: Math.ceil(minDelaySeconds),
            });
          }

          if (body.action === "verify_otp") {
            if (!existing) {
              throw new ApiError(400, "NO_ACTIVE_CODE", "No active verification code found for this phone number.");
            }

            if (existing["lockedUid"] && existing["lockedUid"] !== user.uid) {
              throw new ApiError(403, "FORBIDDEN", "This verification request belongs to another account.");
            }

            if (existing["verified"] === true) {
              throw new ApiError(400, "ALREADY_VERIFIED", "This phone number is already verified.");
            }

            if (!existing["codeHash"]) {
              throw new ApiError(400, "NO_ACTIVE_CODE", "No active verification code found. Request a new code.");
            }

            const expiresAt = (existing["codeExpiresAt"] as number) || 0;
            if (nowMs > expiresAt) {
              throw new ApiError(410, "CODE_EXPIRED", "Verification code has expired. Request a new code.");
            }

            const attemptsRemaining = (existing["attemptsRemaining"] as number) ?? 5;
            const abuseFlag = Boolean(existing["abuseFlag"]);

            if (attemptsRemaining <= 0 || abuseFlag) {
              throw new ApiError(
                403,
                "TOO_MANY_FAILED_ATTEMPTS",
                "Too many failed verification attempts. This code has been invalidated for security. Please request a new code."
              );
            }

            // Constant-time compare
            const salt = (existing["salt"] as string) || "";
            const expectedHash = (existing["codeHash"] as string) || "";
            const candidateHash = crypto.createHash("sha256").update(body.code + salt).digest("hex");

            const candBuf = Buffer.from(candidateHash, "hex");
            const expBuf = Buffer.from(expectedHash, "hex");

            const isMatch = candBuf.length === expBuf.length && crypto.timingSafeEqual(candBuf, expBuf);

            if (!isMatch) {
              const newRemaining = attemptsRemaining - 1;
              await fs.patchDoc(`kycPhoneVerifications/${phoneHash}`, {
                attemptsRemaining: newRemaining,
                abuseFlag: newRemaining <= 0,
              });

              if (newRemaining <= 0) {
                await writeAuditLog(fs, {
                  actorUid: user.uid,
                  action: "kyc.phone_otp_abuse_flagged",
                  targetType: "user",
                  targetId: user.uid,
                  reason: "Maximum failed phone OTP attempts exceeded; verification invalidated",
                });
                throw new ApiError(
                  403,
                  "TOO_MANY_FAILED_ATTEMPTS",
                  "Maximum failed verification attempts reached. Code has been invalidated."
                );
              }

              throw new ApiError(
                400,
                "INVALID_CODE",
                `Invalid verification code. You have ${newRemaining} attempt${newRemaining === 1 ? "" : "s"} remaining.`
              );
            }

            // Success: mark verified, clear secret codeHash & salt to prevent replay
            const now = new Date().toISOString();
            await fs.patchDoc(`kycPhoneVerifications/${phoneHash}`, {
              verified: true,
              verifiedAt: now,
              attemptsRemaining: 0,
              codeHash: null,
              salt: null,
              codeExpiresAt: 0,
            });

            await fs.patchDoc(`users/${user.uid}`, {
              phone,
              phoneVerified: true,
              phoneVerifiedAt: now,
            });

            await fs.patchDoc(`producers/${user.uid}`, {
              phone,
              phoneVerified: true,
              phoneVerifiedAt: now,
            }).catch(() => {});

            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "kyc.phone_verified",
              targetType: "user",
              targetId: user.uid,
              reason: "Phone number verified via Brevo OTP verification",
              metadata: {
                phoneMasked: phone.slice(0, 3) + "******" + phone.slice(-3),
              },
            });

            return Response.json({
              ok: true,
              verified: true,
              verifiedAt: now,
            });
          }

          throw new ApiError(400, "BAD_REQUEST", "Unsupported action.");
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
