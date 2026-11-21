import { describe, it, expect } from 'vitest';
import {
  ALL_COUNTRIES,
  getCountryRule,
  getAllCountryRules,
  validateIdFormat,
  validateTaxIdFormat,
  validateCompanyRegistrationFormat,
} from '../lib/kyc-country-rules';

describe('Batch A2: Producer KYC & Owner Country Rules Integration', () => {
  it('covers all 193 sovereign countries with zero missing defaults', () => {
    const rules = getAllCountryRules();
    expect(rules).toHaveLength(193);

    for (const rule of rules) {
      expect(rule.code).toMatch(/^[A-Z]{2}$/);
      expect(rule.flag).toBeDefined();
      expect(rule.dialCode).toMatch(/^\+[\d-]+$/);
      expect(rule.defaultCurrency).toMatch(/^[A-Z]{3}$/);
      expect(rule.acceptedPersonalIdTypes.length).toBeGreaterThan(0);
      expect(rule.bankCodeSystem).toBeDefined();
    }
  });

  it('merges custom owner overrides into getCountryRule and getAllCountryRules', () => {
    const customOverrides = {
      NG: {
        defaultCurrency: 'USD',
        isGeneric: false,
      },
    };

    const ngRule = getCountryRule('NG', customOverrides as any);
    expect(ngRule.defaultCurrency).toBe('USD');

    const allWithOverrides = getAllCountryRules(customOverrides as any);
    const foundNg = allWithOverrides.find((r) => r.code === 'NG');
    expect(foundNg?.defaultCurrency).toBe('USD');
  });

  it('validates IDs according to country-specific rules', () => {
    // US Passport (9 digits)
    const validPassport = validateIdFormat('US', 'passport', '123456789');
    expect(validPassport.valid).toBe(true);
    const invalidPassport = validateIdFormat('US', 'passport', '12345');
    expect(invalidPassport.valid).toBe(false);

    // Nigeria NIN (11 digits)
    const validNin = validateIdFormat('NG', 'nin', '12345678901');
    expect(validNin.valid).toBe(true);
    const invalidNin = validateIdFormat('NG', 'nin', '12345');
    expect(invalidNin.valid).toBe(false);
  });
});
