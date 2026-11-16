import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { requireVideoWorker } from "@/lib/server/video-worker-auth";

const schema = z.object({ claimToken: z.string().regex(/^[a-f0-9]{32}$/) });
export const Route = createFileRoute("/api/public/v1/worker/jobs/$assetId/heartbeat")({
  server: { handlers: { POST: async ({ request, params }) => {
    try {
      const fs = await Firestore.create();
      await requireVideoWorker(request, fs);
      const body = await parseBody(request, schema);
      const assetId = params.assetId;
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId)) throw new ApiError(400, "WORKER_JOB_INVALID", "The processing job identifier is invalid.");
      const path = "videoTranscodeJobs/" + assetId;
      const nextExpiry = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
      await fs.transact([path], docs => {
        const job = docs[0];
        if (!job || job["status"] !== "processing" || job["claimToken"] !== body.claimToken ||
            typeof job["leaseExpiresAt"] !== "string" || Date.parse(job["leaseExpiresAt"]) <= Date.now()) {
          throw new ApiError(409, "WORKER_LEASE_INVALID", "The processing job lease is no longer valid.");
        }
        return { result: undefined, writes: [{ update: { name: fs.docName(path), fields: {
          leaseExpiresAt: { stringValue: nextExpiry }, updatedAt: { stringValue: new Date().toISOString() },
        } }, updateMask: { fieldPaths: ["leaseExpiresAt", "updatedAt"] } }] };
      });
      return Response.json({ assetId, leaseExpiresAt: nextExpiry });
    } catch (error) { return errorBody(error); }
  } } },
});
