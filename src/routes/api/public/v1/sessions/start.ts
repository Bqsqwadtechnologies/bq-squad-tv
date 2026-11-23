import { verifyPreviewToken } from "@/lib/server/preview-grants";
import { requireVerifiedViewer } from "@/lib/server/access";
import { createFileRoute } from "@tanstack/react-router";
import { assertLegalAcceptance } from "@/lib/server/legal-acceptance";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, getUserProfile, getWallet, parseBody, requireUser } from "@/lib/server/api";
import { assertContentAgeEligibility } from "@/lib/server/content-rating";
import { assertContentPlaybackRights, type PlaybackPlatform } from "@/lib/server/content-rights";
import { consumeIntegrityChallenge } from "@/lib/server/integrity-challenge";
import { verifyPlayIntegrityToken } from "@/lib/server/play-integrity";
import { getPricingConfig, requireMinorUnitAmount } from "@/lib/server/pricing";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSafeStoragePath, signPlaybackToken } from "@/lib/server/storage/security";
import { signSessionLeaseToken } from "@/lib/server/session-lease-token";
import { assertRiskStepUp, recordRiskSignal } from "@/lib/server/risk-engine";
import { acquireSessionLease } from "@/lib/server/session-limits";
import { initialSessionHold } from "@/lib/server/session-holds";
import { loadStreamStorageConfiguration } from "@/lib/server/storage/transfers";
import {
  estimateExpectedPlaybackBytes,
  reserveExpectedStorageEgress,
  releaseExpectedStorageEgress,
} from "@/lib/server/storage/expected-egress";
import {
  LEGACY_STREAM_DESTINATION_ID,
  resolveAssetStreamBinding,
} from "@/lib/server/storage/asset-binding";
import {
  assertWebRefreshSessionActive,
  readWebRefreshCookie,
  refreshFirebaseWebSession,
  rotateWebRefreshSession,
  requireSameOrigin,
  webRefreshCookie,
} from "@/lib/server/web-session";

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

const bodySchema = z.object({
  channelId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  contentAssetId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,100}$/)
    .optional(),
  clientPlatform: z.enum(["android", "web", "android_tv"]),
  integrityNonce: z.string().uuid().optional(),
  integrityToken: z.string().min(1).max(20_000).optional(),
  idempotencyKey: z.string().uuid(),
  previewToken: z.string().optional(),
});

async function makePlaybackUrl(
  requestUrl: string,
  sid: string,
  uid: string,
  path: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const token = await signPlaybackToken({ sid, uid, path, iat: now, exp: now + 900 });
  const relative =
    "/api/public/v1/streaming/hls/" +
    path.split("/").map(encodeURIComponent).join("/") +
    "?sid=" +
    encodeURIComponent(sid) +
    "&token=" +
    encodeURIComponent(token);
  return new URL(relative, requestUrl).toString();
}

function remainingSeconds(balanceMinor: number, ratePerMinuteMinor: number): number {
  if (ratePerMinuteMinor <= 0) return 0;
  return Math.floor((balanceMinor * 60) / ratePerMinuteMinor);
}

export const Route = createFileRoute("/api/public/v1/sessions/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let rotatedWebCookie: string | null = null;
        try {
          const { user } = await requireVerifiedViewer(request);
          const body = await parseBody(request, bodySchema);
          const fs = await Firestore.create();
          await assertLegalAcceptance(fs, user.uid, "public");
          if (body.clientPlatform === "web") {
            requireSameOrigin(request);
            const refreshToken = readWebRefreshCookie(request);
            if (!refreshToken) {
              throw new ApiError(
                401,
                "WEB_SESSION_REQUIRED",
                "A secure website session is required for web playback.",
              );
            }
            await assertWebRefreshSessionActive(fs, refreshToken);
            const webSession = await refreshFirebaseWebSession(refreshToken);
            if (webSession.uid !== user.uid) {
              throw new ApiError(
                401,
                "WEB_SESSION_MISMATCH",
                "The website session does not match the signed-in account.",
              );
            }
            await rotateWebRefreshSession(
              fs,
              refreshToken,
              webSession.refreshToken,
              webSession.uid,
            );
            rotatedWebCookie = webRefreshCookie(webSession.refreshToken);
          }
          const responseHeaders = rotatedWebCookie
            ? { "set-cookie": rotatedWebCookie, "cache-control": "no-store", pragma: "no-cache" }
            : undefined;
          await enforceRateLimit(fs, "session-start:" + user.uid, { limit: 8, windowMs: 60_000 });
          await assertRiskStepUp(fs, user.uid, user.authTime);

          const idempotencyDigest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(user.uid + ":" + body.idempotencyKey),
          );
          const idempotencyId = Array.from(new Uint8Array(idempotencyDigest), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join("");
          const idempotencyPath = "sessionStartRequests/" + idempotencyId;
          const priorRequest = await fs.getDoc(idempotencyPath);
          if (
            priorRequest &&
            priorRequest["uid"] === user.uid &&
            typeof priorRequest["sessionId"] === "string"
          ) {
            const priorSession = await fs.getDoc("sessions/" + priorRequest["sessionId"]);
            if (
              priorSession?.["active"] === true &&
              typeof priorSession["storagePath"] === "string"
            ) {
              const playbackUrl = await makePlaybackUrl(
                request.url,
                priorRequest["sessionId"],
                user.uid,
                priorSession["storagePath"],
              );
              const currentWallet = await getWallet(fs, user.uid);
              const balance = requireMinorUnitAmount(currentWallet.balanceMinor, "wallet balance");
              const rate = requireMinorUnitAmount(
                priorSession["ratePerMinuteMinor"],
                "ratePerMinuteMinor",
              );
              const leaseToken = await signSessionLeaseToken({
                sid: priorRequest["sessionId"],
                seq: integer(priorSession["lastClientSequence"]) ?? 0,
                positionMs: integer(priorSession["lastPlaybackPositionMs"]) ?? 0,
                billedSeconds: integer(priorSession["billedSeconds"]) ?? 0,
                leaseExp: Math.floor(Date.now() / 1000) + 45,
              });
              return Response.json(
                {
                  sessionId: priorRequest["sessionId"],
                  playbackUrl,
                  leaseToken,
                  ratePerMinuteMinor: rate,
                  walletBalanceMinor: balance,
                  currency:
                    typeof priorSession["currency"] === "string"
                      ? (priorSession["currency"] as string)
                      : currentWallet.currency,
                  timeRemainingSeconds: remainingSeconds(balance, rate),
                  sessionTotalMinor: integer(priorSession["sessionTotalMinor"]) ?? 0,
                  active: true,
                },
                responseHeaders ? { headers: responseHeaders } : {},
              );
            }
            throw new ApiError(
              409,
              "IDEMPOTENCY_KEY_ALREADY_USED",
              "This session request has already been used.",
            );
          }

          if (body.clientPlatform !== "web") {
            if (!body.integrityNonce || !body.integrityToken) {
              throw new ApiError(
                400,
                "PLAY_INTEGRITY_REQUIRED",
                "A fresh Google Play Integrity attestation is required.",
              );
            }
            await verifyPlayIntegrityToken(body.integrityToken, body.integrityNonce);
            await consumeIntegrityChallenge(fs, body.integrityNonce, user.uid);
          }

          const channel = await fs.getDoc("channels/" + body.channelId);
          if (
            !channel ||
            channel["published"] !== true ||
            String(channel["status"] ?? "").toUpperCase() === "SUSPENDED"
          ) {
            throw new ApiError(
              404,
              "CHANNEL_NOT_AVAILABLE",
              "This channel is not available for playback.",
            );
          }
          const assetId =
            body.contentAssetId ??
            (typeof channel["currentAssetId"] === "string" ? channel["currentAssetId"] : "");
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId)) {
            throw new ApiError(
              409,
              "CHANNEL_NO_ACTIVE_ASSET",
              "This channel has no playable media asset.",
            );
          }

          const asset = await fs.getDoc("contentAssets/" + assetId);
          if (!asset || asset["channelId"] !== body.channelId || asset["status"] !== "ready") {
            throw new ApiError(
              409,
              "CONTENT_ASSET_NOT_READY",
              "The selected channel media is not ready for playback.",
            );
          }
          if (asset["deliveryMode"] !== "bq_hosted") {
            throw new ApiError(
              503,
              "EXTERNAL_PROVIDER_PENDING",
              "This channel's external streaming provider adapter is not ready yet.",
            );
          }
          const storagePath = asset["storagePath"];
          const isDirectMp4 =
            typeof storagePath === "string" && storagePath.toLowerCase().endsWith(".mp4");
          const isHlsManifest =
            typeof storagePath === "string" && storagePath.toLowerCase().endsWith(".m3u8");
          if (
            typeof storagePath !== "string" ||
            !isSafeStoragePath(storagePath) ||
            !(isHlsManifest || isDirectMp4)
          ) {
            throw new ApiError(
              503,
              "STREAM_MANIFEST_NOT_CONFIGURED",
              "The channel's private streaming manifest is not configured.",
            );
          }

          const profile = await getUserProfile(fs, user.uid);
          assertContentAgeEligibility(
            profile.adultEligible,
            channel["adultOnly"] === true || asset["adultOnly"] === true,
            asset["contentRating"] ?? channel["contentRating"],
          );
          // A user-selected account country is suitable for currency defaults, not proof of licensed territory.
          // Fail closed until a trusted, host-provided geolocation adapter is configured.
          const viewerCountry = "";
          const rights =
            asset["license"] && typeof asset["license"] === "object"
              ? (asset["license"] as Record<string, unknown>)
              : channel["license"] && typeof channel["license"] === "object"
                ? (channel["license"] as Record<string, unknown>)
                : null;
          const pricing = await getPricingConfig(fs);
          const wallet = await getWallet(fs, user.uid);
          const walletCurrency = wallet.currency;
          const assetRates =
            asset["ratePerMinuteByCurrency"] && typeof asset["ratePerMinuteByCurrency"] === "object"
              ? (asset["ratePerMinuteByCurrency"] as Record<string, unknown>)
              : {};
          const channelRates =
            channel["ratePerMinuteByCurrency"] &&
            typeof channel["ratePerMinuteByCurrency"] === "object"
              ? (channel["ratePerMinuteByCurrency"] as Record<string, unknown>)
              : {};
          const configuredAssetRates =
            pricing["assetRatesById"] && typeof pricing["assetRatesById"] === "object"
              ? ((pricing["assetRatesById"] as Record<string, Record<string, unknown>>)[assetId] ??
                {})
              : {};
          const configuredChannelRates =
            pricing["channelRatesById"] && typeof pricing["channelRatesById"] === "object"
              ? ((pricing["channelRatesById"] as Record<string, Record<string, unknown>>)[
                  body.channelId
                ] ?? {})
              : {};
          const currencySpecificRate =
            configuredAssetRates[walletCurrency] ??
            configuredChannelRates[walletCurrency] ??
            assetRates[walletCurrency] ??
            channelRates[walletCurrency];

          // Batch N24 "Must pay": every playback grant requires an active hold and sufficient balance,
          // or an explicit owner-set free price rule on that title/asset/channel.
          // Channels or assets cannot bypass billing simply by setting paid: false.
          // Private previews (preview playback grants) are unbilled and never public.
          const isExplicitOwnerFree =
            currencySpecificRate === 0 ||
            (pricing.promoPricingWindows &&
              pricing.promoPricingWindows.some(
                (p) =>
                  p.active &&
                  p.overrideRateMinor === 0 &&
                  (p.targetType === "global" ||
                    (p.targetType === "movie" && p.targetId === assetId) ||
                    (p.targetType === "channel" && p.targetId === body.channelId)),
              ));

          let isPreviewGrant = false;
          if (body.previewToken) {
            try {
              const previewPayload = verifyPreviewToken(body.previewToken);
              const targetMatches =
                (previewPayload.targetType === "channel" && previewPayload.targetId === body.channelId) ||
                (previewPayload.targetType === "asset" && previewPayload.targetId === assetId);
              if (targetMatches && previewPayload.granteeUid === user.uid) {
                isPreviewGrant = true;
              }
            } catch {
              isPreviewGrant = false;
            }
          }
          const paidPlayback = !isExplicitOwnerFree && !isPreviewGrant;

          assertContentPlaybackRights({
            contentStatus: asset["contentStatus"] ?? channel["contentStatus"] ?? "published",
            license: rights,
            viewerCountry,
            platform: body.clientPlatform as PlaybackPlatform,
            paidPlayback,
          });
          const singlePriceCurrency =
            typeof asset["currency"] === "string"
              ? (asset["currency"] as string)
              : typeof channel["currency"] === "string"
                ? (channel["currency"] as string)
                : "NGN";
          const channelCurrency =
            typeof currencySpecificRate === "number" ? walletCurrency : singlePriceCurrency;
          if (paidPlayback && channelCurrency !== walletCurrency) {
            throw new ApiError(
              409,
              "CHANNEL_CURRENCY_MISMATCH",
              "This channel is not priced in your wallet currency.",
            );
          }
          const currency = paidPlayback ? channelCurrency : walletCurrency;
          const rateDefaults = pricing["defaultRatePerMinuteByCurrency"];
          const defaultRate =
            rateDefaults && typeof rateDefaults === "object"
              ? (rateDefaults as Record<string, unknown>)[currency]
              : undefined;
          const ratePerMinuteMinor = paidPlayback
            ? requireMinorUnitAmount(
                currencySpecificRate ??
                  asset["ratePerMinuteMinor"] ??
                  channel["ratePerMinuteMinor"] ??
                  defaultRate ??
                  (currency === "NGN" ? pricing["defaultRatePerMinuteMinor"] : undefined),
                "ratePerMinuteMinor",
              )
            : 0;
          if (paidPlayback && ratePerMinuteMinor < 1) {
            throw new ApiError(
              503,
              "CHANNEL_PRICE_INVALID",
              "This paid channel does not have a valid per-minute price.",
            );
          }
          const minimumBalances = pricing["minimumSessionBalanceByCurrency"];
          const configuredMinimum =
            minimumBalances && typeof minimumBalances === "object"
              ? (minimumBalances as Record<string, unknown>)[currency]
              : undefined;
          const assetMinimums =
            asset["minimumBalanceByCurrency"] &&
            typeof asset["minimumBalanceByCurrency"] === "object"
              ? (asset["minimumBalanceByCurrency"] as Record<string, unknown>)
              : {};
          const channelMinimums =
            channel["minimumBalanceByCurrency"] &&
            typeof channel["minimumBalanceByCurrency"] === "object"
              ? (channel["minimumBalanceByCurrency"] as Record<string, unknown>)
              : {};
          const minimumBalanceMinor = paidPlayback
            ? requireMinorUnitAmount(
                assetMinimums[currency] ??
                  channelMinimums[currency] ??
                  asset["minimumBalanceMinor"] ??
                  channel["minimumBalanceMinor"] ??
                  configuredMinimum ??
                  (currency === "NGN" ? pricing["minimumSessionBalanceMinor"] : 100),
                "minimumBalanceMinor",
              )
            : 0;
          const balanceMinor = requireMinorUnitAmount(wallet.balanceMinor, "wallet balance");
          if (paidPlayback && balanceMinor < minimumBalanceMinor) {
            throw new ApiError(
              402,
              "INSUFFICIENT_FUNDS",
              "Your wallet balance is too low to start this channel.",
            );
          }
          const configuredDailyLimits =
            pricing["dailySpendLimitByCurrency"] &&
            typeof pricing["dailySpendLimitByCurrency"] === "object"
              ? (pricing["dailySpendLimitByCurrency"] as Record<string, unknown>)
              : {};
          const configuredDailyLimit = configuredDailyLimits[currency];
          const dailySpendLimitMinor =
            wallet.dailySpendLimitMinor ??
            (configuredDailyLimit === undefined
              ? null
              : requireMinorUnitAmount(configuredDailyLimit, "dailySpendLimitMinor"));
          if (
            paidPlayback &&
            dailySpendLimitMinor !== null &&
            wallet.spentTodayMinor >= dailySpendLimitMinor
          ) {
            throw new ApiError(
              402,
              "DAILY_SPEND_LIMIT_REACHED",
              "Your daily viewing limit has been reached.",
            );
          }

          const channelOwnerUid =
            typeof channel["ownerUid"] === "string" ? channel["ownerUid"] : "";
          // Backward compatibility for platform live channels created before
          // ownerUid was corrected to "platform". They must not require the
          // Zillionaire owner personal producer settlement account.
          const platformOwned =
            channelOwnerUid === "platform" ||
            (channel["type"] === "platform" && channel["deliveryMode"] === "live_hls");
          const producerUid = platformOwned ? "" : channelOwnerUid;
          if (!platformOwned && !/^[A-Za-z0-9_-]{1,128}$/.test(producerUid)) {
            throw new ApiError(
              503,
              "CHANNEL_OWNER_INVALID",
              "The channel owner is not configured for revenue settlement.",
            );
          }
          const producer = producerUid ? await fs.getDoc("producers/" + producerUid) : null;
          if (producerUid && !producer) {
            throw new ApiError(
              503,
              "PRODUCER_ACCOUNT_MISSING",
              "The channel producer account is not available.",
            );
          }
          const configuredShares =
            pricing["producerShareBpsByChannel"] &&
            typeof pricing["producerShareBpsByChannel"] === "object"
              ? (pricing["producerShareBpsByChannel"] as Record<string, unknown>)
              : {};
          const shareBps = platformOwned
            ? 0
            : integer(
                configuredShares[body.channelId] ??
                  channel["producerShareBps"] ??
                  pricing["defaultProducerShareBps"],
              );
          if (shareBps === null || shareBps > 10_000) {
            throw new ApiError(
              503,
              "REVENUE_SPLIT_INVALID",
              "The channel revenue split is not configured correctly.",
            );
          }

          const sessionId = crypto.randomUUID().replace(/-/g, "");
          const streamConfiguration = await loadStreamStorageConfiguration(
            fs,
            asset,
            assetId,
            sessionId,
          );
          const assetBinding = resolveAssetStreamBinding(asset, assetId);
          if (
            streamConfiguration.configurationStatus !== "configured" ||
            !streamConfiguration.metadata.enabled ||
            streamConfiguration.metadata.mode !== "active" ||
            streamConfiguration.metadata.paidEgressEnabled === true ||
            (streamConfiguration.metadata.destinationId !== LEGACY_STREAM_DESTINATION_ID &&
              streamConfiguration.metadata.healthStatus !== "healthy")
          ) {
            throw new ApiError(
              503,
              "STREAM_DESTINATION_UNAVAILABLE",
              "The streaming location is not ready for playback.",
            );
          }
          if (!storagePath.startsWith(assetBinding.objectPrefix + "/")) {
            throw new ApiError(
              503,
              "STREAM_MANIFEST_NOT_CONFIGURED",
              "The channel's streaming manifest does not match its assigned storage location.",
            );
          }
          const storedBitrate =
            integer(asset["streamBitrateBps"]) ?? integer(asset["averageBitrateBps"]);
          const streamBitrateBps =
            storedBitrate !== null && storedBitrate >= 64_000 && storedBitrate <= 25_000_000
              ? storedBitrate
              : 1_500_000;
          // Reserve the whole expected asset before granting playback so a
          // viewer is not cut off when a free allowance is reached mid-film.
          const initialEgressBytes = estimateExpectedPlaybackBytes({
            ...asset,
            streamBitrateBps,
          });

          const now = new Date();
          const nowIso = now.toISOString();
          const budgetMonth = nowIso.slice(0, 7);
          const monthlyUsagePath = "walletMonthlyUsage/" + user.uid + "_" + budgetMonth;
          const playbackUrl = await makePlaybackUrl(request.url, sessionId, user.uid, storagePath);
          const egressGrant = await reserveExpectedStorageEgress(
            fs,
            streamConfiguration.metadata,
            sessionId,
            initialEgressBytes,
          );
          const activeSessionsPath = "activeSessions/" + user.uid;
          const walletPath = "wallets/" + user.uid;
          const holdPath = "walletHolds/" + sessionId;
          const configuredSessionLimit = integer(pricing["maxConcurrentSessions"]);
          const maxConcurrentSessions =
            configuredSessionLimit !== null &&
            configuredSessionLimit >= 1 &&
            configuredSessionLimit <= 5
              ? configuredSessionLimit
              : 2;
          const sessionFields = {
            uid: user.uid,
            channelId: body.channelId,
            contentAssetId: assetId,
            producerUid: producerUid || null,
            producerShareBps: shareBps,
            deliveryMode: "bq_hosted",
            storagePath,
            playbackUrl,
            clientPlatform: body.clientPlatform,
            viewerCountry,
            streamDestinationId: streamConfiguration.metadata.destinationId,
            replicaId:
              streamConfiguration.metadata.destinationId === assetBinding.streamDestinationId
                ? null
                : streamConfiguration.metadata.destinationId,
            streamBitrateBps,
            streamQualityCap: egressGrant.qualityCap,
            storageEgressReservationId: sessionId,
            storageEgressGroupId: streamConfiguration.metadata.accountGroup,
            initialExpectedEgressBytes: initialEgressBytes,
            ratePerMinuteMinor,
            currency,
            paidPlayback,
            dailySpendLimitMinor,
            status: "active",
            active: true,
            startedAt: nowIso,
            lastHeartbeatAt: nowIso,
            lastClientSequence: 0,
            lastPlaybackState: "idle",
            lastPlaybackPositionMs: 0,
            billedSeconds: 0,
            sessionTotalMinor: 0,
            walletBalanceMinor: balanceMinor,
            walletHoldMinor: 0,
            pricingVersion: pricing.version,
            licenseValidUntil: rights?.["validUntil"] ?? null,
          };
          let committedBalanceMinor = balanceMinor;
          try {
            await fs.transact(
              [idempotencyPath, activeSessionsPath, walletPath, holdPath, monthlyUsagePath],
              (docs) => {
                if (docs[0])
                  throw new ApiError(
                    409,
                    "IDEMPOTENCY_KEY_ALREADY_USED",
                    "This session request has already been used.",
                  );
                const activeSessionDoc = docs[1] ?? {};
                const currentWallet = docs[2] ?? {};
                const monthlyUsage = docs[4] ?? {};
                const currentBalance =
                  currentWallet["balanceMinor"] === undefined
                    ? 0
                    : requireMinorUnitAmount(currentWallet["balanceMinor"], "wallet balance");
                const heldBalance = integer(currentWallet["heldBalanceMinor"]) ?? 0;
                const today = nowIso.slice(0, 10);
                const spentToday =
                  currentWallet["spentDate"] === today
                    ? (integer(currentWallet["spentTodayMinor"]) ?? 0)
                    : 0;
                const dailyLimit =
                  typeof currentWallet["dailySpendLimitMinor"] === "number"
                    ? currentWallet["dailySpendLimitMinor"]
                    : dailySpendLimitMinor;
                const dailyRemaining =
                  typeof dailyLimit === "number" && Number.isSafeInteger(dailyLimit)
                    ? Math.max(0, dailyLimit - spentToday)
                    : Number.MAX_SAFE_INTEGER;
                const monthlyBudget = integer(currentWallet["monthlyBudgetMinor"]) ?? 0;
                const monthlySpent = integer(monthlyUsage["spentMinor"]) ?? 0;
                const monthlyRemaining =
                  monthlyBudget > 0
                    ? Math.max(0, monthlyBudget - monthlySpent)
                    : Number.MAX_SAFE_INTEGER;
                if (paidPlayback && monthlyRemaining <= 0) {
                  throw new ApiError(
                    402,
                    "MONTHLY_BUDGET_REACHED",
                    "Your monthly viewing budget has been reached.",
                  );
                }
                const targetHoldMinor =
                  ratePerMinuteMinor > 0
                    ? Math.min(
                        Number.MAX_SAFE_INTEGER,
                        ratePerMinuteMinor * 10,
                        dailyRemaining,
                        monthlyRemaining,
                      )
                    : 0;
                const hold = initialSessionHold(currentBalance, heldBalance, targetHoldMinor);
                if (paidPlayback && hold.holdMinor < 1) {
                  throw new ApiError(
                    402,
                    "INSUFFICIENT_AVAILABLE_BALANCE",
                    "Your available wallet balance is already reserved by another viewing session.",
                  );
                }
                if (
                  typeof currentWallet["currency"] === "string" &&
                  currentWallet["currency"] !== currency
                ) {
                  throw new ApiError(
                    409,
                    "WALLET_CURRENCY_MISMATCH",
                    "The wallet currency changed while playback was starting.",
                  );
                }
                const nowMs = now.getTime();
                const liveSessions = acquireSessionLease(
                  activeSessionDoc["sessions"],
                  sessionId,
                  nowMs,
                  maxConcurrentSessions,
                );
                if (!liveSessions) {
                  throw new ApiError(
                    409,
                    "CONCURRENT_SESSION_LIMIT",
                    "Your account is already using the maximum number of concurrent playback sessions.",
                  );
                }
                committedBalanceMinor = currentBalance;
                const committedSessionFields = {
                  ...sessionFields,
                  walletBalanceMinor: currentBalance,
                  walletHoldMinor: hold.holdMinor,
                };
                return {
                  result: undefined,
                  writes: [
                    {
                      update: {
                        name: fs.docName("sessions/" + sessionId),
                        fields: encodeFields(committedSessionFields),
                      },
                      currentDocument: { exists: false },
                    },
                    {
                      update: {
                        name: fs.docName(idempotencyPath),
                        fields: encodeFields({ uid: user.uid, sessionId, createdAt: nowIso }),
                      },
                      currentDocument: { exists: false },
                    },
                    {
                      update: {
                        name: fs.docName(activeSessionsPath),
                        fields: encodeFields({ sessions: liveSessions, updatedAt: nowIso }),
                      },
                      updateMask: { fieldPaths: ["sessions", "updatedAt"] },
                      ...(docs[1] ? {} : { currentDocument: { exists: false } }),
                    },
                    {
                      update: {
                        name: fs.docName(walletPath),
                        fields: encodeFields({
                          balanceMinor: currentBalance,
                          heldBalanceMinor: hold.heldBalanceMinor,
                          currency,
                          updatedAt: nowIso,
                        }),
                      },
                      updateMask: {
                        fieldPaths: ["balanceMinor", "heldBalanceMinor", "currency", "updatedAt"],
                      },
                      ...(docs[2] ? {} : { currentDocument: { exists: false } }),
                    },
                    {
                      update: {
                        name: fs.docName(holdPath),
                        fields: encodeFields({
                          uid: user.uid,
                          sessionId,
                          amountMinor: hold.holdMinor,
                          currency,
                          status: hold.holdMinor > 0 ? "active" : "released",
                          expiresAt:
                            hold.holdMinor > 0
                              ? new Date(now.getTime() + 120_000).toISOString()
                              : null,
                          createdAt: nowIso,
                          updatedAt: nowIso,
                        }),
                      },
                      currentDocument: { exists: false },
                    },
                  ],
                };
              },
            );
          } catch (error) {
            await releaseExpectedStorageEgress(fs, sessionId).catch(() => undefined);
            throw error;
          }

          const leaseToken = await signSessionLeaseToken({
            sid: sessionId,
            seq: 0,
            positionMs: 0,
            billedSeconds: 0,
            leaseExp: Math.floor(Date.now() / 1000) + 45,
          });
          await recordRiskSignal(fs, user.uid, "session_start");
          return Response.json(
            {
              sessionId,
              playbackUrl,
              leaseToken,
              ratePerMinuteMinor,
              walletBalanceMinor: committedBalanceMinor,
              currency,
              timeRemainingSeconds: remainingSeconds(committedBalanceMinor, ratePerMinuteMinor),
              sessionTotalMinor: 0,
              active: true,
            },
            { status: 201, ...(responseHeaders ? { headers: responseHeaders } : {}) },
          );
        } catch (error) {
          const response = errorBody(error);
          if (!rotatedWebCookie) return response;
          const headers = new Headers(response.headers);
          headers.set("set-cookie", rotatedWebCookie);
          headers.set("cache-control", "no-store");
          headers.set("pragma", "no-cache");
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        }
      },
    },
  },
});
