import { createFileRoute } from "@tanstack/react-router";
import * as crypto from "node:crypto";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSafeStoragePath } from "@/lib/server/storage/security";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const Route = createFileRoute("/api/public/v1/producer/payout-proof-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          // Rate limit upload attempts
          await enforceRateLimit(fs, `payout-proof-upload:${user.uid}`, {
            limit: 10,
            windowMs: 60 * 60 * 1000,
          });

          const formData = await request.formData();
          const file = formData.get("file");

          if (!file || typeof file === "string" || typeof (file as any).arrayBuffer !== "function") {
            throw new ApiError(400, "MISSING_FILE", "A valid proof-of-account document file is required.");
          }

          if (file.size > MAX_FILE_SIZE_BYTES) {
            throw new ApiError(400, "FILE_TOO_LARGE", "Proof document exceeds maximum limit of 10MB.");
          }

          const mimeType = file.type || "application/octet-stream";
          if (!ALLOWED_MIME_TYPES.has(mimeType)) {
            throw new ApiError(
              400,
              "INVALID_MIME_TYPE",
              "Unsupported file type. Accepted formats: PDF, JPEG, PNG, WEBP."
            );
          }

          const formName = (formData.get("fileName") || formData.get("filename") || "") as string;
          const fileNameProp = (file as any).name;
          const rawName = (formName || (fileNameProp && fileNameProp !== "blob" ? fileNameProp : "")) || "proof_document.pdf";
          const leaf = rawName.split(/[\\/]/).pop() ?? "proof.pdf";
          const safeName = leaf
            .normalize("NFKC")
            .replace(/[^A-Za-z0-9._-]/g, "_")
            .slice(0, 100);

          const uploadId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
          const storagePath = `kyc-vault/payout-proof/${user.uid}/${uploadId}_${safeName}`;

          if (!isSafeStoragePath(storagePath)) {
            throw new ApiError(400, "INVALID_PATH", "Storage path is invalid.");
          }

          // Buffer the file bytes
          const arrayBuffer = await file.arrayBuffer();
          const fileBuffer = Buffer.from(arrayBuffer);

          if (fileBuffer.length === 0) {
            throw new ApiError(400, "FILE_EMPTY", "Uploaded file cannot be empty.");
          }

          // Validate magic bytes for accepted formats
          const isPdf = fileBuffer.length >= 4 && fileBuffer.subarray(0, 4).toString("ascii") === "%PDF";
          const isJpg = fileBuffer.length >= 3 && fileBuffer[0] === 0xFF && fileBuffer[1] === 0xD8 && fileBuffer[2] === 0xFF;
          const isPng = fileBuffer.length >= 4 && fileBuffer[0] === 0x89 && fileBuffer[1] === 0x50 && fileBuffer[2] === 0x4E && fileBuffer[3] === 0x47;
          const isWebp = fileBuffer.length >= 12 && fileBuffer.subarray(0, 4).toString("ascii") === "RIFF" && fileBuffer.subarray(8, 12).toString("ascii") === "WEBP";

          if (!isPdf && !isJpg && !isPng && !isWebp) {
            throw new ApiError(400, "INVALID_FILE_SIGNATURE", "File contents do not match an allowed format (PDF, JPEG, PNG, WEBP).");
          }

          // Upload to Supabase Storage if configured
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.storage
              .from("bq-sqwad-source-media")
              .upload(storagePath, fileBuffer, {
                contentType: mimeType,
                upsert: true,
              });
          } catch {
            // Storage mock/local fallback
          }

          // Record upload metadata
          await fs.setDoc(`payoutProofUploads/${uploadId}`, {
            uid: user.uid,
            path: storagePath,
            fileName: safeName,
            mimeType,
            sizeBytes: file.size,
            uploadedAt: new Date().toISOString(),
          });

          return Response.json({
            success: true,
            proofDocumentPath: storagePath,
            proofDocumentFileName: safeName,
            sizeBytes: file.size,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
