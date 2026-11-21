import { Firestore } from "@/lib/server/firebase-admin";

export interface PayoutRules {
  minimumPayoutUSDMinor: number;
  minimumPayoutNGNMinor: number;
  usdToNgnRate: number;
  dualApprovalThresholdUSDMinor: number;
  dualApprovalThresholdNGNMinor: number;
  stepUpThresholdUSDMinor: number;
  stepUpThresholdNGNMinor: number;
  updatedAt?: string;
  updatedBy?: string;
  updateReason?: string;
}

export const DEFAULT_PAYOUT_RULES: PayoutRules = {
  minimumPayoutUSDMinor: 50000, // $500.00
  minimumPayoutNGNMinor: 75000000, // ₦750,000.00 at 1500 rate
  usdToNgnRate: 1500,
  dualApprovalThresholdUSDMinor: 500000, // $5,000.00
  dualApprovalThresholdNGNMinor: 750000000, // ₦7,500,000.00
  stepUpThresholdUSDMinor: 100000, // $1,000.00
  stepUpThresholdNGNMinor: 150000000, // ₦1,500,000.00
};

export async function getPayoutRules(fs: Firestore): Promise<PayoutRules> {
  try {
    const doc = await fs.getDoc("platformSettings/payouts");
    if (!doc) return { ...DEFAULT_PAYOUT_RULES };
    return {
      minimumPayoutUSDMinor:
        typeof doc["minimumPayoutUSDMinor"] === "number" && doc["minimumPayoutUSDMinor"] > 0
          ? doc["minimumPayoutUSDMinor"]
          : DEFAULT_PAYOUT_RULES.minimumPayoutUSDMinor,
      minimumPayoutNGNMinor:
        typeof doc["minimumPayoutNGNMinor"] === "number" && doc["minimumPayoutNGNMinor"] > 0
          ? doc["minimumPayoutNGNMinor"]
          : DEFAULT_PAYOUT_RULES.minimumPayoutNGNMinor,
      usdToNgnRate:
        typeof doc["usdToNgnRate"] === "number" && doc["usdToNgnRate"] > 0
          ? doc["usdToNgnRate"]
          : DEFAULT_PAYOUT_RULES.usdToNgnRate,
      dualApprovalThresholdUSDMinor:
        typeof doc["dualApprovalThresholdUSDMinor"] === "number"
          ? doc["dualApprovalThresholdUSDMinor"]
          : DEFAULT_PAYOUT_RULES.dualApprovalThresholdUSDMinor,
      dualApprovalThresholdNGNMinor:
        typeof doc["dualApprovalThresholdNGNMinor"] === "number"
          ? doc["dualApprovalThresholdNGNMinor"]
          : DEFAULT_PAYOUT_RULES.dualApprovalThresholdNGNMinor,
      stepUpThresholdUSDMinor:
        typeof doc["stepUpThresholdUSDMinor"] === "number"
          ? doc["stepUpThresholdUSDMinor"]
          : DEFAULT_PAYOUT_RULES.stepUpThresholdUSDMinor,
      stepUpThresholdNGNMinor:
        typeof doc["stepUpThresholdNGNMinor"] === "number"
          ? doc["stepUpThresholdNGNMinor"]
          : DEFAULT_PAYOUT_RULES.stepUpThresholdNGNMinor,
      ...(typeof doc["updatedAt"] === "string" ? { updatedAt: doc["updatedAt"] } : {}),
      ...(typeof doc["updatedBy"] === "string" ? { updatedBy: doc["updatedBy"] } : {}),
      ...(typeof doc["updateReason"] === "string" ? { updateReason: doc["updateReason"] } : {}),
    };
  } catch {
    return { ...DEFAULT_PAYOUT_RULES };
  }
}

export function getMinimumPayoutForCurrency(rules: PayoutRules, currency: string): number {
  if (currency === "USD") return rules.minimumPayoutUSDMinor;
  if (currency === "NGN") return rules.minimumPayoutNGNMinor;
  return rules.minimumPayoutUSDMinor;
}

export function isDualApprovalRequired(rules: PayoutRules, currency: string, amountMinor: number): boolean {
  if (currency === "USD") {
    return amountMinor >= rules.dualApprovalThresholdUSDMinor;
  }
  if (currency === "NGN") {
    return amountMinor >= rules.dualApprovalThresholdNGNMinor;
  }
  return amountMinor >= rules.dualApprovalThresholdUSDMinor;
}

export function isStepUpRequired(rules: PayoutRules, currency: string, amountMinor: number): boolean {
  if (currency === "USD") {
    return amountMinor >= rules.stepUpThresholdUSDMinor;
  }
  if (currency === "NGN") {
    return amountMinor >= rules.stepUpThresholdNGNMinor;
  }
  return amountMinor >= rules.stepUpThresholdUSDMinor;
}
