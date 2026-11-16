import { ApiError, Firestore } from "../firebase-admin";
import { calculateEgressLevel, storageAccountEgressId } from "./ledger";
import { resolveStorageDestinationConfiguration, validateStorageDestinationMetadata, type StoragePurpose } from "./registry";
import { pickDestination, type StorageCandidate } from "./routing";

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
    const accountEgress = new Map<string, { usedBytes: number; budgetBytes: number | null; paidEnabled: boolean }>();
    const monthKey = new Date().toISOString().slice(0, 7);
    for (const [groupName, items] of groups) {
      const ledger = await fs.getDoc("storageAccountEgress/" + storageAccountEgressId(groupName));
      const budgets = items.map(item => item.metadata.freeEgressBudgetBytes);
      const paidChoices = items.map(item => item.metadata.paidEgressEnabled === true);
      const budgetValue = budgets[0] ?? null;
      const paidEnabled = paidChoices[0] === true;
      const consistent = budgets.every(value => value === budgetValue) && paidChoices.every(value => value === paidEnabled);
      const legacyUsage = items.reduce((sum, item) => sum + (item.metadata.egressMonthKey === monthKey ? asSafeBytes(item.metadata.egressMonthBytes) : 0), 0);
      accountEgress.set(groupName, {
        usedBytes: ledger?.["monthKey"] === monthKey ? asSafeBytes(ledger["monthBytes"]) : legacyUsage,
        budgetBytes: consistent && typeof budgetValue === "number" && Number.isSafeInteger(budgetValue) && budgetValue >= 0 ? budgetValue : null,
        paidEnabled: consistent && paidEnabled,
      });
    }
    const candidates: StorageCandidate[] = [];
    for (const item of parsed) {
      const group = groups.get(item.metadata.accountGroup) ?? [];
      const reported = group.map(value => value.metadata.usageBytes).filter((value): value is number => value !== null && Number.isSafeInteger(value));
      if (reported.length !== group.length || reported.length === 0) continue;
      // Usage is measured per bucket, so account usage is the sum of bucket
      // usage plus reservations. Shared quota must be configured explicitly
      // for multi-bucket accounts; a bucket soft cap is not an account quota.
      const accountUsage = reported.reduce((sum, value) => sum + value, 0) + group.reduce((sum, value) => sum + value.reservedBytes, 0);
      const configuredCaps = group.map(value => value.metadata.accountCapBytes).filter((value): value is number => value !== null && value !== undefined && Number.isSafeInteger(value));
      const accountCap = group.length === 1
        ? (configuredCaps[0] ?? group[0]!.metadata.softCapBytes)
        : configuredCaps.length === group.length && new Set(configuredCaps).size === 1 ? configuredCaps[0]! : null;
      if (accountCap === null) continue;
      const sharedEgress = accountEgress.get(item.metadata.accountGroup);
      const egressHeadroom = sharedEgress?.paidEnabled
        ? Number.MAX_SAFE_INTEGER
        : sharedEgress?.budgetBytes === null || sharedEgress?.budgetBytes === undefined
          ? null
          : Math.max(0, sharedEgress.budgetBytes - (sharedEgress.usedBytes ?? 0));
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
    const cursorPath = "storageRoutingCursors/global";
    let cursorDoc = await fs.getDoc(cursorPath);
    if (!cursorDoc) {
      await fs.setDoc(cursorPath, { cursor: 0, updatedAt: new Date().toISOString() }, { mustNotExist: true }).catch(() => undefined);
      cursorDoc = await fs.getDoc(cursorPath);
    }
    if (!cursorDoc) throw new ApiError(503, "STORAGE_CURSOR_UNAVAILABLE", "The storage routing cursor could not be initialized.");
    const cursor = asSafeBytes(cursorDoc["cursor"]);
    const pick = pickDestination(candidates, input.incomingBytes, input.purpose, cursor);
    if (!pick) {
      throw new ApiError(507, "STORAGE_CAPACITY_UNAVAILABLE", "No verified storage destination currently has enough available capacity.");
    }
    const selected = parsed.find(item => item.metadata.destinationId === pick.id);
    if (!selected) throw new ApiError(503, "STORAGE_ROUTING_RETRY", "Storage routing changed; please retry.");
    const groupItems = groups.get(selected.metadata.accountGroup) ?? [];
    const groupPaths = groupItems.map(item => "storageDestinations/" + item.metadata.destinationId);
    const selectedGroupIndex = groupItems.findIndex(item => item.metadata.destinationId === pick.id);
    if (selectedGroupIndex < 0) throw new ApiError(503, "STORAGE_ROUTING_RETRY", "Storage routing changed; please retry.");
    try {
      await fs.transact([cursorPath, ...groupPaths, "storageReservations/" + reservationId], docs => {
        const currentCursor = docs[0];
        const currentCursorValue = asSafeBytes(currentCursor?.["cursor"]);
        const groupDocs = docs.slice(1, 1 + groupItems.length);
        const existingReservation = docs[1 + groupItems.length];
        if (currentCursorValue !== cursor) throw new ApiError(409, "STORAGE_CURSOR_CHANGED", "Storage routing changed; retry selection.");
        if (existingReservation) throw new ApiError(409, "STORAGE_RESERVATION_EXISTS", "This storage reservation already exists.");
        if (groupDocs.some(doc => !doc)) throw new ApiError(409, "STORAGE_DESTINATION_CHANGED", "A storage destination in this account group is unavailable.");
        const validGroupDocs = groupDocs as Array<Record<string, unknown>>;
        const groupUsageValues = validGroupDocs.map(doc => doc["usageBytes"]);
        if (groupUsageValues.some(value => typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)) {
          throw new ApiError(409, "STORAGE_USAGE_UNKNOWN", "Storage usage must be reconciled before automatic assignment.");
        }
        const groupUsage = (groupUsageValues as number[]).reduce((sum, value) => sum + value, 0) + validGroupDocs.reduce((sum, doc) => sum + asSafeBytes(doc["reservedBytes"]), 0);
        const configuredCaps = validGroupDocs.map(doc => doc["accountCapBytes"]).filter((value): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0);
        const groupCap = groupItems.length === 1
          ? (configuredCaps[0] ?? selected.metadata.softCapBytes)
          : configuredCaps.length === groupItems.length && new Set(configuredCaps).size === 1 ? configuredCaps[0]! : null;
        if (groupCap === null) throw new ApiError(409, "STORAGE_ACCOUNT_CAPACITY_UNKNOWN", "The shared storage account quota must be configured before assignment.");
        if (groupUsage + input.incomingBytes > groupCap) {
          throw new ApiError(409, "STORAGE_ACCOUNT_CAPACITY_CHANGED", "The shared storage account has insufficient remaining capacity.");
        }
        const currentDestination = validGroupDocs[selectedGroupIndex];
        if (input.purpose === "hls_streaming") {
          const paidEgressEnabled = currentDestination["paidEgressEnabled"] === true;
          const egressBudget = currentDestination["freeEgressBudgetBytes"];
          const egressMonthKey = new Date().toISOString().slice(0, 7);
          const egressUsed = currentDestination["egressMonthKey"] === egressMonthKey ? asSafeBytes(currentDestination["egressMonthBytes"]) : 0;
          if ((typeof egressBudget !== "number" || !Number.isSafeInteger(egressBudget) || egressBudget < 0) && !paidEgressEnabled) {
            throw new ApiError(409, "STORAGE_EGRESS_BUDGET_UNKNOWN", "The HLS destination requires a configured egress budget or explicit paid-egress approval.");
          }
          if (calculateEgressLevel(egressUsed, typeof egressBudget === "number" ? egressBudget : 0, paidEgressEnabled) === "blocked") {
            throw new ApiError(409, "STORAGE_EGRESS_LIMIT_REACHED", "The HLS destination has reached its safe egress limit.");
          }
        }
        if (currentDestination["enabled"] !== true || currentDestination["mode"] !== "active" || currentDestination["healthStatus"] !== "healthy") {
          throw new ApiError(409, "STORAGE_DESTINATION_CHANGED", "The selected storage destination is no longer eligible.");
        }
        const currentUsage = currentDestination["usageBytes"] as number;
        const nextReserved = asSafeBytes(currentDestination["reservedBytes"]) + input.incomingBytes;
        if (currentUsage + nextReserved > selected.metadata.softCapBytes) {
          throw new ApiError(409, "STORAGE_CAPACITY_CHANGED", "Storage capacity changed during reservation.");
        }
        const now = new Date().toISOString();
        return {
          result: undefined,
          writes: [
            { update: { name: fs.docName("storageDestinations/" + pick.id), fields: { reservedBytes: { integerValue: String(nextReserved) }, updatedAt: { stringValue: now } } }, updateMask: { fieldPaths: ["reservedBytes", "updatedAt"] } },
            { update: { name: fs.docName(cursorPath), fields: { cursor: { integerValue: String(cursor + 1) }, updatedAt: { stringValue: now } } }, updateMask: { fieldPaths: ["cursor", "updatedAt"] } },
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
            { update: { name: fs.docName("storageDestinations/" + destinationId), fields: { reservedBytes: { integerValue: String(currentReserved - bytes) }, updatedAt: { stringValue: now } } }, updateMask: { fieldPaths: ["reservedBytes", "updatedAt"] } },
            { update: { name: fs.docName("storageReservations/" + reservationId), fields: { status: { stringValue: "released" }, releasedAt: { stringValue: now } } }, updateMask: { fieldPaths: ["status", "releasedAt"] } },
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
    const reservation = await fs.getDoc("storageReservations/" + reservationId);
    if (!reservation) throw new ApiError(404, "STORAGE_RESERVATION_NOT_FOUND", "The storage reservation could not be found.");
    if (reservation["status"] === "committed") return;
    if (reservation["status"] !== "reserved") throw new ApiError(409, "STORAGE_RESERVATION_NOT_ACTIVE", "The storage reservation is no longer active.");
    const destinationId = typeof reservation["destinationId"] === "string" ? reservation["destinationId"] : "";
    const reservedBytes = asSafeBytes(reservation["reservedBytes"]);
    if (!destinationId || reservedBytes < 1 || actualBytes > reservedBytes) throw new ApiError(409, "STORAGE_RESERVATION_SIZE_MISMATCH", "The uploaded object exceeds its reserved capacity.");
    try {
      await fs.transact(["storageReservations/" + reservationId, "storageDestinations/" + destinationId], docs => {
        const current = docs[0];
        const destination = docs[1];
        if (!current || current["status"] !== "reserved") {
          if (current?.["status"] === "committed") return { result: undefined, writes: [] };
          throw new ApiError(409, "STORAGE_RESERVATION_NOT_ACTIVE", "The storage reservation is no longer active.");
        }
        if (!destination) throw new ApiError(409, "STORAGE_DESTINATION_MISSING", "The reserved storage destination is missing.");
        const currentReserved = asSafeBytes(destination["reservedBytes"]);
        const currentUsage = asSafeBytes(destination["usageBytes"]);
        if (currentReserved < reservedBytes || currentUsage + actualBytes > Number.MAX_SAFE_INTEGER) {
          throw new ApiError(409, "STORAGE_RESERVATION_CORRUPT", "The storage reservation counters are inconsistent.");
        }
        const now = new Date().toISOString();
        return {
          result: undefined,
          writes: [
            { update: { name: fs.docName("storageDestinations/" + destinationId), fields: {
              reservedBytes: { integerValue: String(currentReserved - reservedBytes) },
              usageBytes: { integerValue: String(currentUsage + actualBytes) },
              usageSource: { stringValue: "ledger" },
              usageCheckedAt: { stringValue: now },
              updatedAt: { stringValue: now },
            } }, updateMask: { fieldPaths: ["reservedBytes", "usageBytes", "usageSource", "usageCheckedAt", "updatedAt"] } },
            { update: { name: fs.docName("storageReservations/" + reservationId), fields: {
              status: { stringValue: "committed" },
              actualBytes: { integerValue: String(actualBytes) },
              committedAt: { stringValue: now },
            } }, updateMask: { fieldPaths: ["status", "actualBytes", "committedAt"] } },
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
