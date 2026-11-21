/**
 * Automated KYC Risk Scoring Engine (Batch C2)
 * Evaluates risk score (0-100) based on:
 * 1. Country risk (FATF / sanction corridors)
 * 2. Cross-account duplicates (ID, phone, bank account)
 * 3. Name mismatch between KYC legal entity and bank account beneficiary
 * 4. Device and IP velocity
 * 5. Document quality and expiration flags
 * 
 * Scores >= 70 trigger "high" risk and mandate four-eyes (dual reviewer) approval.
 */

export interface KycRiskEvaluationInput {
  applicantUid: string;
  country: string;
  applicantName: string;
  payoutAccountName?: string;
  duplicateIdFound?: boolean;
  duplicatePhoneFound?: boolean;
  duplicateBankFound?: boolean;
  duplicateFaceFound?: boolean;
  highVelocityCount?: number; // Count of recent submissions with same IP/device
  documentQualityScore?: number; // 0-100, where < 50 is poor
  isDocumentExpired?: boolean;
}

export interface RiskFactor {
  code: string;
  scoreDelta: number;
  description: string;
}

export interface KycRiskScoreResult {
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  requiresFourEyes: boolean;
  factors: RiskFactor[];
  evaluatedAt: string;
}

// FATF high-risk jurisdictions and heavily restricted corridors
export const HIGH_RISK_COUNTRIES = new Set([
  "KP", // North Korea
  "IR", // Iran
  "MM", // Myanmar
  "SY", // Syria
  "YE", // Yemen
  "AF", // Afghanistan
  "CU", // Cuba
  "SS", // South Sudan
]);

// Increased monitoring jurisdictions
export const MEDIUM_RISK_COUNTRIES = new Set([
  "CD", // Congo DR
  "ML", // Mali
  "MZ", // Mozambique
  "HT", // Haiti
]);

/**
 * Normalized token overlap similarity between two legal names.
 * Returns 0 (complete match) to 1.0 (complete mismatch).
 */
export function calculateNameMismatchRatio(name1: string, name2: string): number {
  if (!name1 || !name2) return 0;
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  const tokens1 = clean(name1);
  const tokens2 = clean(name2);

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  let matches = 0;
  for (const t1 of tokens1) {
    if (tokens2.some((t2) => t2 === t1 || t1.includes(t2) || t2.includes(t1))) {
      matches++;
    }
  }

  const matchRatio = (2 * matches) / (tokens1.length + tokens2.length);
  return Math.max(0, Math.min(1, 1 - matchRatio));
}

/**
 * Calculates KYC risk score and four-eyes requirement.
 */
export function calculateKycRiskScore(input: KycRiskEvaluationInput): KycRiskScoreResult {
  const factors: RiskFactor[] = [];
  let score = 10; // Baseline low risk score for new applicants

  const upperCountry = (input.country || "").toUpperCase().trim();

  // 1. Country Risk
  if (HIGH_RISK_COUNTRIES.has(upperCountry)) {
    factors.push({
      code: "COUNTRY_FATF_HIGH_RISK",
      scoreDelta: 40,
      description: `Applicant country (${upperCountry}) is designated FATF high-risk or sanctioned corridor.`,
    });
    score += 40;
  } else if (MEDIUM_RISK_COUNTRIES.has(upperCountry)) {
    factors.push({
      code: "COUNTRY_MONITORING_LIST",
      scoreDelta: 20,
      description: `Applicant country (${upperCountry}) is on increased compliance monitoring.`,
    });
    score += 20;
  }

  // 2. Duplicates across accounts
  if (input.duplicateIdFound) {
    factors.push({
      code: "DUPLICATE_ID_NUMBER",
      scoreDelta: 30,
      description: "Identification number matches an existing registered user account.",
    });
    score += 30;
  }
  if (input.duplicatePhoneFound) {
    factors.push({
      code: "DUPLICATE_PHONE_NUMBER",
      scoreDelta: 20,
      description: "Phone number matches an existing user account.",
    });
    score += 20;
  }
  if (input.duplicateBankFound) {
    factors.push({
      code: "DUPLICATE_BANK_ACCOUNT",
      scoreDelta: 25,
      description: "Settlement bank account matches an existing registered account.",
    });
    score += 25;
  }
  if (input.duplicateFaceFound) {
    factors.push({
      code: "DUPLICATE_FACIAL_MATCH",
      scoreDelta: 35,
      description: "Biometric face capture matches another registered account with high confidence.",
    });
    score += 35;
  }

  // 3. Name Mismatch
  if (input.payoutAccountName && input.applicantName) {
    const mismatch = calculateNameMismatchRatio(input.applicantName, input.payoutAccountName);
    if (mismatch >= 0.5) {
      factors.push({
        code: "BENEFICIARY_NAME_MISMATCH",
        scoreDelta: 25,
        description: `Beneficiary bank account name '${input.payoutAccountName}' diverges from KYC applicant name '${input.applicantName}'.`,
      });
      score += 25;
    }
  }

  // 4. IP / Device Velocity
  if (typeof input.highVelocityCount === "number" && input.highVelocityCount > 2) {
    const delta = Math.min(30, (input.highVelocityCount - 2) * 10);
    factors.push({
      code: "HIGH_VELOCITY_SUBMISSIONS",
      scoreDelta: delta,
      description: `${input.highVelocityCount} recent verification submissions from same IP or device identifier.`,
    });
    score += delta;
  }

  // 5. Document Quality and Expiration
  if (input.isDocumentExpired) {
    factors.push({
      code: "EXPIRED_DOCUMENT",
      scoreDelta: 20,
      description: "Identification document provided has passed its expiration date.",
    });
    score += 20;
  }
  if (typeof input.documentQualityScore === "number" && input.documentQualityScore < 50) {
    factors.push({
      code: "LOW_DOCUMENT_QUALITY",
      scoreDelta: 15,
      description: `Document capture quality (${input.documentQualityScore}/100) is below clarity standards.`,
    });
    score += 15;
  }

  const finalScore = Math.min(100, Math.max(0, score));
  const riskLevel: "low" | "medium" | "high" =
    finalScore >= 70 ? "high" : finalScore >= 40 ? "medium" : "low";

  const requiresFourEyes = riskLevel === "high";

  return {
    riskScore: finalScore,
    riskLevel,
    requiresFourEyes,
    factors,
    evaluatedAt: new Date().toISOString(),
  };
}
