import * as crypto from 'node:crypto';

export type KycStatus = 'unsubmitted' | 'pending' | 'approved' | 'rejected';

export type KycType = 'producer_personal' | 'producer_business' | 'provider_corporate';

export interface KycHistoryEntry {
  version: number;
  status: KycStatus;
  timestamp: string;
  reviewerUid?: string;
  rejectionReason?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface EncryptedField {
  ciphertext: string;
  iv: string;
  tag: string;
  algorithm: 'aes-256-gcm';
  keyVersion: number;
}

export interface KycProfile {
  uid: string;
  role: 'producer' | 'provider';
  kycStatus: KycStatus;
  kycType: KycType;
  kycCountry: string; // ISO 3166-1 alpha-2 code
  kycVersion: number;
  kycSubmittedAt?: string;
  kycReviewedAt?: string;
  kycReviewedBy?: string;
  kycRejectionReason?: string;
  kycHistory: KycHistoryEntry[];

  // Sensitive encrypted fields
  encryptedIdNumber?: EncryptedField;
  encryptedTaxNumber?: EncryptedField;
  encryptedDateOfBirth?: EncryptedField;
  encryptedAccountNumber?: EncryptedField;

  // Masked values for list display
  maskedIdNumber?: string;
  maskedTaxNumber?: string;
  maskedAccountNumber?: string;
  maskedDateOfBirth?: string;

  // Entity and contact metadata
  legalName?: string;
  businessName?: string;
  phone?: string;
  phoneVerified?: boolean;
  idTypeId?: string;
  companyRegNumber?: string;
  directorName?: string;
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

  // Documents
  documentVaultPaths?: Record<string, string>;
  faceCaptureVaultPath?: string;
  riskScore?: number;
  riskFlags?: string[];
}

/**
 * Masking utilities for safe list views
 */
export function maskIdNumber(id: string): string {
  if (!id) return '';
  const clean = id.trim();
  if (clean.length <= 4) return '***';
  return '*'.repeat(clean.length - 4) + clean.slice(-4);
}

export function maskAccountNumber(acc: string): string {
  if (!acc) return '';
  const clean = acc.trim();
  if (clean.length <= 4) return '****';
  return '*'.repeat(clean.length - 4) + clean.slice(-4);
}

export function maskTaxNumber(tax: string): string {
  if (!tax) return '';
  const clean = tax.trim();
  if (clean.length <= 4) return '****';
  return '*'.repeat(clean.length - 4) + clean.slice(-4);
}

export function maskDateOfBirth(dob: string): string {
  if (!dob) return '';
  // Format YYYY-MM-DD -> ****-**-DD
  const parts = dob.split('-');
  if (parts.length === 3) {
    return `****-**-${parts[2]}`;
  }
  return '****-**-**';
}

/**
 * Decode a server-only, base64-encoded 32-byte AES key.
 * Fail closed: there is intentionally no development or production fallback.
 */
function getEncryptionKey(): Buffer {
  const encodedKey = process.env['KYC_FIELD_ENCRYPTION_KEY'];
  if (!encodedKey) {
    throw new Error('KYC_FIELD_ENCRYPTION_KEY is required before sensitive KYC fields can be encrypted.');
  }

  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== encodedKey.replace(/=+$/, '')) {
    throw new Error('KYC_FIELD_ENCRYPTION_KEY must be a valid base64-encoded 32-byte key.');
  }
  return key;
}

export function encryptSensitiveField(plaintext: string): EncryptedField {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return {
    ciphertext,
    iv: iv.toString('hex'),
    tag,
    algorithm: 'aes-256-gcm',
    keyVersion: 1,
  };
}

export function decryptSensitiveField(field: EncryptedField): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(field.iv, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(Buffer.from(field.tag, 'hex'));

  let decrypted = decipher.update(field.ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
