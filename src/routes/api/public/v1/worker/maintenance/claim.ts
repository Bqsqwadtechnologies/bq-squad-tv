import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";
import { requireVideoWorker } from "@/lib/server/video-worker-auth";
import { videoWorkerLeaseExpiry } from "@/lib/server/video-worker-policy";

export const Route = createFileRoute("/api/public/v1/worker/maintenance/claim")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const fs = await Firestore.create();
      const workerId = await requireVideoWorker(request, fs);
      const [queued, processing] = await Promise.all([
        fs.query("videoMaintenanceJobs", { filters: [{ field: "status", op: "EQUAL", value: "queued" }], orderByField: "createdAt", limit: 20 }),
        fs.query("videoMaintenanceJobs", { filters: [{ field: "status", op: "EQUAL", value: "processing" }], limit: 200 }),
      ]);
      const now = Date.now();
      const candidates = [
        ...queued,
        ...processing.filter(row => typeof row["leaseExpiresAt"] !== "string" || Date.parse(row["leaseExpiresAt"]) <= now),
      ];
      for (const row of candidates) {
        const notBefore = typeof row["notBefore"] === "string" ? Date.parse(row["notBefore"]) : 0;
        if (Number.isFinite(notBefore) && notBefore > now) continue;
        const taskId = row.__id;
        if (!/^[A-Za-z0-9_-]{1,120}$/.test(taskId)) continue;
        const path = "videoMaintenanceJobs/" + taskId;
        const claimToken = crypto.randomUUID().replace(/-/g, "");
        const leaseExpiresAt = videoWorkerLeaseExpiry(now);
        const claimed = await fs.transact([path], docs => {
          const task = docs[0];
          if (!task || !["queued", "processing"].includes(String(task["status"]))) return { result: false, writes: [] };
          if (task["status"] === "processing" && typeof task["leaseExpiresAt"] === "string" && Date.parse(task["leaseExpiresAt"]) > now) {
            return { result: false, writes: [] };
          }
          const attempts = (typeof task["attempts"] === "number" ? task["attempts"] : 0) + 1;
          if (attempts > 5) {
            return {
              result: false,
              writes: [{ update: { name: fs.docName(path), fields: {
                status: { stringValue: "dead" }, updatedAt: { stringValue: new Date(now).toISOString() },
              } }, updateMask: { fieldPaths: ["status", "updatedAt"] } }],
            };
          }
          return {
            result: true,
            writes: [{ update: { name: fs.docName(path), fields: {
              status: { stringValue: "processing" },
              workerId: { stringValue: workerId },
              claimToken: { stringValue: claimToken },
              leaseExpiresAt: { stringValue: leaseExpiresAt },
              attempts: { integerValue: String(attempts) },
              updatedAt: { stringValue: new Date(now).toISOString() },
            } }, updateMask: { fieldPaths: ["status", "workerId", "claimToken", "leaseExpiresAt", "attempts", "updatedAt"] } }],
          };
        });
        if (!claimed) continue;
        const task = await fs.getDoc(path);
        if (!task) continue;
        return Response.json({
          taskId,
          taskType: task["taskType"],
          payload: task["payload"] ?? {},
          claimToken,
          leaseExpiresAt,
          workerId,
        });
      }
      return Response.json({ task: null });
    } catch (error) { return errorBody(error); }
  } } },
});
