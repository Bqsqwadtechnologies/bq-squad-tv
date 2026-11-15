import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";
import { assertContentPlaybackRights } from "@/lib/server/content-rights";
import { isSafeStoragePath, redactSensitiveText, signPlaybackToken, verifyPlaybackToken } from "@/lib/server/storage/security";
import { resolveHlsReference, rewriteHlsPlaylist } from "@/lib/server/streaming/hls-playlist";

function sessionId(value: string | null): string {
  if (!value || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) {
    throw new ApiError(401, "STREAM_SESSION_INVALID", "The playback session is invalid.");
  }
  return value;
}

function requestPath(value: string): string {
  let decoded: string;
  try { decoded = value.split("/").map((part) => decodeURIComponent(part)).join("/"); }
  catch { throw new ApiError(400, "STREAM_PATH_INVALID", "The media resource path is invalid."); }
  if (!isSafeStoragePath(decoded)) throw new ApiError(400, "STREAM_PATH_INVALID", "The media resource path is invalid.");
  return decoded;
}

function isPlaylist(path: string): boolean {
  return path.toLowerCase().endsWith(".m3u8");
}

function proxyUrl(path: string, sid: string, uid: string): string {
  return signPlaybackToken({
    sid, uid, path, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300,
  }).then((token) =>
    "/api/public/v1/streaming/hls/" + path.split("/").map(encodeURIComponent).join("/") +
    "?sid=" + encodeURIComponent(sid) + "&token=" + encodeURIComponent(token)
  ) as unknown as string;
}

export const Route = createFileRoute("/api/public/v1/streaming/hls/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const url = new URL(request.url);
          const sid = sessionId(url.searchParams.get("sid"));
          const token = url.searchParams.get("token") ?? "";
          const resourcePath = requestPath(params._splat ?? "");
          const fs = await Firestore.create();
          const session = await fs.getDoc("sessions/" + sid);
          if (!session || session["active"] !== true || typeof session["uid"] !== "string") {
            throw new ApiError(403, "STREAM_SESSION_REVOKED", "This playback session is no longer active.");
          }
          const uid = session["uid"];
          await verifyPlaybackToken(token, { sid, uid, path: resourcePath });
          const lastHeartbeat = typeof session["lastHeartbeatAt"] === "string" ? Date.parse(session["lastHeartbeatAt"]) : 0;
          if (!Number.isFinite(lastHeartbeat) || Date.now() - lastHeartbeat > 45_000 || lastHeartbeat > Date.now() + 60_000) {
            await fs.patchDoc("sessions/" + sid, { active: false, status: "ended", endedAt: new Date().toISOString(), endReason: "HEARTBEAT_TIMEOUT" });
            throw new ApiError(403, "STREAM_SESSION_EXPIRED", "Playback authorization has expired.");
          }
          const licenseUntil = typeof session["licenseValidUntil"] === "string" ? Date.parse(session["licenseValidUntil"]) : Number.NaN;
          if (!Number.isFinite(licenseUntil) || Date.now() >= licenseUntil) {
            await fs.patchDoc("sessions/" + sid, { active: false, status: "ended", endedAt: new Date().toISOString(), endReason: "LICENSE_EXPIRED" });
            throw new ApiError(403, "STREAM_LICENSE_EXPIRED", "The content license is no longer active.");
          }
          if (session["deliveryMode"] !== "bq_hosted") {
            throw new ApiError(403, "STREAM_DELIVERY_MODE_INVALID", "This session is not authorized for BQ-hosted playback.");
          }
          const rootPath = typeof session["storagePath"] === "string" ? session["storagePath"] : "";
          if (!isSafeStoragePath(rootPath) || !resourcePath.startsWith(rootPath.slice(0, rootPath.lastIndexOf("/") + 1))) {
            throw new ApiError(403, "STREAM_RESOURCE_OUTSIDE_ASSET", "This resource is outside the authorized media asset.");
          }
          const channelId = typeof session["channelId"] === "string" ? session["channelId"] : "";
          const assetId = typeof session["contentAssetId"] === "string" ? session["contentAssetId"] : "";
          const [channel, asset] = await Promise.all([
            fs.getDoc("channels/" + channelId),
            fs.getDoc("contentAssets/" + assetId),
          ]);
          if (!channel || channel["published"] !== true || channel["status"] === "suspended" ||
              !asset || asset["status"] !== "ready" || asset["deliveryMode"] !== "bq_hosted") {
            throw new ApiError(403, "STREAM_CONTENT_UNAVAILABLE", "This content is no longer available.");
          }
          assertContentPlaybackRights({
            contentStatus: asset["contentStatus"] ?? channel["contentStatus"] ?? "published",
            license: (asset["license"] ?? channel["license"] ?? null) as Record<string, unknown> | null,
            viewerCountry: typeof session["viewerCountry"] === "string" ? session["viewerCountry"] : "",
            platform: session["clientPlatform"] as "android" | "web" | "android_tv",
            paidPlayback: true,
          });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: signed, error: signedError } = await supabaseAdmin.storage
            .from("bq-sqwad-streaming-media")
            .createSignedUrl(resourcePath, 60);
          if (signedError || !signed?.signedUrl) {
            throw new ApiError(404, "STREAM_RESOURCE_NOT_FOUND", "The requested media resource is unavailable.");
          }
          const upstreamHeaders = new Headers();
          const range = request.headers.get("range");
          if (range && !isPlaylist(resourcePath)) upstreamHeaders.set("Range", range);
          let upstream: Response;
          try {
            upstream = await fetch(signed.signedUrl, { headers: upstreamHeaders });
          } catch {
            throw new ApiError(502, "STREAM_STORAGE_UNAVAILABLE", "The media storage service is temporarily unavailable.");
          }
          if (!upstream.ok && upstream.status !== 206) {
            throw new ApiError(502, "STREAM_STORAGE_ERROR", "The media resource could not be retrieved.");
          }

          if (isPlaylist(resourcePath)) {
            const playlist = await upstream.text();
            const rewritten = rewriteHlsPlaylist(playlist, resourcePath, (childPath) => {
              // The token is generated asynchronously by Web Crypto; playlist rewriting is completed below.
              return childPath;
            });
            const lines = rewritten.split(/\r?\n/);
            const signedLines = await Promise.all(lines.map(async (line) => {
              const replace = async (childPath: string) => {
                const childToken = await signPlaybackToken({
                  sid, uid, path: childPath,
                  iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300,
                });
                return "/api/public/v1/streaming/hls/" + childPath.split("/").map(encodeURIComponent).join("/") +
                  "?sid=" + encodeURIComponent(sid) + "&token=" + encodeURIComponent(childToken);
              };
              if (!line.trim()) return line;
              if (line.trimStart().startsWith("#")) {
                const matches = [...line.matchAll(/(URI\s*=\s*")([^"]+)(")/gi)];
                let output = line;
                for (const match of matches) {
                  const original = match[2] ?? "";
                  if (!original.startsWith("/api/public/v1/streaming/hls/")) {
                    const resolved = resolveHlsReference(resourcePath, original);
                    output = output.replace(match[0], match[1] + await replace(resolved) + match[3]);
                  }
                }
                return output;
              }
              return await replace(resolveHlsReference(resourcePath, line.trim()));
            }));
            return new Response(signedLines.join("\n"), {
              status: 200,
              headers: {
                "content-type": "application/vnd.apple.mpegurl",
                "cache-control": "private, no-store",
                "x-content-type-options": "nosniff",
              },
            });
          }

          const headers = new Headers({
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
            "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
          });
          for (const name of ["content-length", "content-range", "accept-ranges"]) {
            const value = upstream.headers.get(name);
            if (value) headers.set(name, value);
          }
          return new Response(upstream.body, { status: upstream.status, headers });
        } catch (error) {
          // Never include signed storage URLs or bearer/playback tokens in diagnostics.
          if (!(error instanceof ApiError)) {
            console.error("HLS proxy request failed", redactSensitiveText(error instanceof Error ? error.message : "unknown"));
          }
          return errorBody(error);
        }
      },
    },
  },
});
