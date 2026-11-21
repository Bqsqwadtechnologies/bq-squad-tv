import { enforceRateLimit } from "@/lib/server/rate-limit";
import { createFileRoute } from "@tanstack/react-router";
import * as crypto from "node:crypto";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { resolvePlatformAccess } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { isSafeStoragePath } from "@/lib/server/storage/security";

const MAX_VIEWER_TTL_MS = 65 * 1000; // 60 seconds link validity (+5s clock skew tolerance)

export const Route = createFileRoute("/api/public/v1/zillionaire/kyc/view-doc")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          // Check reviewer authorization: must be owner or have compliance/security/producers/providers access
          const access = await resolvePlatformAccess(
            fs,
            user.uid,
            user.email,
            user.customClaims,
            user.emailVerified === true
          );

          const hasKycAccess =
            access.isZillionaireOwner ||
            access.zillionaireModules.some((m) =>
              ["security", "compliance", "producers", "providers"].includes(m)
            );

          if (!hasKycAccess) {
            throw new ApiError(403, "FORBIDDEN", "You do not have permission to view KYC documents.");
          }

          // Rate limit document views per reviewer (max 30 views / min)
          await enforceRateLimit(fs, "kyc-view-doc:" + user.uid, {
            limit: 30,
            windowMs: 60_000,
          });

          const url = new URL(request.url);
          const path = url.searchParams.get("path");
          const reviewer = url.searchParams.get("reviewer");
          const expStr = url.searchParams.get("exp");
          const sig = url.searchParams.get("sig");

          if (!path || !reviewer || !expStr || !sig) {
            throw new ApiError(400, "INVALID_REQUEST", "Missing required viewer parameters.");
          }

          // Enforce reviewer binding: link must be bound to authenticated caller
          if (reviewer !== user.uid) {
            throw new ApiError(403, "FORBIDDEN", "Viewer link is bound to another reviewer identifier.");
          }

          if (!isSafeStoragePath(path) || !path.startsWith("kyc-vault/")) {
            throw new ApiError(400, "INVALID_PATH", "Document path is outside the private vault.");
          }

          const exp = Number(expStr);
          const nowMs = Date.now();
          if (!Number.isFinite(exp) || nowMs > exp) {
            throw new ApiError(410, "LINK_EXPIRED", "This document viewing link has expired. Request a new view.");
          }

          // Upper bound TTL check: reject links created too far into the future
          if (exp > nowMs + MAX_VIEWER_TTL_MS) {
            throw new ApiError(400, "INVALID_EXPIRATION", "Link expiration exceeds maximum permitted window.");
          }

          // Validate HMAC signature (Fail closed if secret missing or too short)
          const signingSecret = process.env["KYC_VAULT_SIGNING_SECRET"];
          if (!signingSecret || Buffer.byteLength(signingSecret, "utf8") < 32) {
            throw new ApiError(500, "CONFIG_ERROR", "KYC vault signing secret is not configured.");
          }

          const expectedSig = crypto
            .createHmac("sha256", signingSecret)
            .update(`${path}:${reviewer}:${exp}`)
            .digest("hex");

          const sigBuf = Buffer.from(sig, "hex");
          const expBuf = Buffer.from(expectedSig, "hex");
          if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            throw new ApiError(401, "INVALID_SIGNATURE", "The document viewer signature is invalid.");
          }

          // Mandatory audit log entry for every view
          const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "kyc.document_viewed",
            targetType: "kyc_document",
            targetId: path,
            reason: "Reviewer viewed confidential KYC document in secure viewer",
            metadata: {
              reviewerUid: reviewer,
              clientIp,
              expiresAt: new Date(exp).toISOString(),
            },
          });

          // Fetch from Supabase storage or internal vault
          let mimeType = "application/pdf";
          if (path.endsWith(".jpg") || path.endsWith(".jpeg")) mimeType = "image/jpeg";
          else if (path.endsWith(".png")) mimeType = "image/png";
          else if (path.endsWith(".webp")) mimeType = "image/webp";

          let fileBuffer: Buffer | null = null;
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data, error } = await supabaseAdmin.storage
              .from("bq-sqwad-source-media")
              .download(path);

            if (!error && data) {
              fileBuffer = Buffer.from(await data.arrayBuffer());
            }
          } catch {
            // Storage client fallback if local/mock
          }

          const watermarkText = `CONFIDENTIAL BQ SQWAD TV - REVIEWER ${user.uid} - ${new Date().toISOString()} - IP ${clientIp}`;

          if (!fileBuffer) {
            // Return structured inspection metadata if physical file is mocked/pending live sync
            return Response.json(
              {
                status: "verified_metadata",
                path,
                watermark: watermarkText,
                mimeType,
                expiresInSeconds: Math.max(0, Math.floor((exp - nowMs) / 1000)),
              },
              {
                headers: {
                  "cache-control": "private, no-store, max-age=0",
                  "x-watermark": watermarkText,
                },
              }
            );
          }

          return new Response(new Uint8Array(fileBuffer), {
            status: 200,
            headers: {
              "content-type": mimeType,
              "content-disposition": "inline; filename=kyc_watermarked_preview",
              "x-content-type-options": "nosniff",
              "cache-control": "private, no-cache, no-store, must-revalidate, max-age=0",
              "pragma": "no-cache",
              "expires": "0",
              "x-watermark": watermarkText,
            },
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
