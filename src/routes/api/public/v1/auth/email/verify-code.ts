import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  ApiError,
  Firestore,
  encodeFields,
  type FirestoreWrite,
} from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import {
  EMAIL_OTP_MAX_ATTEMPTS,
  equalOtpHashes,
  hashEmailOtp,
  normalizeEmail,
} from "@/lib/server/email/otp";

const schema = z.object({ code: z.string().regex(/^\d{6}$/) });

export const Route = createFileRoute("/api/public/v1/auth/email/verify-code")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          if (!user.email)
            throw new ApiError(400, "EMAIL_REQUIRED", "An email address is required.");
          if (user.emailVerified) return Response.json({ verified: true, alreadyVerified: true });
          const { code } = await parseBody(request, schema);
          const fs = await Firestore.create();
          const challengePath = "emailOtpChallenges/" + user.uid;
          const profilePath = "users/" + user.uid;
          const now = Date.now();

          const outcome = await fs.transact(
            [challengePath, profilePath],
            async ([challenge, profile]) => {
              if (
                !challenge ||
                challenge["purpose"] !== "verify_email" ||
                challenge["uid"] !== user.uid ||
                challenge["email"] !== normalizeEmail(user.email ?? "")
              ) {
                return { result: "missing" as const, writes: [] };
              }
              const expiresAt = challenge["expiresAt"];
              if (typeof expiresAt !== "number" || expiresAt <= now) {
                return {
                  result: "expired" as const,
                  writes: [{ delete: fs.docName(challengePath) }],
                };
              }
              const attempts =
                typeof challenge["attempts"] === "number" ? (challenge["attempts"] as number) : 0;
              if (attempts >= EMAIL_OTP_MAX_ATTEMPTS) {
                return {
                  result: "locked" as const,
                  writes: [{ delete: fs.docName(challengePath) }],
                };
              }
              const salt =
                typeof challenge["salt"] === "string" ? (challenge["salt"] as string) : "";
              const storedHash =
                typeof challenge["codeHash"] === "string" ? (challenge["codeHash"] as string) : "";
              const suppliedHash = await hashEmailOtp(user.uid, "verify_email", salt, code);
              if (!salt || !storedHash || !equalOtpHashes(storedHash, suppliedHash)) {
                const nextAttempts = attempts + 1;
                const writes: FirestoreWrite[] =
                  nextAttempts >= EMAIL_OTP_MAX_ATTEMPTS
                    ? [{ delete: fs.docName(challengePath) }]
                    : [
                        {
                          update: {
                            name: fs.docName(challengePath),
                            fields: encodeFields({ attempts: nextAttempts }),
                          },
                          updateMask: { fieldPaths: ["attempts"] },
                        },
                      ];
                return {
                  result:
                    nextAttempts >= EMAIL_OTP_MAX_ATTEMPTS
                      ? ("locked" as const)
                      : ("invalid" as const),
                  writes,
                };
              }

              const nextProfile = {
                ...(profile ?? {}),
                email: user.email,
                appEmailVerified: true,
                appEmailVerifiedAt: new Date(now).toISOString(),
              };
              return {
                result: "verified" as const,
                writes: [
                  { update: { name: fs.docName(profilePath), fields: encodeFields(nextProfile) } },
                  { delete: fs.docName(challengePath) },
                ],
              };
            },
          );

          if (outcome === "missing")
            throw new ApiError(404, "OTP_NOT_FOUND", "Request a new verification code.");
          if (outcome === "expired")
            throw new ApiError(410, "OTP_EXPIRED", "That code has expired. Request a new one.");
          if (outcome === "locked")
            throw new ApiError(
              429,
              "OTP_ATTEMPTS_EXCEEDED",
              "Too many incorrect codes. Request a new code.",
            );
          if (outcome === "invalid")
            throw new ApiError(400, "OTP_INVALID", "That verification code is incorrect.");
          return Response.json({ verified: true });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
