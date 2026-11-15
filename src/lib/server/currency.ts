import { ApiError } from "./firebase-admin";

export const DEFAULT_CURRENCY = "USD";

/** ISO 3166-1 alpha-2 country to ISO 4217 settlement currency. */
const COUNTRY_CURRENCY: Readonly<Record<string, string>> = {
  NG: "NGN", GH: "GHS", KE: "KES", ZA: "ZAR", US: "USD", GB: "GBP",
  CA: "CAD", AU: "AUD", NZ: "NZD", IN: "INR", JP: "JPY", KR: "KRW",
  SG: "SGD", HK: "HKD", AE: "AED", SA: "SAR", EG: "EGP", RW: "RWF",
  CI: "XOF", SN: "XOF", BJ: "XOF", BF: "XOF", ML: "XOF", NE: "XOF",
  TG: "XOF", GW: "XOF", CM: "XAF", GA: "XAF", CG: "XAF", TD: "XAF",
  CF: "XAF", GQ: "XAF", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR",
  NL: "EUR", BE: "EUR", IE: "EUR", PT: "EUR", AT: "EUR", FI: "EUR",
  GR: "EUR", CY: "EUR", MT: "EUR", LU: "EUR", EE: "EUR", LV: "EUR",
  LT: "EUR", SK: "EUR", SI: "EUR", HR: "EUR", MX: "MXN", BR: "BRL",
  AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN", TR: "TRY", CH: "CHF",
  SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF",
  RO: "RON", BG: "BGN", ID: "IDR", MY: "MYR", TH: "THB", PH: "PHP",
  VN: "VND", PK: "PKR", BD: "BDT", LK: "LKR", IL: "ILS", QA: "QAR",
  KW: "KWD", BH: "BHD", OM: "OMR", JO: "JOD", MA: "MAD", TN: "TND",
  ET: "ETB", UG: "UGX", TZ: "TZS", ZM: "ZMW", ZW: "ZWL", MU: "MUR",
};

const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

export function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export function currencyForCountry(countryCode: unknown): string {
  const country = normalizeCountryCode(countryCode);
  return country ? COUNTRY_CURRENCY[country] ?? DEFAULT_CURRENCY : DEFAULT_CURRENCY;
}

export function minorUnitDigits(currency: string): number {
  if (!/^[A-Z]{3}$/.test(currency)) throw new ApiError(400, "CURRENCY_INVALID", "Currency must be a three-letter ISO 4217 code.");
  if (ZERO_DECIMAL.has(currency)) return 0;
  if (THREE_DECIMAL.has(currency)) return 3;
  return 2;
}

export function minorUnitName(currency: string): string {
  const digits = minorUnitDigits(currency);
  return digits === 0 ? "major unit" : digits === 3 ? "minor unit (1/1000)" : "minor unit (1/100)";
}

export function isSupportedPaystackCurrency(currency: string): boolean {
  return ["NGN", "GHS", "ZAR", "KES", "USD", "XOF", "EGP", "RWF"].includes(currency);
}

export function requireCurrency(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) {
    throw new ApiError(400, "CURRENCY_INVALID", "A valid ISO 4217 currency code is required.");
  }
  return value;
}
