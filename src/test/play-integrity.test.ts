import { describe, expect, it } from "vitest";
import { assertPlayIntegrityPayload } from "@/lib/server/play-integrity";

const now = 1_794_280_000_000;
const validPayload = {
  requestDetails: {
    requestPackageName: "com.bqsqwad.tv",
    nonce: "one-use-challenge",
    timestampMillis: String(now - 30_000),
  },
  appIntegrity: { appRecognitionVerdict: "PLAY_RECOGNIZED" },
  deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_DEVICE_INTEGRITY"] },
  accountDetails: { appLicensingVerdict: "LICENSED" },
};

describe("Google Play Integrity payload validation", () => {
  it("accepts a recognized app, trusted device and licensed Play installation", () => {
    expect(() => assertPlayIntegrityPayload(validPayload, "one-use-challenge", "com.bqsqwad.tv", now)).not.toThrow();
  });

  it("rejects a mismatched package, nonce or stale request", () => {
    expect(() => assertPlayIntegrityPayload({
      ...validPayload,
      requestDetails: { ...validPayload.requestDetails, requestPackageName: "other.package" },
    }, "one-use-challenge", "com.bqsqwad.tv", now)).toThrow();
    expect(() => assertPlayIntegrityPayload(validPayload, "different-nonce", "com.bqsqwad.tv", now)).toThrow();
    expect(() => assertPlayIntegrityPayload({
      ...validPayload,
      requestDetails: { ...validPayload.requestDetails, timestampMillis: String(now - 6 * 60_000) },
    }, "one-use-challenge", "com.bqsqwad.tv", now)).toThrow();
  });

  it("rejects unrecognized app, untrusted device and unlicensed install", () => {
    expect(() => assertPlayIntegrityPayload({
      ...validPayload, appIntegrity: { appRecognitionVerdict: "UNRECOGNIZED_VERSION" },
    }, "one-use-challenge", "com.bqsqwad.tv", now)).toThrow();
    expect(() => assertPlayIntegrityPayload({
      ...validPayload, deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_BASIC_INTEGRITY"] },
    }, "one-use-challenge", "com.bqsqwad.tv", now)).toThrow();
    expect(() => assertPlayIntegrityPayload({
      ...validPayload, accountDetails: { appLicensingVerdict: "UNLICENSED" },
    }, "one-use-challenge", "com.bqsqwad.tv", now)).toThrow();
  });
});
