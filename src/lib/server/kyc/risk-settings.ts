import { Firestore, ApiError } from "@/lib/server/firebase-admin";
import { writeAuditLog } from "@/lib/server/audit";

export interface KycRiskSettings {
  tier1CumulativeLimitUsdMinor: number; // e.g. 1000000 ($10,000 in cents)
  tier1CumulativeLimitNgnMinor: number; // e.g. 1500000000 (₦15,000,000 in kobo)
  highRiskThresholdScore: number;       // default 70
  fourEyesRequiredForHighRisk: boolean; // default true
  updatedAt: string;
  updatedByUid?: string;
  updatedByEmail?: string;
  reason?: string;
}

export const DEFAULT_KYC_RISK_SETTINGS: KycRiskSettings = {
  tier1CumulativeLimitUsdMinor: 10_000 * 100,        // $10,000
  tier1CumulativeLimitNgnMinor: 15_000_000 * 100,   // ₦15,000,000
  highRiskThresholdScore: 70,
  fourEyesRequiredForHighRisk: true,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const RISK_SETTINGS_PATH = "payout_rules/risk_settings";

/**
 * Loads KYC risk and payout tier settings from Firestore, returning safe defaults.
 */
export async function getKycRiskSettings(fs: Firestore): Promise<KycRiskSettings> {
  const doc = await fs.getDoc(RISK_SETTINGS_PATH).catch(() => null);
  if (!doc) {
    return { ...DEFAULT_KYC_RISK_SETTINGS };
  }

  return {
    tier1CumulativeLimitUsdMinor:
      typeof doc["tier1CumulativeLimitUsdMinor"] === "number" &&
      doc["tier1CumulativeLimitUsdMinor"] > 0
        ? doc["tier1CumulativeLimitUsdMinor"]
        : DEFAULT_KYC_RISK_SETTINGS.tier1CumulativeLimitUsdMinor,
    tier1CumulativeLimitNgnMinor:
      typeof doc["tier1CumulativeLimitNgnMinor"] === "number" &&
      doc["tier1CumulativeLimitNgnMinor"] > 0
        ? doc["tier1CumulativeLimitNgnMinor"]
        : DEFAULT_KYC_RISK_SETTINGS.tier1CumulativeLimitNgnMinor,
    highRiskThresholdScore:
      typeof doc["highRiskThresholdScore"] === "number" &&
      doc["highRiskThresholdScore"] >= 1 &&
      doc["highRiskThresholdScore"] <= 100
        ? doc["highRiskThresholdScore"]
        : DEFAULT_KYC_RISK_SETTINGS.highRiskThresholdScore,
    fourEyesRequiredForHighRisk:
      typeof doc["fourEyesRequiredForHighRisk"] === "boolean"
        ? doc["fourEyesRequiredForHighRisk"]
        : DEFAULT_KYC_RISK_SETTINGS.fourEyesRequiredForHighRisk,
    updatedAt: typeof doc["updatedAt"] === "string" ? doc["updatedAt"] : DEFAULT_KYC_RISK_SETTINGS.updatedAt,
    ...(typeof doc["updatedByUid"] === "string" ? { updatedByUid: doc["updatedByUid"] } : {}),
    ...(typeof doc["updatedByEmail"] === "string" ? { updatedByEmail: doc["updatedByEmail"] } : {}),
    ...(typeof doc["reason"] === "string" ? { reason: doc["reason"] } : {}),
  };
}

/**
 * Updates KYC risk and payout tier settings with mandatory owner reason and audit logging.
 */
export async function updateKycRiskSettings(
  fs: Firestore,
  updates: Partial<KycRiskSettings>,
  reviewer: { uid: string; email?: string },
  reason: string,
): Promise<KycRiskSettings> {
  if (!reason || reason.trim().length < 3) {
    throw new ApiError(
      400,
      "REASON_REQUIRED",
      "A meaningful reason of at least 3 characters is required to update risk and tier settings.",
    );
  }

  const current = await getKycRiskSettings(fs);
  const now = new Date().toISOString();

  const next: KycRiskSettings = {
    ...current,
    ...(typeof updates.tier1CumulativeLimitUsdMinor === "number" && updates.tier1CumulativeLimitUsdMinor > 0
      ? { tier1CumulativeLimitUsdMinor: Math.floor(updates.tier1CumulativeLimitUsdMinor) }
      : {}),
    ...(typeof updates.tier1CumulativeLimitNgnMinor === "number" && updates.tier1CumulativeLimitNgnMinor > 0
      ? { tier1CumulativeLimitNgnMinor: Math.floor(updates.tier1CumulativeLimitNgnMinor) }
      : {}),
    ...(typeof updates.highRiskThresholdScore === "number" &&
    updates.highRiskThresholdScore >= 1 &&
    updates.highRiskThresholdScore <= 100
      ? { highRiskThresholdScore: updates.highRiskThresholdScore }
      : {}),
    ...(typeof updates.fourEyesRequiredForHighRisk === "boolean"
      ? { fourEyesRequiredForHighRisk: updates.fourEyesRequiredForHighRisk }
      : {}),
    updatedAt: now,
    updatedByUid: reviewer.uid,
    updatedByEmail: reviewer.email || "",
    reason: reason.trim(),
  };

  await fs.setDoc(RISK_SETTINGS_PATH, next as any);

  // Write audit log with reason
  await writeAuditLog(fs, {
    action: "kyc.risk_settings.updated",
    actorUid: reviewer.uid,
    targetType: "payout_rules",
    targetId: "risk_settings",
    reason: reason.trim(),
    metadata: {
      actorEmail: reviewer.email || "",
      before: current,
      after: next,
    },
  });

  return next;
}
