import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireChannelPermission } from "@/lib/server/channel-access";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSafeStoragePath } from "@/lib/server/storage/security";
import { writeAuditLog } from "@/lib/server/audit";

const MAX_SOURCE_BYTES = 5 * 1024 * 1024 * 1024;
const mimeByExtension: Record<string, string[]> = {
  mp4: ["video/mp4"],
  mov: ["video/quicktime"],
  mkv: ["video/x-matroska"],
  webm: ["video/webm"],
};

const bodySchema = z.object({
  channelId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  filename: z.string().min(1).max(180),
  sizeBytes: z.number().int().positive().max(MAX_SOURCE_BYTES),
  mimeType: z.string().min(1).max(100),
});

function safeFilename(value: string): string {
  const leaf = value.split(/[\\/]/).pop() ?? "";
  const normalized = leaf.normalize("NFKC").replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\s+/g, "_");
  if (!normalized || normalized === "." || normalized === ".." || normalized.length > 160) {
    throw new ApiError(400, "INVALID_FILENAME", "The upload filename is invalid.");
  }
  return normalized;
}

export const Route = createFileRoute("/api/public/v1/storage/intent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, bodySchema);
          const fs = await Firestore.create();
          await enforceRateLimit(fs, "storage-intent:" + user.uid, { limit: 10, windowMs: 5 * 60_000 });
          await requireChannelPermission(fs, body.channelId, user.uid, "video.upload");

          const filename = safeFilename(body.filename);
          const extension = filename.toLowerCase().split(".").pop() ?? "";
          if (!mimeByExtension[extension]?.includes(body.mimeType.toLowerCase())) {
            throw new ApiError(415, "UPLOAD_TYPE_NOT_ALLOWED", "Only MP4, MOV, MKV and WebM source videos are accepted.");
          }
          const channel = await fs.getDoc("channels/" + body.channelId);
          if (!channel || String(channel["status"] ?? "").toUpperCase() === "SUSPENDED" || channel["deleted"] === true) {
            throw new ApiError(404, "CHANNEL_NOT_AVAILABLE", "This channel is not available for uploads.");
          }

          const assetId = crypto.randomUUID().replace(/-/g, "");
          const path = `producers/${user.uid}/${body.channelId}/${assetId}/${filename}`;
          if (!isSafeStoragePath(path)) throw new ApiError(400, "UPLOAD_PATH_INVALID", "The generated upload path is invalid.");

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.storage
            .from("bq-sqwad-source-media")
            .createSignedUploadUrl(path, { upsert: false });
          if (error || !data?.signedUrl || !data.token) {
            throw new ApiError(503, "STORAGE_UPLOAD_UNAVAILABLE", "A private upload session could not be created.");
          }

          const now = new Date();
          const expiresAt = new Date(now.getTime() + 2 * 60 * 60_000).toISOString();
          await fs.setDoc("contentAssets/" + assetId, {
            channelId: body.channelId,
            ownerUid: user.uid,
            sourceBucket: "bq-sqwad-source-media",
            sourcePath: path,
            sourceFilename: filename,
            declaredSizeBytes: body.sizeBytes,
            declaredMimeType: body.mimeType.toLowerCase(),
            status: "uploading",
            deliveryMode: "bq_hosted",
            createdAt: now.toISOString(),
            uploadExpiresAt: expiresAt,
            uploadTokenLifetimeSeconds: 7200,
          }, { mustNotExist: true });
          await writeAuditLog(fs, {
            actorUid: user.uid, action: "content.upload_intent_created",
            targetType: "contentAsset", targetId: assetId,
            reason: "Authorized channel source upload",
            metadata: { channelId: body.channelId, sizeBytes: body.sizeBytes, extension },
          });

          const storageBase = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
          let resumableEndpoint: string | null = null;
          if (storageBase) {
            try {
              const parsed = new URL(storageBase);
              const host = parsed.hostname.endsWith(".supabase.co")
                ? parsed.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co")
                : parsed.hostname;
              resumableEndpoint = parsed.protocol + "//" + host + "/storage/v1/upload/resumable";
            } catch {
              resumableEndpoint = null;
            }
          }

          return Response.json({
            assetId,
            path,
            bucket: "bq-sqwad-source-media",
            signedUrl: data.signedUrl,
            token: data.token,
            expiresAt,
            method: body.sizeBytes > 6 * 1024 * 1024 && resumableEndpoint ? "TUS" : "PUT",
            uploadMode: body.sizeBytes > 6 * 1024 * 1024 && resumableEndpoint ? "tus" : "signed_put",
            resumableEndpoint: body.sizeBytes > 6 * 1024 * 1024 ? resumableEndpoint : null,
            resumableSignatureHeader: body.sizeBytes > 6 * 1024 * 1024 && resumableEndpoint ? "x-signature" : null,
          }, { status: 201 });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
