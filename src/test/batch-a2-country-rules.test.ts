import { describe, it, expect } from 'vitest';
import {
  ALL_COUNTRIES,
  getAllCountryRules,
  getCountryRule,
  validateIdFormat,
  validateTaxIdFormat,
  validateCompanyRegistryFormat,
} from '../lib/kyc-country-rules';

describe('Batch A2: Country-first KYC rules', () => {
  it('contains a global country directory with unique ISO codes', () => {
    expect(ALL_COUNTRIES.length).toBeGreaterThanOrEqual(190);
    expect(new Set(ALL_COUNTRIES.map((country) => country.code)).size).toBe(ALL_COUNTRIES.length);
  });

  it('provides tailored rules for priority jurisdictions', () => {
    for (const code of ['NG', 'GB', 'US', 'GH', 'KE', 'ZA']) {
      const rule = getCountryRule(code);
      expect(rule.isGeneric).toBe(false);
      expect(rule.acceptedPersonalIdTypes.length).toBeGreaterThan(0);
      expect(rule.taxId.label).toBeTruthy();
      expect(rule.companyRegistry.label).toBeTruthy();
    }
  });

  it('validates Nigerian ID, tax and company-registration formats', () => {
    expect(validateIdFormat('NG', 'nin', '12345678901').valid).toBe(true);
    expect(validateIdFormat('NG', 'nin', '123').valid).toBe(false);
    expect(validateTaxIdFormat('NG', '').valid).toBe(false);
    expect(validateTaxIdFormat('NG', '1234567890').valid).toBe(true);
    expect(validateCompanyRegistryFormat('NG', '').valid).toBe(false);
    expect(validateCompanyRegistryFormat('NG', 'RC1234567').valid).toBe(true);
  });

  it('uses non-blocking generic KYC rules for countries without tailored settings', () => {
    const rule = getCountryRule('JP');
    expect(rule.name).toBe('Japan');
    expect(rule.isGeneric).toBe(true);
    expect(rule.acceptedPersonalIdTypes.length).toBeGreaterThan(0);
    expect(rule.bankCodeSystem).toBe('iban');
  });

  it('returns complete rules for every listed country', () => {
    const rules = getAllCountryRules();
    expect(rules).toHaveLength(ALL_COUNTRIES.length);
    expect(rules.every((rule) => rule.acceptedPersonalIdTypes.length > 0)).toBe(true);
  });
});
