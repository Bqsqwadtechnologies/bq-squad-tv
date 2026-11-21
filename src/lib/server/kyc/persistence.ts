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
  // Raw sensitive fields to be encrypted
  rawIdNumber?: string;
  rawTaxNumber?: string;
  rawDateOfBirth?: string;
  rawAccountNumber?: string;
  // Documents and face captures
  documentVaultPaths?: Record<string, string>;
  faceCaptureVaultPath?: string;
  riskScore?: number;
  riskFlags?: string[];
  status?: KycStatus;
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
    input.rawAccountNumber
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
    ...(maskedIdNumber ? { maskedIdNumber } : {}),
    ...(maskedTaxNumber ? { maskedTaxNumber } : {}),
    ...(maskedDateOfBirth ? { maskedDateOfBirth } : {}),
    ...(maskedAccountNumber ? { maskedAccountNumber } : {}),
    documentVaultPaths: {
      ...(existing?.documentVaultPaths || {}),
      ...(input.documentVaultPaths || {}),
    },
    ...(input.faceCaptureVaultPath ? { faceCaptureVaultPath: input.faceCaptureVaultPath } : (existing?.faceCaptureVaultPath ? { faceCaptureVaultPath: existing.faceCaptureVaultPath } : {})),
    riskScore: input.riskScore ?? existing?.riskScore ?? 0,
    riskFlags: input.riskFlags ?? existing?.riskFlags ?? [],
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
    await fs.patchDoc(`providers/${input.uid}`, {
      kycStatus: newStatus,
      kycCountry: profile.kycCountry,
      kycSubmittedAt: now,
    }).catch(() => {});
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
    status: 'approved' | 'rejected';
    reason?: string;
    notes?: string;
  }
): Promise<KycProfile> {
  const existing = await getKycProfile(fs, input.uid);
  if (!existing) {
    throw new ApiError(404, 'KYC_PROFILE_NOT_FOUND', 'KYC profile does not exist.');
  }

  if (input.status === 'rejected' && (!input.reason || input.reason.trim().length < 3)) {
    throw new ApiError(400, 'REJECTION_REASON_REQUIRED', 'A rejection reason of at least 3 characters is required.');
  }

  const now = new Date().toISOString();
  const currentVersion = existing.kycVersion + 1;

  const historyEntry: KycHistoryEntry = {
    version: currentVersion,
    status: input.status,
    timestamp: now,
    reviewerUid: input.reviewerUid,
    rejectionReason: input.reason?.trim(),
    notes: input.notes?.trim(),
  };

  const updatedProfile: KycProfile = {
    ...existing,
    kycStatus: input.status,
    kycVersion: currentVersion,
    kycReviewedAt: now,
    kycReviewedBy: input.reviewerUid,
    kycRejectionReason: input.status === 'rejected' ? input.reason?.trim() : undefined,
    kycHistory: [...existing.kycHistory, historyEntry],
  };

  await fs.setDoc(`kycProfiles/${input.uid}`, updatedProfile as any);

  // Synchronize status
  if (existing.role === 'producer') {
    await fs.patchDoc(`producers/${input.uid}`, {
      kycStatus: input.status,
      verificationStatus: input.status === 'approved' ? 'APPROVED' : 'REJECTED',
      verificationReviewedAt: now,
      verificationReviewedBy: input.reviewerUid,
      verificationReviewReason: input.reason?.trim() ?? null,
    }).catch(() => {});
  } else if (existing.role === 'provider') {
    await fs.patchDoc(`providers/${input.uid}`, {
      kycStatus: input.status,
      status: input.status === 'approved' ? 'active' : 'rejected',
    }).catch(() => {});
  }

  await fs.patchDoc(`users/${input.uid}`, {
    kycStatus: input.status,
  }).catch(() => {});

  return updatedProfile;
}
