import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getUserProfile, assertContentAgeEligibility } from "@/lib/server/api";
import { assertContentPlaybackRights } from "@/lib/server/content-rights";
import { verifyPlaybackToken } from "@/lib/server/storage/security";
import { decryptHlsContentKey, getStreamingSourceKey, type EncryptedStreamingSource } from "@/lib/server/streaming/source-encryption";

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export const Route = createFileRoute("/api/public/v1/streaming/key/$assetId")({
  server: { handlers: { GET: async ({ request, params }) => {
    try {
      const assetId = params.assetId;
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId)) throw new ApiError(400, "STREAM_KEY_INVALID", "The content key request is invalid.");
      const url = new URL(request.url);
      const sid = url.searchParams.get("sid") ?? "";
      const token = url.searchParams.get("token") ?? "";
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(sid)) throw new ApiError(401, "STREAM_SESSION_INVALID", "The playback session is invalid.");
      const fs = await Firestore.create();
      const session = await fs.getDoc("sessions/" + sid);
      if (!session || session["active"] !== true || typeof session["uid"] !== "string" ||
          session["contentAssetId"] !== assetId || session["deliveryMode"] !== "bq_hosted") {
        throw new ApiError(403, "STREAM_SESSION_REVOKED", "This playback session is no longer active.");
      }
      const uid = session["uid"] as string;
      await verifyPlaybackToken(token, { sid, uid, path: "stream-key/" + assetId });
      const now = Date.now();
      const lastHeartbeat = typeof session["lastHeartbeatAt"] === "string" ? Date.parse(session["lastHeartbeatAt"]) : 0;
      if (!Number.isFinite(lastHeartbeat) || now - lastHeartbeat > 45_000 || lastHeartbeat > now + 60_000) {
        await fs.patchDoc("sessions/" + sid, { active: false, status: "ended", endedAt: new Date(now).toISOString(), endReason: "HEARTBEAT_TIMEOUT" });
        throw new ApiError(403, "STREAM_SESSION_EXPIRED", "Playback authorization has expired.");
      }
      const wallet = await fs.getDoc("wallets/" + uid);
      const balance = typeof wallet?.["balanceMinor"] === "number" && Number.isSafeInteger(wallet["balanceMinor"])
        ? wallet["balanceMinor"] as number : 0;
      const today = new Date(now).toISOString().slice(0, 10);
      const spent = wallet?.["spentDate"] === today && typeof wallet["spentTodayMinor"] === "number"
        ? wallet["spentTodayMinor"] as number : 0;
      const dailyLimit = typeof wallet?.["dailySpendLimitMinor"] === "number" ? wallet["dailySpendLimitMinor"] as number : null;
      if (balance <= 0 || (dailyLimit !== null && spent >= dailyLimit)) {
        await fs.patchDoc("sessions/" + sid, { active: false, status: "ended", endedAt: new Date(now).toISOString(), endReason: "WALLET_LIMIT" });
        throw new ApiError(403, "STREAM_WALLET_EXHAUSTED", "The wallet or daily viewing limit no longer allows playback.");
      }
      const licenseUntil = typeof session["licenseValidUntil"] === "string" ? Date.parse(session["licenseValidUntil"]) : Number.NaN;
      if (!Number.isFinite(licenseUntil) || now >= licenseUntil) {
        await fs.patchDoc("sessions/" + sid, { active: false, status: "ended", endedAt: new Date(now).toISOString(), endReason: "LICENSE_EXPIRED" });
        throw new ApiError(403, "STREAM_LICENSE_EXPIRED", "The content license is no longer active.");
      }
      const channelId = typeof session["channelId"] === "string" ? session["channelId"] : "";
      const [channel, asset, profile] = await Promise.all([
        fs.getDoc("channels/" + channelId),
        fs.getDoc("contentAssets/" + assetId),
        getUserProfile(fs, uid),
      ]);
      if (!channel || channel["published"] !== true || !asset || asset["status"] !== "ready" ||
          asset["hlsEncryptionEnabled"] !== true || !asset["encryptedHlsKey"]) {
        throw new ApiError(403, "STREAM_KEY_UNAVAILABLE", "The protected content key is not available.");
      }
      assertContentAgeEligibility(
        profile.adultEligible,
        channel["adultOnly"] === true || asset["adultOnly"] === true,
        asset["contentRating"] ?? channel["contentRating"],
      );
      assertContentPlaybackRights({
        contentStatus: asset["contentStatus"] ?? channel["contentStatus"] ?? "published",
        license: (asset["license"] ?? channel["license"] ?? null) as Record<string, unknown> | null,
        viewerCountry: typeof session["viewerCountry"] === "string" ? session["viewerCountry"] : "",
        platform: session["clientPlatform"] as "android" | "web" | "android_tv",
        paidPlayback: session["paidPlayback"] !== false,
      });
      const envelope = asset["encryptedHlsKey"] as EncryptedStreamingSource;
      const wrappingKey = getStreamingSourceKey(envelope.keyVersion);
      const encodedKey = await decryptHlsContentKey(envelope, assetId, wrappingKey.keyBase64Url);
      const keyBytes = decodeBase64Url(encodedKey);
      if (keyBytes.length !== 16) throw new ApiError(500, "STREAM_KEY_INVALID", "The protected content key is invalid.");
      return new Response(keyBytes, {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-length": "16",
          "cache-control": "no-store, private, max-age=0",
          "pragma": "no-cache",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
        },
      });
    } catch (error) { return errorBody(error); }
  } } },
});
