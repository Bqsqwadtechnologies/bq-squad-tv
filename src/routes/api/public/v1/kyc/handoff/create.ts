import { createFileRoute } from "@tanstack/react-router";
import crypto from "crypto";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { getKycDraft } from "@/lib/server/kyc/persistence";

function getHandoffSecret(): string {
  return process.env["KYC_VAULT_SIGNING_SECRET"] || "fallback-handoff-signing-secret-32-chars-min!";
}

export const Route = createFileRoute("/api/public/v1/kyc/handoff/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const draft = await getKycDraft(fs, user.uid);

          const expiresAt = Math.floor(Date.now() / 1000) + 900; // 15 minutes
          const payload = {
            uid: user.uid,
            hasDraft: Boolean(draft),
            exp: expiresAt,
          };

          const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
          const signature = crypto
            .createHmac("sha256", getHandoffSecret())
            .update(encoded)
            .digest("base64url");

          const token = `${encoded}.${signature}`;
          const origin = new URL(request.url).origin;
          const resumeUrl = `${origin}/producer?resumeKycToken=${token}`;

          return Response.json({
            token,
            resumeUrl,
            expiresAt,
            hasDraft: Boolean(draft),
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
