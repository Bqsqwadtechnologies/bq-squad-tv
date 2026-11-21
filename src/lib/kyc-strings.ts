/**
 * KYC & Identity Verification String Table and Accessibility Labels
 *
 * All labels, hints, help messages, error strings, and status texts are centralized
 * in this owner-customizable dictionary to support screen readers, RTL languages,
 * and multi-language internationalization.
 *
 * Strictly free of storage, vendor, and reviewer names.
 */

export interface KycStringDictionary {
  [key: string]: string;
}

export const DEFAULT_KYC_STRINGS: KycStringDictionary = {
  // General & Accessibility
  "kyc.header.title": "Identity Verification",
  "kyc.header.subtitle": "Securely verify your legal identity to activate creator payouts and settlement services.",
  "kyc.header.trustBadge": "Your information is encrypted and protected. We use it only to verify your identity and to pay you.",
  "kyc.header.learnMore": "Learn more about data protection",
  "kyc.aria.progressBar": "Identity verification progress tracker",
  "kyc.aria.stepActive": "Current step",
  "kyc.aria.stepCompleted": "Completed step",
  "kyc.aria.stepPending": "Pending step",

  // Steps
  "kyc.step.country": "1. Country & Entity",
  "kyc.step.phone": "2. Phone Verification",
  "kyc.step.details": "3. Applicant Details",
  "kyc.step.documents": "4. Document & Photo",
  "kyc.step.review": "5. Consent & Submit",

  // Country & Entity
  "kyc.country.selectLabel": "Country of Legal Residence or Incorporation",
  "kyc.country.help": "Select the country matching your government-issued identity document or registered business. Your payout bank account must be located in this same country.",
  "kyc.entity.individual": "Personal (Individual / Sole Trader)",
  "kyc.entity.individualDesc": "Register using your personal government-issued identification document and selfie.",
  "kyc.entity.company": "Company (Registered Entity / Corporation)",
  "kyc.entity.companyDesc": "Register with corporate registration documents, tax identifiers, and authorized representative identity.",

  // Phone OTP
  "kyc.phone.title": "Mobile Number Verification",
  "kyc.phone.help": "A one-time verification code (OTP) will be sent by SMS to confirm ownership of your primary mobile number. SMS is used strictly for this security step.",
  "kyc.phone.verified": "Mobile number successfully verified",

  // Field Help & Tooltips (Plain-language explanations of government identifiers)
  "kyc.help.nin": "Your National Identification Number (NIN) is an 11-digit number issued by NIMC in Nigeria. You can find it on your National e-ID Card, National Identity Slip (NIN Slip), or by dialing *346# from your registered SIM card.",
  "kyc.help.bvn": "Bank Verification Number (BVN) is an 11-digit identifier linked to your Nigerian commercial bank accounts. Dial *565*0# from your registered phone to retrieve your BVN.",
  "kyc.help.cac": "Corporate Affairs Commission (CAC) Registration Number is your business RC number (for Limited Liability Companies) or BN number (for Business Names), found at the top left of your CAC Certificate of Incorporation.",
  "kyc.help.ssn": "Social Security Number (SSN) is a 9-digit number formatted as XXX-XX-XXXX issued by the US Social Security Administration, found on your Social Security card.",
  "kyc.help.ein": "Employer Identification Number (EIN) is a 9-digit federal tax ID issued by the IRS to US business entities, found on official IRS correspondence such as Notice CP 575.",
  "kyc.help.nino": "National Insurance Number is a 9-character code (e.g. QQ 12 34 56 C) issued in the United Kingdom, found on your payslips, P60, or National Insurance letter from HMRC.",
  "kyc.help.crn": "Companies House Company Registration Number (CRN) is an 8-digit unique identifier found on your UK Certificate of Incorporation.",
  "kyc.help.ghanaCard": "Ghana Card PIN is the unique personal ID number formatted as GHA-XXXXXXXXX-X found on the front of your Ghana National Identity Card.",
  "kyc.help.kenyaId": "National ID Number is the 7-to-8 digit registration number printed on your Kenyan National Identity Card or Maisha Namba.",
  "kyc.help.saId": "South African ID Number is a 13-digit barcoded number indicating your birth date and citizenship status, found on your green ID book or smart ID card.",
  "kyc.help.passport": "Your official international passport number is located in the upper-right corner of your passport biographical data page.",
  "kyc.help.driversLicense": "Driver's license number is the alphanumeric state or national identifier displayed on the front of your valid driving credential.",

  // Low-Bandwidth Mode & Image Compression
  "kyc.bandwidth.lowBandwidthToggle": "Low-bandwidth mode (client-side compression)",
  "kyc.bandwidth.lowBandwidthHelp": "Compresses images directly in your browser before uploading to save mobile data and speed up transfer on slow or limited connections.",
  "kyc.bandwidth.compressing": "Compressing image for upload...",
  "kyc.bandwidth.saved": "Reduced upload size by {savings}% ({originalSize} -> {compressedSize})",

  // Camera & File Fallbacks
  "kyc.capture.cameraTitle": "Capture Document or Photo",
  "kyc.capture.cameraPermissionDenied": "Camera access was denied or is unavailable on this device. You can upload an existing clear photo or scan instead.",
  "kyc.capture.switchToFile": "Upload a photo or scanned file instead",
  "kyc.capture.switchToCamera": "Take photo using device camera",
  "kyc.capture.fileDropzone": "Drag and drop your document file here, or browse files",
  "kyc.capture.fileRequirements": "Accepted formats: JPEG, PNG, WebP, PDF. Maximum file size: 10 MB.",

  // Saved Drafts & QR Handoff
  "kyc.draft.saveDraft": "Save Draft",
  "kyc.draft.saved": "Draft saved automatically. You can safely exit and resume anytime.",
  "kyc.draft.resumeOnPhone": "Continue on Mobile Phone (QR Code)",
  "kyc.draft.qrModalTitle": "Scan with Your Mobile Phone Camera",
  "kyc.draft.qrModalHelp": "Open your mobile camera app and point it at the code below to resume this verification application on your smartphone. All saved entries and uploaded files will carry over.",
  "kyc.draft.copyLink": "Copy mobile resume link",
  "kyc.draft.copied": "Resume link copied to clipboard!",

  // Status Timeline & Dispatched Notices
  "kyc.timeline.title": "Verification Progress Timeline",
  "kyc.status.draft": "Draft in Progress",
  "kyc.status.draftDesc": "Application started. Complete all required fields and submit for review.",
  "kyc.status.submitted": "Submitted for Verification",
  "kyc.status.submittedDesc": "Your identity details and documents have been received. Notification email dispatched.",
  "kyc.status.submittedEmail": "Email sent: Application Received Confirmation",
  "kyc.status.underReview": "Under Review",
  "kyc.status.underReviewDesc": "Your application is actively undergoing standard compliance and verification checks.",
  "kyc.status.underReviewEmail": "Email sent: Review In Progress Notice",
  "kyc.status.needsChanges": "Additional Information Requested",
  "kyc.status.needsChangesDesc": "Specific corrections are required before approval. Check your email for detailed notes.",
  "kyc.status.needsChangesEmail": "Email sent: Information Update Request",
  "kyc.status.approved": "Identity Verified & Active",
  "kyc.status.approvedDesc": "Congratulations! Your identity is verified and creator payouts are enabled.",
  "kyc.status.approvedEmail": "Email sent: Verification Approved & Settlement Activated",
  "kyc.status.expired": "Re-Verification Required",
  "kyc.status.expiredDesc": "Your identity document has reached its expiration date or periodic review is due.",
  "kyc.status.expiredEmail": "Email sent: Identity Document Expiry Reminder",

  // Support Integration
  "kyc.support.button": "Ask about my verification",
  "kyc.support.modalTitle": "Verification Inquiry",
  "kyc.support.help": "Have questions about your verification status or need assistance with document requirements? Our compliance support team is here to assist.",
  "kyc.support.subject": "Subject: Verification Inquiry",
  "kyc.support.messagePlaceholder": "Describe your question or difficulty (e.g. clarification on required document type or change of address)...",
  "kyc.support.submit": "Submit Verification Inquiry",
  "kyc.support.submitting": "Submitting inquiry...",
  "kyc.support.submitted": "Your inquiry has been submitted. Our compliance team will reply directly to your registered email address.",
};

/**
 * Returns the localized or owner-customized string for a given key.
 */
export function getKycString(
  key: string,
  customStrings?: Record<string, string>,
  params?: Record<string, string | number>
): string {
  let text = customStrings?.[key] || DEFAULT_KYC_STRINGS[key] || key;
  if (params) {
    for (const [pKey, pVal] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${pKey}\\}`, "g"), String(pVal));
    }
  }
  return text;
}
