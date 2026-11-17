import type { Firestore } from "./firebase-admin";
import { getPlatformFlags } from "./flags";

export const MODAL_PRICING = {
  cpuUsdPerCoreSecond: 0.0000131,
  memoryUsdPerGiBSecond: 0.00000222,
  networkEgressUsdPerGiB: 0.04,
  starterIncludedEgressBytes: 1_099_511_627_776,
};

export function estimateModalComputeCost(cores: number, memoryGiB: number, seconds: number): number {
  const safeCores = Number.isFinite(cores) ? Math.max(0, cores) : 0;
  const safeMemory = Number.isFinite(memoryGiB) ? Math.max(0, memoryGiB) : 0;
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return safeCores * MODAL_PRICING.cpuUsdPerCoreSecond * safeSeconds +
    safeMemory * MODAL_PRICING.memoryUsdPerGiBSecond * safeSeconds;
}

export async function getModalSpendSnapshot(fs: Firestore, now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  const [flags, settings, rows] = await Promise.all([
    getPlatformFlags(fs),
    fs.getDoc("config/modalSpend"),
    fs.query("modalUsage", {
      filters: [{ field: "month", op: "EQUAL", value: month }],
      limit: 5000,
    }),
  ]);
  const estimatedCostUsd = rows.reduce((sum, row) =>
    sum + (typeof row["estimatedCostUsd"] === "number" && Number.isFinite(row["estimatedCostUsd"]) ? row["estimatedCostUsd"] : 0), 0);
  const outputBytes = rows.reduce((sum, row) =>
    sum + (typeof row["outputBytes"] === "number" && Number.isSafeInteger(row["outputBytes"]) ? row["outputBytes"] : 0), 0);
  const monthlyLimitUsd = typeof settings?.["monthlyLimitUsd"] === "number" &&
    Number.isFinite(settings["monthlyLimitUsd"]) && (settings["monthlyLimitUsd"] as number) > 0
    ? settings["monthlyLimitUsd"] as number : 25;
  const override = settings?.["override"] === true;
  const guarded = flags.modalSpendGuard && !override;
  return {
    month,
    estimatedCostUsd,
    outputBytes,
    monthlyLimitUsd,
    override,
    guardEnabled: flags.modalSpendGuard,
    pauseNewJobs: guarded && estimatedCostUsd >= monthlyLimitUsd,
    rates: MODAL_PRICING,
  };
}
