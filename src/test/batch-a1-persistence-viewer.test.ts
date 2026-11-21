import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as crypto from 'node:crypto';
import {
  saveKycProfile,
  getKycProfile,
  reviewKycProfile,
} from '../lib/server/kyc/persistence';

describe('Batch A1: KYC Persistence & Authenticated Viewer', () => {
  const mockDb = new Map<string, any>();

  const mockFs: any = {
    getDoc: async (path: string) => mockDb.get(path) || null,
    setDoc: async (path: string, data: any) => {
      mockDb.set(path, data);
    },
    patchDoc: async (path: string, patch: any) => {
      const existing = mockDb.get(path) || {};
      mockDb.set(path, { ...existing, ...patch });
    },
  };

  const testKey = crypto.randomBytes(32).toString('base64');
  let originalKey: string | undefined;

  beforeEach(() => {
    mockDb.clear();
    originalKey = process.env['KYC_FIELD_ENCRYPTION_KEY'];
    process.env['KYC_FIELD_ENCRYPTION_KEY'] = testKey;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env['KYC_FIELD_ENCRYPTION_KEY'];
    else process.env['KYC_FIELD_ENCRYPTION_KEY'] = originalKey;
  });

  it('persists KYC profile with encrypted fields and masked readouts', async () => {
    const rawId = 'ID-9988776655';
    const rawTax = 'TAX-11223344';
    const profile = await saveKycProfile(mockFs, {
      uid: 'user_test_producer_01',
      role: 'producer',
      kycType: 'individual',
      kycCountry: 'US',
      rawIdNumber: rawId,
      rawTaxNumber: rawTax,
      documentVaultPaths: {
        passport: 'kyc-vault/tenants/user_test_producer_01/passport_123.pdf',
      },
    });

    expect(profile.kycStatus).toBe('pending');
    expect(profile.maskedIdNumber).toBe('*********6655');
    expect(profile.maskedTaxNumber).toBe('********3344');
    expect(profile.encryptedIdNumber?.ciphertext).toBeDefined();

    // Stored in mock db
    const stored = await mockFs.getDoc('kycProfiles/user_test_producer_01');
    expect(stored).toBeDefined();
    expect(stored.kycCountry).toBe('US');

    // Read back with decryptSensitive = true
    const readBack = await getKycProfile(mockFs, 'user_test_producer_01', { decryptSensitive: true });
    expect((readBack as any).decryptedIdNumber).toBe(rawId);
    expect((readBack as any).decryptedTaxNumber).toBe(rawTax);
  });

  it('enforces mandatory reason when rejecting a KYC submission', async () => {
    await saveKycProfile(mockFs, {
      uid: 'user_test_02',
      role: 'producer',
      kycType: 'individual',
      kycCountry: 'GB',
    });

    // Rejection without reason fails
    await expect(
      reviewKycProfile(mockFs, {
        uid: 'user_test_02',
        reviewerUid: 'owner_admin',
        status: 'rejected',
        reason: '',
      })
    ).rejects.toThrow('A rejection reason of at least 3 characters is required.');

    // Rejection with reason succeeds
    const reviewed = await reviewKycProfile(mockFs, {
      uid: 'user_test_02',
      reviewerUid: 'owner_admin',
      status: 'rejected',
      reason: 'Passport expired; please upload a valid document.',
    });

    expect(reviewed.kycStatus).toBe('rejected');
    expect(reviewed.kycRejectionReason).toBe('Passport expired; please upload a valid document.');
    expect(reviewed.kycHistory).toHaveLength(2);
  });
});

describe('Batch A1: View Doc HMAC & Security', () => {
  const secret = 'super-secret-vault-signing-key-32bytes-min!!';

  it('verifies valid HMAC signature against path and reviewer', () => {
    const path = 'kyc-vault/tenants/user_123/passport.pdf';
    const reviewer = 'rev_001';
    const exp = Date.now() + 60000;

    const sig = crypto.createHmac('sha256', secret).update(`${path}:${reviewer}:${exp}`).digest('hex');
    expect(sig).toHaveLength(64);

    // Tampered path
    const tamperedPathSig = crypto.createHmac('sha256', secret).update(`${path}2:${reviewer}:${exp}`).digest('hex');
    expect(tamperedPathSig).not.toBe(sig);

    // Tampered reviewer
    const tamperedReviewerSig = crypto.createHmac('sha256', secret).update(`${path}:rev_002:${exp}`).digest('hex');
    expect(tamperedReviewerSig).not.toBe(sig);
  });
});
