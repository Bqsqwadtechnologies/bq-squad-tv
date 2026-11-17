import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { calculateB2DailyFreeEgressBudget, calculateB2MonthlyFreeEgressBudget, calculateEgressLevel, storageAccountEgressId } from "@/lib/server/storage/ledger";
import { rebuildStoragePoolIndex } from "@/lib/server/storage/pool-index";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({
  monthlyBudgetBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  dailyBudgetBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  reason: z.string().trim().min(3).max(500),
});

function requireStepUp(authTime: number): void {
  const age = Math.floor(Date.now() / 1000) - authTime;
  if (!Number.isSafeInteger(authTime) || age < 0 || age > 300) {
    throw new ApiError(401, "STEP_UP_REQUIRED", "Sign in again to confirm this sensitive storage action.");
  }
}

export const Route = createFileRoute("/api/public/v1/admin/storage/groups/$groupId/budget")({
  server: { handlers: { PUT: async ({ request, params }) => {
    try {
      const user = await requireUser(request);
      requireStepUp(user.authTime);
      const body = await parseBody(request, schema);
      const groupId = params.groupId;
      if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{1,99}$/.test(groupId)) {
        throw new ApiError(400, "STORAGE_GROUP_INVALID", "The storage account group is invalid.");
      }
      const fs = await Firestore.create();
      const access = await requireAdminModule(fs, user, "system");
      if (!access.isZillionaireOwner) throw new ApiError(403, "OWNER_ONLY", "Only the protected platform owner can change a shared storage allowance.");
      const rows = await fs.query("storageDestinations", {
        filters: [{ field: "accountGroup", op: "EQUAL", value: groupId }],
        limit: 500,
      });
      if (rows.length === 0) throw new ApiError(404, "STORAGE_GROUP_NOT_FOUND", "No storage locations belong to this account group.");
      if (rows.length > 499) throw new ApiError(413, "STORAGE_GROUP_TOO_LARGE", "This account group is too large for one safe allowance update.");
      const providerTypes = new Set(rows.map(row => row["providerType"]));
      if (providerTypes.size !== 1) throw new ApiError(409, "STORAGE_GROUP_PROVIDER_MISMATCH", "A shared account group cannot mix storage providers.");
      const providerType = rows[0]?.["providerType"];
      const now = new Date().toISOString();
      let dailyBudgetBytes = body.dailyBudgetBytes ?? null;
      if (providerType === "backblaze_b2") {
        const usageKnown = rows.every(row =>
          typeof row["usageBytes"] === "number" && Number.isSafeInteger(row["usageBytes"]) &&
          row["usageBytes"] >= 0 && (row["usageSource"] === "provider_listing" || row["usageSource"] === "ledger"));
        if (!usageKnown) throw new ApiError(409, "STORAGE_USAGE_UNKNOWN", "Reconcile every location in this account before setting its free delivery allowance.");
        const storedBytes = rows.reduce((sum, row) => sum + Number(row["usageBytes"]), 0);
        const maxMonthly = calculateB2MonthlyFreeEgressBudget(storedBytes);
        const maxDaily = calculateB2DailyFreeEgressBudget();
        if (body.monthlyBudgetBytes > maxMonthly || (dailyBudgetBytes !== null && dailyBudgetBytes > maxDaily)) {
          throw new ApiError(400, "B2_FREE_ALLOWANCE_EXCEEDED", "The requested allowance is above the conservative published free limit.");
        }
        dailyBudgetBytes = dailyBudgetBytes === null ? maxDaily : dailyBudgetBytes;
      } else if (providerType !== "lovable_storage") {
        throw new ApiError(400, "STORAGE_PROVIDER_UNSUPPORTED", "This storage provider cannot use a shared free allowance.");
      }
      const accountCapValues = rows.map(row => row["accountCapBytes"]);
      if (accountCapValues.some(value => value !== accountCapValues[0])) {
        throw new ApiError(409, "STORAGE_GROUP_CAP_MISMATCH", "All locations in this account must share one capacity limit before changing its delivery allowance.");
      }
      const policyPath = "storageAccountPolicies/" + storageAccountEgressId(groupId);
      const egressStatePath = "storageEgressState/" + storageAccountEgressId(groupId);
      const paths = [policyPath, egressStatePath, ...rows.map(row => "storageDestinations/" + String(row["__id"]))];
      await fs.transact(paths, docs => {
        const policy = docs[0];
        const egressState = docs[1];
        const groupDocs = docs.slice(2);
        if (groupDocs.length !== rows.length || groupDocs.some(doc => !doc || doc["accountGroup"] !== groupId)) {
          throw new ApiError(409, "STORAGE_GROUP_CHANGED", "The account group changed while its allowance was being saved.");
        }
        const previousBudget = typeof policy?.["monthlyBudgetBytes"] === "number"
          ? policy["monthlyBudgetBytes"]
          : typeof rows[0]?.["freeEgressBudgetBytes"] === "number" ? rows[0]["freeEgressBudgetBytes"] : null;
        if (previousBudget !== null && body.monthlyBudgetBytes > previousBudget && body.reason.length < 3) {
          throw new ApiError(400, "STORAGE_BUDGET_REASON_REQUIRED", "A reason is required when raising a shared delivery allowance.");
        }
        const monthKey = now.slice(0, 7);
        const dayKey = now.slice(0, 10);
        const counter = (value: unknown): number =>
          typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
        const monthExpected = egressState?.["monthKey"] === monthKey ? counter(egressState["monthExpectedBytes"]) : 0;
        const monthReserved = egressState?.["monthKey"] === monthKey ? counter(egressState["monthReservedBytes"]) : 0;
        const monthConsumed = egressState?.["monthKey"] === monthKey ? counter(egressState["monthConsumedBytes"]) : 0;
        const dayExpected = egressState?.["dayKey"] === dayKey ? counter(egressState["dayExpectedBytes"]) : 0;
        const dayReserved = egressState?.["dayKey"] === dayKey ? counter(egressState["dayReservedBytes"]) : 0;
        const dayConsumed = egressState?.["dayKey"] === dayKey ? counter(egressState["dayConsumedBytes"]) : 0;
        const effectiveDailyBudget = dailyBudgetBytes ?? body.monthlyBudgetBytes;
        const monthLevel = calculateEgressLevel(monthExpected, body.monthlyBudgetBytes, false);
        const dayLevel = calculateEgressLevel(dayExpected, effectiveDailyBudget, false);
        const rank: Record<string, number> = { normal: 0, warn: 1, throttle: 2, blocked: 3 };
        const level = rank[monthLevel] >= rank[dayLevel] ? monthLevel : dayLevel;
        const writes = [
          {
            update: {
              name: fs.docName(policyPath),
              fields: encodeFields({
                accountGroup: groupId,
                providerType,
                monthlyBudgetBytes: body.monthlyBudgetBytes,
                dailyBudgetBytes,
                source: providerType === "backblaze_b2" ? "published_free_allowance" : "owner_supplied",
                reason: body.reason,
                updatedAt: now,
                updatedBy: user.uid,
              }),
            },
            ...(policy ? {} : { currentDocument: { exists: false } }),
          },
          {
            update: {
              name: fs.docName(egressStatePath),
              fields: encodeFields({
                accountGroup: groupId,
                monthKey, monthExpectedBytes: monthExpected, monthReservedBytes: monthReserved,
                monthConsumedBytes: monthConsumed,
                dayKey, dayExpectedBytes: dayExpected, dayReservedBytes: dayReserved,
                dayConsumedBytes: dayConsumed,
                budgetBytes: body.monthlyBudgetBytes,
                dailyBudgetBytes: effectiveDailyBudget,
                level,
                updatedAt: now,
              }),
              updateMask: { fieldPaths: [
                "accountGroup", "monthKey", "monthExpectedBytes", "monthReservedBytes", "monthConsumedBytes",
                "dayKey", "dayExpectedBytes", "dayReservedBytes", "dayConsumedBytes",
                "budgetBytes", "dailyBudgetBytes", "level", "updatedAt",
              ] },
            },
            ...(egressState ? {} : { currentDocument: { exists: false } }),
          },
          ...rows.map((row, index) => ({
            update: {
              name: fs.docName("storageDestinations/" + String(row["__id"])),
              fields: encodeFields({
                freeEgressBudgetBytes: body.monthlyBudgetBytes,
                dailyEgressCapBytes: dailyBudgetBytes,
                paidEgressEnabled: false,
                egressBudgetReason: body.reason,
                egressBudgetUpdatedAt: now,
                updatedAt: now,
              }),
              updateMask: { fieldPaths: ["freeEgressBudgetBytes", "dailyEgressCapBytes", "paidEgressEnabled", "egressBudgetReason", "egressBudgetUpdatedAt", "updatedAt"] },
            },
          })),
        ];
        return { result: undefined, writes };
      });
      await rebuildStoragePoolIndex(fs);
      const alertRank: Record<string, number> = { normal: 0, warn: 1, throttle: 2, blocked: 3 };
      const egressState = await fs.getDoc("storageEgressState/" + storageAccountEgressId(groupId));
      if ((alertRank[String(egressState?.["level"])] ?? 0) > 0) {
        const alertId = "egress-budget-owner-" + storageAccountEgressId(groupId) + "-" + new Date().toISOString().slice(0, 10);
        await fs.setDoc("storageAlerts/" + alertId, {
          scope: "account_group",
          accountGroup: groupId,
          severity: egressState?.["level"] === "blocked" ? "critical" : egressState?.["level"] === "throttle" ? "warning" : "info",
          reasonCode: "EGRESS_ALLOWANCE_UPDATED",
          message: "The shared free delivery allowance was updated. New playback may be limited by the current usage level.",
          level: egressState?.["level"],
          createdAt: now,
          acknowledged: false,
        }, { mustNotExist: true }).catch(() => undefined);
      }
      await writeAuditLog(fs, {
        actorUid: user.uid,
        action: "storage.account_egress_budget_updated",
        targetType: "storageAccountGroup",
        targetId: groupId,
        reason: body.reason,
        metadata: { providerType, monthlyBudgetBytes: body.monthlyBudgetBytes, dailyBudgetBytes },
      });
      return Response.json({ saved: true, accountGroup: groupId, monthlyBudgetBytes: body.monthlyBudgetBytes, dailyBudgetBytes, paidEgressEnabled: false });
    } catch (error) { return errorBody(error); }
  } } },
});
