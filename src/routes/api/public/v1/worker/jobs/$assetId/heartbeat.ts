import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { videoWorkerLeaseExpiry, isVideoWorkerLeaseActive } from "@/lib/server/video-worker-policy";
import { requireVideoWorker } from "@/lib/server/video-worker-auth";

const schema = z.object({
  claimToken: z.string().regex(/^[a-f0-9]{32}$/),
  stage: z.enum(["download", "encode", "upload", "verify"]).default("encode"),
  progress: z.number().min(0).max(100).default(0),
});
export const Route = createFileRoute("/api/public/v1/worker/jobs/$assetId/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const fs = await Firestore.create();
          const workerId = await requireVideoWorker(request, fs);
          const body = await parseBody(request, schema);
          const assetId = params.assetId;
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId))
            throw new ApiError(
              400,
              "WORKER_JOB_INVALID",
              "The processing job identifier is invalid.",
            );
          const path = "videoTranscodeJobs/" + assetId;
          const now = Date.now();
          const leaseMinutes = Number(process.env["VIDEO_WORKER_LEASE_MINUTES"] ?? "10");
          const nextExpiry = videoWorkerLeaseExpiry(now, leaseMinutes);
          await fs.transact([path], (docs) => {
            const job = docs[0];
            if (
              !job ||
              job["status"] !== "processing" ||
              job["claimToken"] !== body.claimToken ||
              job["workerId"] !== workerId ||
              !isVideoWorkerLeaseActive(job["leaseExpiresAt"])
            ) {
              throw new ApiError(
                409,
                "WORKER_LEASE_INVALID",
                "The processing job lease is no longer valid.",
              );
            }
            return {
              result: undefined,
              writes: [
                {
                  update: {
                    name: fs.docName(path),
                    fields: {
                      leaseExpiresAt: { stringValue: nextExpiry },
                      stage: { stringValue: body.stage },
                      progress: { doubleValue: body.progress },
                      lastHeartbeatAt: { stringValue: new Date(now).toISOString() },
                      updatedAt: { stringValue: new Date(now).toISOString() },
                    },
                  },
                  updateMask: {
                    fieldPaths: [
                      "leaseExpiresAt",
                      "stage",
                      "progress",
                      "lastHeartbeatAt",
                      "updatedAt",
                    ],
                  },
                },
              ],
            };
          });
          return Response.json({ assetId, leaseExpiresAt: nextExpiry });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
