export interface PlatformSettings {
  // Maintenance Mode
  maintenanceMode: boolean;
  maintenanceMessage: string;
  maintenanceEndsAt: string | null;
  ownerBypass: boolean;

  // Session and Device Limits
  maxConcurrentSessions: number;
  maxDevicesPerAccount: number;
  sessionExpiryDays: number;
  requireDeviceFingerprint: boolean;

  // IP and Country Block Lists
  blockedIps: string[];
  blockedCountries: string[];
  countryAccessMode: "all_except_blocked" | "only_allowed";
  allowedCountries: string[];

  // Rate-Limit Settings
  publicApiRpm: number;
  authAttemptsRpm: number;
  streamGrantRpm: number;
  videoUploadRph: number;

  // Wallet Limits
  minTopupMinor: number;
  maxTopupMinor: number;
  maxWalletBalanceMinor: number;
  dailySpendLimitMinor: number;
  allowNegativeBalance: boolean;

  // Per-minute price defaults, currency and country rules
  defaultRatePerMinuteMinor: number;
  minimumSessionBalanceMinor: number;
  defaultProducerShareBps: number;
  supportedCurrencies: string[];
  defaultCurrency: string;

  // Email Sender Settings
  senderName: string;
  senderEmail: string;
  supportEmail: string;
  notificationsEmail: string;
  emailProvider: "lovable_managed" | "custom_smtp" | "sendgrid" | "postmark";
  emailProviderConfigured: boolean;

  // App Version Gate (Force Update for Android)
  minAndroidVersionCode: number;
  latestAndroidVersionCode: number;
  androidVersionName: string;
  forceUpdateAndroid: boolean;
  androidUpdateUrl: string;
  androidReleaseNotes: string;

  // Announcement Ticker
  announcementEnabled: boolean;
  announcementText: string;
  announcementType: "info" | "warning" | "success" | "emergency";
  announcementLink: string;
  announcementLinkLabel: string;
  announcementDismissible: boolean;

  // Legal-Acceptance Version Gate
  termsVersion: string;
  privacyVersion: string;
  producerTermsVersion: string;
  requireLegalReacceptance: boolean;
  legalEffectiveDate: string;

  // Versioning
  version?: number;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  maintenanceMode: false,
  maintenanceMessage:
    "BQ SQWAD TV is temporarily undergoing scheduled maintenance to upgrade streaming capacity. We will be back shortly.",
  maintenanceEndsAt: null,
  ownerBypass: true,

  maxConcurrentSessions: 2,
  maxDevicesPerAccount: 5,
  sessionExpiryDays: 30,
  requireDeviceFingerprint: false,

  blockedIps: [],
  blockedCountries: ["KP", "IR"],
  countryAccessMode: "all_except_blocked",
  allowedCountries: ["NG", "GH", "KE", "ZA", "GB", "US", "CA"],

  publicApiRpm: 120,
  authAttemptsRpm: 10,
  streamGrantRpm: 30,
  videoUploadRph: 20,

  minTopupMinor: 50000, // ₦500.00
  maxTopupMinor: 5000000, // ₦50,000.00
  maxWalletBalanceMinor: 50000000, // ₦500,000.00
  dailySpendLimitMinor: 10000000, // ₦100,000.00
  allowNegativeBalance: false,

  defaultRatePerMinuteMinor: 500, // ₦5.00
  minimumSessionBalanceMinor: 2500, // ₦25.00
  defaultProducerShareBps: 7000, // 70%
  supportedCurrencies: ["NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR"],
  defaultCurrency: "NGN",

  senderName: "BQ SQWAD TV",
  senderEmail: "tv@bqsqwad.com",
  supportEmail: "tv@bqsqwad.com",
  notificationsEmail: "notifications@bqsqwad.com",
  emailProvider: "lovable_managed",
  emailProviderConfigured: true,

  minAndroidVersionCode: 10,
  latestAndroidVersionCode: 12,
  androidVersionName: "1.2.0",
  forceUpdateAndroid: false,
  androidUpdateUrl: "https://play.google.com/store/apps/details?id=com.bqsqwad.tv",
  androidReleaseNotes:
    "Performance upgrades, offline caching improvements and enhanced playback stability.",

  announcementEnabled: false,
  announcementText:
    "Welcome to BQ SQWAD TV — Stream top African cinema, live FAST channels and exclusive Nollywood releases in crystal-clear HD.",
  announcementType: "info",
  announcementLink: "/movies",
  announcementLinkLabel: "Explore Titles",
  announcementDismissible: true,

  termsVersion: "2026.1",
  privacyVersion: "2026.1",
  producerTermsVersion: "2026.1",
  requireLegalReacceptance: false,
  legalEffectiveDate: "2026-01-01",
};
