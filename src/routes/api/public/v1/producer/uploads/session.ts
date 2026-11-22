import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requirePlatformRole } from "@/lib/server/roles";
import { requireApprovedKyc } from "@/lib/server/access";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSafeStoragePath } from "@/lib/server/storage/security";

const schema = z.object({
  filename: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().positive().max(5_000_000_000),
  mediaKind: z.enum(["video", "poster", "backdrop", "trailer", "subtitles", "evidence"]),
  contentType: z.string().trim().min(1).max(100).optional(),
});

export const Route = createFileRoute("/api/public/v1/producer/uploads/session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, user, "producer");
          await requireApprovedKyc(fs, user.uid, "producer");

          await enforceRateLimit(fs, "producer-upload-session:" + user.uid, {
            limit: 30,
            windowMs: 60 * 60_000,
          });

          const body = await parseBody(request, schema);
          const leaf = body.filename.split(/[\\/]/).pop() ?? "";
          const sanitizedFilename = leaf
            .normalize("NFKC")
            .replace(/[^A-Za-z0-9._-]/g, "_")
            .slice(0, 120);

          if (!sanitizedFilename || sanitizedFilename === "." || sanitizedFilename === "..") {
            throw new ApiError(400, "FILENAME_INVALID", "The filename is invalid.");
          }

          const uploadSessionId = crypto.randomUUID().replace(/-/g, "");
          const storagePath = `producers/${user.uid}/uploads/${uploadSessionId}/${sanitizedFilename}`;

          if (!isSafeStoragePath(storagePath)) {
            throw new ApiError(400, "STORAGE_PATH_INVALID", "The storage path is invalid.");
          }

          const allowedTypes: Record<string, string[]> = {
            video: ["video/mp4", "video/quicktime", "video/x-matroska", "video/webm"],
            evidence: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
          };
          const inferredType: Record<string, string> = {
            mp4: "video/mp4", mov: "video/quicktime", mkv: "video/x-matroska", webm: "video/webm",
            pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
          };
          const extension = sanitizedFilename.toLowerCase().split(".").pop() || "";
          const contentType = (body.contentType || inferredType[extension] || "").toLowerCase();
          if (!allowedTypes[body.mediaKind]?.includes(contentType)) {
            throw new ApiError(415, "UPLOAD_TYPE_NOT_ALLOWED", "This file type is not supported.");
          }
          const maxSize = body.mediaKind === "video" ? 5_000_000_000 : 25_000_000;
          if (body.sizeBytes > maxSize) {
            throw new ApiError(413, "UPLOAD_TOO_LARGE", "This file is larger than the supported limit.");
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: signed, error: signedError } = await supabaseAdmin.storage
            .from("bq-sqwad-source-media")
            .createSignedUploadUrl(storagePath, { upsert: false });
          if (signedError || !signed?.signedUrl || !signed.token) {
            console.error("[producer-upload] Could not create signed upload session", signedError?.message);
            throw new ApiError(503, "UPLOAD_STORAGE_UNAVAILABLE", "Secure uploads are temporarily unavailable. Please try again later.");
          }

          const expiresAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();

          await fs.setDoc(`producerUploadSessions/${uploadSessionId}`, {
            id: uploadSessionId,
            uid: user.uid,
            storagePath,
            mediaKind: body.mediaKind,
            declaredSizeBytes: body.sizeBytes,
            contentType,
            filename: sanitizedFilename,
            bucket: "bq-sqwad-source-media",
            status: "uploading",
            expiresAt,
            createdAt: new Date().toISOString(),
          });

          return Response.json(
            {
              uploadSessionId,
              storagePath,
              signedUrl: signed.signedUrl,
              token: signed.token,
              method: "PUT",
              bucket: "bq-sqwad-source-media",
              filename: sanitizedFilename,
              mediaKind: body.mediaKind,
              expiresInSeconds: 7200,
            },
            { status: 201, headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
