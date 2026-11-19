import { describe, expect, it } from "vitest";
import { notificationDeliveryStatus } from "@/lib/server/notifications";

describe("notification delivery status", () => {
  it("distinguishes missing devices, successful delivery and partial delivery", () => {
    expect(notificationDeliveryStatus({ sentCount: 0, failedCount: 0, deviceCount: 0 })).toBe(
      "no_devices",
    );
    expect(notificationDeliveryStatus({ sentCount: 2, failedCount: 0, deviceCount: 2 })).toBe(
      "sent",
    );
    expect(notificationDeliveryStatus({ sentCount: 1, failedCount: 1, deviceCount: 2 })).toBe(
      "partial",
    );
    expect(notificationDeliveryStatus({ sentCount: 0, failedCount: 2, deviceCount: 2 })).toBe(
      "failed",
    );
  });

  it("handles empty and edge delivery payloads correctly", () => {
    expect(notificationDeliveryStatus({ sentCount: 10, failedCount: 0, deviceCount: 10 })).toBe("sent");
    expect(notificationDeliveryStatus({ sentCount: 5, failedCount: 5, deviceCount: 10 })).toBe("partial");
  });
});
