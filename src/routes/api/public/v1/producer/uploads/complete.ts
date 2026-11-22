import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requirePlatformRole } from "@/lib/server/roles";

const schema = z.object({ uploadSessionId: z.string().regex(/^[A-Fa-f0-9]{32}$/) });

export const Route = createFileRoute("/api/public/v1/producer/uploads/complete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, user, "producer");
          const { uploadSessionId } = await parseBody(request, schema);
          const path = `producerUploadSessions/${uploadSessionId}`;
          const session = await fs.getDoc(path);
          if (!session || session["uid"] !== user.uid || session["status"] !== "uploading") {
            throw new ApiError(404, "UPLOAD_SESSION_NOT_FOUND", "That upload session is no longer available.");
          }
          if (typeof session["expiresAt"] !== "string" || Date.parse(session["expiresAt"] as string) <= Date.now()) {
            throw new ApiError(410, "UPLOAD_SESSION_EXPIRED", "That upload session expired. Please upload the file again.");
          }
          const storagePath = String(session["storagePath"] || "");
          const filename = String(session["filename"] || "");
          const bucket = String(session["bucket"] || "");
          if (bucket !== "bq-sqwad-source-media" || !storagePath.startsWith(`producers/${user.uid}/uploads/${uploadSessionId}/`)) {
            throw new ApiError(403, "UPLOAD_PATH_INVALID", "The uploaded file does not match this account.");
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const folder = storagePath.slice(0, storagePath.lastIndexOf("/"));
          const { data: objects, error: listError } = await supabaseAdmin.storage.from(bucket).list(folder, {
            limit: 100,
            search: filename,
          });
          if (listError) throw new ApiError(503, "UPLOAD_VERIFY_UNAVAILABLE", "We could not verify the uploaded file. Please try again.");
          const object = objects?.find((item) => item.name === filename);
          const actualSize = Number(object?.metadata?.size ?? object?.metadata?.contentLength ?? NaN);
          if (!object || !Number.isFinite(actualSize) || actualSize !== Number(session["declaredSizeBytes"])) {
            throw new ApiError(400, "UPLOAD_INCOMPLETE", "The file did not finish uploading. Please try again.");
          }
          await fs.patchDoc(path, { status: "uploaded", uploadedAt: new Date().toISOString(), verifiedSizeBytes: actualSize });
          return Response.json({ success: true, uploadSessionId, storagePath, mediaKind: session["mediaKind"] });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
