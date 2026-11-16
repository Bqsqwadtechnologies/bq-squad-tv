import { ApiError, Firestore } from "../firebase-admin";
import { calculateEgressLevel, type EgressLevel } from "./ledger";

export async function recordStorageEgress(
  fs: Firestore,
  destinationId: string,
  bytes: number,
  highResolution: boolean,
): Promise<EgressLevel> {
  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(destinationId) || !Number.isSafeInteger(bytes) || bytes < 1) {
    throw new ApiError(400, "EGRESS_RECORD_INVALID", "The storage egress record is invalid.");
  }
  const path = "storageDestinations/" + destinationId;
  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  const dayKey = now.toISOString().slice(0, 10);
  try {
    return await fs.transact([path], docs => {
    const destination = docs[0];
    if (!destination) throw new ApiError(503, "STREAM_DESTINATION_MISSING", "The streaming destination is unavailable.");
    const budget = destination["freeEgressBudgetBytes"];
    const paidEnabled = destination["paidEgressEnabled"] === true;
    if ((typeof budget !== "number" || !Number.isSafeInteger(budget) || budget < 0) && !paidEnabled) {
      throw new ApiError(503, "EGRESS_BUDGET_UNKNOWN", "The streaming destination egress budget must be configured before delivery.");
    }
    const effectiveBudget = typeof budget === "number" && Number.isSafeInteger(budget) && budget >= 0 ? budget : 0;
    const currentMonth = destination["egressMonthKey"] === monthKey && typeof destination["egressMonthBytes"] === "number"
      ? destination["egressMonthBytes"] : 0;
    const currentDay = destination["egressDayKey"] === dayKey && typeof destination["egressDayBytes"] === "number"
      ? destination["egressDayBytes"] : 0;
    const nextMonth = currentMonth + bytes;
    const nextDay = currentDay + bytes;
    const dailyCap = destination["dailyEgressCapBytes"];
    if (typeof dailyCap === "number" && Number.isSafeInteger(dailyCap) && nextDay > dailyCap) {
      throw new ApiError(429, "STORAGE_DAILY_EGRESS_LIMIT", "This streaming destination has reached its configured daily delivery limit.");
    }
    if (!Number.isSafeInteger(nextMonth) || !Number.isSafeInteger(nextDay)) throw new ApiError(409, "EGRESS_COUNTER_OVERFLOW", "The storage egress counter is unavailable.");
    const level = calculateEgressLevel(nextMonth, effectiveBudget, paidEnabled);
    if (level === "blocked") throw new ApiError(429, "STORAGE_EGRESS_LIMIT_REACHED", "This streaming destination has reached its safe monthly delivery limit.");
    if (level === "throttle" && highResolution) throw new ApiError(429, "STORAGE_EGRESS_QUALITY_LIMIT", "High-resolution delivery is temporarily limited to protect the storage bandwidth budget.");
    const updatedAt = now.toISOString();
    return {
      result: level,
      writes: [{ update: { name: fs.docName(path), fields: {
        egressMonthBytes: { integerValue: String(nextMonth) },
        egressMonthKey: { stringValue: monthKey },
        egressDayBytes: { integerValue: String(nextDay) },
        egressDayKey: { stringValue: dayKey },
        egressLevel: { stringValue: level },
        egressAlertAt: level === "warn" || level === "throttle" || level === "blocked" ? { stringValue: updatedAt } : { nullValue: null },
        updatedAt: { stringValue: updatedAt },
      } }, updateMask: { fieldPaths: ["egressMonthBytes", "egressMonthKey", "egressDayBytes", "egressDayKey", "egressLevel", "egressAlertAt", "updatedAt"] } }],
    };
    });
  } catch (error) {
    if (error instanceof ApiError && (error.code === "STORAGE_EGRESS_LIMIT_REACHED" || error.code === "STORAGE_DAILY_EGRESS_LIMIT")) {
      await fs.patchDoc(path, { egressLevel: "blocked", egressAlertAt: new Date().toISOString() }).catch(() => undefined);
    } else if (error instanceof ApiError && error.code === "STORAGE_EGRESS_QUALITY_LIMIT") {
      await fs.patchDoc(path, { egressLevel: "throttle", egressAlertAt: new Date().toISOString() }).catch(() => undefined);
    }
    throw error;
  }
}
