import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import {
  encryptSensitiveField,
  decryptSensitiveField,
  maskIdNumber,
  maskAccountNumber,
  maskTaxNumber,
  maskDateOfBirth,
} from '../lib/server/kyc/types';
import {
  buildPrivateDocumentVaultPath,
  validateKycFile,
  generateShortLivedViewerUrl,
} from '../lib/server/kyc/storage';

describe('Batch A1: KYC Data Model & Private Storage', () => {
  it('correctly masks sensitive identity fields for public/list views', () => {
    expect(maskIdNumber('1234567890')).toBe('******7890');
    expect(maskAccountNumber('0123456789')).toBe('******6789');
    expect(maskTaxNumber('TIN-987654321')).toBe('*********4321');
    expect(maskDateOfBirth('1990-05-24')).toBe('****-**-24');
  });

  it('fails closed without an encryption key and performs AES-256-GCM when configured', () => {
    const previousKey = process.env['KYC_FIELD_ENCRYPTION_KEY'];
    delete process.env['KYC_FIELD_ENCRYPTION_KEY'];
    expect(() => encryptSensitiveField('sensitive-test-value')).toThrow('KYC_FIELD_ENCRYPTION_KEY is required');

    const rawId = 'NIN-99482710485';
    process.env['KYC_FIELD_ENCRYPTION_KEY'] = crypto.randomBytes(32).toString('base64');
    const encrypted = encryptSensitiveField(rawId);

    expect(encrypted.algorithm).toBe('aes-256-gcm');
    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toHaveLength(24); // 12 bytes in hex
    expect(encrypted.tag).toHaveLength(32); // 16 bytes in hex

    const decrypted = decryptSensitiveField(encrypted);
    expect(decrypted).toBe(rawId);
    if (previousKey === undefined) delete process.env['KYC_FIELD_ENCRYPTION_KEY'];
    else process.env['KYC_FIELD_ENCRYPTION_KEY'] = previousKey;
  });

  it('generates secure private document vault paths that do not leak raw identifiers', () => {
    const path = buildPrivateDocumentVaultPath('../user/123', 'national_id', 'pdf');
    expect(path).toMatch(/^kyc-vault\/tenants\/___user_123\/national_id_[a-f0-9]{32}\.pdf$/);
  });

  it('validates document size and mime types with header sanity checks', () => {
    // Empty buffer
    expect(validateKycFile(Buffer.alloc(0), 'application/pdf').valid).toBe(false);

    // Too small buffer (< 10KB)
    expect(validateKycFile(Buffer.from('tiny'), 'application/pdf').error).toBe('FILE_TOO_SMALL_OR_CORRUPT');

    // Valid mock PDF
    const validPdfHeader = Buffer.from('%PDF-1.4\n' + '0'.repeat(15000));
    const pdfRes = validateKycFile(validPdfHeader, 'application/pdf');
    expect(pdfRes.valid).toBe(true);
    expect(pdfRes.fileHash).toHaveLength(64);

    // Mismatched magic bytes
    const fakeJpeg = Buffer.from('not-a-jpeg-header' + '0'.repeat(15000));
    expect(validateKycFile(fakeJpeg, 'image/jpeg').error).toBe('INVALID_JPEG_HEADER');
  });

  it('issues short-lived signed URLs with 60s expiration and watermark metadata', () => {
    const vaultPath = 'kyc-vault/tenants/user_123/id_abc.pdf';
    const reviewer = 'owner_zillionaire_01';
    const previousKey = process.env['KYC_VAULT_SIGNING_SECRET'];
    delete process.env['KYC_VAULT_SIGNING_SECRET'];
    expect(() => generateShortLivedViewerUrl(vaultPath, reviewer)).toThrow('KYC_VAULT_SIGNING_SECRET must be configured');
    process.env['KYC_VAULT_SIGNING_SECRET'] = crypto.randomBytes(32).toString('hex');
    const payload = generateShortLivedViewerUrl(vaultPath, reviewer, '192.168.1.1');

    expect(payload.durationSeconds).toBe(60);
    expect(payload.signedUrl).toContain('exp=');
    expect(payload.signedUrl).toContain('sig=');
    expect(payload.watermark.overlayText).toContain('CONFIDENTIAL BQ SQWAD TV');
    expect(payload.watermark.reviewerUid).toBe(reviewer);
    if (previousKey === undefined) delete process.env['KYC_VAULT_SIGNING_SECRET'];
    else process.env['KYC_VAULT_SIGNING_SECRET'] = previousKey;
  });
});
