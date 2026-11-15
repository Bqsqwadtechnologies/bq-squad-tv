import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireSessionOwned } from "./-shared";
import { assertContentPlaybackRights } from "@/lib/server/content-rights";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSafeStoragePath, signPlaybackToken } from "@/lib/server/storage/security";

export const Route = createFileRoute("/api/public/v1/sessions/$sessionId/refresh")({
  server: { handlers: { POST: async ({ request, params }) => {
    try {
      const user = await requireUser(request);
      const sid = params.sessionId;
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(sid)) throw new ApiError(400, "INVALID_REQUEST", "Invalid session id.");
      const fs = await Firestore.create();
      await enforceRateLimit(fs, "session-refresh:" + user.uid, { limit: 20, windowMs: 60_000 });
      const session = requireSessionOwned(await fs.getDoc("sessions/" + sid), sid, user.uid);
      if (session["active"] !== true || session["deliveryMode"] !== "bq_hosted") {
        throw new ApiError(409, "SESSION_INACTIVE", "This playback session is no longer active.");
      }
      const heartbeat = typeof session["lastHeartbeatAt"] === "string" ? Date.parse(session["lastHeartbeatAt"]) : 0;
      if (!Number.isFinite(heartbeat) || Date.now() - heartbeat > 45_000 || heartbeat > Date.now() + 60_000) {
        await fs.patchDoc("sessions/" + sid, { active: false, status: "ended", endedAt: new Date().toISOString(), endReason: "HEARTBEAT_TIMEOUT" });
        throw new ApiError(403, "SESSION_HEARTBEAT_EXPIRED", "A recent playback heartbeat is required.");
      }
      const channelId = typeof session["channelId"] === "string" ? session["channelId"] : "";
      const assetId = typeof session["contentAssetId"] === "string" ? session["contentAssetId"] : "";
      const [channel, asset] = await Promise.all([fs.getDoc("channels/" + channelId), fs.getDoc("contentAssets/" + assetId)]);
      if (!channel || channel["published"] !== true || !asset || asset["status"] !== "ready") {
        throw new ApiError(403, "STREAM_CONTENT_UNAVAILABLE", "This content is no longer available.");
      }
      assertContentPlaybackRights({
        contentStatus: asset["contentStatus"] ?? channel["contentStatus"] ?? "published",
        license: (asset["license"] ?? channel["license"] ?? null) as Record<string, unknown> | null,
        viewerCountry: typeof session["viewerCountry"] === "string" ? session["viewerCountry"] : "",
        platform: session["clientPlatform"] as "android" | "web" | "android_tv",
        paidPlayback: true,
      });
      const path = typeof session["storagePath"] === "string" ? session["storagePath"] : "";
      if (!isSafeStoragePath(path) || !path.toLowerCase().endsWith(".m3u8")) {
        throw new ApiError(503, "STREAM_MANIFEST_NOT_CONFIGURED", "The channel manifest is not configured.");
      }
      const now = Math.floor(Date.now() / 1000);
      const token = await signPlaybackToken({ sid, uid: user.uid, path, iat: now, exp: now + 900 });
      const streamUrl = "/api/public/v1/streaming/hls/" + path.split("/").map(encodeURIComponent).join("/") +
        "?sid=" + encodeURIComponent(sid) + "&token=" + encodeURIComponent(token);
      return Response.json({ sessionId: sid, streamUrl, expiresInSeconds: 900 });
    } catch (error) { return errorBody(error); }
  } } },
});
