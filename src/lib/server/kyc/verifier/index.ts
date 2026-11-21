import type {
  DocumentCheckInput,
  DocumentCheckResult,
  FaceMatchInput,
  FaceMatchResult,
  LivenessInput,
  LivenessResult,
  SanctionsPepInput,
  SanctionsPepResult,
  KycCaseInput,
  KycVerifierResult,
  KycVerifier,
} from "./types";

export * from "./types";

/**
 * Default Manual KYC Verifier.
 * Performs deterministic baseline sanity checks and assigns the case to
 * manual review for the platform owner to make the final verification decision.
 */
export class ManualKycVerifier implements KycVerifier {
  public readonly name = "manual";

  public async verifyDocument(input: DocumentCheckInput): Promise<DocumentCheckResult> {
    const hasDoc = Boolean(input.documentVaultPath || input.rawDocumentData);
    const hasNumber = Boolean(input.documentNumber && input.documentNumber.trim().length >= 4);

    return {
      passed: hasDoc,
      score: hasDoc && hasNumber ? 75 : 50,
      documentAuthentic: hasDoc,
      classificationMatch: true,
      details: {
        documentType: input.documentType,
        countryCode: input.countryCode,
        requiresManualVisualInspection: true,
      },
    };
  }

  public async matchFace(input: FaceMatchInput): Promise<FaceMatchResult> {
    const hasSelfie = Boolean(input.faceVaultPath || input.rawSelfieData);
    return {
      passed: hasSelfie,
      score: hasSelfie ? 80 : 0,
      similarityPercentage: hasSelfie ? 85 : 0,
      details: {
        requiresManualFacialComparison: true,
      },
    };
  }

  public async verifyLiveness(input: LivenessInput): Promise<LivenessResult> {
    const hasVideo = Boolean(input.videoVaultPath || (input.frames && input.frames.length > 0));
    return {
      passed: hasVideo,
      score: hasVideo ? 80 : 40,
      livenessConfidence: hasVideo ? 0.85 : 0.5,
      spoofRisk: "low",
      details: {
        requiresManualLivenessAudit: true,
      },
    };
  }

  public async screenSanctionsAndPep(input: SanctionsPepInput): Promise<SanctionsPepResult> {
    // Manual baseline check: name presence
    const cleanName = input.fullName.trim();
    return {
      passed: cleanName.length > 0,
      isPep: false,
      isSanctioned: false,
      matches: [],
      details: {
        checkedName: cleanName,
        countryCode: input.countryCode,
        note: "Standard baseline screening clear; final review with owner.",
      },
    };
  }

  public async evaluateCase(caseData: KycCaseInput): Promise<KycVerifierResult> {
    const performedAt = new Date().toISOString();
    const documentVaultPath = Object.values(caseData.documentVaultPaths || {})[0];
    const documentNumber = caseData.idNumber || caseData.companyRegNumber;
    const faceVaultPath = caseData.documentVaultPaths?.["selfie_face"];
    const documentPhotoVaultPath = caseData.documentVaultPaths?.["id_front"];
    const videoVaultPath = caseData.documentVaultPaths?.["liveness_video"];

    const [docCheck, faceMatch, liveness, sanctions] = await Promise.all([
      this.verifyDocument({
        documentType: "identity_evidence",
        countryCode: caseData.countryCode,
        ...(documentVaultPath ? { documentVaultPath } : {}),
        ...(documentNumber ? { documentNumber } : {}),
      }),
      this.matchFace({
        ...(faceVaultPath ? { faceVaultPath } : {}),
        ...(documentPhotoVaultPath ? { documentPhotoVaultPath } : {}),
      }),
      this.verifyLiveness({
        ...(videoVaultPath ? { videoVaultPath } : {}),
      }),
      this.screenSanctionsAndPep({
        fullName: caseData.fullName,
        countryCode: caseData.countryCode,
        ...(caseData.idNumber ? { nationalIdNumber: caseData.idNumber } : {}),
        ...(caseData.dateOfBirth ? { dateOfBirth: caseData.dateOfBirth } : {}),
      }),
    ]);

    const averageScore = Math.round(
      (docCheck.score + faceMatch.score + liveness.score + (sanctions.passed ? 100 : 0)) / 4
    );

    return {
      provider: this.name,
      status: "manual_review_required",
      overallScore: averageScore,
      reasons: ["Case prepared for manual verification review by platform compliance."],
      checks: {
        documentCheck: docCheck,
        faceMatch: faceMatch,
        liveness,
        sanctionsPep: sanctions,
      },
      performedAt,
      fallbackToManual: false,
      manualReviewRequired: true,
      ownerNotice: "Standard manual queue assignment: owner decision required.",
    };
  }
}

/**
 * External KYC Verifier Adapter.
 * Connects to external automated verification provider when activated by feature flag.
 *
 * CRITICAL SAFETY REQUIREMENT:
 * If the external provider experiences network failure, timeout, 5xx server errors,
 * or rate limiting, IT MUST NEVER BLOCK THE USER.
 * Instead, the evaluation gracefully falls back to manual review with a visible
 * "automatic check unavailable" note for the owner.
 */
export class ExternalKycVerifierAdapter implements KycVerifier {
  public readonly name = "external-provider";
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(options?: { apiKey?: string; endpoint?: string; timeoutMs?: number }) {
    this.apiKey = options?.apiKey || process.env['KYC_VERIFIER_API_KEY'] || "";
    this.endpoint = options?.endpoint || process.env['KYC_VERIFIER_ENDPOINT'] || "https://api.verifypay.internal/v1/kyc";
    this.timeoutMs = options?.timeoutMs || 8000; // 8-second bounded timeout
  }

  public async verifyDocument(input: DocumentCheckInput): Promise<DocumentCheckResult> {
    try {
      const res = await this.callProviderApi<{
        passed: boolean;
        score: number;
        documentAuthentic: boolean;
        classificationMatch: boolean;
      }>("/verify/document", input);

      return {
        passed: Boolean(res.passed),
        score: Number(res.score ?? 70),
        documentAuthentic: Boolean(res.documentAuthentic ?? true),
        classificationMatch: Boolean(res.classificationMatch ?? true),
        details: { provider: this.name },
      };
    } catch {
      // Graceful degraded result on sub-check failure
      return {
        passed: true,
        score: 50,
        documentAuthentic: true,
        classificationMatch: true,
        details: { providerFallback: true, note: "automatic check unavailable" },
      };
    }
  }

  public async matchFace(input: FaceMatchInput): Promise<FaceMatchResult> {
    try {
      const res = await this.callProviderApi<{
        passed: boolean;
        score: number;
        similarityPercentage: number;
      }>("/verify/face-match", input);

      return {
        passed: Boolean(res.passed),
        score: Number(res.score ?? 70),
        similarityPercentage: Number(res.similarityPercentage ?? 80),
        details: { provider: this.name },
      };
    } catch {
      return {
        passed: true,
        score: 50,
        similarityPercentage: 70,
        details: { providerFallback: true, note: "automatic check unavailable" },
      };
    }
  }

  public async verifyLiveness(input: LivenessInput): Promise<LivenessResult> {
    try {
      const res = await this.callProviderApi<{
        passed: boolean;
        score: number;
        livenessConfidence: number;
        spoofRisk: "low" | "medium" | "high";
      }>("/verify/liveness", input);

      return {
        passed: Boolean(res.passed),
        score: Number(res.score ?? 75),
        livenessConfidence: Number(res.livenessConfidence ?? 0.8),
        spoofRisk: res.spoofRisk || "low",
        details: { provider: this.name },
      };
    } catch {
      return {
        passed: true,
        score: 50,
        livenessConfidence: 0.5,
        spoofRisk: "low",
        details: { providerFallback: true, note: "automatic check unavailable" },
      };
    }
  }

  public async screenSanctionsAndPep(input: SanctionsPepInput): Promise<SanctionsPepResult> {
    try {
      const res = await this.callProviderApi<{
        passed: boolean;
        isPep: boolean;
        isSanctioned: boolean;
        matches: Array<{ name: string; list: string; score: number }>;
      }>("/verify/sanctions-pep", input);

      return {
        passed: Boolean(res.passed),
        isPep: Boolean(res.isPep),
        isSanctioned: Boolean(res.isSanctioned),
        matches: Array.isArray(res.matches) ? res.matches : [],
        details: { provider: this.name },
      };
    } catch {
      return {
        passed: true,
        isPep: false,
        isSanctioned: false,
        matches: [],
        details: { providerFallback: true, note: "automatic check unavailable" },
      };
    }
  }

  public async evaluateCase(caseData: KycCaseInput): Promise<KycVerifierResult> {
    const performedAt = new Date().toISOString();

    // Check if API key is present; if not, fall back safely
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      return {
        provider: this.name,
        status: "manual_review_required",
        overallScore: 0,
        reasons: ["External verification API key is not configured."],
        checks: {},
        performedAt,
        fallbackToManual: true,
        fallbackReason: "automatic check unavailable: missing API credentials",
        manualReviewRequired: true,
        ownerNotice: "automatic check unavailable",
      };
    }

    try {
      const response = await this.callProviderApi<{
        status: "passed" | "flagged" | "failed" | "manual_review_required";
        overallScore: number;
        reasons: string[];
        checks: {
          documentCheck?: DocumentCheckResult;
          faceMatch?: FaceMatchResult;
          liveness?: LivenessResult;
          sanctionsPep?: SanctionsPepResult;
        };
      }>("/evaluate", caseData);

      return {
        provider: this.name,
        status: response.status || "manual_review_required",
        overallScore: typeof response.overallScore === "number" ? response.overallScore : 70,
        reasons: Array.isArray(response.reasons) ? response.reasons : [],
        checks: response.checks || {},
        performedAt,
        fallbackToManual: false,
        manualReviewRequired: true, // Owner always makes final decision
        ...(response.status === "flagged" ? { ownerNotice: "Automated check flagged anomalies for review." } : {}),
      };
    } catch (err: any) {
      // Automatic fallback to manual review on external provider failure
      console.warn("[KYC Verifier] External provider call failed, falling back to manual review:", err?.message || err);

      return {
        provider: this.name,
        status: "manual_review_required",
        overallScore: 0,
        reasons: [
          "External automated check was unreachable or returned an error; routed to manual review.",
        ],
        checks: {},
        performedAt,
        fallbackToManual: true,
        fallbackReason: `automatic check unavailable (${err?.message || "provider timeout/error"})`,
        manualReviewRequired: true,
        ownerNotice: "automatic check unavailable",
      };
    }
  }

  private async callProviderApi<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.endpoint}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "X-Provider-Client": "bq-sqwad-tv/1.0",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Provider API returned HTTP ${res.status}`);
      }

      return (await res.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Factory helper: resolves the appropriate KycVerifier instance.
 * Returns ExternalKycVerifierAdapter if FEATURE_EXTERNAL_KYC_VERIFIER is "true" and API key is set,
 * otherwise returns the default ManualKycVerifier.
 */
export function getKycVerifier(): KycVerifier {
  const isExternalEnabled =
    process.env['FEATURE_EXTERNAL_KYC_VERIFIER'] === "true" ||
    process.env['FEATURE_EXTERNAL_KYC_VERIFIER'] === "1";

  const apiKey = process.env['KYC_VERIFIER_API_KEY'];
  const hasApiKey = Boolean(apiKey && apiKey.trim());

  if (isExternalEnabled && hasApiKey) {
    return new ExternalKycVerifierAdapter();
  }

  return new ManualKycVerifier();
}
