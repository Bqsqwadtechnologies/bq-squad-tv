import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody } from "@/lib/server/api";
import { assertContentPlaybackRights } from "@/lib/server/content-rights";
import {
  isSafeStoragePath,
  redactSensitiveText,
  signPlaybackToken,
  verifyPlaybackToken,
} from "@/lib/server/storage/security";
import { resolveHlsReference } from "@/lib/server/streaming/hls-playlist";
import { getUserProfile, requireAdultForContent } from "@/lib/server/api";
import {
  loadStreamStorageConfiguration,
  createStorageDownloadTarget,
} from "@/lib/server/storage/transfers";
import { resolveAssetStreamBinding } from "@/lib/server/storage/asset-binding";
import { getPlatformFlags } from "@/lib/server/flags";
import { signHlsObjectsDirectly } from "@/lib/server/storage/direct-signing";
import { rewritePlaylistWithSignedObjects } from "@/lib/server/streaming/direct-playlist";
import {
  getSharedSignedObjects,
  sharedPlaylistWindow,
} from "@/lib/server/streaming/shared-playlist-cache";

function sessionId(value: string | null): string {
  if (!value || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) {
    throw new ApiError(401, "STREAM_SESSION_INVALID", "The playback session is invalid.");
  }
  return value;
}

function requestPath(value: string): string {
  if (/%2f|%5c/i.test(value)) {
    throw new ApiError(400, "STREAM_PATH_INVALID", "The media resource path is invalid.");
  }
  let decoded: string;
  try {
    decoded = value
      .split("/")
      .map((part) => decodeURIComponent(part))
      .join("/");
  } catch {
    throw new ApiError(400, "STREAM_PATH_INVALID", "The media resource path is invalid.");
  }
  if (!isSafeStoragePath(decoded))
    throw new ApiError(400, "STREAM_PATH_INVALID", "The media resource path is invalid.");
  return decoded;
}

function isPlaylist(path: string): boolean {
  return path.toLowerCase().endsWith(".m3u8");
}

function capMasterPlaylistAt480p(playlist: string): string {
  const lines = playlist.split(/\r?\n/);
  const output: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const resolution = line.match(/RESOLUTION=\d+x(\d+)/i);
      const height = resolution ? Number(resolution[1]) : 0;
      const next = lines[index + 1] ?? "";
      if (height > 480) {
        index++;
        continue;
      }
      output.push(line);
      if (next && !next.startsWith("#")) {
        output.push(next);
        index++;
      }
      continue;
    }
    output.push(line);
  }
  return output.join("\n");
}

async function rewritePlaylistForSession(
  playlist: string,
  playlistPath: string,
  sid: string,
  uid: string,
): Promise<string> {
  const lines = playlist.split(/\r?\n/);
  const output: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      output.push(line);
      continue;
    }
    const makeUrl = async (reference: string) => {
      const childPath = resolveHlsReference(playlistPath, reference);
      const childToken = await signPlaybackToken({
        sid,
        uid,
        path: childPath,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900,
      });
      return (
        "/api/public/v1/streaming/hls/" +
        childPath.split("/").map(encodeURIComponent).join("/") +
        "?sid=" +
        encodeURIComponent(sid) +
        "&token=" +
        encodeURIComponent(childToken) +
        "&delivery=proxy"
      );
    };
    if (trimmed.startsWith("#")) {
      const matches = [...line.matchAll(/(URI\s*=\s*")([^"]+)(")/gi)];
      let rewritten = line;
      for (const match of matches) {
        const original = match[2] ?? "";
        if (original.startsWith("data:")) continue;
        const keyMatch = original.match(
          /\/api\/public\/v1\/streaming\/key\/([A-Za-z0-9_-]{1,100})(?:$|[?#])/,
        );
        let replacement: string;
        if (keyMatch?.[1]) {
          const keyAssetId = keyMatch[1];
          const keyPath = "stream-key/" + keyAssetId;
          const now = Math.floor(Date.now() / 1000);
          const keyToken = await signPlaybackToken({
            sid,
            uid,
            path: keyPath,
            iat: now,
            exp: now + 900,
          });
          replacement =
            "/api/public/v1/streaming/key/" +
            encodeURIComponent(keyAssetId) +
            "?sid=" +
            encodeURIComponent(sid) +
            "&token=" +
            encodeURIComponent(keyToken);
        } else {
          replacement = await makeUrl(original);
        }
        rewritten = rewritten.replace(match[0], match[1] + replacement + match[3]);
      }
      output.push(rewritten);
    } else {
      output.push(await makeUrl(trimmed));
    }
  }
  return output.join("\n");
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
            throw new ApiError(
              403,
              "STREAM_SESSION_REVOKED",
              "This playback session is no longer active.",
            );
          }
          const uid = session["uid"];
          await verifyPlaybackToken(token, { sid, uid, path: resourcePath });
          const lastHeartbeat =
            typeof session["lastHeartbeatAt"] === "string"
              ? Date.parse(session["lastHeartbeatAt"])
              : 0;
          if (
            !Number.isFinite(lastHeartbeat) ||
            Date.now() - lastHeartbeat > 45_000 ||
            lastHeartbeat > Date.now() + 60_000
          ) {
            await fs.patchDoc("sessions/" + sid, {
              active: false,
              status: "ended",
              endedAt: new Date().toISOString(),
              endReason: "HEARTBEAT_TIMEOUT",
            });
            throw new ApiError(
              403,
              "STREAM_SESSION_EXPIRED",
              "Playback authorization has expired.",
            );
          }
          const wallet = await fs.getDoc("wallets/" + uid);
          const walletBalance =
            typeof wallet?.["balanceMinor"] === "number" &&
            Number.isSafeInteger(wallet["balanceMinor"])
              ? (wallet["balanceMinor"] as number)
              : 0;
          const today = new Date().toISOString().slice(0, 10);
          const spentToday =
            wallet?.["spentDate"] === today && typeof wallet["spentTodayMinor"] === "number"
              ? (wallet["spentTodayMinor"] as number)
              : 0;
          const dailyLimit =
            typeof wallet?.["dailySpendLimitMinor"] === "number" &&
            Number.isSafeInteger(wallet["dailySpendLimitMinor"])
              ? (wallet["dailySpendLimitMinor"] as number)
              : null;
          if (walletBalance <= 0 || (dailyLimit !== null && spentToday >= dailyLimit)) {
            await fs.patchDoc("sessions/" + sid, {
              active: false,
              status: "ended",
              endedAt: new Date().toISOString(),
              endReason: "WALLET_LIMIT",
            });
            throw new ApiError(
              403,
              "STREAM_WALLET_EXHAUSTED",
              "The wallet or daily viewing limit no longer allows playback.",
            );
          }
          const licenseUntil =
            typeof session["licenseValidUntil"] === "string"
              ? Date.parse(session["licenseValidUntil"])
              : Number.NaN;
          if (!Number.isFinite(licenseUntil) || Date.now() >= licenseUntil) {
            await fs.patchDoc("sessions/" + sid, {
              active: false,
              status: "ended",
              endedAt: new Date().toISOString(),
              endReason: "LICENSE_EXPIRED",
            });
            throw new ApiError(
              403,
              "STREAM_LICENSE_EXPIRED",
              "The content license is no longer active.",
            );
          }
          if (session["deliveryMode"] !== "bq_hosted") {
            throw new ApiError(
              403,
              "STREAM_DELIVERY_MODE_INVALID",
              "This session is not authorized for BQ-hosted playback.",
            );
          }
          const allowedExtension = /\.(?:m3u8|ts|m4s|mp4|vtt|aac|m4a|key|bin)$/i;
          if (!allowedExtension.test(resourcePath))
            throw new ApiError(
              415,
              "STREAM_RESOURCE_TYPE_INVALID",
              "This media resource type is not allowed.",
            );
          const channelId = typeof session["channelId"] === "string" ? session["channelId"] : "";
          const assetId =
            typeof session["contentAssetId"] === "string" ? session["contentAssetId"] : "";
          const [channel, asset, profile] = await Promise.all([
            fs.getDoc("channels/" + channelId),
            fs.getDoc("contentAssets/" + assetId),
            getUserProfile(fs, uid),
          ]);
          if (
            !channel ||
            channel["published"] !== true ||
            String(channel["status"] ?? "").toUpperCase() === "SUSPENDED" ||
            !asset ||
            asset["status"] !== "ready" ||
            asset["deliveryMode"] !== "bq_hosted"
          ) {
            throw new ApiError(
              403,
              "STREAM_CONTENT_UNAVAILABLE",
              "This content is no longer available.",
            );
          }
          requireAdultForContent(profile, channel["adultOnly"]);
          assertContentPlaybackRights({
            contentStatus: asset["contentStatus"] ?? channel["contentStatus"] ?? "published",
            license: (asset["license"] ?? channel["license"] ?? null) as Record<
              string,
              unknown
            > | null,
            viewerCountry:
              typeof session["viewerCountry"] === "string" ? session["viewerCountry"] : "",
            platform: session["clientPlatform"] as "android" | "web" | "android_tv",
            paidPlayback: session["paidPlayback"] !== false,
          });

          const assetBinding = resolveAssetStreamBinding(asset, assetId);
          if (!resourcePath.startsWith(assetBinding.objectPrefix + "/")) {
            throw new ApiError(
              403,
              "STREAM_RESOURCE_OUTSIDE_ASSET",
              "This resource is outside the authorized media asset.",
            );
          }
          const storageConfig = await loadStreamStorageConfiguration(fs, asset, assetId);
          if (
            storageConfig.configurationStatus !== "configured" ||
            !storageConfig.metadata.enabled ||
            storageConfig.metadata.mode === "retired" ||
            (typeof asset["streamDestinationId"] === "string" &&
              storageConfig.metadata.healthStatus !== "healthy")
          ) {
            throw new ApiError(
              503,
              "STREAM_DESTINATION_UNAVAILABLE",
              "The assigned streaming destination is not available.",
            );
          }
          // The grant and heartbeat endpoints account for expected delivery.
          // Never read or update egress counters on the media-segment path.
          const signed = await createStorageDownloadTarget(storageConfig, resourcePath, 60);
          const upstreamHeaders = new Headers();
          const range = request.headers.get("range");
          if (range && !isPlaylist(resourcePath)) upstreamHeaders.set("Range", range);
          let upstream: Response;
          try {
            upstream = await fetch(signed.signedUrl, {
              headers: upstreamHeaders,
              signal: AbortSignal.timeout(30_000),
            });
          } catch {
            throw new ApiError(
              502,
              "STREAM_STORAGE_UNAVAILABLE",
              "The media storage service is temporarily unavailable.",
            );
          }
          if (!upstream.ok && upstream.status !== 206) {
            throw new ApiError(
              502,
              "STREAM_STORAGE_ERROR",
              "The media resource could not be retrieved.",
            );
          }

          if (isPlaylist(resourcePath)) {
            let playlist = await upstream.text();
            if (
              session["streamQualityCap"] === 480 &&
              /(?:^|\/)master\.m3u8$/i.test(resourcePath)
            ) {
              playlist = capMasterPlaylistAt480p(playlist);
            }
            const flags = await getPlatformFlags(fs);
            let rewritten: string;
            if (
              storageConfig.metadata.deliveryMode === "direct_signed" &&
              url.searchParams.get("delivery") !== "proxy"
            ) {
              try {
                rewritten = (
                  await rewritePlaylistWithSignedObjects({
                    playlist,
                    playlistPath: resourcePath,
                    signObjects: (objectPaths) => {
                      const window = sharedPlaylistWindow();
                      const assetVersion =
                        typeof asset["version"] === "string" || typeof asset["version"] === "number"
                          ? String(asset["version"])
                          : String(asset["updatedAt"] ?? "v1");
                      const cacheKey = [
                        assetId,
                        assetVersion,
                        storageConfig.metadata.destinationId,
                        resourcePath,
                        window.windowStartMs,
                      ].join(":");
                      return getSharedSignedObjects({
                        key: cacheKey,
                        expiresAtMs: Date.now() + 21_600_000,
                        create: () =>
                          signHlsObjectsDirectly({
                            configuration: storageConfig,
                            objectPaths,
                            expiresInSeconds: 21_600,
                          }),
                      });
                    },
                    playlistUrl: async (childPath) => {
                      const issuedAt = Math.floor(Date.now() / 1000);
                      const childToken = await signPlaybackToken({
                        sid,
                        uid,
                        path: childPath,
                        iat: issuedAt,
                        exp: issuedAt + 900,
                      });
                      return (
                        "/api/public/v1/streaming/hls/" +
                        childPath.split("/").map(encodeURIComponent).join("/") +
                        "?sid=" +
                        encodeURIComponent(sid) +
                        "&token=" +
                        encodeURIComponent(childToken)
                      );
                    },
                    keyUrl: async (keyAssetId) => {
                      const keyPath = "stream-key/" + keyAssetId;
                      const issuedAt = Math.floor(Date.now() / 1000);
                      const keyToken = await signPlaybackToken({
                        sid,
                        uid,
                        path: keyPath,
                        iat: issuedAt,
                        exp: issuedAt + 900,
                      });
                      return (
                        "/api/public/v1/streaming/key/" +
                        encodeURIComponent(keyAssetId) +
                        "?sid=" +
                        encodeURIComponent(sid) +
                        "&token=" +
                        encodeURIComponent(keyToken)
                      );
                    },
                  })
                ).playlist;
              } catch (error) {
                if (
                  !flags.deliveryProxyFallback ||
                  (error instanceof ApiError && error.status < 500)
                )
                  throw error;
                rewritten = await rewritePlaylistForSession(playlist, resourcePath, sid, uid);
              }
            } else {
              rewritten = await rewritePlaylistForSession(playlist, resourcePath, sid, uid);
            }
            return new Response(rewritten, {
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
            console.error(
              "HLS proxy request failed",
              redactSensitiveText(error instanceof Error ? error.message : "unknown"),
            );
          }
          return errorBody(error);
        }
      },
    },
  },
});
