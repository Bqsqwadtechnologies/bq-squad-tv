import { ApiError } from "../firebase-admin";

export type StorageProviderType = "lovable_storage" | "backblaze_b2";
export type StoragePurpose =
  | "source_media"
  | "hls_streaming"
  | "posters"
  | "thumbnails"
  | "downloads"
  | "temporary"
  | "backup"
  | "producer_verification";

export type StorageDestinationMetadata = {
  destinationId: string;
  providerType: StorageProviderType;
  accountAlias: string;
  secretPrefix: string;
  bucketName: string;
  region: string;
  purpose: StoragePurpose;
  softCapBytes: number;
  accountCapBytes?: number | null;
  dailyEgressCapBytes: number | null;
  priority: number;
  enabled: boolean;
  accountGroup: string;
  mode: "active" | "drain" | "retired";
  replicaOf: string | null;
  usageBytes?: number | null;
  usageSource?: "ledger" | "provider" | null;
  usageCheckedAt?: string | null;
  egressMonthBytes?: number;
  egressMonthKey?: string;
  egressDayBytes?: number;
  egressDayKey?: string;
  freeEgressBudgetBytes?: number | null;
  paidEgressEnabled?: boolean;
  egressLevel?: "normal" | "warn" | "throttle" | "blocked" | "paid";
  egressAlertAt?: string | null;
  healthStatus?: "healthy" | "degraded" | "misconfigured" | "unreachable" | "unknown";
  healthCheckedAt?: string | null;
  lastErrorCode?: string | null;
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
  const accountCapBytes = input["accountCapBytes"] ?? null;
  const dailyEgressCapBytes = input["dailyEgressCapBytes"] ?? null;
  const priority = input["priority"];
  const enabled = input["enabled"];
  const accountGroup = input["accountGroup"] ?? (providerType === "lovable_storage" ? "lovable-default-workspace" : `b2:${String(secretPrefix ?? "")}`);
  const mode = input["mode"] ?? (enabled === true ? "active" : "retired");
  const replicaOf = input["replicaOf"] ?? null;
  const usageBytes = input["usageBytes"] ?? null;
  const usageSource = input["usageSource"] ?? null;
  const healthStatus = input["healthStatus"] ?? "unknown";
  const egressMonthBytes = input["egressMonthBytes"] ?? 0;
  const egressDayBytes = input["egressDayBytes"] ?? 0;
  const freeEgressBudgetBytes = input["freeEgressBudgetBytes"] ?? null;
  const paidEgressEnabled = input["paidEgressEnabled"] ?? false;
  const egressLevel = input["egressLevel"] ?? "normal";
  const lastErrorCode = input["lastErrorCode"] ?? null;

  if (typeof destinationId !== "string" || !DESTINATION_ID.test(destinationId) ||
      (providerType !== "lovable_storage" && providerType !== "backblaze_b2") ||
      typeof accountAlias !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 _.-]{1,79}$/.test(accountAlias) ||
      typeof secretPrefix !== "string" || !SECRET_PREFIX.test(secretPrefix) ||
      typeof bucketName !== "string" || !BUCKET_NAME.test(bucketName) ||
      typeof region !== "string" || !/^[A-Za-z0-9-]{1,80}$/.test(region) ||
      !["source_media", "hls_streaming", "posters", "thumbnails", "downloads", "temporary", "backup", "producer_verification"].includes(String(purpose)) ||
      typeof accountGroup !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9:_-]{1,99}$/.test(accountGroup) ||
      !["active", "drain", "retired"].includes(String(mode)) ||
      (replicaOf !== null && (typeof replicaOf !== "string" || !DESTINATION_ID.test(replicaOf))) ||
      typeof softCapBytes !== "number" || !Number.isSafeInteger(softCapBytes) || softCapBytes < 1 ||
      (accountCapBytes !== null && (typeof accountCapBytes !== "number" || !Number.isSafeInteger(accountCapBytes) || accountCapBytes < 1)) ||
      (dailyEgressCapBytes !== null && (typeof dailyEgressCapBytes !== "number" || !Number.isSafeInteger(dailyEgressCapBytes) || dailyEgressCapBytes < 1)) ||
      typeof priority !== "number" || !Number.isInteger(priority) || priority < 0 || priority > 10000 ||
      typeof enabled !== "boolean" ||
      (usageBytes !== null && (typeof usageBytes !== "number" || !Number.isSafeInteger(usageBytes) || usageBytes < 0)) ||
      (usageSource !== null && usageSource !== "ledger" && usageSource !== "provider") ||
      !["healthy", "degraded", "misconfigured", "unreachable", "unknown"].includes(String(healthStatus)) ||
      typeof egressMonthBytes !== "number" || !Number.isSafeInteger(egressMonthBytes) || egressMonthBytes < 0 ||
      typeof egressDayBytes !== "number" || !Number.isSafeInteger(egressDayBytes) || egressDayBytes < 0 ||
      (freeEgressBudgetBytes !== null && (typeof freeEgressBudgetBytes !== "number" || !Number.isSafeInteger(freeEgressBudgetBytes) || freeEgressBudgetBytes < 0)) ||
      typeof paidEgressEnabled !== "boolean" ||
      !["normal", "warn", "throttle", "blocked", "paid"].includes(String(egressLevel)) ||
      (lastErrorCode !== null && (typeof lastErrorCode !== "string" || !/^[A-Z0-9_]{1,80}$/.test(lastErrorCode)))) {
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
    accountCapBytes: accountCapBytes as number | null,
    dailyEgressCapBytes: dailyEgressCapBytes as number | null,
    priority,
    enabled,
    accountGroup,
    mode: mode as "active" | "drain" | "retired",
    replicaOf: replicaOf as string | null,
    usageBytes: usageBytes as number | null,
    usageSource: usageSource as "ledger" | "provider" | null,
    usageCheckedAt: typeof input["usageCheckedAt"] === "string" ? input["usageCheckedAt"] : null,
    egressMonthBytes,
    egressMonthKey: typeof input["egressMonthKey"] === "string" && /^\d{4}-\d{2}$/.test(input["egressMonthKey"]) ? input["egressMonthKey"] : undefined,
    egressDayBytes,
    egressDayKey: typeof input["egressDayKey"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input["egressDayKey"]) ? input["egressDayKey"] : undefined,
    freeEgressBudgetBytes: freeEgressBudgetBytes as number | null,
    paidEgressEnabled,
    egressLevel: egressLevel as StorageDestinationMetadata["egressLevel"],
    egressAlertAt: typeof input["egressAlertAt"] === "string" ? input["egressAlertAt"] : null,
    healthStatus: healthStatus as StorageDestinationMetadata["healthStatus"],
    healthCheckedAt: typeof input["healthCheckedAt"] === "string" ? input["healthCheckedAt"] : null,
    lastErrorCode: lastErrorCode as string | null,
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
      destination.metadata.mode !== "active" ||
      destination.metadata.purpose !== purpose ||
      !Number.isSafeInteger(incomingBytes) || incomingBytes < 0) return false;

  // Unknown usage is not treated as zero. Until a provider usage check is
  // available, the destination is not eligible for automatic capacity routing.
  if (reportedUsageBytes === null || !Number.isSafeInteger(reportedUsageBytes) || reportedUsageBytes < 0) return false;
  return reportedUsageBytes <= destination.metadata.softCapBytes - incomingBytes;
}

export function redactStorageDestination(destination: StorageDestinationConfiguration) {
  return {
    ...destination.metadata,
    configurationStatus: destination.configurationStatus,
    missingSecretNames: destination.missingSecretNames,
  };
}
