import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { requireVideoWorker } from "@/lib/server/video-worker-auth";
import { validateStorageDestinationMetadata, resolveStorageDestinationConfiguration } from "@/lib/server/storage/registry";
import { createStorageUploadTarget } from "@/lib/server/storage/transfers";
import { assertStorageObjectKey } from "@/lib/server/storage/ledger";

const schema = z.object({
  claimToken: z.string().regex(/^[a-f0-9]{32}$/),
  objectKey: z.string().min(1).max(1024),
  contentType: z.enum(["application/vnd.apple.mpegurl", "video/mp2t", "video/mp4", "text/vtt", "audio/aac", "application/octet-stream"]),
});

export const Route = createFileRoute("/api/public/v1/worker/jobs/$assetId/target")({
  server: { handlers: { POST: async ({ request, params }) => {
    try {
      const fs = await Firestore.create();
      await requireVideoWorker(request, fs);
      const body = await parseBody(request, schema);
      const assetId = params.assetId;
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId)) throw new ApiError(400, "WORKER_JOB_INVALID", "The processing job identifier is invalid.");
      const job = await fs.getDoc("videoTranscodeJobs/" + assetId);
      if (!job || job["status"] !== "processing" || job["claimToken"] !== body.claimToken ||
          typeof job["leaseExpiresAt"] !== "string" || Date.parse(job["leaseExpiresAt"]) <= Date.now()) {
        throw new ApiError(409, "WORKER_LEASE_INVALID", "The processing job lease is no longer valid.");
      }
      const prefix = typeof job["outputPrefix"] === "string" ? job["outputPrefix"] : "";
      const objectKey = assertStorageObjectKey(body.objectKey);
      if (!prefix || !objectKey.startsWith(prefix + "/") || objectKey.length > prefix.length + 220 ||
          !/\.(m3u8|ts)$/i.test(objectKey)) {
        throw new ApiError(400, "WORKER_OBJECT_KEY_INVALID", "The output object key is outside the assigned HLS prefix.");
      }
      const destinationId = typeof job["outputDestinationId"] === "string" ? job["outputDestinationId"] : "";
      const raw = destinationId ? await fs.getDoc("storageDestinations/" + destinationId) : null;
      if (!raw) throw new ApiError(503, "HLS_DESTINATION_MISSING", "The assigned HLS destination is unavailable.");
      const metadata = validateStorageDestinationMetadata({ ...raw, destinationId });
      const config = resolveStorageDestinationConfiguration(metadata);
      if (config.configurationStatus !== "configured" || metadata.healthStatus !== "healthy" || metadata.mode !== "active") {
        throw new ApiError(503, "HLS_DESTINATION_UNAVAILABLE", "The assigned HLS destination is not ready.");
      }
      const target = await createStorageUploadTarget(config, objectKey, 900);
      return Response.json({ objectKey, method: target.method, signedUrl: target.signedUrl, ...(target.token ? { token: target.token } : {}), expiresInSeconds: target.expiresInSeconds });
    } catch (error) { return errorBody(error); }
  } } },
});
