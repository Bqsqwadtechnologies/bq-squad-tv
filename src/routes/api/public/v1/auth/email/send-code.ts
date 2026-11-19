import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { sendVerificationCodeEmail } from "@/lib/server/email/brevo";
import {
  EMAIL_OTP_TTL_MS,
  generateEmailOtp,
  hashEmailAddress,
  hashEmailOtp,
  normalizeEmail,
} from "@/lib/server/email/otp";

export const Route = createFileRoute("/api/public/v1/auth/email/send-code")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          if (!user.email)
            throw new ApiError(400, "EMAIL_REQUIRED", "An email address is required.");
          if (user.emailVerified) return Response.json({ sent: false, alreadyVerified: true });

          const email = normalizeEmail(user.email);
          const fs = await Firestore.create();
          await enforceRateLimit(fs, "email-otp-user:" + user.uid, {
            limit: 3,
            windowMs: 15 * 60_000,
          });
          const emailRateLimitKey = await hashEmailAddress(email);
          await enforceRateLimit(fs, "email-otp-address:" + emailRateLimitKey, {
            limit: 5,
            windowMs: 60 * 60_000,
          });

          const { code, salt } = generateEmailOtp();
          const codeHash = await hashEmailOtp(user.uid, "verify_email", salt, code);
          const challengePath = "emailOtpChallenges/" + user.uid;
          const now = Date.now();
          await fs.setDoc(challengePath, {
            uid: user.uid,
            email,
            purpose: "verify_email",
            salt,
            codeHash,
            attempts: 0,
            createdAt: new Date(now).toISOString(),
            expiresAt: now + EMAIL_OTP_TTL_MS,
          });

          try {
            await sendVerificationCodeEmail({
              to: email,
              code,
              purpose: "verify_email",
              expiresInMinutes: 10,
            });
          } catch (error) {
            await fs.deleteDoc(challengePath).catch(() => undefined);
            throw error;
          }
          return Response.json({ sent: true, expiresInSeconds: EMAIL_OTP_TTL_MS / 1000 });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
