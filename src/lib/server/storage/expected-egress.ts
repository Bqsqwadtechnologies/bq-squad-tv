import { ApiError, Firestore, encodeFields, type FirestoreWrite } from "../firebase-admin";
import { calculateEgressLevel, storageAccountEgressId, storageLedgerShard, type EgressLevel } from "./ledger";
import type { StorageDestinationMetadata } from "./registry";

const SHARDS = 20;
const safe = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
const monthKey = (date: Date) => date.toISOString().slice(0, 7);
const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const groupPath = (id: string) => "storageEgressState/" + storageAccountEgressId(id);
const destPath = (id: string) => "storageEgressDestinationState/" + id;
const reservationPath = (id: string) => "storageEgressReservations/" + id;
const groupCounterPath = (id: string, month: string, day: string, shard: number) =>
  "storageEgressCounters/group-" + storageAccountEgressId(id) + "-" + month + "-" + day + "-" + shard;
const destCounterPath = (id: string, month: string, day: string, shard: number) =>
  "storageEgressCounters/destination-" + id + "-" + month + "-" + day + "-" + shard;
const eventPath = (id: string, sequence: number) => "storageEgressEvents/" + id + "-" + sequence;

function write(fs: Firestore, path: string, fields: Record<string, unknown>, exists: boolean): FirestoreWrite {
  return {
    update: { name: fs.docName(path), fields: encodeFields(fields) },
    ...(exists ? { updateMask: { fieldPaths: Object.keys(fields) } } : { currentDocument: { exists: false } }),
  };
}
function rank(level: EgressLevel): number {
  return ({ normal: 0, warn: 1, throttle: 2, blocked: 3, paid: 4 })[level];
}
function severe(a: EgressLevel, b: EgressLevel): EgressLevel { return rank(a) >= rank(b) ? a : b; }
function message(level: EgressLevel): string {
  if (level === "warn") return "A storage account is approaching its free delivery allowance.";
  if (level === "throttle") return "New playback sessions are limited to standard quality to protect the free delivery allowance.";
  return "New playback sessions are paused to prevent unexpected storage delivery charges.";
}
async function alertOwner(fs: Firestore, groupId: string, level: EgressLevel, values: Record<string, unknown>) {
  const id = crypto.randomUUID().replace(/-/g, "");
  await fs.setDoc("storageAlerts/" + id, {
    severity: level === "blocked" ? "error" : "warning",
    reasonCode: "STORAGE_EGRESS_" + level.toUpperCase(),
    accountGroup: groupId, message: message(level), ...values,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    acknowledged: false,
  }).catch(() => undefined);
}

export function estimateExpectedPlaybackBytes(asset: Record<string, unknown>): number {
  let bytes = typeof asset["streamBytes"] === "number" && Number.isSafeInteger(asset["streamBytes"]) && asset["streamBytes"] > 0
    ? asset["streamBytes"] : 0;
  if (!bytes && Array.isArray(asset["files"])) {
    bytes = asset["files"].reduce((sum, file) => {
      if (!file || typeof file !== "object") return sum;
      const size = (file as Record<string, unknown>)["sizeBytes"];
      return typeof size === "number" && Number.isSafeInteger(size) && size > 0 ? sum + size : sum;
    }, 0);
  }
  if (!bytes) {
    const duration = asset["durationSeconds"];
    const bitrate = asset["streamBitrateBps"] ?? asset["averageBitrateBps"] ?? 1_500_000;
    if (typeof duration === "number" && Number.isSafeInteger(duration) && duration > 0 &&
        typeof bitrate === "number" && Number.isSafeInteger(bitrate) && bitrate > 0) {
      bytes = Math.ceil(duration * bitrate / 8);
    }
  }
  if (!bytes) bytes = 1_350_000_000; // conservative two-hour standard-quality fallback for legacy assets
  const estimate = Math.ceil(bytes * 1.1);
  if (!Number.isSafeInteger(estimate) || estimate < 1) throw new ApiError(409, "EGRESS_ESTIMATE_INVALID", "The expected playback size could not be estimated safely.");
  return estimate;
}

export function estimatePlaybackProgressBytes(bitrateBps: number, seconds: number): number {
  if (!Number.isSafeInteger(bitrateBps) || bitrateBps < 64_000 || bitrateBps > 25_000_000 ||
      !Number.isSafeInteger(seconds) || seconds < 0 || seconds > 86_400) {
    throw new ApiError(400, "EGRESS_PROGRESS_INVALID", "The playback progress estimate is invalid.");
  }
  return Math.ceil(bitrateBps * seconds / 8 * 1.1);
}

export async function reserveExpectedStorageEgress(
  fs: Firestore,
  metadata: StorageDestinationMetadata,
  sessionId: string,
  expectedBytes: number,
): Promise<{ level: EgressLevel; qualityCap: 480 | null }> {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(sessionId) || !Number.isSafeInteger(expectedBytes) || expectedBytes < 1) {
    throw new ApiError(400, "EGRESS_RESERVATION_INVALID", "The expected playback reservation is invalid.");
  }
  if (metadata.paidEgressEnabled === true) throw new ApiError(409, "STORAGE_PAID_EGRESS_DISABLED", "Paid data transfer is disabled for this service.");
  const budget = metadata.freeEgressBudgetBytes;
  // A daily cap applies only when the provider publishes/configures one.
  // Lovable's conservative default is monthly; do not invent a 1/30 daily limit.
  const dailyBudget = typeof metadata.dailyEgressCapBytes === "number" && Number.isSafeInteger(metadata.dailyEgressCapBytes)
    ? metadata.dailyEgressCapBytes
    : typeof budget === "number" ? budget : 0;
  if (typeof budget !== "number" || !Number.isSafeInteger(budget) || budget < 1 || dailyBudget < 1) {
    throw new ApiError(503, "EGRESS_BUDGET_UNKNOWN", "The free delivery allowance must be checked before playback.");
  }
  const now = new Date();
  const month = monthKey(now);
  const day = dayKey(now);
  const shard = storageLedgerShard(sessionId, SHARDS);
  const gp = groupPath(metadata.accountGroup);
  const dp = destPath(metadata.destinationId);
  const gc = groupCounterPath(metadata.accountGroup, month, day, shard);
  const dc = destCounterPath(metadata.destinationId, month, day, shard);
  const rp = reservationPath(sessionId);
  let nextLevel: EgressLevel = "normal";
  let priorLevel: EgressLevel = "normal";
  let monthBytes = 0;
  let dayBytes = 0;
  try {
    const result = await fs.transact([gp, dp, gc, dc, rp], docs => {
      const [group, destination, groupShard, destShard, existing] = docs;
      if (existing) {
        if (existing["status"] === "reserved" && existing["destinationId"] === metadata.destinationId &&
            existing["reservedBytes"] === expectedBytes) {
          const level = typeof group?.["level"] === "string" ? group["level"] as EgressLevel : "normal";
          return { result: { level, monthBytes: safe(group?.["monthExpectedBytes"]), dayBytes: safe(group?.["dayExpectedBytes"]), priorLevel: level }, writes: [] };
        }
        throw new ApiError(409, "EGRESS_RESERVATION_EXISTS", "This playback reservation has already been used for a different delivery grant.");
      }
      if (group?.["monthKey"] === month && typeof group["budgetBytes"] === "number" && group["budgetBytes"] !== budget) {
        throw new ApiError(503, "EGRESS_ACCOUNT_CONFIGURATION_MISMATCH", "The provider account monthly allowance differs across its storage locations.");
      }
      if (group?.["dayKey"] === day && typeof group["dailyBudgetBytes"] === "number" && group["dailyBudgetBytes"] !== dailyBudget) {
        throw new ApiError(503, "EGRESS_ACCOUNT_CONFIGURATION_MISMATCH", "The provider account daily allowance differs across its storage locations.");
      }
      const currentMonth = group?.["monthKey"] === month ? safe(group["monthExpectedBytes"]) : 0;
      const currentDay = group?.["dayKey"] === day ? safe(group["dayExpectedBytes"]) : 0;
      monthBytes = currentMonth + expectedBytes;
      dayBytes = currentDay + expectedBytes;
      priorLevel = group?.["monthKey"] === month && typeof group["level"] === "string" ? group["level"] as EgressLevel : "normal";
      const monthLevel = calculateEgressLevel(monthBytes, budget, false);
      const dayLevel = calculateEgressLevel(dayBytes, dailyBudget, false);
      nextLevel = severe(monthLevel, dayLevel);
      if (nextLevel === "blocked") throw new ApiError(429, "STORAGE_EGRESS_LIMIT_REACHED", "This storage account has reached its safe free delivery limit. New playback sessions are paused.");
      const nowIso = now.toISOString();
      const groupFields = {
        accountGroup: metadata.accountGroup, monthKey: month, dayKey: day,
        monthExpectedBytes: monthBytes, dayExpectedBytes: dayBytes,
        monthReservedBytes: safe(group?.["monthKey"] === month ? group["monthReservedBytes"] : 0) + expectedBytes,
        dayReservedBytes: safe(group?.["dayKey"] === day ? group["dayReservedBytes"] : 0) + expectedBytes,
        monthConsumedBytes: safe(group?.["monthKey"] === month ? group["monthConsumedBytes"] : 0),
        dayConsumedBytes: safe(group?.["dayKey"] === day ? group["dayConsumedBytes"] : 0),
        budgetBytes: budget, dailyBudgetBytes: dailyBudget, level: nextLevel, updatedAt: nowIso,
      };
      const destinationFields = {
        destinationId: metadata.destinationId, monthKey: month, dayKey: day,
        monthExpectedBytes: safe(destination?.["monthKey"] === month ? destination["monthExpectedBytes"] : 0) + expectedBytes,
        dayExpectedBytes: safe(destination?.["dayKey"] === day ? destination["dayExpectedBytes"] : 0) + expectedBytes,
        monthReservedBytes: safe(destination?.["monthKey"] === month ? destination["monthReservedBytes"] : 0) + expectedBytes,
        dayReservedBytes: safe(destination?.["dayKey"] === day ? destination["dayReservedBytes"] : 0) + expectedBytes,
        monthConsumedBytes: safe(destination?.["monthKey"] === month ? destination["monthConsumedBytes"] : 0),
        dayConsumedBytes: safe(destination?.["dayKey"] === day ? destination["dayConsumedBytes"] : 0),
        budgetBytes: budget, dailyBudgetBytes: dailyBudget, level: nextLevel, updatedAt: nowIso,
      };
      const counter = (raw: Record<string, unknown> | null, scope: string, id: string) => ({
        scope, id, shard, monthKey: month, dayKey: day,
        monthExpectedBytes: safe(raw?.["monthKey"] === month ? raw["monthExpectedBytes"] : 0) + expectedBytes,
        dayExpectedBytes: safe(raw?.["dayKey"] === day ? raw["dayExpectedBytes"] : 0) + expectedBytes,
        monthReservedBytes: safe(raw?.["monthKey"] === month ? raw["monthReservedBytes"] : 0) + expectedBytes,
        dayReservedBytes: safe(raw?.["dayKey"] === day ? raw["dayReservedBytes"] : 0) + expectedBytes,
        monthConsumedBytes: safe(raw?.["monthKey"] === month ? raw["monthConsumedBytes"] : 0),
        dayConsumedBytes: safe(raw?.["dayKey"] === day ? raw["dayConsumedBytes"] : 0),
        updatedAt: nowIso,
      });
      return {
        result: { level: nextLevel, monthBytes, dayBytes, priorLevel },
        writes: [
          write(fs, gp, groupFields, Boolean(group)),
          write(fs, dp, destinationFields, Boolean(destination)),
          write(fs, gc, counter(groupShard, "group", metadata.accountGroup), Boolean(groupShard)),
          write(fs, dc, counter(destShard, "destination", metadata.destinationId), Boolean(destShard)),
          write(fs, rp, {
            sessionId, destinationId: metadata.destinationId, accountGroup: metadata.accountGroup,
            monthKey: month, dayKey: day, shard, reservedBytes: expectedBytes, consumedBytes: 0,
            status: "reserved", createdAt: nowIso, expiresAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
          }, false),
        ],
      };
    });
    nextLevel = result.level;
    monthBytes = result.monthBytes;
    dayBytes = result.dayBytes;
    priorLevel = result.priorLevel;
    if (rank(nextLevel) > rank(priorLevel)) {
      await alertOwner(fs, metadata.accountGroup, nextLevel, { monthExpectedBytes: monthBytes, monthBudgetBytes: budget, dayExpectedBytes: dayBytes, dayBudgetBytes: dailyBudget });
    }
    return { level: nextLevel, qualityCap: nextLevel === "throttle" ? 480 : null };
  } catch (error) {
    if (error instanceof ApiError && error.code === "STORAGE_EGRESS_LIMIT_REACHED") {
      await alertOwner(fs, metadata.accountGroup, "blocked", { monthExpectedBytes: monthBytes || expectedBytes, monthBudgetBytes: budget, dayExpectedBytes: dayBytes || expectedBytes, dayBudgetBytes: dailyBudget });
    }
    throw error;
  }
}

export async function recordExpectedStorageEgressProgress(
  fs: Firestore, sessionId: string, sequence: number, bytes: number,
): Promise<void> {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || !Number.isSafeInteger(bytes) || bytes < 0) {
    throw new ApiError(400, "EGRESS_PROGRESS_INVALID", "The playback progress record is invalid.");
  }
  const reserve = await fs.getDoc(reservationPath(sessionId));
  if (!reserve || reserve["status"] !== "reserved") return;
  const groupId = String(reserve["accountGroup"]);
  const destinationId = String(reserve["destinationId"]);
  const month = String(reserve["monthKey"]);
  const day = String(reserve["dayKey"]);
  const shard = safe(reserve["shard"]);
  const gp = groupPath(groupId), dp = destPath(destinationId);
  const gc = groupCounterPath(groupId, month, day, shard), dc = destCounterPath(destinationId, month, day, shard);
  const ep = eventPath(sessionId, sequence);
  const progressResult = await fs.transact([reservationPath(sessionId), gp, dp, gc, dc, ep], docs => {
    const [current, group, destination, groupShard, destShard, priorEvent] = docs;
    if (priorEvent || !current || current["status"] !== "reserved") return { result: undefined, writes: [] };
    const remaining = Math.max(0, safe(current["reservedBytes"]) - safe(current["consumedBytes"]));
    const consumed = Math.min(bytes, remaining);
    const extra = bytes - consumed;
    const now = new Date().toISOString();
    const progress = (raw: Record<string, unknown> | null) => {
      const sameMonth = raw?.["monthKey"] === month;
      const sameDay = raw?.["dayKey"] === day;
      return {
        monthExpectedBytes: sameMonth ? safe(raw["monthExpectedBytes"]) + extra : safe(raw?.["monthExpectedBytes"]),
        dayExpectedBytes: sameDay ? safe(raw["dayExpectedBytes"]) + extra : safe(raw?.["dayExpectedBytes"]),
        monthConsumedBytes: sameMonth ? safe(raw["monthConsumedBytes"]) + bytes : safe(raw?.["monthConsumedBytes"]),
        dayConsumedBytes: sameDay ? safe(raw["dayConsumedBytes"]) + bytes : safe(raw?.["dayConsumedBytes"]),
        monthReservedBytes: sameMonth ? Math.max(0, safe(raw["monthReservedBytes"]) - consumed) : safe(raw?.["monthReservedBytes"]),
        dayReservedBytes: sameDay ? Math.max(0, safe(raw["dayReservedBytes"]) - consumed) : safe(raw?.["dayReservedBytes"]),
        updatedAt: now,
      };
    };
    const groupMonth = group?.["monthKey"] === month ? safe(group["monthExpectedBytes"]) + extra : safe(group?.["monthExpectedBytes"]);
    const groupDay = group?.["dayKey"] === day ? safe(group["dayExpectedBytes"]) + extra : safe(group?.["dayExpectedBytes"]);
    const budget = safe(group?.["budgetBytes"]);
    const dailyBudget = safe(group?.["dailyBudgetBytes"]);
    const priorLevel = typeof group?.["level"] === "string" ? group["level"] as EgressLevel : "normal";
    const nextLevel = severe(
      group?.["monthKey"] === month ? calculateEgressLevel(groupMonth, budget, false) : "normal",
      group?.["dayKey"] === day ? calculateEgressLevel(groupDay, dailyBudget, false) : "normal",
    );
    return {
      result: { priorLevel, nextLevel, groupMonth, groupDay, budget, dailyBudget },
      writes: [
        write(fs, reservationPath(sessionId), { consumedBytes: safe(current["consumedBytes"]) + consumed, updatedAt: now }, true),
        ...(group ? [write(fs, gp, { ...progress(group), level: nextLevel }, true)] : []),
        ...(destination ? [write(fs, dp, progress(destination), true)] : []),
        ...(groupShard ? [write(fs, gc, progress(groupShard), true)] : []),
        ...(destShard ? [write(fs, dc, progress(destShard), true)] : []),
        write(fs, ep, { sessionId, sequence, expectedBytes: bytes, reservedConsumedBytes: consumed, additionalExpectedBytes: extra, createdAt: now }, false),
      ],
    };
  });
  if (progressResult && typeof progressResult === "object") {
    const result = progressResult as { priorLevel?: EgressLevel; nextLevel?: EgressLevel; groupMonth?: number; groupDay?: number; budget?: number; dailyBudget?: number };
    if (result.priorLevel && result.nextLevel && rank(result.nextLevel) > rank(result.priorLevel)) {
      await alertOwner(fs, groupId, result.nextLevel, {
        monthExpectedBytes: result.groupMonth ?? 0, monthBudgetBytes: result.budget ?? 0,
        dayExpectedBytes: result.groupDay ?? 0, dayBudgetBytes: result.dailyBudget ?? 0,
      });
    }
  }
}

export async function releaseExpectedStorageEgress(fs: Firestore, sessionId: string): Promise<void> {
  const reserve = await fs.getDoc(reservationPath(sessionId));
  if (!reserve || reserve["status"] !== "reserved") return;
  const groupId = String(reserve["accountGroup"]);
  const destinationId = String(reserve["destinationId"]);
  const month = String(reserve["monthKey"]);
  const day = String(reserve["dayKey"]);
  const shard = safe(reserve["shard"]);
  const gp = groupPath(groupId), dp = destPath(destinationId);
  const gc = groupCounterPath(groupId, month, day, shard), dc = destCounterPath(destinationId, month, day, shard);
  await fs.transact([reservationPath(sessionId), gp, dp, gc, dc], docs => {
    const [current, group, destination, groupShard, destShard] = docs;
    if (!current || current["status"] !== "reserved") return { result: undefined, writes: [] };
    const remaining = Math.max(0, safe(current["reservedBytes"]) - safe(current["consumedBytes"]));
    const now = new Date().toISOString();
    const release = (raw: Record<string, unknown> | null) => ({
      monthExpectedBytes: raw?.["monthKey"] === month ? Math.max(0, safe(raw["monthExpectedBytes"]) - remaining) : safe(raw?.["monthExpectedBytes"]),
      dayExpectedBytes: raw?.["dayKey"] === day ? Math.max(0, safe(raw["dayExpectedBytes"]) - remaining) : safe(raw?.["dayExpectedBytes"]),
      monthReservedBytes: raw?.["monthKey"] === month ? Math.max(0, safe(raw["monthReservedBytes"]) - remaining) : safe(raw?.["monthReservedBytes"]),
      dayReservedBytes: raw?.["dayKey"] === day ? Math.max(0, safe(raw["dayReservedBytes"]) - remaining) : safe(raw?.["dayReservedBytes"]),
      updatedAt: now,
    });
    return {
      result: undefined,
      writes: [
        write(fs, reservationPath(sessionId), { status: "released", releasedAt: now, remainingReleasedBytes: remaining }, true),
        ...(group ? [write(fs, gp, release(group), true)] : []),
        ...(destination ? [write(fs, dp, release(destination), true)] : []),
        ...(groupShard ? [write(fs, gc, release(groupShard), true)] : []),
        ...(destShard ? [write(fs, dc, release(destShard), true)] : []),
      ],
    };
  });
}
