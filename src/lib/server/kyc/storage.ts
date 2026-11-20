import * as crypto from 'node:crypto';

export interface KycFileValidationResult {
  valid: boolean;
  error?: string;
  fileHash?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface KycSignedUrlPayload {
  signedUrl: string;
  expiresAt: string;
  durationSeconds: number;
  watermark: {
    overlayText: string;
    reviewerUid: string;
    timestamp: string;
    documentPath: string;
  };
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MIN_FILE_SIZE_BYTES = 10 * 1024; // 10KB minimum to prevent empty or corrupt files

/**
 * Generates an isolated private vault path for a user's verification documents.
 * Never exposes public or guessable paths.
 */
export function buildPrivateDocumentVaultPath(
  tenantId: string,
  docType: string,
  extension: string
): string {
  const safeDocType = docType.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const safeExt = extension.replace(/^\./, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const randomSuffix = crypto.randomBytes(16).toString('hex');
  return `kyc-vault/tenants/${tenantId}/${safeDocType}_${randomSuffix}.${safeExt || 'bin'}`;
}

/**
 * Validates document buffer for MIME types, size limits, and basic integrity.
 */
export function validateKycFile(
  buffer: Buffer,
  declaredMimeType: string
): KycFileValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'FILE_EMPTY' };
  }

  if (buffer.length < MIN_FILE_SIZE_BYTES) {
    return { valid: false, error: 'FILE_TOO_SMALL_OR_CORRUPT' };
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: 'FILE_EXCEEDS_MAX_SIZE' };
  }

  const mime = declaredMimeType.toLowerCase().trim();
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    return { valid: false, error: 'UNSUPPORTED_MIME_TYPE' };
  }

  // Magic bytes sanity check
  const headerHex = buffer.subarray(0, 4).toString('hex');
  if (mime === 'application/pdf' && !buffer.subarray(0, 5).toString('ascii').startsWith('%PDF-')) {
    return { valid: false, error: 'INVALID_PDF_HEADER' };
  }
  if ((mime === 'image/jpeg') && !headerHex.startsWith('ffd8')) {
    return { valid: false, error: 'INVALID_JPEG_HEADER' };
  }
  if ((mime === 'image/png') && headerHex !== '89504e47') {
    return { valid: false, error: 'INVALID_PNG_HEADER' };
  }

  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    valid: true,
    fileHash,
    mimeType: mime,
    sizeBytes: buffer.length,
  };
}

/**
 * Issues short-lived (60s) signed URL for owner or authorized reviewer.
 * Includes dynamic watermark configuration.
 */
export function generateShortLivedViewerUrl(
  privateVaultPath: string,
  reviewerUid: string,
  clientIp?: string
): KycSignedUrlPayload {
  const now = new Date();
  const expiresDate = new Date(now.getTime() + 60 * 1000); // 60 seconds
  const timestampIso = now.toISOString();

  // Create HMAC token for authenticated signed URL
  const hmacSecret = process.env['KYC_VAULT_SIGNING_SECRET'] || 'BQ-SQWAD-TV-VAULT-SIGNING-SECRET-2026';
  const token = crypto
    .createHmac('sha256', hmacSecret)
    .update(`${privateVaultPath}:${reviewerUid}:${expiresDate.getTime()}`)
    .digest('hex');

  const signedUrl = `/api/public/v1/zillionaire/kyc/view-doc?path=${encodeURIComponent(privateVaultPath)}&reviewer=${encodeURIComponent(reviewerUid)}&exp=${expiresDate.getTime()}&sig=${token}`;

  const watermarkText = `CONFIDENTIAL BQ SQWAD TV • REVIEWER ${reviewerUid} • ${timestampIso}${clientIp ? ` • IP ${clientIp}` : ''}`;

  return {
    signedUrl,
    expiresAt: expiresDate.toISOString(),
    durationSeconds: 60,
    watermark: {
      overlayText: watermarkText,
      reviewerUid,
      timestamp: timestampIso,
      documentPath: privateVaultPath,
    },
  };
}
