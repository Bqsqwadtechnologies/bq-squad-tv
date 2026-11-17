import { ApiError, Firestore, encodeFields } from "../firebase-admin";
import { calculateEgressLevel, storageAccountEgressId } from "./ledger";
import { validateStorageDestinationMetadata, type StoragePurpose } from "./registry";
import { pickDestination, type StorageCandidate } from "./routing";
import {
  adjustPoolShardEntries,
  getStoragePoolEntries,
  groupCapacityPath,
  rebuildStoragePoolIndex,
  type StoragePoolEntry,
} from "./pool-index";

export type StorageReservation = {
  reservationId: string;
  destinationId: string;
  purpose: StoragePurpose;
  reservedBytes: number;
  expiresAt: string;
};

function safeBytes(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
function storageRoutingPath(purpose: StoragePurpose): string {
  return "storageRouting/" + purpose;
}

async function findPoolEntries(fs: Firestore, purpose: StoragePurpose): Promise<StoragePoolEntry[]> {
  let entries = await getStoragePoolEntries(fs, purpose);
  if (entries.length === 0) {
    await rebuildStoragePoolIndex(fs, [purpose]);
    entries = await getStoragePoolEntries(fs, purpose);
  }
  return entries;
}

/**
 * Selects from compact purpose shards, then transactionally confirms only the
 * selected destination, its shared account summary, the routing cursor,
 * reservation and index shard. It never scans every destination on an upload.
 */
export async function reserveStorageDestination(
  fs: Firestore,
  input: { purpose: StoragePurpose; incomingBytes: number; reservationId?: string; ttlMs?: number },
): Promise<StorageReservation> {
  if (!Number.isSafeInteger(input.incomingBytes) || input.incomingBytes < 1) {
    throw new ApiError(400, "STORAGE_RESERVATION_INVALID", "The storage reservation size is invalid.");
  }
  const reservationId = input.reservationId ?? crypto.randomUUID().replace(/-/g, "");
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(reservationId)) throw new ApiError(400, "STORAGE_RESERVATION_INVALID", "The storage reservation ID is invalid.");
  const ttlMs = input.ttlMs ?? 2 * 60 * 60_000;
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || ttlMs > 24 * 60 * 60_000) throw new ApiError(400, "STORAGE_RESERVATION_INVALID", "The storage reservation lifetime is invalid.");
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const cursorPath = storageRoutingPath(input.purpose);
  let cursorDoc = await fs.getDoc(cursorPath);
  if (!cursorDoc) {
    await fs.setDoc(cursorPath, { cursor: 0, updatedAt: new Date().toISOString() }, { mustNotExist: true }).catch(() => undefined);
    cursorDoc = await fs.getDoc(cursorPath);
  }
  if (!cursorDoc) throw new ApiError(503, "STORAGE_CURSOR_UNAVAILABLE", "The storage routing cursor could not be initialized.");

  for (let attempt = 0; attempt < 3; attempt++) {
    const entries = await findPoolEntries(fs, input.purpose);
    const routing = await fs.getDoc(cursorPath);
    if (!routing) throw new ApiError(503, "STORAGE_CURSOR_UNAVAILABLE", "The storage routing cursor could not be read.");
    const cursor = safeBytes(routing["cursor"]);
    let remaining = entries.filter(entry => entry.state === "eligible" && entry.freeBytes >= input.incomingBytes);
    let groupSkips = 0;

    while (remaining.length && groupSkips <= entries.length) {
      const candidates: StorageCandidate[] = remaining.map(entry => ({
        id: entry.id,
        priority: entry.priority,
        purpose: input.purpose,
        usageBytes: 0,
        softCapBytes: entry.freeBytes,
        healthStatus: entry.state === "eligible" ? "healthy" : "degraded",
        mode: "active",
        configured: true,
        egressHeadroomBytes: entry.egressHeadroomBytes,
        egressCircuitBreakerBytes: 0,
        accountGroup: entry.groupId,
        accountGroupUsedBytes: 0,
        accountGroupCapBytes: entry.freeBytes,
      }));
      const pick = pickDestination(candidates, input.incomingBytes, input.purpose, cursor);
      if (!pick) break;
      const selected = remaining.find(entry => entry.id === pick.id);
      if (!selected) throw new ApiError(503, "STORAGE_ROUTING_RETRY", "Storage routing changed; please retry.");
      const groupPath = groupCapacityPath(selected.groupId);
      const groupSummary = await fs.getDoc(groupPath);
      if (!groupSummary || typeof groupSummary["freeBytes"] !== "number" ||
          !Number.isSafeInteger(groupSummary["freeBytes"])) {
        await rebuildStoragePoolIndex(fs, [input.purpose]);
        break;
      }
      if (groupSummary["freeBytes"] < input.incomingBytes) {
        remaining = remaining.filter(entry => entry.groupId !== selected.groupId);
        groupSkips++;
        continue;
      }

      const destinationPath = "storageDestinations/" + selected.id;
      const reservationPath = "storageReservations/" + reservationId;
      const shardPath = "storagePool/" + selected.shardDocId;
      const egressPath = "storageAccountEgress/" + storageAccountEgressId(selected.groupId);
      const readPaths = [
        cursorPath, destinationPath, groupPath, reservationPath, shardPath,
        ...(input.purpose === "hls_streaming" ? [egressPath] : []),
      ];
      try {
        await fs.transact(readPaths, docs => {
          const currentCursor = docs[0];
          const destination = docs[1];
          const group = docs[2];
          const existingReservation = docs[3];
          const shard = docs[4];
          const egress = input.purpose === "hls_streaming" ? docs[5] : null;
          if (safeBytes(currentCursor?.["cursor"]) !== cursor) {
            throw new ApiError(409, "STORAGE_CURSOR_CHANGED", "Storage routing changed; retry selection.");
          }
          if (existingReservation) throw new ApiError(409, "STORAGE_RESERVATION_EXISTS", "This storage reservation already exists.");
          if (!destination || !group || !shard) throw new ApiError(409, "STORAGE_POOL_CHANGED", "The selected storage location changed; retry selection.");
          const metadata = validateStorageDestinationMetadata({ ...destination, destinationId: selected.id });
          if (metadata.accountGroup !== selected.groupId || metadata.purpose !== input.purpose ||
              !metadata.enabled || metadata.mode !== "active" || metadata.healthStatus !== "healthy") {
            throw new ApiError(409, "STORAGE_DESTINATION_CHANGED", "The selected storage location is no longer eligible.");
          }
          if (typeof metadata.usageBytes !== "number" || !Number.isSafeInteger(metadata.usageBytes)) {
            throw new ApiError(409, "STORAGE_USAGE_UNKNOWN", "Storage usage must be reconciled before automatic assignment.");
          }
          const groupFree = safeBytes(group["freeBytes"]);
          const groupReserved = safeBytes(group["reservedBytes"]);
          const groupUsage = group["usageBytes"];
          const groupCap = group["capBytes"];
          if (typeof groupUsage !== "number" || !Number.isSafeInteger(groupUsage) ||
              typeof groupCap !== "number" || !Number.isSafeInteger(groupCap)) {
            throw new ApiError(409, "STORAGE_ACCOUNT_CAPACITY_UNKNOWN", "The shared storage account quota must be checked before assignment.");
          }
          if (groupFree < input.incomingBytes) {
            throw new ApiError(409, "STORAGE_ACCOUNT_CAPACITY_CHANGED", "The shared storage account has insufficient remaining capacity.");
          }
          if (input.purpose === "hls_streaming") {
            if (metadata.paidEgressEnabled === true) {
              throw new ApiError(409, "STORAGE_PAID_EGRESS_DISABLED", "Paid data transfer is disabled for this service.");
            }
            const budget = metadata.freeEgressBudgetBytes;
            if (typeof budget !== "number" || !Number.isSafeInteger(budget) || budget < 1) {
              throw new ApiError(409, "STORAGE_EGRESS_BUDGET_UNKNOWN", "The free data-transfer allowance must be checked before streaming.");
            }
            const monthKey = new Date().toISOString().slice(0, 7);
            const used = egress?.["monthKey"] === monthKey ? safeBytes(egress["monthBytes"]) : 0;
            if (calculateEgressLevel(used, budget, false) === "blocked") {
              throw new ApiError(409, "STORAGE_EGRESS_LIMIT_REACHED", "This storage account has reached its safe monthly delivery limit.");
            }
          }
          const currentUsage = metadata.usageBytes;
          const currentReserved = safeBytes(destination["reservedBytes"]);
          if (currentUsage + currentReserved + input.incomingBytes > metadata.softCapBytes) {
            throw new ApiError(409, "STORAGE_CAPACITY_CHANGED", "The selected storage location has insufficient remaining capacity.");
          }
          const nextGroupFree = groupFree - input.incomingBytes;
          const nextGroupReserved = groupReserved + input.incomingBytes;
          const nextDestinationReserved = currentReserved + input.incomingBytes;
          const nextEntries = adjustPoolShardEntries(shard["entries"], selected.id, -input.incomingBytes);
          const now = new Date().toISOString();
          return {
            result: undefined,
            writes: [
              { update: { name: fs.docName(destinationPath), fields: encodeFields({ reservedBytes: nextDestinationReserved, updatedAt: now }), updateMask: { fieldPaths: ["reservedBytes", "updatedAt"] } } },
              { update: { name: fs.docName(groupPath), fields: encodeFields({ reservedBytes: nextGroupReserved, freeBytes: nextGroupFree, updatedAt: now }), updateMask: { fieldPaths: ["reservedBytes", "freeBytes", "updatedAt"] } } },
              { update: { name: fs.docName(shardPath), fields: encodeFields({ entries: nextEntries, updatedAt: now }), updateMask: { fieldPaths: ["entries", "updatedAt"] } } },
              { update: { name: fs.docName(cursorPath), fields: encodeFields({ cursor: pick.nextCursor, updatedAt: now }), updateMask: { fieldPaths: ["cursor", "updatedAt"] } },
              { update: { name: fs.docName(reservationPath), fields: encodeFields({
                reservationId, destinationId: selected.id, purpose: input.purpose,
                groupId: selected.groupId, shardDocId: selected.shardDocId,
                reservedBytes: input.incomingBytes, status: "reserved",
                createdAt: now, expiresAt,
              }), currentDocument: { exists: false } },
            ],
          };
        });
        return { reservationId, destinationId: selected.id, purpose: input.purpose, reservedBytes: input.incomingBytes, expiresAt };
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          if (error.code === "STORAGE_ACCOUNT_CAPACITY_CHANGED") {
            remaining = remaining.filter(entry => entry.groupId !== selected.groupId);
            groupSkips++;
            continue;
          }
          if (attempt < 2) break;
        }
        throw error;
      }
    }
    if (attempt < 2) {
      await rebuildStoragePoolIndex(fs, [input.purpose]);
      continue;
    }
    throw new ApiError(507, "STORAGE_CAPACITY_UNAVAILABLE", "No verified storage location currently has enough available capacity.");
  }
  throw new ApiError(409, "STORAGE_ROUTING_CONFLICT", "Storage capacity changed repeatedly; retry the upload.");
}

async function reservationPoolShard(
  fs: Firestore,
  reservation: Record<string, unknown>,
  destinationId: string,
  purpose: StoragePurpose,
): Promise<string> {
  if (typeof reservation["shardDocId"] === "string" && /^[a-z_]+__\d{3}$/.test(reservation["shardDocId"])) {
    return reservation["shardDocId"];
  }
  const entries = await getStoragePoolEntries(fs, purpose);
  const found = entries.find(entry => entry.id === destinationId);
  if (found) return found.shardDocId;
  await rebuildStoragePoolIndex(fs, [purpose]);
  const rebuilt = await getStoragePoolEntries(fs, purpose);
  const retry = rebuilt.find(entry => entry.id === destinationId);
  if (!retry) throw new ApiError(409, "STORAGE_POOL_ENTRY_MISSING", "The storage pool index needs to be rebuilt.");
  return retry.shardDocId;
}

export async function releaseStorageReservation(fs: Firestore, reservationId: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(reservationId)) throw new ApiError(400, "STORAGE_RESERVATION_INVALID", "The storage reservation ID is invalid.");
  for (let attempt = 0; attempt < 3; attempt++) {
    const reservation = await fs.getDoc("storageReservations/" + reservationId);
    if (!reservation || reservation["status"] !== "reserved") return;
    const destinationId = typeof reservation["destinationId"] === "string" ? reservation["destinationId"] : "";
    const bytes = safeBytes(reservation["reservedBytes"]);
    const purpose = reservation["purpose"] as StoragePurpose;
    if (!destinationId || bytes < 1 || !purpose) throw new ApiError(409, "STORAGE_RESERVATION_CORRUPT", "The storage reservation cannot be released safely.");
    const destination = await fs.getDoc("storageDestinations/" + destinationId);
    if (!destination || typeof destination["accountGroup"] !== "string") throw new ApiError(409, "STORAGE_DESTINATION_MISSING", "The reserved storage location is missing.");
    const groupPath = groupCapacityPath(destination["accountGroup"]);
    const shardDocId = await reservationPoolShard(fs, reservation, destinationId, purpose);
    const destinationPath = "storageDestinations/" + destinationId;
    const reservationPath = "storageReservations/" + reservationId;
    const shardPath = "storagePool/" + shardDocId;
    try {
      await fs.transact([reservationPath, destinationPath, groupPath, shardPath], docs => {
        const current = docs[0];
        const currentDestination = docs[1];
        const group = docs[2];
        const shard = docs[3];
        if (!current || current["status"] !== "reserved") return { result: undefined, writes: [] };
        if (!currentDestination || !group || !shard) throw new ApiError(409, "STORAGE_POOL_CHANGED", "The storage reservation needs a fresh pool index.");
        const currentReserved = safeBytes(currentDestination["reservedBytes"]);
        const groupReserved = safeBytes(group["reservedBytes"]);
        if (currentReserved < bytes || groupReserved < bytes) throw new ApiError(409, "STORAGE_RESERVATION_CORRUPT", "The storage reservation counters are inconsistent.");
        const nextEntries = adjustPoolShardEntries(shard["entries"], destinationId, bytes);
        const capBytes = safeBytes(group["capBytes"]);
        const usageBytes = safeBytes(group["usageBytes"]);
        const nextGroupReserved = groupReserved - bytes;
        const nextGroupFree = Math.max(0, capBytes - usageBytes - nextGroupReserved);
        const now = new Date().toISOString();
        return {
          result: undefined,
          writes: [
            { update: { name: fs.docName(destinationPath), fields: encodeFields({ reservedBytes: currentReserved - bytes, updatedAt: now }), updateMask: { fieldPaths: ["reservedBytes", "updatedAt"] } },
            { update: { name: fs.docName(groupPath), fields: encodeFields({ reservedBytes: nextGroupReserved, freeBytes: nextGroupFree, updatedAt: now }), updateMask: { fieldPaths: ["reservedBytes", "freeBytes", "updatedAt"] } },
            { update: { name: fs.docName(shardPath), fields: encodeFields({ entries: nextEntries, updatedAt: now }), updateMask: { fieldPaths: ["entries", "updatedAt"] } },
            { update: { name: fs.docName(reservationPath), fields: encodeFields({ status: "released", releasedAt: now }), updateMask: { fieldPaths: ["status", "releasedAt"] } },
          ],
        };
      });
      return;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && attempt < 2) continue;
      throw error;
    }
  }
  throw new ApiError(409, "STORAGE_RESERVATION_CONFLICT", "The storage reservation could not be released; retry.");
}

/** Convert a completed upload reservation into ledger usage exactly once. */
export async function commitStorageReservation(fs: Firestore, reservationId: string, actualBytes: number): Promise<void> {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(reservationId) || !Number.isSafeInteger(actualBytes) || actualBytes < 1) {
    throw new ApiError(400, "STORAGE_RESERVATION_INVALID", "The completed storage reservation is invalid.");
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const reservationPath = "storageReservations/" + reservationId;
    const reservation = await fs.getDoc(reservationPath);
    if (!reservation) throw new ApiError(404, "STORAGE_RESERVATION_NOT_FOUND", "The storage reservation could not be found.");
    if (reservation["status"] === "committed") return;
    if (reservation["status"] !== "reserved") throw new ApiError(409, "STORAGE_RESERVATION_NOT_ACTIVE", "The storage reservation is no longer active.");
    const destinationId = typeof reservation["destinationId"] === "string" ? reservation["destinationId"] : "";
    const reservedBytes = safeBytes(reservation["reservedBytes"]);
    const purpose = reservation["purpose"] as StoragePurpose;
    if (!destinationId || reservedBytes < 1 || actualBytes > reservedBytes || !purpose) throw new ApiError(409, "STORAGE_RESERVATION_SIZE_MISMATCH", "The uploaded file exceeds its reserved capacity.");
    const destination = await fs.getDoc("storageDestinations/" + destinationId);
    if (!destination || typeof destination["accountGroup"] !== "string") throw new ApiError(409, "STORAGE_DESTINATION_MISSING", "The reserved storage location is missing.");
    const groupPath = groupCapacityPath(destination["accountGroup"]);
    const shardDocId = await reservationPoolShard(fs, reservation, destinationId, purpose);
    const destinationPath = "storageDestinations/" + destinationId;
    const shardPath = "storagePool/" + shardDocId;
    try {
      await fs.transact([reservationPath, destinationPath, groupPath, shardPath], docs => {
        const current = docs[0];
        const currentDestination = docs[1];
        const group = docs[2];
        const shard = docs[3];
        if (!current || current["status"] !== "reserved") {
          if (current?.["status"] === "committed") return { result: undefined, writes: [] };
          throw new ApiError(409, "STORAGE_RESERVATION_NOT_ACTIVE", "The storage reservation is no longer active.");
        }
        if (!currentDestination || !group || !shard) throw new ApiError(409, "STORAGE_POOL_CHANGED", "The storage reservation needs a fresh pool index.");
        const currentReserved = safeBytes(currentDestination["reservedBytes"]);
        const currentUsage = safeBytes(currentDestination["usageBytes"]);
        const groupReserved = safeBytes(group["reservedBytes"]);
        const groupUsage = group["usageBytes"];
        const groupCap = group["capBytes"];
        if (currentReserved < reservedBytes || groupReserved < reservedBytes ||
            typeof groupUsage !== "number" || !Number.isSafeInteger(groupUsage) ||
            typeof groupCap !== "number" || !Number.isSafeInteger(groupCap) ||
            currentUsage + actualBytes > Number.MAX_SAFE_INTEGER) {
          throw new ApiError(409, "STORAGE_RESERVATION_CORRUPT", "The storage reservation counters are inconsistent.");
        }
        const nextUsage = currentUsage + actualBytes;
        const nextReserved = currentReserved - reservedBytes;
        const nextGroupUsage = groupUsage + actualBytes;
        const nextGroupReserved = groupReserved - reservedBytes;
        const nextGroupFree = Math.max(0, groupCap - nextGroupUsage - nextGroupReserved);
        const nextEntries = adjustPoolShardEntries(shard["entries"], destinationId, reservedBytes - actualBytes);
        const now = new Date().toISOString();
        return {
          result: undefined,
          writes: [
            { update: { name: fs.docName(destinationPath), fields: encodeFields({
              reservedBytes: nextReserved, usageBytes: nextUsage, usageSource: "ledger",
              usageCheckedAt: now, updatedAt: now,
            }), updateMask: { fieldPaths: ["reservedBytes", "usageBytes", "usageSource", "usageCheckedAt", "updatedAt"] } },
            { update: { name: fs.docName(groupPath), fields: encodeFields({
              usageBytes: nextGroupUsage, knownUsageBytes: nextGroupUsage,
              reservedBytes: nextGroupReserved, freeBytes: nextGroupFree, updatedAt: now,
            }), updateMask: { fieldPaths: ["usageBytes", "knownUsageBytes", "reservedBytes", "freeBytes", "updatedAt"] } },
            { update: { name: fs.docName(shardPath), fields: encodeFields({ entries: nextEntries, updatedAt: now }), updateMask: { fieldPaths: ["entries", "updatedAt"] } },
            { update: { name: fs.docName(reservationPath), fields: encodeFields({
              status: "committed", actualBytes, committedAt: now,
            }), updateMask: { fieldPaths: ["status", "actualBytes", "committedAt"] } },
          ],
        };
      });
      return;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && attempt < 2) continue;
      throw error;
    }
  }
  throw new ApiError(409, "STORAGE_RESERVATION_CONFLICT", "The storage reservation could not be committed; retry.");
}
