import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { requireVideoWorker } from "@/lib/server/video-worker-auth";
import { isVideoWorkerLeaseActive } from "@/lib/server/video-worker-policy";
import { validateStorageDestinationMetadata, resolveStorageDestinationConfiguration } from "@/lib/server/storage/registry";
import { createStorageUploadTarget } from "@/lib/server/storage/transfers";

const fileSchema = z.object({
  relativePath: z.string().min(1).max(220),
  contentType: z.enum([
    "application/vnd.apple.mpegurl", "video/mp2t", "video/iso.segment", "video/mp4",
    "text/vtt", "image/jpeg", "image/png", "image/webp", "audio/aac",
  ]),
}).strict();

const schema = z.object({
  claimToken: z.string().regex(/^[a-f0-9]{32}$/),
  files: z.array(fileSchema).min(1).max(50),
}).strict();

function allowedOutput(relativePath: string, contentType: string): boolean {
  const extension = relativePath.split(".").pop()?.toLowerCase();
  const expected: Record<string, string> = {
    m3u8: "application/vnd.apple.mpegurl",
    ts: "video/mp2t",
    m4s: "video/iso.segment",
    mp4: "video/mp4",
    vtt: "text/vtt",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    aac: "audio/aac",
  };
  if (!extension || expected[extension] !== contentType) return false;
  return /^(?:[A-Za-z0-9_-]+\/)*(?:master|index)\.m3u8$/.test(relativePath) ||
    /^(?:[A-Za-z0-9_-]+\/)*segment_[0-9]{5}\.(?:ts|m4s)$/.test(relativePath) ||
    /^(?:[A-Za-z0-9_-]+\/)*init\.mp4$/.test(relativePath) ||
    /^(?:[A-Za-z0-9_-]+\/)*subtitle_[A-Za-z0-9_-]+\.vtt$/.test(relativePath) ||
    /^(?:[A-Za-z0-9_-]+\/)*(?:thumbnail|sprite)[A-Za-z0-9_-]*\.(?:jpg|jpeg|png|webp)$/.test(relativePath) ||
    /^(?:[A-Za-z0-9_-]+\/)*audio_[A-Za-z0-9_-]+\.aac$/.test(relativePath);
}

export const Route = createFileRoute("/api/public/v1/worker/jobs/$assetId/targets")({
  server: { handlers: { POST: async ({ request, params }) => {
    try {
      const fs = await Firestore.create();
      const workerId = await requireVideoWorker(request, fs);
      const body = await parseBody(request, schema);
      const assetId = params.assetId;
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId)) {
        throw new ApiError(400, "WORKER_JOB_INVALID", "The processing job identifier is invalid.");
      }
      const unique = new Set<string>();
      for (const file of body.files) {
        if (!allowedOutput(file.relativePath, file.contentType) || unique.has(file.relativePath)) {
          throw new ApiError(400, "WORKER_OBJECT_KEY_INVALID", "The output file list contains an unsupported or duplicate file name.");
        }
        unique.add(file.relativePath);
      }
      const job = await fs.getDoc("videoTranscodeJobs/" + assetId);
      if (!job || job["status"] !== "processing" || job["claimToken"] !== body.claimToken || job["workerId"] !== workerId ||
          !isVideoWorkerLeaseActive(job["leaseExpiresAt"])) {
        throw new ApiError(409, "WORKER_LEASE_INVALID", "The processing job lease is no longer valid.");
      }
      const prefix = typeof job["outputPrefix"] === "string" ? job["outputPrefix"] : "";
      const destinationId = typeof job["outputDestinationId"] === "string" ? job["outputDestinationId"] : "";
      if (!prefix || !destinationId) throw new ApiError(409, "WORKER_OUTPUT_NOT_RESERVED", "The output location was not reserved.");
      const raw = await fs.getDoc("storageDestinations/" + destinationId);
      if (!raw) throw new ApiError(503, "HLS_DESTINATION_MISSING", "The assigned storage location is unavailable.");
      const metadata = validateStorageDestinationMetadata({ ...raw, destinationId });
      const config = resolveStorageDestinationConfiguration(metadata);
      if (config.configurationStatus !== "configured" || metadata.healthStatus !== "healthy" || !metadata.enabled || metadata.mode === "retired") {
        throw new ApiError(503, "HLS_DESTINATION_UNAVAILABLE", "The assigned storage location is not ready.");
      }
      const targets = await Promise.all(body.files.map(async file => {
        const objectKey = prefix + "/" + file.relativePath;
        const target = await createStorageUploadTarget(config, objectKey, 900);
        return {
          relativePath: file.relativePath,
          objectKey,
          method: target.method,
          signedUrl: target.signedUrl,
          ...(target.token ? { token: target.token } : {}),
          expiresInSeconds: target.expiresInSeconds,
        };
      }));
      return Response.json({ targets });
    } catch (error) { return errorBody(error); }
  } } },
});
