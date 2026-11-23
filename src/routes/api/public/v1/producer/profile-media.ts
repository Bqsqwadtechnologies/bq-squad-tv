import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requirePlatformRole } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSafeStoragePath } from "@/lib/server/storage/security";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function hasValidImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (mimeType === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

export const Route = createFileRoute("/api/public/v1/producer/profile-media")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, user, "producer");
          await enforceRateLimit(fs, "producer-profile-media:" + user.uid, { limit: 12, windowMs: 60 * 60_000 });

          const form = await request.formData();
          const kind = form.get("kind");
          const file = form.get("file");
          if (kind !== "avatar" && kind !== "banner") {
            throw new ApiError(400, "PROFILE_MEDIA_KIND_INVALID", "Choose a profile photo or cover photo.");
          }
          if (!file || typeof file === "string" || typeof (file as Blob).arrayBuffer !== "function") {
            throw new ApiError(400, "PROFILE_MEDIA_FILE_REQUIRED", "Choose an image file to upload.");
          }
          if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
            throw new ApiError(413, "PROFILE_MEDIA_TOO_LARGE", "Profile images must be 8 MB or smaller.");
          }
          const mimeType = file.type.toLowerCase();
          const extension = MIME_EXTENSIONS[mimeType];
          if (!extension) {
            throw new ApiError(415, "PROFILE_MEDIA_TYPE_INVALID", "Use a JPEG, PNG or WebP image.");
          }
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (!hasValidImageSignature(bytes, mimeType)) {
            throw new ApiError(400, "PROFILE_MEDIA_SIGNATURE_INVALID", "The image contents do not match the selected file type.");
          }

          const uploadId = crypto.randomUUID().replace(/-/g, "");
          const path = "producer-profile/" + user.uid + "/" + kind + "/" + uploadId + "." + extension;
          if (!isSafeStoragePath(path)) {
            throw new ApiError(400, "PROFILE_MEDIA_PATH_INVALID", "The profile image path is invalid.");
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.storage
            .from("bq-sqwad-source-media")
            .upload(path, Buffer.from(bytes), { contentType: mimeType, upsert: false, cacheControl: "31536000" });
          if (error) {
            throw new ApiError(503, "PROFILE_MEDIA_STORAGE_FAILED", "The profile image could not be saved. Please try again.");
          }
          const { data: signed, error: signedError } = await supabaseAdmin.storage
            .from("bq-sqwad-source-media")
            .createSignedUrl(path, 60 * 60);
          if (signedError || !signed?.signedUrl) {
            throw new ApiError(503, "PROFILE_MEDIA_PREVIEW_UNAVAILABLE", "The image was uploaded but its preview could not be prepared.");
          }
          return Response.json({ success: true, kind, path, previewUrl: signed.signedUrl });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
