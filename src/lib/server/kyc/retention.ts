/**
 * Country-specific statutory retention periods (in years) under AML / CFT legislation:
 * - NG: 5 years (Money Laundering Prevention and Prohibition Act 2022)
 * - GB: 5 years (The Money Laundering, Terrorist Financing and Transfer of Funds Regulations 2017)
 * - US: 7 years (Bank Secrecy Act / FinCEN)
 * - EU: 5 years (EU 5th Anti-Money Laundering Directive / AMLD5)
 * - Default: 5 years (FATF Recommendation 11 standard)
 */
export const STATUTORY_RETENTION_YEARS_BY_COUNTRY: Record<string, number> = {
  NG: 5,
  GB: 5,
  US: 7,
  CA: 5,
  ZA: 5,
  KE: 5,
  GH: 5,
  DE: 5,
  FR: 5,
  NL: 5,
};

export const DEFAULT_STATUTORY_RETENTION_YEARS = 5;

export function getStatutoryRetentionYears(countryCode?: string): number {
  if (!countryCode) return DEFAULT_STATUTORY_RETENTION_YEARS;
  const upper = countryCode.trim().toUpperCase();
  return STATUTORY_RETENTION_YEARS_BY_COUNTRY[upper] ?? DEFAULT_STATUTORY_RETENTION_YEARS;
}

export function computeRetentionExpiryDate(
  createdAtIso: string,
  countryCode?: string,
  customYears?: number
): string {
  const years = customYears ?? getStatutoryRetentionYears(countryCode);
  const created = new Date(createdAtIso);
  const expiry = new Date(created.getFullYear() + years, created.getMonth(), created.getDate());
  return expiry.toISOString();
}

export function isRetentionPeriodActive(
  createdAtIso: string,
  countryCode?: string,
  customYears?: number
): boolean {
  const expiryIso = computeRetentionExpiryDate(createdAtIso, countryCode, customYears);
  return Date.now() < new Date(expiryIso).getTime();
}
