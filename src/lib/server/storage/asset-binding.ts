import { ApiError, Firestore, encodeFields } from "../firebase-admin";
import { resolveStorageDestinationConfiguration, validateStorageDestinationMetadata } from "./registry";

export const LEGACY_SOURCE_DESTINATION_ID = "lovable-source-legacy";
export const LEGACY_STREAM_DESTINATION_ID = "lovable-stream-legacy";

export type AssetStreamBinding = {
  streamDestinationId: string;
  streamReplicaIds: string[];
  objectPrefix: string;
};

const STORAGE_ID = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const ASSET_ID = /^[A-Za-z0-9_-]{1,100}$/;

export function resolveAssetStreamBinding(
  asset: Record<string, unknown>,
  assetId: string,
): AssetStreamBinding {
  if (!ASSET_ID.test(assetId)) throw new ApiError(400, "ASSET_ID_INVALID", "The content identifier is invalid.");
  const streamDestinationId = typeof asset["streamDestinationId"] === "string" &&
    STORAGE_ID.test(asset["streamDestinationId"])
    ? asset["streamDestinationId"]
    : LEGACY_STREAM_DESTINATION_ID;
  const streamReplicaIds = Array.isArray(asset["streamReplicaIds"])
    ? [...new Set(asset["streamReplicaIds"].filter((value): value is string =>
        typeof value === "string" && STORAGE_ID.test(value) && value !== streamDestinationId))].slice(0, 8)
    : [];
  const storedPrefix = typeof asset["objectPrefix"] === "string"
    ? asset["objectPrefix"]
    : typeof asset["streamObjectPrefix"] === "string" ? asset["streamObjectPrefix"]
      : typeof asset["hlsManifestKey"] === "string" && asset["hlsManifestKey"].includes("/")
        ? asset["hlsManifestKey"].slice(0, asset["hlsManifestKey"].lastIndexOf("/")) : "";
  const prefixBase = "hls/" + assetId + "/";
  const attemptSegment = storedPrefix.startsWith(prefixBase) ? storedPrefix.slice(prefixBase.length) : "";
  const objectPrefix = /^a[1-9][0-9]*$/.test(attemptSegment) ? storedPrefix : "hls/" + assetId;
  return { streamDestinationId, streamReplicaIds, objectPrefix };
}

export function resolveAssetMediaBinding(
  media: Record<string, unknown>,
  assetId: string,
): AssetStreamBinding & { objectKey: string | null; mediaType: string | null } {
  const binding = resolveAssetStreamBinding(media, assetId);
  const key = typeof media["objectKey"] === "string" ? media["objectKey"] : "";
  const objectKey = key.startsWith(binding.objectPrefix + "/") &&
    !key.includes("\\") && !key.split("/").some(part => part === "." || part === "..")
    ? key : null;
  const mediaType = media["mediaType"] === "poster" || media["mediaType"] === "thumbnail" || media["mediaType"] === "sprite"
    ? media["mediaType"] : null;
  return { ...binding, objectKey, mediaType };
}

export function classifyAssetMediaOutput(relativePath: string): "poster" | "thumbnail" | "sprite" | null {
  const filename = relativePath.split("/").pop() ?? "";
  if (/^poster\.(?:jpg|jpeg|png|webp)$/i.test(filename)) return "poster";
  if (/^thumbnail(?:_[A-Za-z0-9_-]+)?\.(?:jpg|jpeg|png|webp)$/i.test(filename)) return "thumbnail";
  if (/^sprite(?:_[A-Za-z0-9_-]+)?\.(?:jpg|jpeg|png|webp)$/i.test(filename)) return "sprite";
  return null;
}

export function isAllowedHlsOutputPath(relativePath: string): boolean {
  if (!relativePath || relativePath.startsWith("/") || relativePath.includes("\\") ||
      relativePath.split("/").some(part => !part || part === "." || part === "..")) return false;
  return /^(?:[A-Za-z0-9_-]+\/)*(?:master|index)\.m3u8$/i.test(relativePath) ||
    /^(?:[A-Za-z0-9_-]+\/)*segment_[0-9]{5}\.(?:ts|m4s)$/i.test(relativePath) ||
    /^(?:[A-Za-z0-9_-]+\/)*init\.mp4$/i.test(relativePath) ||
    /^(?:[A-Za-z0-9_-]+\/)*subtitle_[A-Za-z0-9_-]+\.vtt$/i.test(relativePath) ||
    /^(?:[A-Za-z0-9_-]+\/)*audio_[A-Za-z0-9_-]+\.aac$/i.test(relativePath) ||
    classifyAssetMediaOutput(relativePath) !== null;
}

export async function createAssetMediaRecordId(assetId: string, objectKey: string): Promise<string> {
  if (!ASSET_ID.test(assetId) || !objectKey || objectKey.length > 1024) {
    throw new ApiError(400, "ASSET_MEDIA_INVALID", "The media record is invalid.");
  }
  const bytes = new TextEncoder().encode(assetId + ":" + objectKey);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const suffix = Array.from(digest.slice(0, 12), value => value.toString(16).padStart(2, "0")).join("");
  return assetId + "-" + suffix;
}

/**
 * Switches an asset only after the new package has been uploaded and its
 * reservation committed. Asset binding and reservation attribution change
 * in one Firestore transaction; the old primary is retained as a replica.
 */
export async function bindAssetStreamStorage(
  fs: Firestore,
  input: { assetId: string; destinationId: string; objectPrefix: string; reservationId: string },
): Promise<AssetStreamBinding> {
  if (!ASSET_ID.test(input.assetId) || !STORAGE_ID.test(input.destinationId) ||
      !/^[A-Za-z0-9_-]{8,100}$/.test(input.reservationId) ||
      !input.objectPrefix.startsWith("hls/" + input.assetId + "/") ||
      !/^a[1-9][0-9]*$/.test(input.objectPrefix.slice(("hls/" + input.assetId + "/").length))) {
    throw new ApiError(400, "ASSET_STORAGE_BINDING_INVALID", "The storage assignment is invalid.");
  }
  const assetPath = "contentAssets/" + input.assetId;
  const destinationPath = "storageDestinations/" + input.destinationId;
  const reservationPath = "storageReservations/" + input.reservationId;
  const now = new Date().toISOString();
  let result: AssetStreamBinding | null = null;
  await fs.transact([assetPath, destinationPath, reservationPath], docs => {
    const asset = docs[0];
    const destination = docs[1];
    const reservation = docs[2];
    if (!asset || !destination || !reservation) {
      throw new ApiError(409, "ASSET_STORAGE_BINDING_MISSING", "The content or verified storage assignment is unavailable.");
    }
    const metadata = validateStorageDestinationMetadata({ ...destination, destinationId: input.destinationId });
    const configuration = resolveStorageDestinationConfiguration(metadata);
    const degradedUntil = typeof destination["degradedUntil"] === "string" ? Date.parse(destination["degradedUntil"]) : 0;
    if (metadata.purpose !== "hls_streaming" || !metadata.enabled || metadata.mode !== "active" ||
        metadata.healthStatus !== "healthy" || (Number.isFinite(degradedUntil) && degradedUntil > Date.now()) ||
        metadata.paidEgressEnabled === true || configuration.configurationStatus !== "configured") {
      throw new ApiError(409, "ASSET_STORAGE_DESTINATION_UNAVAILABLE", "The new streaming location is not ready.");
    }
    if (reservation["status"] !== "committed" || reservation["destinationId"] !== input.destinationId ||
        reservation["purpose"] !== "hls_streaming" || typeof reservation["actualBytes"] !== "number" ||
        !Number.isSafeInteger(reservation["actualBytes"]) || reservation["actualBytes"] < 1) {
      throw new ApiError(409, "ASSET_STORAGE_RESERVATION_UNVERIFIED", "The new package must be verified and its storage reservation completed first.");
    }
    const previous = resolveAssetStreamBinding(asset, input.assetId);
    const hadPreviousPackage = typeof asset["streamDestinationId"] === "string" ||
      typeof asset["streamObjectPrefix"] === "string" || typeof asset["hlsManifestKey"] === "string";
    const replicas = [...new Set([
      ...previous.streamReplicaIds,
      ...(hadPreviousPackage && previous.streamDestinationId !== input.destinationId ? [previous.streamDestinationId] : []),
    ])].filter(id => id !== input.destinationId).slice(0, 8);
    result = {
      streamDestinationId: input.destinationId,
      streamReplicaIds: replicas,
      objectPrefix: input.objectPrefix,
    };
    return {
      result: undefined,
      writes: [
        {
          update: {
            name: fs.docName(assetPath),
            fields: encodeFields({
              streamDestinationId: input.destinationId,
              streamReplicaIds: replicas,
              objectPrefix: input.objectPrefix,
              streamObjectPrefix: input.objectPrefix,
              streamBucket: metadata.bucketName,
              updatedAt: now,
            }),
          },
          updateMask: { fieldPaths: ["streamDestinationId", "streamReplicaIds", "objectPrefix", "streamObjectPrefix", "streamBucket", "updatedAt"] },
        },
        {
          update: {
            name: fs.docName(reservationPath),
            fields: encodeFields({
              assetId: input.assetId,
              bindingStatus: "bound",
              boundAt: now,
              previousDestinationId: hadPreviousPackage ? previous.streamDestinationId : null,
            }),
          },
          updateMask: { fieldPaths: ["assetId", "bindingStatus", "boundAt", "previousDestinationId"] },
        },
      ],
    };
  });
  if (!result) throw new ApiError(409, "ASSET_STORAGE_BINDING_FAILED", "The storage assignment could not be saved.");
  return result;
}
