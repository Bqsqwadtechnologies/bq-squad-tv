import { ApiError } from "../firebase-admin";

export type StorageProviderType = "lovable_storage" | "backblaze_b2";
export type StoragePurpose =
  | "source_media"
  | "hls_streaming"
  | "posters"
  | "thumbnails"
  | "downloads"
  | "temporary"
  | "backup";

export type StorageDestinationMetadata = {
  destinationId: string;
  providerType: StorageProviderType;
  accountAlias: string;
  secretPrefix: string;
  bucketName: string;
  region: string;
  purpose: StoragePurpose;
  softCapBytes: number;
  dailyEgressCapBytes: number | null;
  priority: number;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type StorageDestinationConfiguration = {
  metadata: StorageDestinationMetadata;
  configurationStatus: "configured" | "misconfigured" | "disabled";
  missingSecretNames: string[];
  credentials?: {
    url?: string;
    serviceRoleKey?: string;
    keyId?: string;
    applicationKey?: string;
    bucketId?: string;
    endpoint?: string;
  };
};

const DESTINATION_ID = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const SECRET_PREFIX = /^[A-Z][A-Z0-9_]{1,47}$/;
const BUCKET_NAME = /^[a-z0-9][a-z0-9._-]{1,62}$/;

function requiredSecretNames(destination: StorageDestinationMetadata): string[] {
  const prefix = destination.secretPrefix;
  return destination.providerType === "lovable_storage"
    ? [`${prefix}_URL`, `${prefix}_SERVICE_ROLE_KEY`]
    : [`${prefix}_KEY_ID`, `${prefix}_APP_KEY`, `${prefix}_BUCKET_ID`, `${prefix}_ENDPOINT`];
}

export function validateStorageDestinationMetadata(value: unknown): StorageDestinationMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "STORAGE_DESTINATION_INVALID", "Storage destination metadata is invalid.");
  }
  const input = value as Record<string, unknown>;
  const providerType = input["providerType"];
  const purpose = input["purpose"];
  const destinationId = input["destinationId"];
  const accountAlias = input["accountAlias"];
  const secretPrefix = input["secretPrefix"];
  const bucketName = input["bucketName"];
  const region = input["region"];
  const softCapBytes = input["softCapBytes"];
  const dailyEgressCapBytes = input["dailyEgressCapBytes"] ?? null;
  const priority = input["priority"];
  const enabled = input["enabled"];

  if (typeof destinationId !== "string" || !DESTINATION_ID.test(destinationId) ||
      (providerType !== "lovable_storage" && providerType !== "backblaze_b2") ||
      typeof accountAlias !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 _.-]{1,79}$/.test(accountAlias) ||
      typeof secretPrefix !== "string" || !SECRET_PREFIX.test(secretPrefix) ||
      typeof bucketName !== "string" || !BUCKET_NAME.test(bucketName) ||
      typeof region !== "string" || !/^[A-Za-z0-9-]{1,80}$/.test(region) ||
      !["source_media", "hls_streaming", "posters", "thumbnails", "downloads", "temporary", "backup"].includes(String(purpose)) ||
      typeof softCapBytes !== "number" || !Number.isSafeInteger(softCapBytes) || softCapBytes < 1 ||
      (dailyEgressCapBytes !== null && (typeof dailyEgressCapBytes !== "number" || !Number.isSafeInteger(dailyEgressCapBytes) || dailyEgressCapBytes < 1)) ||
      typeof priority !== "number" || !Number.isInteger(priority) || priority < 0 || priority > 10000 ||
      typeof enabled !== "boolean") {
    throw new ApiError(400, "STORAGE_DESTINATION_INVALID", "One or more storage destination fields are invalid.");
  }

  return {
    destinationId,
    providerType,
    accountAlias,
    secretPrefix,
    bucketName,
    region,
    purpose: purpose as StoragePurpose,
    softCapBytes,
    dailyEgressCapBytes: dailyEgressCapBytes as number | null,
    priority,
    enabled,
  };
}

/**
 * Resolve server-only credentials at request time. Only non-secret metadata is
 * stored in Firestore. Credential values are never returned by API handlers.
 */
export function resolveStorageDestinationConfiguration(
  metadata: StorageDestinationMetadata,
  env: Record<string, string | undefined> = process.env,
): StorageDestinationConfiguration {
  if (!metadata.enabled) {
    return { metadata, configurationStatus: "disabled", missingSecretNames: [] };
  }

  const names = requiredSecretNames(metadata);
  const missingSecretNames = names.filter(name => !env[name]?.trim());
  if (missingSecretNames.length > 0) {
    return { metadata, configurationStatus: "misconfigured", missingSecretNames };
  }

  if (metadata.providerType === "lovable_storage") {
    const url = env[`${metadata.secretPrefix}_URL`] ?? "";
    const serviceRoleKey = env[`${metadata.secretPrefix}_SERVICE_ROLE_KEY`] ?? "";
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || !serviceRoleKey) {
        throw new Error("invalid");
      }
    } catch {
      return {
        metadata,
        configurationStatus: "misconfigured",
        missingSecretNames: ["VALID_HTTPS_STORAGE_URL_AND_SERVICE_ROLE_KEY"],
      };
    }
    return {
      metadata,
      configurationStatus: "configured",
      missingSecretNames: [],
      credentials: { url, serviceRoleKey },
    };
  }

  const endpoint = env[`${metadata.secretPrefix}_ENDPOINT`] ?? "";
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".backblazeb2.com") ||
        parsed.username || parsed.password) throw new Error("invalid");
  } catch {
    return {
      metadata,
      configurationStatus: "misconfigured",
      missingSecretNames: ["VALID_BACKBLAZE_HTTPS_ENDPOINT"],
    };
  }

  return {
    metadata,
    configurationStatus: "configured",
    missingSecretNames: [],
    credentials: {
      keyId: env[`${metadata.secretPrefix}_KEY_ID`],
      applicationKey: env[`${metadata.secretPrefix}_APP_KEY`],
      bucketId: env[`${metadata.secretPrefix}_BUCKET_ID`],
      endpoint,
    },
  };
}

export function isStorageDestinationEligible(
  destination: StorageDestinationConfiguration,
  purpose: StoragePurpose,
  incomingBytes = 0,
  reportedUsageBytes: number | null = null,
): boolean {
  if (destination.configurationStatus !== "configured" ||
      !destination.metadata.enabled ||
      destination.metadata.purpose !== purpose ||
      !Number.isSafeInteger(incomingBytes) || incomingBytes < 0) return false;

  // Unknown usage is not treated as zero. Until a provider usage check is
  // available, the destination is not eligible for automatic capacity routing.
  if (reportedUsageBytes === null || !Number.isSafeInteger(reportedUsageBytes) || reportedUsageBytes < 0) return false;
  return reportedUsageBytes + incomingBytes <= destination.metadata.softCapBytes;
}

export function redactStorageDestination(destination: StorageDestinationConfiguration) {
  return {
    ...destination.metadata,
    configurationStatus: destination.configurationStatus,
    missingSecretNames: destination.missingSecretNames,
  };
}
