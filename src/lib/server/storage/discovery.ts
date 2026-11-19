import { ApiError } from "../firebase-admin";
import type { StorageDestinationMetadata, StoragePurpose } from "./registry";

const LOVABLE_BUNDLE = /^STORAGE_LOV_BUNDLE_\d{2,}$/;
const B2_PREFIX = /^STORAGE_B2_(?:NN)?(\d{2})$/;
const GB = 1_000_000_000;
const DEFAULT_LOVABLE_SOFT_CAP = 4_500_000_000;
const DEFAULT_LOVABLE_EGRESS = 9_000_000_000;
const DEFAULT_B2_SOFT_CAP = 9_000_000_000;

export type DiscoveredStorageDestination = Pick<
  StorageDestinationMetadata,
  | "destinationId"
  | "providerType"
  | "accountAlias"
  | "secretPrefix"
  | "bucketName"
  | "region"
  | "purpose"
  | "softCapBytes"
  | "accountCapBytes"
  | "dailyEgressCapBytes"
  | "priority"
  | "enabled"
  | "accountGroup"
  | "mode"
  | "replicaOf"
  | "freeEgressBudgetBytes"
  | "paidEgressEnabled"
> & { credentialSource: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function safeId(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.slice(0, 76);
}
function accountGroupForHost(host: string): string {
  return "lovable:" + safeId(host.replace(/\./g, "-")).slice(0, 90);
}
function validHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

async function discoverB2Bucket(
  prefix: string,
  env: Record<string, string | undefined>,
): Promise<{ bucketId: string; bucketName: string; region: string } | null> {
  const keyId = env[prefix + "_KEY_ID"]?.trim() ?? "";
  const appKey = env[prefix + "_APP_KEY"]?.trim() ?? "";
  const bucketId = env[prefix + "_BUCKET_ID"]?.trim() ?? "";
  const endpoint = env[prefix + "_ENDPOINT"]?.trim() ?? "";
  if (!keyId || !appKey || !bucketId) return null;
  let region = "";
  try {
    const parsed = new URL(endpoint);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      !parsed.hostname.endsWith(".backblazeb2.com")
    )
      return null;
    region = parsed.hostname.match(/^s3\.([a-z0-9-]+)\.backblazeb2\.com$/i)?.[1] ?? "";
  } catch {
    return null;
  }
  if (!region) return null;

  try {
    const auth = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
      headers: { authorization: "Basic " + btoa(keyId + ":" + appKey) },
      signal: AbortSignal.timeout(12_000),
    });
    if (!auth.ok) return null;
    const authData = (await auth.json()) as {
      apiUrl?: string;
      authorizationToken?: string;
      accountId?: string;
    };
    if (!authData.apiUrl || !authData.authorizationToken || !authData.accountId) return null;
    const apiUrl = new URL(authData.apiUrl);
    if (apiUrl.protocol !== "https:" || !apiUrl.hostname.endsWith(".backblazeb2.com")) return null;
    const listed = await fetch(new URL("/b2api/v2/b2_list_buckets", apiUrl), {
      method: "POST",
      headers: {
        authorization: authData.authorizationToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({ accountId: authData.accountId, bucketId }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!listed.ok) return null;
    const data = (await listed.json()) as {
      buckets?: Array<{ bucketId?: string; bucketName?: string }>;
    };
    const match = data.buckets?.find(
      (item) => item.bucketId === bucketId && typeof item.bucketName === "string",
    );
    if (!match?.bucketName || !/^[a-z0-9][a-z0-9._-]{1,62}$/.test(match.bucketName)) return null;
    return { bucketId, bucketName: match.bucketName, region };
  } catch {
    // Provider response bodies and credentials are deliberately never logged or returned.
    return null;
  }
}

function addLovableDestination(
  output: DiscoveredStorageDestination[],
  seen: Set<string>,
  input: { destinationId: string; bucketName: string; secretPrefix: string; url: string },
): void {
  if (
    !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(input.destinationId) ||
    !/^[a-z0-9][a-z0-9._-]{1,62}$/.test(input.bucketName) ||
    !validHttpsUrl(input.url) ||
    seen.has(input.destinationId)
  )
    return;
  let host = "";
  try {
    host = new URL(input.url).hostname;
  } catch {
    return;
  }
  const accountGroup = accountGroupForHost(host);
  if (!/^lovable:[a-z0-9_-]{2,90}$/.test(accountGroup)) return;
  seen.add(input.destinationId);
  output.push({
    destinationId: input.destinationId,
    providerType: "lovable_storage",
    accountAlias: "Lovable storage group",
    secretPrefix: input.secretPrefix,
    bucketName: input.bucketName,
    region: "africa-south1",
    purpose: "source_media" as StoragePurpose,
    softCapBytes: DEFAULT_LOVABLE_SOFT_CAP,
    accountCapBytes: DEFAULT_LOVABLE_SOFT_CAP,
    dailyEgressCapBytes: null,
    priority: 100,
    enabled: true,
    accountGroup,
    mode: "active",
    replicaOf: null,
    freeEgressBudgetBytes: DEFAULT_LOVABLE_EGRESS,
    paidEgressEnabled: false,
    credentialSource: input.secretPrefix,
  });
}

export async function discoverStorageDestinations(
  env: Record<string, string | undefined> = process.env,
  registeredIds: Set<string> = new Set(),
): Promise<{
  destinations: DiscoveredStorageDestination[];
  counts: {
    lovable: number;
    backblaze: number;
    total: number;
    skippedRegistered: number;
    unresolvedBackblaze: number;
  };
  secretNames: string[];
}> {
  const output: DiscoveredStorageDestination[] = [];
  const seen = new Set<string>();
  const secretNames = Object.keys(env)
    .filter(
      (name) =>
        LOVABLE_BUNDLE.test(name) ||
        /^STORAGE_B2_(?:NN)?\d{2}_(?:KEY_ID|APP_KEY|BUCKET_ID|ENDPOINT)$/.test(name),
    )
    .sort();
  let skippedRegistered = 0;
  let unresolvedBackblaze = 0;

  for (const name of secretNames.filter((value) => LOVABLE_BUNDLE.test(value))) {
    const raw = env[name]?.trim() ?? "";
    if (!raw || raw.length > 256_000) continue;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (Array.isArray(parsed["items"])) {
        if (parsed["items"].length < 1 || parsed["items"].length > 25) continue;
        for (const item of parsed["items"]) {
          if (
            !isRecord(item) ||
            typeof item["destinationId"] !== "string" ||
            typeof item["bucket"] !== "string" ||
            !validHttpsUrl(item["url"]) ||
            typeof item["serviceRoleKey"] !== "string" ||
            !item["serviceRoleKey"].trim()
          )
            continue;
          addLovableDestination(output, seen, {
            destinationId: item["destinationId"],
            bucketName: item["bucket"],
            secretPrefix: name,
            url: item["url"],
          });
        }
      } else if (
        Array.isArray(parsed["buckets"]) &&
        parsed["buckets"].length > 0 &&
        parsed["buckets"].length <= 500 &&
        parsed["buckets"].every((value) => typeof value === "string") &&
        new Set(parsed["buckets"]).size === parsed["buckets"].length &&
        validHttpsUrl(parsed["url"]) &&
        typeof parsed["serviceRoleKey"] === "string" &&
        parsed["serviceRoleKey"].trim()
      ) {
        for (const bucket of parsed["buckets"] as string[]) {
          const destinationId = "lov-" + safeId(bucket);
          addLovableDestination(output, seen, {
            destinationId,
            bucketName: bucket,
            secretPrefix: name,
            url: parsed["url"],
          });
        }
      }
    } catch {
      // Malformed bundles are omitted and remain misconfigured until corrected.
    }
  }

  const prefixes = [
    ...new Set(
      secretNames
        .filter((name) => name.endsWith("_KEY_ID"))
        .map((name) => name.slice(0, -"_KEY_ID".length))
        .filter((prefix) => B2_PREFIX.test(prefix)),
    ),
  ].sort();
  const bucketIdentities = new Set<string>();
  for (const prefix of prefixes) {
    const required = [
      prefix + "_KEY_ID",
      prefix + "_APP_KEY",
      prefix + "_BUCKET_ID",
      prefix + "_ENDPOINT",
    ];
    if (required.some((name) => !env[name]?.trim())) continue;
    const found = await discoverB2Bucket(prefix, env);
    if (!found) {
      unresolvedBackblaze++;
      continue;
    }
    if (bucketIdentities.has(found.bucketId)) continue;
    bucketIdentities.add(found.bucketId);
    const destinationId = "b2-" + safeId(found.bucketId);
    if (seen.has(destinationId)) continue;
    seen.add(destinationId);
    output.push({
      destinationId,
      providerType: "backblaze_b2",
      accountAlias: "Backblaze storage account",
      secretPrefix: prefix,
      bucketName: found.bucketName,
      region: found.region,
      purpose: "source_media",
      softCapBytes: DEFAULT_B2_SOFT_CAP,
      accountCapBytes: DEFAULT_B2_SOFT_CAP,
      dailyEgressCapBytes: null,
      priority: 100,
      enabled: true,
      accountGroup: "b2:" + safeId(found.bucketId),
      mode: "active",
      replicaOf: null,
      freeEgressBudgetBytes: 0,
      paidEgressEnabled: false,
      credentialSource: prefix,
    });
  }

  for (const destination of output) {
    if (registeredIds.has(destination.destinationId)) skippedRegistered++;
  }
  const destinations = output.filter(
    (destination) => !registeredIds.has(destination.destinationId),
  );
  const lovable = destinations.filter((item) => item.providerType === "lovable_storage").length;
  const backblaze = destinations.filter((item) => item.providerType === "backblaze_b2").length;
  return {
    destinations,
    counts: {
      lovable,
      backblaze,
      total: destinations.length,
      skippedRegistered,
      unresolvedBackblaze,
    },
    secretNames,
  };
}

export function storageMetadataFromDiscovery(
  item: DiscoveredStorageDestination,
): Omit<
  StorageDestinationMetadata,
  "usageBytes" | "usageSource" | "usageCheckedAt" | "healthStatus" | "healthCheckedAt"
> {
  if (!item.destinationId || item.paidEgressEnabled !== false) {
    throw new ApiError(
      400,
      "STORAGE_DISCOVERY_INVALID",
      "The discovered storage destination is invalid.",
    );
  }
  const { credentialSource: _credentialSource, ...metadata } = item;
  return metadata;
}
