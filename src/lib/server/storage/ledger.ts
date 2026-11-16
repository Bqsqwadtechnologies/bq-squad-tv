import { ApiError } from "../firebase-admin";

export const STORAGE_LEDGER_SHARDS = 20;

export function storageAccountEgressId(accountGroup: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{1,99}$/.test(accountGroup)) throw new RangeError("Invalid storage account group.");
  let hash = 2166136261;
  for (let i = 0; i < accountGroup.length; i++) hash = Math.imul(hash ^ accountGroup.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
export type EgressLevel = "normal" | "warn" | "throttle" | "blocked" | "paid";

export function storageLedgerShard(key: string, shardCount = STORAGE_LEDGER_SHARDS): number {
  if (!key || !Number.isSafeInteger(shardCount) || shardCount < 1 || shardCount > 256) throw new RangeError("Invalid ledger shard input.");
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return (hash >>> 0) % shardCount;
}

export function calculateEgressLevel(usedBytes: number, budgetBytes: number, allowPaidEgress = false): EgressLevel {
  if (!Number.isSafeInteger(usedBytes) || usedBytes < 0 || !Number.isSafeInteger(budgetBytes) || budgetBytes < 0) throw new RangeError("Invalid egress ledger values.");
  if (budgetBytes === 0) return allowPaidEgress ? "paid" : "blocked";
  const ratio = usedBytes / budgetBytes;
  if (ratio >= 1) return allowPaidEgress ? "paid" : "blocked";
  if (ratio >= 0.95) return allowPaidEgress ? "paid" : "blocked";
  if (ratio >= 0.85) return "throttle";
  if (ratio >= 0.70) return "warn";
  return "normal";
}

export function calculateB2MonthlyFreeEgressBudget(averageStoredBytes: number, safetyFactor = 0.8): number {
  if (!Number.isSafeInteger(averageStoredBytes) || averageStoredBytes < 0 || !Number.isFinite(safetyFactor) || safetyFactor <= 0 || safetyFactor > 1) throw new RangeError("Invalid B2 egress budget inputs.");
  return Math.floor(averageStoredBytes * 3 * safetyFactor);
}

export function assertStorageObjectKey(key: string): string {
  if (typeof key !== "string" || key.length < 1 || key.length > 1024 || key.startsWith("/") || key.includes("\\\\") || key.split("/").some(part => !part || part === "." || part === "..")) {
    throw new ApiError(400, "STORAGE_OBJECT_KEY_INVALID", "The storage object key is invalid.");
  }
  return key;
}

export function resolveDestinationId(asset: Record<string, unknown>, role: "source" | "stream" | "poster", legacy: { source: string; stream: string; poster?: string }): string {
  const field = role === "source" ? "sourceDestinationId" : role === "stream" ? "streamDestinationId" : "posterDestinationId";
  const value = asset[field];
  if (typeof value === "string" && /^[a-z0-9][a-z0-9_-]{1,79}$/.test(value)) return value;
  const fallback = role === "source" ? legacy.source : role === "stream" ? legacy.stream : (legacy.poster ?? legacy.stream);
  return fallback;
}
