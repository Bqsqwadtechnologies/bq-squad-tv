import { ApiError, Firestore, encodeFields, type FirestoreWrite } from "../firebase-admin";
import { storageAccountEgressId } from "./ledger";
import {
  resolveStorageDestinationConfiguration,
  validateStorageDestinationMetadata,
  type StoragePurpose,
} from "./registry";

export type StoragePoolEntry = {
  id: string;
  priority: number;
  freeBytes: number;
  groupId: string;
  egressHeadroomBytes: number | null;
  state: "eligible" | "full";
  shardDocId: string;
};

const PURPOSES: StoragePurpose[] = [
  "source_media", "hls_streaming", "posters", "thumbnails",
  "downloads", "temporary", "backup", "producer_verification",
];

function safeBytes(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
function groupCapacityPath(groupId: string): string {
  return "storageAccountCapacity/" + storageAccountEgressId(groupId);
}
export { groupCapacityPath };

function groupCap(items: Array<{ softCapBytes: number; accountCapBytes?: number | null }>): number | null {
  if (items.length === 1) return items[0]?.accountCapBytes ?? items[0]?.softCapBytes ?? null;
  const caps = items.map(item => item.accountCapBytes).filter((value): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0);
  return caps.length === items.length && new Set(caps).size === 1 ? caps[0] ?? null : null;
}

export async function rebuildStoragePoolIndex(
  fs: Firestore,
  purposes: StoragePurpose[] = PURPOSES,
): Promise<{ destinationCount: number; eligibleCount: number; shardCount: number; groupCount: number }> {
  const rows = await fs.query("storageDestinations", { limit: 500 });
  const parsed = rows.map(row => {
    const { __id, ...raw } = row;
    const metadata = validateStorageDestinationMetadata({ ...raw, destinationId: __id });
    const configuration = resolveStorageDestinationConfiguration(metadata);
    return { metadata, configuration, reservedBytes: safeBytes(raw["reservedBytes"]), degradedUntil: raw["degradedUntil"] };
  });
  const groups = new Map<string, typeof parsed>();
  for (const item of parsed) {
    const group = groups.get(item.metadata.accountGroup) ?? [];
    group.push(item);
    groups.set(item.metadata.accountGroup, group);
  }
  const groupSummaries = new Map<string, {
    usageBytes: number | null;
    reservedBytes: number;
    capBytes: number | null;
    freeBytes: number;
    egressHeadroomBytes: number | null;
    destinationCount: number;
  }>();
  const writes: FirestoreWrite[] = [];
  const now = new Date().toISOString();
  const monthKey = now.slice(0, 7);

  for (const [groupId, items] of groups) {
    const usageKnown = items.every(item =>
      typeof item.metadata.usageBytes === "number" &&
      Number.isSafeInteger(item.metadata.usageBytes) &&
      item.metadata.usageBytes >= 0);
    const usageBytes = usageKnown
      ? items.reduce((sum, item) => sum + safeBytes(item.metadata.usageBytes), 0)
      : null;
    const reservedBytes = items.reduce((sum, item) => sum + item.reservedBytes, 0);
    const capBytes = groupCap(items.map(item => ({
      softCapBytes: item.metadata.softCapBytes,
      accountCapBytes: item.metadata.accountCapBytes,
    })));
    const freeBytes = usageBytes === null || capBytes === null
      ? 0
      : Math.max(0, capBytes - usageBytes - reservedBytes);
    const budgets = items.map(item => item.metadata.freeEgressBudgetBytes ?? null);
    const paidChoices = items.map(item => item.metadata.paidEgressEnabled === true);
    const budgetValue = budgets[0] ?? null;
    const paidConsistent = paidChoices.every(value => value === false);
    const budgetConsistent = budgets.every(value => value === budgetValue);
    const ledger = await fs.getDoc("storageAccountEgress/" + storageAccountEgressId(groupId));
    const egressUsed = ledger?.["monthKey"] === monthKey ? safeBytes(ledger["monthBytes"]) : 0;
    const egressHeadroomBytes = budgetConsistent && paidConsistent &&
      typeof budgetValue === "number" && Number.isSafeInteger(budgetValue) && budgetValue >= 0
      ? Math.max(0, budgetValue - egressUsed)
      : null;
    const summary = { usageBytes, reservedBytes, capBytes, freeBytes, egressHeadroomBytes, destinationCount: items.length };
    groupSummaries.set(groupId, summary);
    writes.push({
      update: {
        name: fs.docName(groupCapacityPath(groupId)),
        fields: encodeFields({ accountGroup: groupId, ...summary, updatedAt: now }),
      },
    });
  }

  let eligibleCount = 0;
  let shardCount = 0;
  const currentPoolDocs = await fs.query("storagePool", { limit: 500 });
  const desiredPoolIds = new Set<string>();

  for (const purpose of purposes) {
    const eligible = parsed.filter(item => {
      const metadata = item.metadata;
      const group = groupSummaries.get(metadata.accountGroup);
      const usage = metadata.usageBytes;
      const degradedUntil = typeof item.degradedUntil === "string" ? Date.parse(item.degradedUntil) : 0;
      return metadata.purpose === purpose &&
        metadata.enabled && metadata.mode === "active" &&
        metadata.healthStatus === "healthy" &&
        item.configuration.configurationStatus === "configured" &&
        Number.isSafeInteger(usage) && (usage as number) >= 0 &&
        Number.isFinite(degradedUntil) && degradedUntil <= Date.now() &&
        group?.usageBytes !== null && group?.capBytes !== null && (group?.freeBytes ?? 0) > 0;
    }).map(item => {
      const metadata = item.metadata;
      const group = groupSummaries.get(metadata.accountGroup)!;
      const bucketFree = Math.max(0, metadata.softCapBytes - safeBytes(metadata.usageBytes) - item.reservedBytes);
      const freeBytes = Math.min(bucketFree, group.freeBytes);
      const egressHeadroomBytes = purpose === "hls_streaming" ? group.egressHeadroomBytes : null;
      return {
        id: metadata.destinationId,
        priority: metadata.priority,
        freeBytes,
        groupId: metadata.accountGroup,
        egressHeadroomBytes,
        state: "eligible" as const,
      };
    }).filter(item => item.freeBytes > 0 &&
      (purpose !== "hls_streaming" || (item.egressHeadroomBytes !== null && item.egressHeadroomBytes > 0)))
      .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));

    eligibleCount += eligible.length;
    for (let offset = 0; offset < eligible.length; offset += 200) {
      const shard = eligible.slice(offset, offset + 200);
      const shardNumber = Math.floor(offset / 200);
      const docId = purpose + "__" + String(shardNumber).padStart(3, "0");
      desiredPoolIds.add(docId);
      shardCount++;
      writes.push({
        update: {
          name: fs.docName("storagePool/" + docId),
          fields: encodeFields({
            purpose,
            shardNumber,
            entries: shard,
            updatedAt: now,
          }),
        },
      });
    }
  }

  for (const doc of currentPoolDocs) {
    if (!desiredPoolIds.has(doc.__id)) writes.push({ delete: fs.docName("storagePool/" + doc.__id) });
  }
  if (writes.length > 500) {
    throw new ApiError(413, "STORAGE_POOL_REBUILD_LIMIT", "The storage pool is too large for one safe index rebuild.");
  }
  if (writes.length) await fs.commit(writes);
  return { destinationCount: parsed.length, eligibleCount, shardCount, groupCount: groups.size };
}

export async function getStoragePoolEntries(
  fs: Firestore,
  purpose: StoragePurpose,
): Promise<StoragePoolEntry[]> {
  const docs = await fs.query("storagePool", {
    filters: [{ field: "purpose", op: "EQUAL", value: purpose }],
    limit: 500,
  });
  const entries: StoragePoolEntry[] = [];
  for (const doc of docs) {
    const rawEntries = doc["entries"];
    if (!Array.isArray(rawEntries) || rawEntries.length > 200) {
      throw new ApiError(503, "STORAGE_POOL_INDEX_INVALID", "The storage pool index needs to be rebuilt.");
    }
    for (const raw of rawEntries) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const item = raw as Record<string, unknown>;
      if (typeof item["id"] !== "string" || !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(item["id"]) ||
          typeof item["priority"] !== "number" || !Number.isInteger(item["priority"]) ||
          typeof item["freeBytes"] !== "number" || !Number.isSafeInteger(item["freeBytes"]) || item["freeBytes"] < 0 ||
          typeof item["groupId"] !== "string" ||
          (item["egressHeadroomBytes"] !== null && item["egressHeadroomBytes"] !== undefined &&
            (typeof item["egressHeadroomBytes"] !== "number" || !Number.isSafeInteger(item["egressHeadroomBytes"]))) ||
          !["eligible", "full"].includes(String(item["state"]))) continue;
      entries.push({
        id: item["id"],
        priority: item["priority"],
        freeBytes: item["freeBytes"],
        groupId: item["groupId"],
        egressHeadroomBytes: typeof item["egressHeadroomBytes"] === "number" ? item["egressHeadroomBytes"] : null,
        state: item["state"] as "eligible" | "full",
        shardDocId: doc.__id,
      });
    }
  }
  return entries;
}

export function adjustPoolShardEntries(
  rawEntries: unknown,
  destinationId: string,
  deltaBytes: number,
): Array<Record<string, unknown>> {
  if (!Array.isArray(rawEntries) || !Number.isSafeInteger(deltaBytes)) {
    throw new ApiError(409, "STORAGE_POOL_INDEX_INVALID", "The storage pool index needs to be rebuilt.");
  }
  let found = false;
  const entries = rawEntries.map(raw => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw as Record<string, unknown>;
    const item = raw as Record<string, unknown>;
    if (item["id"] !== destinationId) return item;
    if (typeof item["freeBytes"] !== "number" || !Number.isSafeInteger(item["freeBytes"])) {
      throw new ApiError(409, "STORAGE_POOL_INDEX_INVALID", "The storage pool index needs to be rebuilt.");
    }
    found = true;
    const freeBytes = Math.max(0, item["freeBytes"] + deltaBytes);
    return { ...item, freeBytes, state: freeBytes > 0 ? "eligible" : "full" };
  });
  if (!found) throw new ApiError(409, "STORAGE_POOL_ENTRY_MISSING", "The selected storage location is no longer in the pool.");
  return entries as Array<Record<string, unknown>>;
}
