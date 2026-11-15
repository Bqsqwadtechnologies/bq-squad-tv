import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSafeStoragePath } from "@/lib/server/storage/security";

const schema = z.object({
  filename: z.string().trim().min(1).max(160),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
});

export const Route = createFileRoute("/api/public/v1/producer/verification/upload-intent")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const user = await requireUser(request);
      if (!user.emailVerified) throw new ApiError(403, "EMAIL_VERIFICATION_REQUIRED", "Verify your email before uploading producer verification documents.");
      const body = await parseBody(request, schema);
      const fs = await Firestore.create();
      await enforceRateLimit(fs, "producer-verification-upload:" + user.uid, { limit: 8, windowMs: 24 * 60 * 60_000 });
      const leaf = body.filename.split(/[\\/]/).pop() ?? "";
      const filename = leaf.normalize("NFKC").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
      if (!filename || filename === "." || filename === "..") throw new ApiError(400, "FILENAME_INVALID", "The verification filename is invalid.");
      const path = "producer-verification/" + user.uid + "/" + crypto.randomUUID().replace(/-/g, "") + "/" + filename;
      if (!isSafeStoragePath(path)) throw new ApiError(400, "UPLOAD_PATH_INVALID", "The verification upload path is invalid.");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin.storage.from("bq-sqwad-source-media").createSignedUploadUrl(path, { upsert: false });
      if (error || !data?.signedUrl || !data.token) throw new ApiError(503, "STORAGE_UPLOAD_UNAVAILABLE", "A private verification upload could not be created.");
      return Response.json({
        bucket: "bq-sqwad-source-media",
        path,
        signedUrl: data.signedUrl,
        token: data.token,
        expiresInSeconds: 7200,
        maxBytes: 20 * 1024 * 1024,
        mimeType: body.mimeType,
      }, { status: 201 });
    } catch (error) { return errorBody(error); }
  } } },
});
