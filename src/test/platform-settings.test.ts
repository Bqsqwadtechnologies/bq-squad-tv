import { describe, it, expect } from "vitest";
import {
  DEFAULT_PLATFORM_SETTINGS,
  platformSettingsSchema,
  normalizePlatformSettings,
  isIpBlocked,
  isCountryBlocked,
  checkAppVersionGate,
} from "../lib/server/platform-settings";

describe("Platform Settings & Controls (Batch 4)", () => {
  it("DEFAULT_PLATFORM_SETTINGS conforms to platformSettingsSchema", () => {
    const parsed = platformSettingsSchema.safeParse(DEFAULT_PLATFORM_SETTINGS);
    expect(parsed.success).toBe(true);
  });

  it("normalizePlatformSettings applies safe defaults to empty or partial documents", () => {
    const normalized = normalizePlatformSettings({});
    expect(normalized.maintenanceMode).toBe(false);
    expect(normalized.maxConcurrentSessions).toBe(2);
    expect(normalized.defaultCurrency).toBe("NGN");
    expect(normalized.supportedCurrencies).toContain("NGN");
    expect(normalized.blockedCountries).toEqual(["KP", "IR"]);
  });

  it("normalizePlatformSettings sanitizes custom inputs correctly", () => {
    const custom = normalizePlatformSettings({
      maintenanceMode: true,
      maintenanceMessage: "Upgrading core database clusters",
      maxConcurrentSessions: 4,
      blockedIps: [" 192.168.1.50 ", "10.0.0.0/8"],
      blockedCountries: ["ru", "by"],
      countryAccessMode: "only_allowed",
      allowedCountries: ["ng", "gh", "ke"],
    });

    expect(custom.maintenanceMode).toBe(true);
    expect(custom.maintenanceMessage).toBe("Upgrading core database clusters");
    expect(custom.maxConcurrentSessions).toBe(4);
    expect(custom.blockedIps).toEqual(["192.168.1.50", "10.0.0.0/8"]);
    expect(custom.blockedCountries).toEqual(["RU", "BY"]);
    expect(custom.countryAccessMode).toBe("only_allowed");
    expect(custom.allowedCountries).toEqual(["NG", "GH", "KE"]);
  });

  describe("IP and CIDR Subnet Blocking", () => {
    it("matches exact IP addresses", () => {
      const blocked = ["198.51.100.42", "203.0.113.1"];
      expect(isIpBlocked("198.51.100.42", blocked)).toBe(true);
      expect(isIpBlocked("203.0.113.1", blocked)).toBe(true);
      expect(isIpBlocked("198.51.100.43", blocked)).toBe(false);
    });

    it("matches CIDR subnets correctly", () => {
      const blocked = ["10.50.0.0/16", "172.16.1.0/24"];
      expect(isIpBlocked("10.50.12.34", blocked)).toBe(true);
      expect(isIpBlocked("10.50.255.254", blocked)).toBe(true);
      expect(isIpBlocked("10.51.0.1", blocked)).toBe(false);

      expect(isIpBlocked("172.16.1.200", blocked)).toBe(true);
      expect(isIpBlocked("172.16.2.1", blocked)).toBe(false);
    });

    it("handles empty or invalid inputs gracefully", () => {
      expect(isIpBlocked("", ["10.0.0.0/8"])).toBe(false);
      expect(isIpBlocked("invalid-ip", ["10.0.0.0/8"])).toBe(false);
      expect(isIpBlocked("192.168.1.1", [])).toBe(false);
    });
  });

  describe("Country Geofencing", () => {
    it("enforces all_except_blocked mode", () => {
      const blocked = ["KP", "IR", "SY"];
      const allowed = ["NG", "GH"];

      expect(isCountryBlocked("KP", "all_except_blocked", blocked, allowed)).toBe(true);
      expect(isCountryBlocked("IR", "all_except_blocked", blocked, allowed)).toBe(true);
      expect(isCountryBlocked("NG", "all_except_blocked", blocked, allowed)).toBe(false);
      expect(isCountryBlocked("US", "all_except_blocked", blocked, allowed)).toBe(false);
    });

    it("enforces only_allowed whitelist mode", () => {
      const blocked: string[] = [];
      const allowed = ["NG", "GH", "KE"];

      expect(isCountryBlocked("NG", "only_allowed", blocked, allowed)).toBe(false);
      expect(isCountryBlocked("GH", "only_allowed", blocked, allowed)).toBe(false);
      expect(isCountryBlocked("US", "only_allowed", blocked, allowed)).toBe(true);
      expect(isCountryBlocked("GB", "only_allowed", blocked, allowed)).toBe(true);
    });

    it("handles null / undefined country code gracefully", () => {
      expect(isCountryBlocked(null, "only_allowed", [], ["NG"])).toBe(false);
      expect(isCountryBlocked(undefined, "all_except_blocked", ["KP"], [])).toBe(false);
    });
  });

  describe("App Version Gate & Force Update", () => {
    it("permits current supported version when force update is disabled", () => {
      const settings = {
        ...DEFAULT_PLATFORM_SETTINGS,
        minAndroidVersionCode: 10,
        latestAndroidVersionCode: 15,
        forceUpdateAndroid: false,
      };

      const gate = checkAppVersionGate(12, settings);
      expect(gate.supported).toBe(true);
      expect(gate.forceUpdate).toBe(false);
    });

    it("blocks version below minimum version code", () => {
      const settings = {
        ...DEFAULT_PLATFORM_SETTINGS,
        minAndroidVersionCode: 10,
        latestAndroidVersionCode: 15,
        forceUpdateAndroid: false,
      };

      const gate = checkAppVersionGate(8, settings);
      expect(gate.supported).toBe(false);
      expect(gate.forceUpdate).toBe(false);
    });

    it("enforces force-update when client is below latest version and forceUpdate is true", () => {
      const settings = {
        ...DEFAULT_PLATFORM_SETTINGS,
        minAndroidVersionCode: 10,
        latestAndroidVersionCode: 15,
        forceUpdateAndroid: true,
      };

      const gate = checkAppVersionGate(12, settings);
      expect(gate.supported).toBe(false);
      expect(gate.forceUpdate).toBe(true);
      expect(gate.latestVersion).toBe(15);
    });

    it("allows clients on or above latest version even when forceUpdate is true", () => {
      const settings = {
        ...DEFAULT_PLATFORM_SETTINGS,
        minAndroidVersionCode: 10,
        latestAndroidVersionCode: 15,
        forceUpdateAndroid: true,
      };

      const gate = checkAppVersionGate(15, settings);
      expect(gate.supported).toBe(true);
      expect(gate.forceUpdate).toBe(false);
    });
  });
});
