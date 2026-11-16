import { ApiError, Firestore } from "../firebase-admin";
import { resolveStorageDestinationConfiguration, validateStorageDestinationMetadata, type StoragePurpose } from "./registry";
import { pickDestination, type StorageCandidate } from "./routing";

const LEGACY_SOURCE_ID = "lovable-source-legacy";
const LEGACY_STREAM_ID = "lovable-stream-legacy";

export type StorageReservation = {
  reservationId: string;
  destinationId: string;
  purpose: StoragePurpose;
  reservedBytes: number;
  expiresAt: string;
};

function asSafeBytes(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/**
 * Reserves capacity and advances the routing cursor in one Firestore
 * transaction. The provider usage snapshot must be known; reservations are
 * added separately so concurrent upload intents cannot overbook the same cap.
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

  for (let attempt = 0; attempt < 3; attempt++) {
    const rows = await fs.query("storageDestinations", { limit: 500 });
    const parsed = rows.map(row => {
      const { __id, ...raw } = row;
      const metadata = validateStorageDestinationMetadata({ ...raw, destinationId: __id });
      const configuration = resolveStorageDestinationConfiguration(metadata);
      return { metadata, configuration, reservedBytes: asSafeBytes(raw["reservedBytes"]) };
    });
    const groups = new Map<string, typeof parsed>();
    for (const item of parsed) {
      const group = groups.get(item.metadata.accountGroup) ?? [];
      group.push(item);
      groups.set(item.metadata.accountGroup, group);
    }
    const candidates: StorageCandidate[] = [];
    for (const item of parsed) {
      const group = groups.get(item.metadata.accountGroup) ?? [];
      const reported = group.map(value => value.metadata.usageBytes).filter((value): value is number => value !== null && Number.isSafeInteger(value));
      if (reported.length !== group.length || reported.length === 0) continue;
      // Shared workspace/account usage is represented by the largest reported
      // snapshot, not the sum (which would count the same quota repeatedly).
      const accountUsage = Math.max(...reported) + group.reduce((sum, value) => sum + value.reservedBytes, 0);
      // Until a verified account-level quota is configured, use the smallest
      // declared soft cap as a conservative group-wide ceiling.
      const accountCap = Math.min(...group.map(value => value.metadata.softCapBytes));
      const egressBudget = item.metadata.freeEgressBudgetBytes;
      const egressHeadroom = egressBudget === null || egressBudget === undefined
        ? null
        : Math.max(0, egressBudget - asSafeBytes(item.metadata.egressMonthBytes) - input.incomingBytes);
      candidates.push({
        id: item.metadata.destinationId,
        priority: item.metadata.priority,
        purpose: item.metadata.purpose,
        usageBytes: item.metadata.usageBytes === null ? null : item.metadata.usageBytes + item.reservedBytes,
        softCapBytes: item.metadata.softCapBytes,
        healthStatus: item.metadata.healthStatus ?? "unknown",
        mode: item.metadata.mode,
        configured: item.configuration.configurationStatus === "configured",
        egressHeadroomBytes: egressHeadroom,
        egressCircuitBreakerBytes: 0,
        accountGroup: item.metadata.accountGroup,
        accountGroupUsedBytes: accountUsage,
        accountGroupCapBytes: accountCap,
      });
    }
    const cursorPath = "storageRoutingCursors/" + input.purpose;
    const cursorDoc = await fs.getDoc(cursorPath);
    const cursor = asSafeBytes(cursorDoc?.["cursor"]);
    const pick = pickDestination(candidates, input.incomingBytes, input.purpose, cursor);
    if (!pick) {
      throw new ApiError(507, "STORAGE_CAPACITY_UNAVAILABLE", "No verified storage destination currently has enough available capacity.");
    }
    const selected = parsed.find(item => item.metadata.destinationId === pick.id);
    if (!selected) throw new ApiError(503, "STORAGE_ROUTING_RETRY", "Storage routing changed; please retry.");
    try {
      await fs.transact([cursorPath, "storageDestinations/" + pick.id, "storageReservations/" + reservationId], docs => {
        const currentCursor = docs[0];
        const currentDestination = docs[1];
        const existingReservation = docs[2];
        if (existingReservation) throw new ApiError(409, "STORAGE_RESERVATION_EXISTS", "This storage reservation already exists.");
        if (!currentDestination || currentDestination["enabled"] !== true || currentDestination["mode"] !== "active" || currentDestination["healthStatus"] !== "healthy") {
          throw new ApiError(409, "STORAGE_DESTINATION_CHANGED", "The selected storage destination is no longer eligible.");
        }
        const currentUsage = currentDestination["usageBytes"];
        if (typeof currentUsage !== "number" || !Number.isSafeInteger(currentUsage) || currentUsage < 0) {
          throw new ApiError(409, "STORAGE_USAGE_UNKNOWN", "Storage usage must be reconciled before automatic assignment.");
        }
        const nextReserved = asSafeBytes(currentDestination["reservedBytes"]) + input.incomingBytes;
        if (currentUsage + nextReserved > selected.metadata.softCapBytes) {
          throw new ApiError(409, "STORAGE_CAPACITY_CHANGED", "Storage capacity changed during reservation.");
        }
        const now = new Date().toISOString();
        return {
          result: undefined,
          writes: [
            { update: { name: fs.docName("storageDestinations/" + pick.id), fields: { reservedBytes: { integerValue: String(nextReserved) }, updatedAt: { stringValue: now } } } },
            { update: { name: fs.docName(cursorPath), fields: { cursor: { integerValue: String(pick.nextCursor) }, updatedAt: { stringValue: now } } } },
            { update: { name: fs.docName("storageReservations/" + reservationId), fields: {
              reservationId: { stringValue: reservationId },
              destinationId: { stringValue: pick.id },
              purpose: { stringValue: input.purpose },
              reservedBytes: { integerValue: String(input.incomingBytes) },
              status: { stringValue: "reserved" },
              createdAt: { stringValue: now },
              expiresAt: { stringValue: expiresAt },
            } } },
          ],
        };
      });
      return { reservationId, destinationId: pick.id, purpose: input.purpose, reservedBytes: input.incomingBytes, expiresAt };
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && attempt < 2) continue;
      throw error;
    }
  }
  throw new ApiError(409, "STORAGE_ROUTING_CONFLICT", "Storage capacity changed repeatedly; retry the upload.");
}

export async function releaseStorageReservation(fs: Firestore, reservationId: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(reservationId)) throw new ApiError(400, "STORAGE_RESERVATION_INVALID", "The storage reservation ID is invalid.");
  for (let attempt = 0; attempt < 3; attempt++) {
    const reservation = await fs.getDoc("storageReservations/" + reservationId);
    if (!reservation || reservation["status"] !== "reserved") return;
    const destinationId = typeof reservation["destinationId"] === "string" ? reservation["destinationId"] : "";
    const bytes = asSafeBytes(reservation["reservedBytes"]);
    if (!destinationId || bytes < 1) throw new ApiError(409, "STORAGE_RESERVATION_CORRUPT", "The storage reservation cannot be released safely.");
    try {
      await fs.transact(["storageReservations/" + reservationId, "storageDestinations/" + destinationId], docs => {
        const current = docs[0];
        const destination = docs[1];
        if (!current || current["status"] !== "reserved") return { result: undefined, writes: [] };
        if (!destination) throw new ApiError(409, "STORAGE_DESTINATION_MISSING", "The reserved storage destination is missing.");
        const currentReserved = asSafeBytes(destination["reservedBytes"]);
        if (currentReserved < bytes) throw new ApiError(409, "STORAGE_RESERVATION_CORRUPT", "The storage reservation counter is inconsistent.");
        const now = new Date().toISOString();
        return {
          result: undefined,
          writes: [
            { update: { name: fs.docName("storageDestinations/" + destinationId), fields: { reservedBytes: { integerValue: String(currentReserved - bytes) }, updatedAt: { stringValue: now } } } },
            { update: { name: fs.docName("storageReservations/" + reservationId), fields: { status: { stringValue: "released" }, releasedAt: { stringValue: now } } } },
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
