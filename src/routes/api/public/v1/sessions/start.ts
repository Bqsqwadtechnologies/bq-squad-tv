import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getUserProfile, getWallet, parseBody, requireAdultForContent, requireUser } from "@/lib/server/api";
import { assertContentPlaybackRights, type PlaybackPlatform } from "@/lib/server/content-rights";
import { getPricingConfig, requireMinorUnitAmount } from "@/lib/server/pricing";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSafeStoragePath, signPlaybackToken } from "@/lib/server/storage/security";

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

const bodySchema = z.object({
  channelId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  contentAssetId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),
  clientPlatform: z.enum(["android", "web", "android_tv"]),
});

export const Route = createFileRoute("/api/public/v1/sessions/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, bodySchema);
          const fs = await Firestore.create();
          await enforceRateLimit(fs, "session-start:" + user.uid, { limit: 8, windowMs: 60_000 });

          const channel = await fs.getDoc("channels/" + body.channelId);
          if (!channel || channel["published"] !== true || channel["status"] === "suspended") {
            throw new ApiError(404, "CHANNEL_NOT_AVAILABLE", "This channel is not available for playback.");
          }
          const assetId = body.contentAssetId ??
            (typeof channel["currentAssetId"] === "string" ? channel["currentAssetId"] : "");
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId)) {
            throw new ApiError(409, "CHANNEL_NO_ACTIVE_ASSET", "This channel has no playable media asset.");
          }

          const asset = await fs.getDoc("contentAssets/" + assetId);
          if (!asset || asset["channelId"] !== body.channelId || asset["status"] !== "ready") {
            throw new ApiError(409, "CONTENT_ASSET_NOT_READY", "The selected channel media is not ready for playback.");
          }
          if (asset["deliveryMode"] !== "bq_hosted") {
            throw new ApiError(503, "EXTERNAL_PROVIDER_PENDING", "This channel's external streaming provider has not been connected yet.");
          }
          const storagePath = asset["storagePath"];
          if (typeof storagePath !== "string" || !isSafeStoragePath(storagePath) || !storagePath.toLowerCase().endsWith(".m3u8")) {
            throw new ApiError(503, "STREAM_MANIFEST_NOT_CONFIGURED", "The channel's private streaming manifest is not configured.");
          }

          const profile = await getUserProfile(fs, user.uid);
          requireAdultForContent(profile, channel["adultOnly"]);
          const viewerCountry = request.headers.get("cf-ipcountry")?.trim().toUpperCase() ?? "";
          const rights = asset["license"] && typeof asset["license"] === "object"
            ? asset["license"] as Record<string, unknown>
            : channel["license"] && typeof channel["license"] === "object"
              ? channel["license"] as Record<string, unknown>
              : null;
          assertContentPlaybackRights({
            contentStatus: asset["contentStatus"] ?? channel["contentStatus"] ?? (channel["published"] === true ? "published" : "draft"),
            license: rights,
            viewerCountry,
            platform: body.clientPlatform as PlaybackPlatform,
            paidPlayback: true,
          });

          const pricing = await getPricingConfig(fs);
          const ratePerMinuteMinor = requireMinorUnitAmount(
            asset["ratePerMinuteMinor"] ?? channel["ratePerMinuteMinor"] ?? pricing["defaultRatePerMinuteMinor"],
            "ratePerMinuteMinor",
          );
          if (ratePerMinuteMinor < 1) {
            throw new ApiError(503, "CHANNEL_PRICE_INVALID", "This channel does not have a valid paid playback price.");
          }
          const minimumBalanceMinor = requireMinorUnitAmount(
            channel["minimumBalanceMinor"] ?? pricing["minimumSessionBalanceMinor"] ?? 100,
            "minimumBalanceMinor",
          );
          const wallet = await getWallet(fs, user.uid);
          const balanceMinor = requireMinorUnitAmount(wallet.balanceMinor, "wallet balance");
          if (balanceMinor < minimumBalanceMinor) {
            throw new ApiError(402, "INSUFFICIENT_FUNDS", "Your wallet balance is too low to start this channel.");
          }
          if (wallet.dailySpendLimitMinor !== null && wallet.spentTodayMinor >= wallet.dailySpendLimitMinor) {
            throw new ApiError(402, "DAILY_SPEND_LIMIT_REACHED", "Your daily viewing limit has been reached.");
          }

          const producerUid = typeof channel["ownerUid"] === "string" ? channel["ownerUid"] : "";
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(producerUid)) {
            throw new ApiError(503, "CHANNEL_OWNER_INVALID", "The channel owner is not configured for revenue settlement.");
          }
          const producer = await fs.getDoc("producers/" + producerUid);
          if (!producer) throw new ApiError(503, "PRODUCER_ACCOUNT_MISSING", "The channel producer account is not available.");
          const shareBps = integer(channel["producerShareBps"] ?? pricing["defaultProducerShareBps"]);
          if (shareBps === null || shareBps > 10_000) {
            throw new ApiError(503, "REVENUE_SPLIT_INVALID", "The channel revenue split is not configured correctly.");
          }

          const now = new Date();
          const nowIso = now.toISOString();
          const sessionId = crypto.randomUUID().replace(/-/g, "");
          const expiresAt = Math.floor(now.getTime() / 1000) + 300;
          const token = await signPlaybackToken({
            sid: sessionId, uid: user.uid, path: storagePath,
            iat: Math.floor(now.getTime() / 1000), exp: expiresAt,
          });
          const streamUrl = "/api/public/v1/streaming/hls/" + encodeURIComponent(storagePath.split("/").map(encodeURIComponent).join("/")) +
            "?sid=" + encodeURIComponent(sessionId) + "&token=" + encodeURIComponent(token);

          await fs.setDoc("sessions/" + sessionId, {
            uid: user.uid,
            channelId: body.channelId,
            contentAssetId: assetId,
            producerUid,
            producerShareBps: shareBps,
            deliveryMode: "bq_hosted",
            storagePath,
            clientPlatform: body.clientPlatform,
            viewerCountry,
            ratePerMinuteMinor,
            currency: "NGN",
            status: "active",
            active: true,
            startedAt: nowIso,
            lastHeartbeatAt: nowIso,
            lastClientSequence: 0,
            lastPlaybackState: "idle",
            lastPlaybackPositionMs: 0,
            billedSeconds: 0,
            sessionTotalMinor: 0,
            pricingVersion: pricing.version,
            licenseValidUntil: rights?.["validUntil"] ?? null,
          }, { mustNotExist: true });

          return Response.json({
            sessionId,
            streamUrl,
            expiresInSeconds: 300,
            ratePerMinuteMinor,
            currency: "NGN",
            walletBalanceMinor: balanceMinor,
          }, { status: 201 });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
