/**
 * Types and interfaces for the KYC Verification Provider Adapter (Batch C1)
 */

export interface DocumentCheckInput {
  documentType: string;
  countryCode: string;
  documentVaultPath?: string;
  rawDocumentData?: string;
  documentNumber?: string;
}

export interface DocumentCheckResult {
  passed: boolean;
  score: number; // 0 - 100
  documentAuthentic: boolean;
  classificationMatch: boolean;
  details?: Record<string, unknown>;
}

export interface FaceMatchInput {
  faceVaultPath?: string;
  documentPhotoVaultPath?: string;
  rawSelfieData?: string;
}

export interface FaceMatchResult {
  passed: boolean;
  score: number; // 0 - 100
  similarityPercentage: number;
  details?: Record<string, unknown>;
}

export interface LivenessInput {
  videoVaultPath?: string;
  frames?: string[];
  clientSignals?: Record<string, unknown>;
}

export interface LivenessResult {
  passed: boolean;
  score: number; // 0 - 100
  livenessConfidence: number;
  spoofRisk: "low" | "medium" | "high";
  details?: Record<string, unknown>;
}

export interface SanctionsPepInput {
  fullName: string;
  dateOfBirth?: string;
  countryCode: string;
  nationalIdNumber?: string;
}

export interface SanctionsPepResult {
  passed: boolean;
  isPep: boolean;
  isSanctioned: boolean;
  matches: Array<{ name: string; list: string; score: number }>;
  details?: Record<string, unknown>;
}

export interface KycCaseInput {
  uid: string;
  role: "producer" | "provider";
  fullName: string;
  countryCode: string;
  idNumber?: string;
  companyRegNumber?: string;
  documentVaultPaths?: Record<string, string>;
  dateOfBirth?: string;
}

export interface KycVerifierResult {
  provider: string; // "manual" or external provider name
  status: "passed" | "flagged" | "failed" | "manual_review_required";
  overallScore: number; // 0 - 100
  reasons: string[];
  checks: {
    documentCheck?: DocumentCheckResult;
    faceMatch?: FaceMatchResult;
    liveness?: LivenessResult;
    sanctionsPep?: SanctionsPepResult;
  };
  performedAt: string;
  fallbackToManual: boolean;
  fallbackReason?: string;
  manualReviewRequired: boolean;
  ownerNotice?: string;
}

/**
 * Standard interface for KYC verification providers.
 * Allows plug-and-play adapters for external services behind feature flags
 * while defaulting to manual review.
 */
export interface KycVerifier {
  readonly name: string;
  verifyDocument(input: DocumentCheckInput): Promise<DocumentCheckResult>;
  matchFace(input: FaceMatchInput): Promise<FaceMatchResult>;
  verifyLiveness(input: LivenessInput): Promise<LivenessResult>;
  screenSanctionsAndPep(input: SanctionsPepInput): Promise<SanctionsPepResult>;
  evaluateCase(caseData: KycCaseInput): Promise<KycVerifierResult>;
}
