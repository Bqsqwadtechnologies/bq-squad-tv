export const CANNED_REJECTION_REASONS = {
  DOCUMENT_EXPIRED:
    "The submitted identity document has expired. Please upload a valid, unexpired government-issued document.",
  DOCUMENT_ILLEGIBLE_OR_GLARE:
    "The document image is blurred, cropped, or obscured by glare. Please capture all four corners clearly under good lighting.",
  NAME_MISMATCH_PAYOUT:
    "The legal name on your identity document does not match your payout account beneficiary name.",
  UNSUPPORTED_ID_TYPE:
    "The uploaded document type is not accepted for your selected jurisdiction.",
  SUSPECTED_TAMPERING_OR_ALTERATION:
    "The document appears altered or digital artifacting is detected. Original physical documents must be photographed.",
  FACE_CAPTURE_MISMATCH:
    "Facial verification does not match the portrait on the submitted identity document.",
  RESIDENTIAL_PROOF_MISSING:
    "A valid proof of address (utility bill or bank statement dated within 90 days) is required.",
  SOURCE_OF_FUNDS_REQUIRED:
    "Source of income verification is required for elevated processing tiers.",
  REGISTRATION_UNVERIFIABLE:
    "Company registration number could not be verified in national registrar records.",
  OTHER:
    "The submission does not meet compliance requirements.",
} as const;

export type CannedRejectionCode = keyof typeof CANNED_REJECTION_REASONS;

export interface ReviewerDailyCount {
  reviewerUid: string;
  reviewerEmail: string;
  date: string;
  reviewsCompleted: number;
  approvals: number;
  rejections: number;
  escalations: number;
  lastActiveAt: string;
}

export function computeSlaDueTime(hours = 24): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function isSlaBreached(slaDueAt?: string | null): boolean {
  if (!slaDueAt) return false;
  const due = new Date(slaDueAt).getTime();
  return !isNaN(due) && Date.now() > due;
}
