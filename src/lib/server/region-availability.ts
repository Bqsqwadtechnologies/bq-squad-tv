import { normalizeCountryCode } from "./currency";

export type RegionAvailability = {
  mode?: "GLOBAL" | "WHITELIST" | "BLACKLIST";
  countries?: string[];
  availableFrom?: string | null;
  availableTo?: string | null;
};

/** Fail closed for a whitelist when the request has no trustworthy country. */
export function isAvailableInRegion(
  availability: unknown,
  countryCodeRaw: unknown,
  now = Date.now(),
): boolean {
  if (!availability || typeof availability !== "object" || Array.isArray(availability)) return true;
  const rule = availability as RegionAvailability;
  const mode = rule.mode ?? "GLOBAL";
  if (mode === "GLOBAL") return true;

  const countryCode = normalizeCountryCode(countryCodeRaw);
  const countries = Array.isArray(rule.countries)
    ? rule.countries.map(normalizeCountryCode).filter((value): value is string => value !== null)
    : [];

  if (rule.availableFrom) {
    const start = Date.parse(rule.availableFrom);
    if (Number.isFinite(start) && now < start) return false;
  }
  if (rule.availableTo) {
    const end = Date.parse(rule.availableTo);
    if (Number.isFinite(end) && now > end) return false;
  }
  if (!countryCode) return mode !== "WHITELIST";
  return mode === "WHITELIST"
    ? countries.includes(countryCode)
    : mode === "BLACKLIST"
      ? !countries.includes(countryCode)
      : true;
}
