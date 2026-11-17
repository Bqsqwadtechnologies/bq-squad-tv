import { ApiError } from "../firebase-admin";
import { assertStorageObjectKey } from "./ledger";
import type { StorageDestinationConfiguration } from "./registry";

const encoder = new TextEncoder();
const MAX_TTL_SECONDS = 6 * 60 * 60;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, char =>
    "%" + char.charCodeAt(0).toString(16).toUpperCase());
}
function encodePath(path: string): string {
  return path.split("/").map(awsEncode).join("/");
}
function encodeQuery(entries: Array<[string, string]>): string {
  return entries
    .sort(([ak, av], [bk, bv]) => ak.localeCompare(bk) || av.localeCompare(bv))
    .map(([key, value]) => awsEncode(key) + "=" + awsEncode(value))
    .join("&");
}
async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}
async function hmac(key: Uint8Array, value: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value)));
}
async function signingKey(secret: string, date: string, region: string): Promise<Uint8Array> {
  const dateKey = await hmac(encoder.encode("AWS4" + secret), date);
  const regionKey = await hmac(dateKey, region);
  const serviceKey = await hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}
function allowedHlsKey(key: string): boolean {
  const name = key.split("/").pop()?.toLowerCase() ?? "";
  return /^(?:master|index|variant(?:_[a-z0-9_-]+)?)\.m3u8$/.test(name) ||
    /^segment_[0-9]{5}\.(?:ts|m4s)$/.test(name) ||
    /^init\.mp4$/.test(name) ||
    /^subtitle_[a-z0-9_-]+\.vtt$/.test(name) ||
    /^(?:encryption|stream)_[a-z0-9_-]+\.(?:key|keyinfo)$/.test(name);
}
function safeS3Endpoint(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch {
    throw new ApiError(503, "STORAGE_DESTINATION_MISCONFIGURED", "The Backblaze S3 endpoint is invalid.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      !url.hostname.endsWith(".backblazeb2.com")) {
    throw new ApiError(503, "STORAGE_DESTINATION_MISCONFIGURED", "The Backblaze S3 endpoint is invalid.");
  }
  return url;
}

/**
 * Creates an S3 Signature Version 4 presigned GET URL without a provider API
 * request. Only explicitly permitted HLS delivery objects can be signed.
 */
export async function presignBackblazeHlsGet(input: {
  configuration: StorageDestinationConfiguration;
  objectKey: string;
  expiresInSeconds: number;
  now?: Date;
}): Promise<string> {
  const { configuration } = input;
  const credentials = configuration.credentials;
  if (configuration.configurationStatus !== "configured" ||
      configuration.metadata.providerType !== "backblaze_b2" ||
      !credentials?.keyId || !credentials.applicationKey || !credentials.endpoint) {
    throw new ApiError(503, "STORAGE_DESTINATION_MISCONFIGURED", "The Backblaze storage location is not configured.");
  }
  if (!Number.isInteger(input.expiresInSeconds) || input.expiresInSeconds < 1 ||
      input.expiresInSeconds > MAX_TTL_SECONDS) {
    throw new ApiError(400, "STORAGE_SIGNED_URL_TTL_INVALID", "The signed link lifetime is outside the allowed range.");
  }
  let objectKey: string;
  try { objectKey = assertStorageObjectKey(input.objectKey); } catch {
    throw new ApiError(400, "STORAGE_SIGNED_URL_PATH_INVALID", "This storage object cannot be signed.");
  }
  if (!allowedHlsKey(objectKey)) {
    throw new ApiError(403, "STORAGE_SIGNED_URL_TYPE_FORBIDDEN", "Only HLS playlists, segments, key information and subtitles can be signed.");
  }

  const endpoint = safeS3Endpoint(credentials.endpoint);
  const region = configuration.metadata.region;
  if (!/^[a-z0-9-]{3,32}$/.test(region)) {
    throw new ApiError(503, "STORAGE_DESTINATION_MISCONFIGURED", "The Backblaze signing region is invalid.");
  }
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new ApiError(400, "STORAGE_SIGNED_URL_CLOCK_INVALID", "The signing clock is invalid.");
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const amzDate = iso.slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const scope = dateStamp + "/" + region + "/s3/aws4_request";
  const canonicalUri = encodePath("/" + configuration.metadata.bucketName + "/" + objectKey);
  const query: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", credentials.keyId + "/" + scope],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(input.expiresInSeconds)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const canonicalQuery = encodeQuery(query);
  const canonicalHeaders = "host:" + endpoint.host.toLowerCase() + "\n";
  const canonicalRequest = [
    "GET", canonicalUri, canonicalQuery, canonicalHeaders, "host", "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256", amzDate, scope, await sha256(canonicalRequest),
  ].join("\n");
  const key = await signingKey(credentials.applicationKey, dateStamp, region);
  const signature = hex(await hmac(key, stringToSign));
  const finalQuery = encodeQuery([...query, ["X-Amz-Signature", signature]]);
  return endpoint.origin + canonicalUri + "?" + finalQuery;
}
