import { ApiError, Firestore } from "../firebase-admin";
import { calculateEgressLevel, storageAccountEgressId, type EgressLevel } from "./ledger";

function safeBytes(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/**
 * Account-group egress is shared across every bucket in the provider account.
 * The owner must configure the same monthly budget and paid-egress choice on
 * every destination in that group. Per-bucket daily caps remain independent.
 */
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
    const initial = await fs.getDoc(path);
    if (!initial || typeof initial["accountGroup"] !== "string") {
      throw new ApiError(503, "STREAM_DESTINATION_MISSING", "The streaming destination is unavailable.");
    }
    const accountGroup = initial["accountGroup"];
    const groupRows = await fs.query("storageDestinations", { limit: 500 });
    const group = groupRows.filter(row => row["accountGroup"] === accountGroup);
    if (group.length === 0) throw new ApiError(503, "EGRESS_ACCOUNT_GROUP_UNKNOWN", "The storage account group is unavailable.");
    const budgets = group.map(row => row["freeEgressBudgetBytes"]);
    const paidChoices = group.map(row => row["paidEgressEnabled"] === true);
    const sharedBudget = budgets[0];
    const paidEnabled = paidChoices[0] === true;
    if (budgets.some(value => value !== sharedBudget) || paidChoices.some(value => value !== paidEnabled)) {
      throw new ApiError(503, "EGRESS_ACCOUNT_CONFIGURATION_MISMATCH", "Every destination in this provider account must share one verified egress budget and paid-egress setting.");
    }
    if ((typeof sharedBudget !== "number" || !Number.isSafeInteger(sharedBudget) || sharedBudget < 0) && !paidEnabled) {
      throw new ApiError(503, "EGRESS_BUDGET_UNKNOWN", "The provider account egress budget must be configured before delivery.");
    }
    const budget = typeof sharedBudget === "number" && Number.isSafeInteger(sharedBudget) && sharedBudget >= 0 ? sharedBudget : 0;
    const legacyMonth = group.reduce((sum, row) => sum + (row["egressMonthKey"] === monthKey ? safeBytes(row["egressMonthBytes"]) : 0), 0);
    const legacyDay = group.reduce((sum, row) => sum + (row["egressDayKey"] === dayKey ? safeBytes(row["egressDayBytes"]) : 0), 0);
    const accountLedgerPath = "storageAccountEgress/" + storageAccountEgressId(accountGroup);
    const destinationLegacyMonth = initial["egressMonthKey"] === monthKey ? safeBytes(initial["egressMonthBytes"]) : 0;
    const destinationLegacyDay = initial["egressDayKey"] === dayKey ? safeBytes(initial["egressDayBytes"]) : 0;

    return await fs.transact([path, accountLedgerPath], docs => {
      const destination = docs[0];
      const accountLedger = docs[1];
      if (!destination) throw new ApiError(503, "STREAM_DESTINATION_MISSING", "The streaming destination is unavailable.");
      const currentMonth = accountLedger?.["monthKey"] === monthKey
        ? safeBytes(accountLedger["monthBytes"])
        : accountLedger ? 0 : Math.max(legacyMonth, destinationLegacyMonth);
      const currentDay = accountLedger?.["dayKey"] === dayKey
        ? safeBytes(accountLedger["dayBytes"])
        : accountLedger ? 0 : Math.max(legacyDay, destinationLegacyDay);
      const nextMonth = currentMonth + bytes;
      const nextDay = currentDay + bytes;
      const dailyCap = destination["dailyEgressCapBytes"];
      if (typeof dailyCap === "number" && Number.isSafeInteger(dailyCap) && nextDay > dailyCap) {
        throw new ApiError(429, "STORAGE_DAILY_EGRESS_LIMIT", "This streaming destination has reached its configured daily delivery limit.");
      }
      if (!Number.isSafeInteger(nextMonth) || !Number.isSafeInteger(nextDay)) {
        throw new ApiError(409, "EGRESS_COUNTER_OVERFLOW", "The storage egress counter is unavailable.");
      }
      const level = calculateEgressLevel(nextMonth, budget, paidEnabled);
      if (level === "blocked") throw new ApiError(429, "STORAGE_EGRESS_LIMIT_REACHED", "This provider account has reached its safe monthly delivery limit.");
      if (level === "throttle" && highResolution) {
        throw new ApiError(429, "STORAGE_EGRESS_QUALITY_LIMIT", "High-resolution delivery is temporarily limited to protect the provider account bandwidth budget.");
      }
      const updatedAt = now.toISOString();
      const writes = [
        { update: { name: fs.docName(path), fields: {
          egressMonthBytes: { integerValue: String(destinationLegacyMonth + bytes) },
          egressMonthKey: { stringValue: monthKey },
          egressDayBytes: { integerValue: String(destinationLegacyDay + bytes) },
          egressDayKey: { stringValue: dayKey },
          egressAccountMonthBytes: { integerValue: String(nextMonth) },
          egressLevel: { stringValue: level },
          egressAlertAt: level === "warn" || level === "throttle" || level === "blocked" ? { stringValue: updatedAt } : { nullValue: null },
          updatedAt: { stringValue: updatedAt },
        } }, updateMask: { fieldPaths: ["egressMonthBytes", "egressMonthKey", "egressDayBytes", "egressDayKey", "egressAccountMonthBytes", "egressLevel", "egressAlertAt", "updatedAt"] } },
        { update: { name: fs.docName(accountLedgerPath), fields: {
          accountGroup: { stringValue: accountGroup },
          monthKey: { stringValue: monthKey },
          monthBytes: { integerValue: String(nextMonth) },
          dayKey: { stringValue: dayKey },
          dayBytes: { integerValue: String(nextDay) },
          budgetBytes: { integerValue: String(budget) },
          paidEgressEnabled: { booleanValue: paidEnabled },
          level: { stringValue: level },
          updatedAt: { stringValue: updatedAt },
        } }, updateMask: { fieldPaths: ["accountGroup", "monthKey", "monthBytes", "dayKey", "dayBytes", "budgetBytes", "paidEgressEnabled", "level", "updatedAt"] }, ...(accountLedger ? {} : { currentDocument: { exists: false } }) },
      ];
      return { result: level, writes };
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
