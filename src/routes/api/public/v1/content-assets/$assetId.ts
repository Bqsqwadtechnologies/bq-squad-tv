import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getUserProfile, requireUser } from "@/lib/server/api";
import { assertContentAgeEligibility } from "@/lib/server/content-rating";
import { verifyPreviewToken } from "@/lib/server/preview-grants";
import { resolveAssetMediaBinding } from "@/lib/server/storage/asset-binding";
import {
  createStorageDownloadTarget,
  loadStreamStorageConfiguration,
} from "@/lib/server/storage/transfers";

export const Route = createFileRoute("/api/public/v1/content-assets/$assetId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const assetId = params.assetId;
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId)) {
            throw new ApiError(400, "ASSET_ID_INVALID", "The content identifier is invalid.");
          }
          const fs = await Firestore.create();
          const asset = await fs.getDoc("contentAssets/" + assetId);
          if (!asset || asset["status"] !== "ready") {
            throw new ApiError(
              404,
              "CONTENT_NOT_AVAILABLE",
              "This content is not ready for playback.",
            );
          }
          const channelId = typeof asset["channelId"] === "string" ? asset["channelId"] : "";
          const channel = channelId ? await fs.getDoc("channels/" + channelId) : null;
          const previewToken = new URL(request.url).searchParams.get("previewToken");
          let isPrivatePreview = false;
          if (previewToken) {
            try {
              const grant = verifyPreviewToken(previewToken);
              isPrivatePreview =
                grant.targetType === "asset" &&
                grant.targetId === assetId &&
                grant.granteeUid === user.uid &&
                grant.isPreview === true;
            } catch {
              isPrivatePreview = false;
            }
            if (!isPrivatePreview) {
              throw new ApiError(403, "PREVIEW_NOT_AUTHORIZED", "This private preview link is not valid for this account.");
            }
          }
          if (
            !channel ||
            (channel["published"] !== true && !isPrivatePreview) ||
            String(channel["status"] ?? "").toUpperCase() === "SUSPENDED" ||
            (asset["contentStatus"] !== "published" && !isPrivatePreview)
          ) {
            throw new ApiError(
              404,
              "CONTENT_NOT_AVAILABLE",
              "This content is not published or available.",
            );
          }
          const profile = await getUserProfile(fs, user.uid);
          assertContentAgeEligibility(
            profile.adultEligible,
            channel["adultOnly"] === true || asset["adultOnly"] === true,
            asset["contentRating"] ?? channel["contentRating"],
          );
          const license =
            asset["license"] && typeof asset["license"] === "object"
              ? (asset["license"] as Record<string, unknown>)
              : {};
          const now = Date.now();
          const validFrom =
            typeof license["validFrom"] === "string" ? Date.parse(license["validFrom"]) : NaN;
          const validUntil =
            typeof license["validUntil"] === "string" ? Date.parse(license["validUntil"]) : NaN;
          const rightsCurrent =
            license["status"] === "verified" &&
            license["verificationStatus"] === "verified" &&
            license["commercialStreamingAllowed"] === true &&
            license["payPerMinuteAllowed"] === true &&
            Number.isFinite(validFrom) &&
            Number.isFinite(validUntil) &&
            validFrom <= now &&
            validUntil > now;
          const currency =
            typeof asset["currency"] === "string"
              ? asset["currency"]
              : typeof channel["currency"] === "string"
                ? channel["currency"]
                : "USD";
          const rateByCurrency =
            asset["ratePerMinuteByCurrency"] && typeof asset["ratePerMinuteByCurrency"] === "object"
              ? (asset["ratePerMinuteByCurrency"] as Record<string, unknown>)
              : {};
          const channelRates =
            channel["ratePerMinuteByCurrency"] &&
            typeof channel["ratePerMinuteByCurrency"] === "object"
              ? (channel["ratePerMinuteByCurrency"] as Record<string, unknown>)
              : {};
          const ratePerMinuteMinor =
            typeof rateByCurrency[currency] === "number"
              ? (rateByCurrency[currency] as number)
              : typeof channelRates[currency] === "number"
                ? (channelRates[currency] as number)
                : typeof asset["ratePerMinuteMinor"] === "number"
                  ? (asset["ratePerMinuteMinor"] as number)
                  : typeof channel["ratePerMinuteMinor"] === "number"
                    ? (channel["ratePerMinuteMinor"] as number)
                    : 0;

          let posterUrl = typeof asset["posterUrl"] === "string" ? asset["posterUrl"] : null;
          const signMedia = async (mediaId: string): Promise<string | null> => {
            const media = await fs.getDoc("contentAssetMedia/" + mediaId);
            if (!media || media["assetId"] !== assetId) return null;
            const binding = resolveAssetMediaBinding(media, assetId);
            if (!binding.objectKey) return null;
            const storage = await loadStreamStorageConfiguration(fs, media, assetId);
            if (
              storage.configurationStatus !== "configured" ||
              !storage.metadata.enabled ||
              storage.metadata.mode !== "active" ||
              storage.metadata.healthStatus !== "healthy"
            )
              return null;
            const signed = await createStorageDownloadTarget(storage, binding.objectKey, 300);
            return signed.signedUrl;
          };
          if (rightsCurrent && typeof asset["posterMediaId"] === "string") {
            posterUrl = await signMedia(asset["posterMediaId"]).catch(() => posterUrl);
          }
          const thumbnailIds = Array.isArray(asset["thumbnailMediaIds"])
            ? asset["thumbnailMediaIds"]
                .filter((value): value is string => typeof value === "string")
                .slice(0, 8)
            : [];
          const thumbnailUrls = rightsCurrent
            ? (await Promise.all(thumbnailIds.map((id) => signMedia(id).catch(() => null)))).filter(
                (value): value is string => value !== null,
              )
            : [];

          // Resolve public producer identity and optional transparent video branding.
          const producerUid = typeof asset["ownerUid"] === "string" ? asset["ownerUid"] : typeof asset["producerUid"] === "string" ? asset["producerUid"] : null;
          let producerSummary: {
            slug: string;
            name: string;
            verified: boolean;
            blueVerified: boolean;
            brandOverlayText: string;
            brandOverlayLogoUrl: string | null;
          } | null = null;
          if (producerUid) {
            const prodDoc = await fs.getDoc("producers/" + producerUid);
            if (prodDoc) {
              let brandOverlayLogoUrl: string | null = null;
              if (typeof prodDoc["brandOverlayLogoPath"] === "string") {
                try {
                  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
                  const signedLogo = await supabaseAdmin.storage
                    .from("bq-sqwad-source-media")
                    .createSignedUrl(prodDoc["brandOverlayLogoPath"] as string, 60 * 60);
                  brandOverlayLogoUrl = signedLogo.data?.signedUrl || null;
                } catch {
                  brandOverlayLogoUrl = null;
                }
              }
              producerSummary = {
                slug: (prodDoc["slug"] as string) || (prodDoc["publicId"] as string) || producerUid,
                name: (prodDoc["displayName"] as string) || (prodDoc["name"] as string) || "Producer",
                verified: prodDoc["verificationStatus"] === "APPROVED",
                blueVerified: prodDoc["publicVerificationStatus"] === "ACTIVE" &&
                  typeof prodDoc["publicVerificationUntil"] === "string" &&
                  Date.parse(prodDoc["publicVerificationUntil"] as string) > Date.now(),
                brandOverlayText: typeof prodDoc["brandOverlayText"] === "string" ? prodDoc["brandOverlayText"] as string : "",
                brandOverlayLogoUrl,
              };
            }
          }

          return Response.json({
            content: {
              id: assetId,
              channelId,
              title: typeof asset["title"] === "string" ? asset["title"] : "Untitled",
              description: typeof asset["description"] === "string" ? asset["description"] : "",
              category: typeof asset["category"] === "string" ? asset["category"] : "Movie",
              posterUrl,
              thumbnailUrls,
              averageStars: typeof asset["averageStars"] === "number" ? asset["averageStars"] : 0,
              ratingCount: typeof asset["ratingCount"] === "number" ? asset["ratingCount"] : 0,
              contentRating:
                typeof asset["ageRating"] === "string"
                  ? asset["ageRating"]
                  : typeof asset["contentRating"] === "string"
                    ? asset["contentRating"]
                    : typeof channel["contentRating"] === "string"
                      ? channel["contentRating"]
                      : "NR",
              deliveryMode:
                typeof asset["deliveryMode"] === "string"
                  ? asset["deliveryMode"]
                  : typeof channel["deliveryMode"] === "string"
                    ? channel["deliveryMode"]
                    : "unknown",
              currency,
              ratePerMinuteMinor,
              rightsCurrent,
              isPrivatePreview,
              producer: producerSummary,
              // The platform originality mark applies to BQ-hosted producer assets.
              // Licensed external-provider playback is not modified or overlaid.
              bqOriginalMark: Boolean(producerUid) && (
                ["bq_hosted", "native"].includes(
                  String(asset["deliveryMode"] || channel["deliveryMode"] || "").toLowerCase(),
                )
              ),
            },
            channel: {
              id: channelId,
              title: typeof channel["title"] === "string" ? channel["title"] : "Channel",
              category: typeof channel["category"] === "string" ? channel["category"] : "Channel",
            },
            producer: producerSummary,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
