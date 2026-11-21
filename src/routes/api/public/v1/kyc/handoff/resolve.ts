import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import crypto from "crypto";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { getKycDraft } from "@/lib/server/kyc/persistence";

const resolveSchema = z.object({
  token: z.string().trim().min(10),
});

function getHandoffSecret(): string {
  return process.env["KYC_VAULT_SIGNING_SECRET"] || "fallback-handoff-signing-secret-32-chars-min!";
}

export const Route = createFileRoute("/api/public/v1/kyc/handoff/resolve")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await parseBody(request, resolveSchema);
          const parts = body.token.split(".");
          if (parts.length !== 2) {
            return Response.json({ error: "Invalid handoff token format." }, { status: 400 });
          }

          const [encoded, signature] = parts;
          const expectedSig = crypto
            .createHmac("sha256", getHandoffSecret())
            .update(encoded)
            .digest("base64url");

          const sigBuf = Buffer.from(signature);
          const expBuf = Buffer.from(expectedSig);

          if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            return Response.json({ error: "Invalid token signature." }, { status: 401 });
          }

          let payload: any;
          try {
            payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
          } catch {
            return Response.json({ error: "Corrupted token payload." }, { status: 400 });
          }

          if (typeof payload.exp !== "number" || Date.now() / 1000 > payload.exp) {
            return Response.json(
              { error: "Handoff session has expired. Please generate a new code." },
              { status: 410 }
            );
          }

          const fs = await Firestore.create();
          const draft = await getKycDraft(fs, payload.uid);

          return Response.json({
            valid: true,
            uid: payload.uid,
            draft: draft || null,
            expiresAt: payload.exp,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
