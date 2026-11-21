import { computeNextReverificationDate } from "@/lib/server/kyc/lifecycle";
import { KycConsentRecord } from "@/lib/server/kyc/types";
import type { KycVerifierResult } from "./verifier/types";
import { Firestore, ApiError } from '../firebase-admin';
import {
  type KycProfile,
  type KycStatus,
  type KycType,
  type KycHistoryEntry,
  encryptSensitiveField,
  decryptSensitiveField,
  maskIdNumber,
  maskTaxNumber,
  maskDateOfBirth,
  maskAccountNumber,
} from './types';

export interface SaveKycInput {
  uid: string;
  role: 'producer' | 'provider';
  kycType: KycType;
  kycCountry: string;
  legalName?: string;
  businessName?: string;
  officialEmail?: string;
  officialEmailVerified?: boolean;
  phone?: string;
  phoneVerified?: boolean;
  idTypeId?: string;
  companyRegNumber?: string;
  directorName?: string;
  representative?: {
    fullName: string;
    title: string;
    idTypeId: string;
    idNumberMasked?: string;
  };
  residentialAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  businessAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  // Raw sensitive fields to be encrypted
  rawIdNumber?: string;
  rawTaxNumber?: string;
  rawDateOfBirth?: string;
  rawAccountNumber?: string;
  rawRepresentativeIdNumber?: string;
  // Documents and face captures
  documentVaultPaths?: Record<string, string>;
  faceCaptureVaultPath?: string;
  riskScore?: number;
  riskLevel?: "low" | "medium" | "high";
  requiresFourEyes?: boolean;
  riskFactors?: string[];
  riskFlags?: string[];
  verifierResult?: KycVerifierResult;
  payoutTier?: 0 | 1 | 2;
  consentLog?: KycConsentRecord[];
  status?: KycStatus;
  providerId?: string;
}

export async function getKycProfile(
  fs: Firestore,
  uid: string,
  options?: { decryptSensitive?: boolean }
): Promise<KycProfile | null> {
  const doc = await fs.getDoc(`kycProfiles/${uid}`);
  if (!doc) {
    return null;
  }

  const profile = doc as unknown as KycProfile;

  if (options?.decryptSensitive) {
    // Decrypt if encryption key is present and fields exist
    try {
      if (profile.encryptedIdNumber) {
        (profile as any).decryptedIdNumber = decryptSensitiveField(profile.encryptedIdNumber);
      }
      if (profile.encryptedTaxNumber) {
        (profile as any).decryptedTaxNumber = decryptSensitiveField(profile.encryptedTaxNumber);
      }
      if (profile.encryptedDateOfBirth) {
        (profile as any).decryptedDateOfBirth = decryptSensitiveField(profile.encryptedDateOfBirth);
      }
      if (profile.encryptedAccountNumber) {
        (profile as any).decryptedAccountNumber = decryptSensitiveField(profile.encryptedAccountNumber);
      }
      if (profile.encryptedRepresentativeIdNumber) {
        (profile as any).decryptedRepresentativeIdNumber = decryptSensitiveField(profile.encryptedRepresentativeIdNumber);
      }
    } catch (err) {
      // If decryption fails (e.g. key rotated or missing), keep masked fields and log
      console.warn(`[KYC] Decryption failed for uid ${uid}:`, err);
    }
  }

  return profile;
}

export async function saveKycProfile(
  fs: Firestore,
  input: SaveKycInput
): Promise<KycProfile> {
  if (!input.uid || !/^[A-Za-z0-9_-]{1,128}$/.test(input.uid)) {
    throw new ApiError(400, 'INVALID_UID', 'Invalid user identifier for KYC profile.');
  }

  const now = new Date().toISOString();
  const existing = await getKycProfile(fs, input.uid);

  const currentVersion = (existing?.kycVersion || 0) + 1;
  const newStatus: KycStatus = input.status || (existing?.kycStatus === 'approved' ? 'approved' : 'pending');

  const historyEntry: KycHistoryEntry = {
    version: currentVersion,
    status: newStatus,
    timestamp: now,
    notes: existing ? 'KYC application updated/resubmitted' : 'Initial KYC submission',
  };

  const updatedHistory: KycHistoryEntry[] = [...(existing?.kycHistory || []), historyEntry];

  // Handle sensitive encryption & masking
  const hasRawSensitive = Boolean(
    input.rawIdNumber ||
    input.rawTaxNumber ||
    input.rawDateOfBirth ||
    input.rawAccountNumber ||
    input.rawRepresentativeIdNumber
  );

  const encKey = process.env['KYC_FIELD_ENCRYPTION_KEY'];
  if (hasRawSensitive && (!encKey || Buffer.byteLength(encKey, 'utf8') < 32)) {
    throw new ApiError(500, 'SECURITY_CONFIG_ERROR', 'KYC field encryption key is required to persist sensitive records.');
  }

  const encryptedIdNumber = input.rawIdNumber
    ? encryptSensitiveField(input.rawIdNumber)
    : existing?.encryptedIdNumber;

  const encryptedTaxNumber = input.rawTaxNumber
    ? encryptSensitiveField(input.rawTaxNumber)
    : existing?.encryptedTaxNumber;

  const encryptedDateOfBirth = input.rawDateOfBirth
    ? encryptSensitiveField(input.rawDateOfBirth)
    : existing?.encryptedDateOfBirth;

  const encryptedAccountNumber = input.rawAccountNumber
    ? encryptSensitiveField(input.rawAccountNumber)
    : existing?.encryptedAccountNumber;

  const encryptedRepresentativeIdNumber = input.rawRepresentativeIdNumber
    ? encryptSensitiveField(input.rawRepresentativeIdNumber)
    : existing?.encryptedRepresentativeIdNumber;

  const maskedIdNumber = input.rawIdNumber
    ? maskIdNumber(input.rawIdNumber)
    : existing?.maskedIdNumber;

  const maskedTaxNumber = input.rawTaxNumber
    ? maskTaxNumber(input.rawTaxNumber)
    : existing?.maskedTaxNumber;

  const maskedDateOfBirth = input.rawDateOfBirth
    ? maskDateOfBirth(input.rawDateOfBirth)
    : existing?.maskedDateOfBirth;

  const maskedAccountNumber = input.rawAccountNumber
    ? maskAccountNumber(input.rawAccountNumber)
    : existing?.maskedAccountNumber;

  const maskedRepresentativeIdNumber = input.rawRepresentativeIdNumber
    ? maskIdNumber(input.rawRepresentativeIdNumber)
    : existing?.maskedRepresentativeIdNumber;

  const profile: KycProfile = {
    uid: input.uid,
    role: input.role,
    kycStatus: newStatus,
    kycType: input.kycType,
    kycCountry: input.kycCountry.toUpperCase().trim(),
    kycVersion: currentVersion,
    kycSubmittedAt: now,
    kycHistory: updatedHistory,
    ...(encryptedIdNumber ? { encryptedIdNumber } : {}),
    ...(encryptedTaxNumber ? { encryptedTaxNumber } : {}),
    ...(encryptedDateOfBirth ? { encryptedDateOfBirth } : {}),
    ...(encryptedAccountNumber ? { encryptedAccountNumber } : {}),
    ...(encryptedRepresentativeIdNumber ? { encryptedRepresentativeIdNumber } : {}),
    ...(maskedIdNumber ? { maskedIdNumber } : {}),
    ...(maskedTaxNumber ? { maskedTaxNumber } : {}),
    ...(maskedDateOfBirth ? { maskedDateOfBirth } : {}),
    ...(maskedAccountNumber ? { maskedAccountNumber } : {}),
    ...(maskedRepresentativeIdNumber ? { maskedRepresentativeIdNumber } : {}),
    documentVaultPaths: {
      ...(existing?.documentVaultPaths || {}),
      ...(input.documentVaultPaths || {}),
    },
    ...(input.faceCaptureVaultPath ? { faceCaptureVaultPath: input.faceCaptureVaultPath } : (existing?.faceCaptureVaultPath ? { faceCaptureVaultPath: existing.faceCaptureVaultPath } : {})),
    riskScore: input.riskScore ?? existing?.riskScore ?? 0,
    riskLevel: input.riskLevel ?? existing?.riskLevel ?? "low",
    requiresFourEyes: input.requiresFourEyes ?? existing?.requiresFourEyes ?? false,
    riskFactors: input.riskFactors ?? existing?.riskFactors ?? [],
    riskFlags: input.riskFlags ?? existing?.riskFlags ?? [],
    payoutTier: input.payoutTier ?? existing?.payoutTier ?? (existing?.kycStatus === "approved" ? 1 : 0),
    ...(input.verifierResult ? { verifierResult: input.verifierResult } : (existing?.verifierResult ? { verifierResult: existing.verifierResult } : {})),
    ...(input.legalName ? { legalName: input.legalName } : existing?.legalName ? { legalName: existing.legalName } : {}),
    ...(input.businessName ? { businessName: input.businessName } : existing?.businessName ? { businessName: existing.businessName } : {}),
    ...(input.officialEmail ? { officialEmail: input.officialEmail } : existing?.officialEmail ? { officialEmail: existing.officialEmail } : {}),
    ...(typeof input.officialEmailVerified === 'boolean' ? { officialEmailVerified: input.officialEmailVerified } : typeof existing?.officialEmailVerified === 'boolean' ? { officialEmailVerified: existing.officialEmailVerified } : {}),
    ...(input.phone ? { phone: input.phone } : existing?.phone ? { phone: existing.phone } : {}),
    ...(typeof input.phoneVerified === 'boolean' ? { phoneVerified: input.phoneVerified } : typeof existing?.phoneVerified === 'boolean' ? { phoneVerified: existing.phoneVerified } : {}),
    ...(input.idTypeId ? { idTypeId: input.idTypeId } : existing?.idTypeId ? { idTypeId: existing.idTypeId } : {}),
    ...(input.companyRegNumber ? { companyRegNumber: input.companyRegNumber } : existing?.companyRegNumber ? { companyRegNumber: existing.companyRegNumber } : {}),
    ...(input.directorName ? { directorName: input.directorName } : existing?.directorName ? { directorName: existing.directorName } : {}),
    ...(input.representative ? { representative: input.representative } : existing?.representative ? { representative: existing.representative } : {}),
    ...(input.residentialAddress ? { residentialAddress: input.residentialAddress } : existing?.residentialAddress ? { residentialAddress: existing.residentialAddress } : {}),
    ...(input.businessAddress ? { businessAddress: input.businessAddress } : existing?.businessAddress ? { businessAddress: existing.businessAddress } : {}),
    consentLog: input.consentLog ?? existing?.consentLog ?? [
      {
        consentType: "data_protection_policy",
        noticeVersion: "2026-v1.0",
        noticeUrl: "/help/data-protection",
        acceptedAt: now,
      },
      {
        consentType: "id_document_processing",
        noticeVersion: "2026-v1.0",
        noticeUrl: "/help/data-protection#retention",
        acceptedAt: now,
      },
      {
        consentType: "face_biometric",
        noticeVersion: "2026-v1.0",
        noticeUrl: "/help/data-protection#biometrics",
        acceptedAt: now,
      },
    ],
    nextReverificationDueAt: existing?.nextReverificationDueAt || computeNextReverificationDate(input.riskLevel || existing?.riskLevel || "low"),
  };

  await fs.setDoc(`kycProfiles/${input.uid}`, profile as any);

  // Synchronize status to producer or provider doc
  if (input.role === 'producer') {
    await fs.patchDoc(`producers/${input.uid}`, {
      kycStatus: newStatus,
      kycCountry: profile.kycCountry,
      kycSubmittedAt: now,
      verificationStatus: newStatus === 'approved' ? 'APPROVED' : newStatus === 'rejected' ? 'REJECTED' : 'PENDING',
    }).catch(() => {});
  } else if (input.role === 'provider') {
    const providerTargets = [input.uid];
    if (input.providerId && input.providerId !== input.uid) {
      providerTargets.push(input.providerId);
    }
    for (const pTarget of providerTargets) {
      await fs.patchDoc(`providers/${pTarget}`, {
        kycStatus: newStatus,
        kycCountry: profile.kycCountry,
        kycSubmittedAt: now,
        status: newStatus === 'approved' ? 'active' : newStatus === 'rejected' ? 'rejected' : 'pending_approval',
      }).catch(() => {});
    }
  }

  // Also sync to user doc
  await fs.patchDoc(`users/${input.uid}`, {
    kycStatus: newStatus,
    kycCountry: profile.kycCountry,
  }).catch(() => {});

  return profile;
}

export async function reviewKycProfile(
  fs: Firestore,
  input: {
    uid: string;
    reviewerUid: string;
    status: "approved" | "rejected";
    reason?: string;
    notes?: string;
  }
): Promise<KycProfile> {
  if (input.status === "rejected" && (!input.reason || input.reason.trim().length < 3)) {
    throw new ApiError(400, "REJECTION_REASON_REQUIRED", "A rejection reason of at least 3 characters is required.");
  }
  const profile = await getKycProfile(fs, input.uid);
  if (!profile) {
    throw new ApiError(404, 'PROFILE_NOT_FOUND', 'KYC profile not found for review.');
  }

  const now = new Date().toISOString();
  const nextVersion = profile.kycVersion + 1;

  const entry: KycHistoryEntry = {
    version: nextVersion,
    status: input.status,
    timestamp: now,
    reviewerUid: input.reviewerUid,
    ...(input.reason !== undefined ? { rejectionReason: input.reason } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };

  const updatedTier = input.status === "approved" ? (profile.payoutTier === 2 ? 2 : 1) : 0;
  const updated: KycProfile = {
    ...profile,
    kycStatus: input.status,
    payoutTier: updatedTier,
    kycVersion: nextVersion,
    kycReviewedAt: now,
    kycReviewedBy: input.reviewerUid,
    kycHistory: [...(Array.isArray(profile.kycHistory) ? profile.kycHistory : []), entry],
  };

  if (input.status === "rejected" && input.reason !== undefined) {
    updated.kycRejectionReason = input.reason;
    updated.rejectionReason = input.reason;
  } else {
    delete updated.kycRejectionReason;
    delete updated.rejectionReason;
  }

  await fs.setDoc(`kycProfiles/${input.uid}`, updated as any);

  // Sync to role collection
  if (profile.role === 'producer') {
    await fs.patchDoc(`producers/${input.uid}`, {
      kycStatus: input.status,
      payoutTier: updatedTier,
      verificationStatus: input.status === 'approved' ? 'APPROVED' : 'REJECTED',
      reviewedAt: now,
      rejectionReason: input.status === 'rejected' ? input.reason : null,
    }).catch(() => {});
  } else if (profile.role === 'provider') {
    await fs.patchDoc(`providers/${input.uid}`, {
      kycStatus: input.status,
      payoutTier: updatedTier,
      status: input.status === 'approved' ? 'active' : 'rejected',
      reviewedAt: now,
      rejectionReason: input.status === 'rejected' ? input.reason : null,
    }).catch(() => {});
  }

  await fs.patchDoc(`users/${input.uid}`, {
    kycStatus: input.status,
  }).catch(() => {});

  return updated;
}

export async function saveKycDraft(
  fs: Firestore,
  uid: string,
  draft: Record<string, unknown>
): Promise<void> {
  if (!uid || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    throw new ApiError(400, 'INVALID_UID', 'Invalid user identifier for KYC draft.');
  }
  await fs.setDoc(`kycDrafts/${uid}`, {
    uid,
    draft,
    updatedAt: new Date().toISOString(),
  });
}

export async function getKycDraft(
  fs: Firestore,
  uid: string
): Promise<Record<string, unknown> | null> {
  if (!uid || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    throw new ApiError(400, 'INVALID_UID', 'Invalid user identifier for KYC draft.');
  }
  const doc = await fs.getDoc(`kycDrafts/${uid}`);
  if (!doc) return null;
  return (doc['draft'] as Record<string, unknown>) || null;
}

export async function deleteKycDraft(
  fs: Firestore,
  uid: string
): Promise<void> {
  if (!uid || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    throw new ApiError(400, 'INVALID_UID', 'Invalid user identifier for KYC draft.');
  }
  await fs.deleteDoc(`kycDrafts/${uid}`).catch(() => {});
}
