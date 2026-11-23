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
          let object: { name: string; metadata?: unknown } | undefined;
          let metadataSize: number | string | undefined;
          let objectInfo: Record<string, unknown> | null = null;
          let lastListError: unknown = null;

          // Storage object listing/metadata can become visible slightly after a
          // successful signed PUT. Retry verification before reporting a false
          // "upload incomplete" result to the producer.
          for (let attempt = 0; attempt < 8; attempt++) {
            const { data: objects, error: listError } = await supabaseAdmin.storage
              .from(bucket)
              .list(folder, { limit: 100, search: filename });
            lastListError = listError;
            if (!listError) {
              object = objects?.find((item) => item.name === filename);
              const listedMetadata = object?.metadata && typeof object.metadata === "object"
                ? object.metadata as Record<string, unknown>
                : {};
              const listedSize = listedMetadata["size"] ?? listedMetadata["contentLength"] ??
                listedMetadata["content-length"] ?? listedMetadata["content_length"];
              if (typeof listedSize === "number" || typeof listedSize === "string") metadataSize = listedSize;
            }

            if (!object || metadataSize === undefined || metadataSize === null) {
              const { data: info, error: infoError } = await supabaseAdmin.storage
                .from(bucket)
                .info(storagePath);
              if (!infoError && info && typeof info === "object") {
                objectInfo = info as Record<string, unknown>;
                const infoMetadata = objectInfo["metadata"];
                const metadata = infoMetadata && typeof infoMetadata === "object"
                  ? infoMetadata as Record<string, unknown>
                  : {};
                const infoSize = metadata["size"] ?? metadata["contentLength"] ??
                  metadata["content-length"] ?? metadata["content_length"] ??
                  metadata["fileSize"] ?? metadata["sizeBytes"] ??
                  objectInfo["size"] ?? objectInfo["contentLength"] ??
                  objectInfo["content-length"] ?? objectInfo["content_length"] ??
                  objectInfo["fileSize"] ?? objectInfo["sizeBytes"];
                if (typeof infoSize === "number" || typeof infoSize === "string") metadataSize = infoSize;
              }
            }

            if (metadataSize !== undefined && metadataSize !== null && Number(metadataSize) > 0) break;
            if (attempt < 7) {
              // Storage listing and object metadata are eventually consistent after signed PUT.
              await new Promise((resolve) => setTimeout(resolve, Math.min(350 + attempt * 250, 2_000)));
            }
          }

          if (lastListError && !object && !objectInfo) {
            throw new ApiError(503, "UPLOAD_VERIFY_UNAVAILABLE", "Private storage could not verify this upload. Please try again.");
          }
          const actualSize = Number(metadataSize ?? NaN);
          if (!object && !objectInfo) {
            throw new ApiError(400, "UPLOAD_INCOMPLETE", "The uploaded file was not found in private storage after repeated checks. Please retry the upload.");
          }
          if (!Number.isFinite(actualSize) || actualSize < 1) {
            throw new ApiError(503, "UPLOAD_SIZE_UNAVAILABLE", "Private storage received the file but could not confirm its size yet. Please retry verification.");
          }
          if (actualSize !== Number(session["declaredSizeBytes"])) {
            throw new ApiError(400, "UPLOAD_SIZE_MISMATCH", "The uploaded file size does not match the selected file. Please upload it again.");
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
