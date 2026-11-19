import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { hashEmailAddress } from "@/lib/server/email/otp";
import { sendSupportContactEmail } from "@/lib/server/email/brevo";

const schema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(254),
    subject: z.enum([
      "General enquiry",
      "Account help",
      "Wallet or payment",
      "Playback issue",
      "Producer support",
      "Rights or copyright",
    ]),
    message: z.string().trim().min(10).max(5000),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          const emailHash = await hashEmailAddress(body.email);
          await enforceRateLimit(fs, "public-contact:" + emailHash, {
            limit: 5,
            windowMs: 60 * 60_000,
          });
          await sendSupportContactEmail({
            name: body.name,
            replyEmail: body.email,
            subject: body.subject,
            message: body.message,
          });
          return Response.json(
            { sent: true },
            { status: 202, headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          if (error instanceof ApiError && error.code === "RATE_LIMITED") {
            return Response.json(
              { error: error.message },
              { status: 429, headers: { "retry-after": "3600", "cache-control": "no-store" } },
            );
          }
          return errorBody(error);
        }
      },
    },
  },
});
