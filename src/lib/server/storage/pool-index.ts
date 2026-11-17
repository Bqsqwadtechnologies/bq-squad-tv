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

export function calculateStorageGroupCap(items: Array<{ softCapBytes: number; accountCapBytes?: number | null }>): number | null {
  if (items.length === 1) return items[0]?.accountCapBytes ?? items[0]?.softCapBytes ?? null;
  const caps = items.map(item => item.accountCapBytes).filter((value): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0);
  return caps.length === items.length && new Set(caps).size === 1 ? caps[0] ?? null : null;
}

export type CompactStoragePoolEntry = Omit<StoragePoolEntry, "shardDocId">;

export function shardStoragePoolEntries(
  purpose: StoragePurpose,
  entries: CompactStoragePoolEntry[],
): Array<{ docId: string; shardNumber: number; entries: CompactStoragePoolEntry[] }> {
  const sorted = [...entries].sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  if (sorted.length === 0) return [{ docId: purpose + "__000", shardNumber: 0, entries: [] }];
  const shards: Array<{ docId: string; shardNumber: number; entries: CompactStoragePoolEntry[] }> = [];
  for (let offset = 0; offset < sorted.length; offset += 200) {
    const shardNumber = Math.floor(offset / 200);
    shards.push({
      docId: purpose + "__" + String(shardNumber).padStart(3, "0"),
      shardNumber,
      entries: sorted.slice(offset, offset + 200).map(item => ({
        id: item.id,
        priority: item.priority,
        freeBytes: item.freeBytes,
        groupId: item.groupId,
        egressHeadroomBytes: item.egressHeadroomBytes,
        state: item.state,
      })),
    });
  }
  return shards;
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
  const capacityWrites: FirestoreWrite[] = [];
  const poolWrites: FirestoreWrite[] = [];
  const now = new Date().toISOString();
  const monthKey = now.slice(0, 7);

  for (const [groupId, items] of groups) {
    const knownItems = items.filter(item =>
      typeof item.metadata.usageBytes === "number" &&
      Number.isSafeInteger(item.metadata.usageBytes) &&
      item.metadata.usageBytes >= 0 &&
      (item.metadata.usageSource === "provider_listing" || item.metadata.usageSource === "ledger"));
    const knownUsageBytes = knownItems.reduce((sum, item) => sum + safeBytes(item.metadata.usageBytes), 0);
    const unknownUsageCount = items.length - knownItems.length;
    const usageBytes = unknownUsageCount === 0 ? knownUsageBytes : null;
    const reservedBytes = items.reduce((sum, item) => sum + item.reservedBytes, 0);
    const capBytes = calculateStorageGroupCap(items.map(item => ({
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
    const summary = { usageBytes, knownUsageBytes, unknownUsageCount, reservedBytes, capBytes, freeBytes, egressHeadroomBytes, destinationCount: items.length };
    groupSummaries.set(groupId, summary);
    capacityWrites.push({
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
        (metadata.usageSource === "provider_listing" || metadata.usageSource === "ledger") &&
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
    for (const shard of shardStoragePoolEntries(purpose, eligible)) {
      desiredPoolIds.add(shard.docId);
      shardCount++;
      poolWrites.push({
        update: {
          name: fs.docName("storagePool/" + shard.docId),
          fields: encodeFields({
            purpose,
            shardNumber: shard.shardNumber,
            entries: shard.entries,
            updatedAt: now,
          }),
        },
      });
    }
  }

  for (const doc of currentPoolDocs) {
    if (!desiredPoolIds.has(doc.__id)) poolWrites.push({ delete: fs.docName("storagePool/" + doc.__id) });
  }
  // Capacity summaries are committed before routing shards. A partially
  // rebuilt index can therefore only under-allocate; reservation transactions
  // still confirm each selected destination and shared account summary.
  for (let offset = 0; offset < capacityWrites.length; offset += 500) {
    await fs.commit(capacityWrites.slice(offset, offset + 500));
  }
  for (let offset = 0; offset < poolWrites.length; offset += 500) {
    await fs.commit(poolWrites.slice(offset, offset + 500));
  }
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


/** Update a destination's verified usage and its shared account counter atomically. */
export async function updateStorageUsageAndPool(
  fs: Firestore,
  destinationId: string,
  newUsageBytes: number,
  checkedAt = new Date().toISOString(),
): Promise<void> {
  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(destinationId) ||
      !Number.isSafeInteger(newUsageBytes) || newUsageBytes < 0) {
    throw new ApiError(400, "STORAGE_USAGE_UPDATE_INVALID", "The storage usage update is invalid.");
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await fs.getDoc("storageDestinations/" + destinationId);
    if (!raw || typeof raw["accountGroup"] !== "string") {
      throw new ApiError(404, "STORAGE_DESTINATION_NOT_FOUND", "The storage location could not be found.");
    }
    const groupId = raw["accountGroup"];
    const groupPath = groupCapacityPath(groupId);
    const groupBefore = await fs.getDoc(groupPath);
    if (!groupBefore ||
        !Number.isSafeInteger(groupBefore["knownUsageBytes"]) ||
        !Number.isSafeInteger(groupBefore["unknownUsageCount"])) {
      await rebuildStoragePoolIndex(fs);
      continue;
    }
    const result = await fs.transact(["storageDestinations/" + destinationId, groupPath], docs => {
      const destination = docs[0];
      const group = docs[1];
      if (!destination || !group) throw new ApiError(409, "STORAGE_GROUP_CHANGED", "The storage account summary changed; retry.");
      const currentUsage = typeof destination["usageBytes"] === "number" &&
        Number.isSafeInteger(destination["usageBytes"]) && destination["usageBytes"] >= 0
        ? destination["usageBytes"] : null;
      const knownUsage = safeBytes(group["knownUsageBytes"]);
      const unknownCount = safeBytes(group["unknownUsageCount"]);
      const nextKnownUsage = currentUsage === null
        ? knownUsage + newUsageBytes
        : knownUsage + newUsageBytes - currentUsage;
      if (currentUsage === null && unknownCount === 0) {
        throw new ApiError(409, "STORAGE_GROUP_USAGE_STALE", "The shared storage usage summary needs to be rebuilt.");
      }
      const nextUnknownCount = currentUsage === null ? Math.max(0, unknownCount - 1) : unknownCount;
      if (!Number.isSafeInteger(nextKnownUsage) || nextKnownUsage < 0) {
        throw new ApiError(409, "STORAGE_GROUP_USAGE_INVALID", "The shared storage usage counter is inconsistent.");
      }
      const capBytes = typeof group["capBytes"] === "number" && Number.isSafeInteger(group["capBytes"])
        ? group["capBytes"] : null;
      const reservedBytes = safeBytes(group["reservedBytes"]);
      const nextUsageBytes = nextUnknownCount === 0 ? nextKnownUsage : null;
      const nextFreeBytes = nextUsageBytes === null || capBytes === null
        ? 0 : Math.max(0, capBytes - nextUsageBytes - reservedBytes);
      const now = checkedAt;
      return {
        result: { becameFullyKnown: unknownCount > 0 && nextUnknownCount === 0, groupFreeBytes: nextFreeBytes },
        writes: [
          {
            update: {
              name: fs.docName("storageDestinations/" + destinationId),
              fields: encodeFields({
                usageBytes: newUsageBytes, usageSource: "provider_listing",
                usageCheckedAt: now, updatedAt: now,
              }),
            },
            updateMask: { fieldPaths: ["usageBytes", "usageSource", "usageCheckedAt", "updatedAt"] },
          },
          {
            update: {
              name: fs.docName(groupPath),
              fields: encodeFields({
                usageBytes: nextUsageBytes, knownUsageBytes: nextKnownUsage,
                unknownUsageCount: nextUnknownCount, freeBytes: nextFreeBytes, updatedAt: now,
              }),
            },
            updateMask: { fieldPaths: ["usageBytes", "knownUsageBytes", "unknownUsageCount", "freeBytes", "updatedAt"] },
          },
        ],
      };
    });
    if (result.becameFullyKnown) {
      await rebuildStoragePoolIndex(fs);
      return;
    }
    const destination = await fs.getDoc("storageDestinations/" + destinationId);
    if (!destination) return;
    const purpose = destination["purpose"] as StoragePurpose;
    const shards = await fs.query("storagePool", {
      filters: [{ field: "purpose", op: "EQUAL", value: purpose }],
      limit: 500,
    });
    const shard = shards.find(row => Array.isArray(row["entries"]) &&
      (row["entries"] as Array<Record<string, unknown>>).some(entry => entry?.["id"] === destinationId));
    if (!shard) {
      if (result.groupFreeBytes > 0) await rebuildStoragePoolIndex(fs);
      return;
    }
    const metadata = validateStorageDestinationMetadata({ ...destination, destinationId });
    const groupFree = result.groupFreeBytes;
    const bucketFree = Math.max(0, metadata.softCapBytes - newUsageBytes - safeBytes(destination["reservedBytes"]));
    const freeBytes = Math.min(bucketFree, groupFree);
    const nextEntries = (shard["entries"] as Array<Record<string, unknown>>).map(entry =>
      entry["id"] === destinationId
        ? { ...entry, freeBytes, state: freeBytes > 0 ? "eligible" : "full" }
        : entry,
    );
    await fs.patchDoc("storagePool/" + shard.__id, { entries: nextEntries, updatedAt: checkedAt });
    return;
  }
  throw new ApiError(409, "STORAGE_USAGE_UPDATE_CONFLICT", "Storage usage changed repeatedly; retry reconciliation.");
}

/** Remove an unhealthy location or refresh its existing compact pool entry. */
export async function refreshStoragePoolDestination(fs: Firestore, destinationId: string): Promise<void> {
  const raw = await fs.getDoc("storageDestinations/" + destinationId);
  if (!raw) return;
  const metadata = validateStorageDestinationMetadata({ ...raw, destinationId });
  const config = resolveStorageDestinationConfiguration(metadata);
  const purpose = metadata.purpose;
  const shards = await fs.query("storagePool", {
    filters: [{ field: "purpose", op: "EQUAL", value: purpose }],
    limit: 500,
  });
  const shard = shards.find(row => Array.isArray(row["entries"]) &&
    (row["entries"] as Array<Record<string, unknown>>).some(entry => entry?.["id"] === destinationId));
  const eligible = metadata.enabled && metadata.mode === "active" &&
    metadata.healthStatus === "healthy" && config.configurationStatus === "configured" &&
    typeof metadata.usageBytes === "number" && Number.isSafeInteger(metadata.usageBytes) &&
    (metadata.usageSource === "provider_listing" || metadata.usageSource === "ledger");
  if (!eligible) {
    if (shard) {
      const entries = (shard["entries"] as Array<Record<string, unknown>>).filter(entry => entry["id"] !== destinationId);
      await fs.patchDoc("storagePool/" + shard.__id, { entries, updatedAt: new Date().toISOString() });
    }
    return;
  }
  const group = await fs.getDoc(groupCapacityPath(metadata.accountGroup));
  if (!group || group["usageBytes"] === null || typeof group["freeBytes"] !== "number") {
    await rebuildStoragePoolIndex(fs);
    return;
  }
  const freeBytes = Math.min(
    Math.max(0, metadata.softCapBytes - metadata.usageBytes! - safeBytes(raw["reservedBytes"])),
    safeBytes(group["freeBytes"]),
  );
  if (freeBytes <= 0 || (purpose === "hls_streaming" && !(typeof group["egressHeadroomBytes"] === "number" && group["egressHeadroomBytes"] > 0))) {
    if (shard) {
      const entries = (shard["entries"] as Array<Record<string, unknown>>).filter(entry => entry["id"] !== destinationId);
      await fs.patchDoc("storagePool/" + shard.__id, { entries, updatedAt: new Date().toISOString() });
    }
    return;
  }
  if (!shard) {
    await rebuildStoragePoolIndex(fs);
    return;
  }
  const entries = (shard["entries"] as Array<Record<string, unknown>>).map(entry =>
    entry["id"] === destinationId ? { ...entry, freeBytes, state: "eligible" } : entry,
  );
  await fs.patchDoc("storagePool/" + shard.__id, { entries, updatedAt: new Date().toISOString() });
}
