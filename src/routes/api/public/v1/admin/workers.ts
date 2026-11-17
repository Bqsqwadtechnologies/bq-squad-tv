import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/admin/workers")({
  server: { handlers: { GET: async ({ request }) => {
    try {
      const user = await requireUser(request);
      const fs = await Firestore.create();
      const access = await requireAdminModule(fs, user, "security");
      if (!access.isZillionaireOwner) throw new ApiError(403, "OWNER_ONLY", "This setting is only available in the Zillionaire dashboard.");
      const raw = process.env["VIDEO_WORKER_KEYS_JSON"] ?? "";
      let workerIds: string[] = [];
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new ApiError(503, "WORKER_KEYS_INVALID", "The processing worker settings are invalid.");
        }
        workerIds = Object.entries(parsed as Record<string, unknown>)
          .filter(([id, secret]) => /^[A-Za-z0-9_-]{1,64}$/.test(id) && typeof secret === "string" && secret.length >= 48)
          .map(([id]) => id);
      } else if ((process.env["STREAMING_HMAC_SECRET"] ?? "").length >= 32) {
        workerIds = ["legacy-shared"];
      }
      const workers = await Promise.all(workerIds.map(async workerId => {
        const record = await fs.getDoc("videoWorkerRegistry/" + workerId);
        return { workerId, disabled: record?.["disabled"] === true, updatedAt: record?.["updatedAt"] ?? null };
      }));
      return Response.json({ workers }, { headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow, noarchive" } });
    } catch (error) { return errorBody(error); }
  } } },
});
