import { describe, expect, it } from "vitest";
import { toPublicDeviceRecord } from "./device-registry";

describe("toPublicDeviceRecord", () => {
  it("never returns push tokens or private registration fields", () => {
    const result = toPublicDeviceRecord({
      __id: "a".repeat(64),
      token: "private-push-token",
      platform: "android",
      deviceName: "Living room TV",
      status: "ACTIVE",
      updatedAt: "2026-11-17T00:00:00.000Z",
      privateMetadata: "must-not-leak",
    });
    expect(result).toEqual({
      id: "a".repeat(64),
      platform: "android",
      deviceName: "Living room TV",
      status: "ACTIVE",
      updatedAt: "2026-11-17T00:00:00.000Z",
    });
    expect(JSON.stringify(result)).not.toContain("private-push-token");
    expect(JSON.stringify(result)).not.toContain("privateMetadata");
  });

  it("normalizes unknown status to active only for existing legacy records", () => {
    expect(toPublicDeviceRecord({ __id: "b".repeat(64), status: "UNKNOWN" }).status).toBe("ACTIVE");
  });
});
