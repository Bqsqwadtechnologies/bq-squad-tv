import { z } from "zod";
import { ApiError, Firestore, encodeFields } from "./firebase-admin";
import { writeAuditLog } from "./audit";
import { PlatformSettings, DEFAULT_PLATFORM_SETTINGS } from "@/lib/platform-settings-types";

export type { PlatformSettings };
export { DEFAULT_PLATFORM_SETTINGS };

export const platformSettingsSchema = z.object({
  maintenanceMode: z.boolean(),
  maintenanceMessage: z.string().trim().min(5).max(1000),
  maintenanceEndsAt: z.string().nullable().optional(),
  ownerBypass: z.boolean(),

  maxConcurrentSessions: z.number().int().min(1).max(10),
  maxDevicesPerAccount: z.number().int().min(1).max(20),
  sessionExpiryDays: z.number().int().min(1).max(365),
  requireDeviceFingerprint: z.boolean(),

  blockedIps: z.array(z.string().trim().max(64)).max(500),
  blockedCountries: z.array(z.string().trim().length(2).toUpperCase()).max(250),
  countryAccessMode: z.enum(["all_except_blocked", "only_allowed"]),
  allowedCountries: z.array(z.string().trim().length(2).toUpperCase()).max(250),

  publicApiRpm: z.number().int().min(10).max(10000),
  authAttemptsRpm: z.number().int().min(1).max(100),
  streamGrantRpm: z.number().int().min(5).max(500),
  videoUploadRph: z.number().int().min(1).max(500),

  minTopupMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  maxTopupMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  maxWalletBalanceMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  dailySpendLimitMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  allowNegativeBalance: z.boolean(),

  defaultRatePerMinuteMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  minimumSessionBalanceMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  defaultProducerShareBps: z.number().int().min(0).max(10000),
  supportedCurrencies: z.array(z.string().trim().length(3).toUpperCase()).min(1).max(20),
  defaultCurrency: z.string().trim().length(3).toUpperCase(),

  senderName: z.string().trim().min(2).max(100),
  senderEmail: z.string().trim().email(),
  supportEmail: z.string().trim().email(),
  notificationsEmail: z.string().trim().email(),
  emailProvider: z.enum(["lovable_managed", "custom_smtp", "sendgrid", "postmark"]),
  emailProviderConfigured: z.boolean(),

  minAndroidVersionCode: z.number().int().min(1),
  latestAndroidVersionCode: z.number().int().min(1),
  androidVersionName: z.string().trim().min(1).max(50),
  forceUpdateAndroid: z.boolean(),
  androidUpdateUrl: z.string().trim().url(),
  androidReleaseNotes: z.string().trim().max(2000),

  announcementEnabled: z.boolean(),
  announcementText: z.string().trim().max(500),
  announcementType: z.enum(["info", "warning", "success", "emergency"]),
  announcementLink: z.string().trim().max(200),
  announcementLinkLabel: z.string().trim().max(50),
  announcementDismissible: z.boolean(),

  termsVersion: z.string().trim().min(1).max(50),
  privacyVersion: z.string().trim().min(1).max(50),
  producerTermsVersion: z.string().trim().min(1).max(50),
  requireLegalReacceptance: z.boolean(),
  legalEffectiveDate: z.string().trim().min(4).max(50),
});

export function normalizePlatformSettings(
  raw: Record<string, unknown> | null | undefined,
): PlatformSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PLATFORM_SETTINGS };

  const parsed = { ...DEFAULT_PLATFORM_SETTINGS };

  // Booleans
  if (typeof raw["maintenanceMode"] === "boolean") parsed.maintenanceMode = raw["maintenanceMode"];
  if (typeof raw["ownerBypass"] === "boolean") parsed.ownerBypass = raw["ownerBypass"];
  if (typeof raw["requireDeviceFingerprint"] === "boolean")
    parsed.requireDeviceFingerprint = raw["requireDeviceFingerprint"];
  if (typeof raw["allowNegativeBalance"] === "boolean")
    parsed.allowNegativeBalance = raw["allowNegativeBalance"];
  if (typeof raw["emailProviderConfigured"] === "boolean")
    parsed.emailProviderConfigured = raw["emailProviderConfigured"];
  if (typeof raw["forceUpdateAndroid"] === "boolean")
    parsed.forceUpdateAndroid = raw["forceUpdateAndroid"];
  if (typeof raw["announcementEnabled"] === "boolean")
    parsed.announcementEnabled = raw["announcementEnabled"];
  if (typeof raw["announcementDismissible"] === "boolean")
    parsed.announcementDismissible = raw["announcementDismissible"];
  if (typeof raw["requireLegalReacceptance"] === "boolean")
    parsed.requireLegalReacceptance = raw["requireLegalReacceptance"];

  // Strings
  if (typeof raw["maintenanceMessage"] === "string" && raw["maintenanceMessage"].trim())
    parsed.maintenanceMessage = raw["maintenanceMessage"].trim();
  if (typeof raw["maintenanceEndsAt"] === "string" || raw["maintenanceEndsAt"] === null)
    parsed.maintenanceEndsAt = raw["maintenanceEndsAt"];
  if (typeof raw["countryAccessMode"] === "string" && (raw["countryAccessMode"] === "all_except_blocked" || raw["countryAccessMode"] === "only_allowed"))
    parsed.countryAccessMode = raw["countryAccessMode"];
  if (typeof raw["defaultCurrency"] === "string" && /^[A-Z]{3}$/.test(raw["defaultCurrency"]))
    parsed.defaultCurrency = raw["defaultCurrency"];
  if (typeof raw["senderName"] === "string" && raw["senderName"].trim())
    parsed.senderName = raw["senderName"].trim();
  if (typeof raw["senderEmail"] === "string" && raw["senderEmail"].trim())
    parsed.senderEmail = raw["senderEmail"].trim();
  if (typeof raw["supportEmail"] === "string" && raw["supportEmail"].trim())
    parsed.supportEmail = raw["supportEmail"].trim();
  if (typeof raw["notificationsEmail"] === "string" && raw["notificationsEmail"].trim())
    parsed.notificationsEmail = raw["notificationsEmail"].trim();
  if (typeof raw["emailProvider"] === "string" && ["lovable_managed", "custom_smtp", "sendgrid", "postmark"].includes(raw["emailProvider"]))
    parsed.emailProvider = raw["emailProvider"] as PlatformSettings["emailProvider"];
  if (typeof raw["androidVersionName"] === "string" && raw["androidVersionName"].trim())
    parsed.androidVersionName = raw["androidVersionName"].trim();
  if (typeof raw["androidUpdateUrl"] === "string" && raw["androidUpdateUrl"].trim())
    parsed.androidUpdateUrl = raw["androidUpdateUrl"].trim();
  if (typeof raw["androidReleaseNotes"] === "string")
    parsed.androidReleaseNotes = raw["androidReleaseNotes"];
  if (typeof raw["announcementText"] === "string")
    parsed.announcementText = raw["announcementText"];
  if (typeof raw["announcementType"] === "string" && ["info", "warning", "success", "emergency"].includes(raw["announcementType"]))
    parsed.announcementType = raw["announcementType"] as PlatformSettings["announcementType"];
  if (typeof raw["announcementLink"] === "string")
    parsed.announcementLink = raw["announcementLink"];
  if (typeof raw["announcementLinkLabel"] === "string")
    parsed.announcementLinkLabel = raw["announcementLinkLabel"];
  if (typeof raw["termsVersion"] === "string" && raw["termsVersion"].trim())
    parsed.termsVersion = raw["termsVersion"].trim();
  if (typeof raw["privacyVersion"] === "string" && raw["privacyVersion"].trim())
    parsed.privacyVersion = raw["privacyVersion"].trim();
  if (typeof raw["producerTermsVersion"] === "string" && raw["producerTermsVersion"].trim())
    parsed.producerTermsVersion = raw["producerTermsVersion"].trim();
  if (typeof raw["legalEffectiveDate"] === "string" && raw["legalEffectiveDate"].trim())
    parsed.legalEffectiveDate = raw["legalEffectiveDate"].trim();

  // Numbers
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : fallback;
  parsed.maxConcurrentSessions = num(raw["maxConcurrentSessions"], parsed.maxConcurrentSessions);
  parsed.maxDevicesPerAccount = num(raw["maxDevicesPerAccount"], parsed.maxDevicesPerAccount);
  parsed.sessionExpiryDays = num(raw["sessionExpiryDays"], parsed.sessionExpiryDays);
  parsed.publicApiRpm = num(raw["publicApiRpm"], parsed.publicApiRpm);
  parsed.authAttemptsRpm = num(raw["authAttemptsRpm"], parsed.authAttemptsRpm);
  parsed.streamGrantRpm = num(raw["streamGrantRpm"], parsed.streamGrantRpm);
  parsed.videoUploadRph = num(raw["videoUploadRph"], parsed.videoUploadRph);
  parsed.minTopupMinor = num(raw["minTopupMinor"], parsed.minTopupMinor);
  parsed.maxTopupMinor = num(raw["maxTopupMinor"], parsed.maxTopupMinor);
  parsed.maxWalletBalanceMinor = num(raw["maxWalletBalanceMinor"], parsed.maxWalletBalanceMinor);
  parsed.dailySpendLimitMinor = num(raw["dailySpendLimitMinor"], parsed.dailySpendLimitMinor);
  parsed.defaultRatePerMinuteMinor = num(raw["defaultRatePerMinuteMinor"], parsed.defaultRatePerMinuteMinor);
  parsed.minimumSessionBalanceMinor = num(raw["minimumSessionBalanceMinor"], parsed.minimumSessionBalanceMinor);
  parsed.defaultProducerShareBps = num(raw["defaultProducerShareBps"], parsed.defaultProducerShareBps);
  parsed.minAndroidVersionCode = num(raw["minAndroidVersionCode"], parsed.minAndroidVersionCode);
  parsed.latestAndroidVersionCode = num(raw["latestAndroidVersionCode"], parsed.latestAndroidVersionCode);

  // Arrays
  if (Array.isArray(raw["blockedIps"])) {
    parsed.blockedIps = raw["blockedIps"]
      .filter((ip): ip is string => typeof ip === "string" && ip.trim().length > 0)
      .map((ip) => ip.trim());
  }
  if (Array.isArray(raw["blockedCountries"])) {
    parsed.blockedCountries = raw["blockedCountries"]
      .filter((c): c is string => typeof c === "string" && /^[A-Za-z]{2}$/.test(c.trim()))
      .map((c) => c.trim().toUpperCase());
  }
  if (Array.isArray(raw["allowedCountries"])) {
    parsed.allowedCountries = raw["allowedCountries"]
      .filter((c): c is string => typeof c === "string" && /^[A-Za-z]{2}$/.test(c.trim()))
      .map((c) => c.trim().toUpperCase());
  }
  if (Array.isArray(raw["supportedCurrencies"])) {
    const valid = raw["supportedCurrencies"]
      .filter((c): c is string => typeof c === "string" && /^[A-Za-z]{3}$/.test(c.trim()))
      .map((c) => c.trim().toUpperCase());
    if (valid.length > 0) parsed.supportedCurrencies = valid;
  }

  if (typeof raw["version"] === "number") parsed.version = raw["version"];
  if (typeof raw["updatedAt"] === "string") parsed.updatedAt = raw["updatedAt"];
  if (typeof raw["updatedBy"] === "string") parsed.updatedBy = raw["updatedBy"];

  return parsed;
}

export async function getPlatformSettings(fs: Firestore): Promise<PlatformSettings> {
  const doc = await fs.getDoc("config/platformSettings");
  return normalizePlatformSettings(doc);
}

// IP & CIDR matchers
function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    num = (num << 8) + n;
  }
  return num >>> 0;
}

export function isIpBlocked(clientIp: string, blockedIps: string[]): boolean {
  if (!clientIp || !Array.isArray(blockedIps) || blockedIps.length === 0) return false;
  const cleanIp = clientIp.trim();
  for (const rule of blockedIps) {
    const trimmed = rule.trim();
    if (!trimmed) continue;
    if (trimmed === cleanIp) return true;
    if (trimmed.includes("/")) {
      const [subnet, bitsStr] = trimmed.split("/");
      if (!subnet || !bitsStr) continue;
      const bits = parseInt(bitsStr, 10);
      if (!isNaN(bits) && bits >= 0 && bits <= 32) {
        const ipNum = ipv4ToNumber(cleanIp);
        const subnetNum = ipv4ToNumber(subnet);
        if (ipNum !== null && subnetNum !== null) {
          const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
          if ((ipNum & mask) === (subnetNum & mask)) return true;
        }
      }
    }
  }
  return false;
}

export function isCountryBlocked(
  countryCode: string | null | undefined,
  mode: "all_except_blocked" | "only_allowed",
  blockedCountries: string[],
  allowedCountries: string[],
): boolean {
  if (!countryCode) return false;
  const code = countryCode.trim().toUpperCase();
  const blockedSet = new Set(blockedCountries.map((c) => c.trim().toUpperCase()));
  const allowedSet = new Set(allowedCountries.map((c) => c.trim().toUpperCase()));

  if (mode === "only_allowed") {
    if (allowedSet.size > 0 && !allowedSet.has(code)) return true;
  }
  return blockedSet.has(code);
}

export function checkAppVersionGate(
  versionCode: number,
  settings: PlatformSettings,
): { supported: boolean; forceUpdate: boolean; latestVersion: number; updateUrl: string } {
  const forceUpdate =
    settings.forceUpdateAndroid && versionCode < settings.latestAndroidVersionCode;
  const supported = versionCode >= settings.minAndroidVersionCode && !forceUpdate;
  return {
    supported,
    forceUpdate,
    latestVersion: settings.latestAndroidVersionCode,
    updateUrl: settings.androidUpdateUrl,
  };
}
