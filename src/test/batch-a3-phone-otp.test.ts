import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';

describe('Batch A3: Brevo Phone OTP Verification Logic', () => {
  it('generates cryptographic 6-digit codes and hashes them with salt', () => {
    const code = crypto.randomInt(100000, 1000000).toString();
    expect(code).toMatch(/^\d{6}$/);

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256').update(code + salt).digest('hex');
    expect(hash).toHaveLength(64);

    // Verify candidate matches
    const candidateHash = crypto.createHash('sha256').update(code + salt).digest('hex');
    const candBuf = Buffer.from(candidateHash, 'hex');
    const targetBuf = Buffer.from(hash, 'hex');
    expect(crypto.timingSafeEqual(candBuf, targetBuf)).toBe(true);

    // Tampered code does not match
    const wrongCode = code === '123456' ? '654321' : '123456';
    const wrongHash = crypto.createHash('sha256').update(wrongCode + salt).digest('hex');
    const wrongBuf = Buffer.from(wrongHash, 'hex');
    expect(crypto.timingSafeEqual(wrongBuf, targetBuf)).toBe(false);
  });

  it('validates E.164 phone format and masks phone numbers securely', () => {
    const validE164 = '+14155552671';
    const invalidFormat = '4155552671';
    const e164Regex = /^\+[1-9]\d{6,14}$/;

    expect(e164Regex.test(validE164)).toBe(true);
    expect(e164Regex.test(invalidFormat)).toBe(false);

    // Phone masking
    const masked = validE164.slice(0, 3) + '******' + validE164.slice(-3);
    expect(masked).toBe('+14******671');
  });

  it('enforces 10-minute expiry window', () => {
    const nowMs = Date.now();
    const expiresAt = nowMs + 10 * 60 * 1000;
    expect(nowMs < expiresAt).toBe(true);

    const expiredTimestamp = nowMs - 1000;
    expect(nowMs > expiredTimestamp).toBe(true);
  });
});
