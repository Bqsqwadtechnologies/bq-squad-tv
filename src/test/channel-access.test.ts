import { describe, expect, it } from "vitest";
import { CHANNEL_ROLE_TEMPLATES, hasChannelPermission } from "@/lib/server/channel-access";

describe("channel permission templates", () => {
  const permissions = [
    "channel.settings", "team.manage", "video.upload", "video.delete",
    "schedule.write", "schedule.publish", "analytics.read", "earnings.read",
    "payout.write", "ads.manage", "chat.moderate", "channel.delete", "ownership.transfer",
  ];

  it("defines a permission decision for every role and permission", () => {
    for (const [role, template] of Object.entries(CHANNEL_ROLE_TEMPLATES)) {
      for (const permission of permissions) {
        expect(typeof hasChannelPermission({ role: role as keyof typeof CHANNEL_ROLE_TEMPLATES, permissions: [...template] }, permission)).toBe("boolean");
      }
    }
  });

  it("keeps owner authority and custom permission sets explicit", () => {
    expect(hasChannelPermission({ role: "owner", permissions: [] }, "payout.write")).toBe(true);
    expect(hasChannelPermission({ role: "analyst", permissions: ["analytics.read"] }, "analytics.read")).toBe(true);
    expect(hasChannelPermission({ role: "analyst", permissions: ["analytics.read"] }, "payout.write")).toBe(false);
  });

  it("does not give worker roles owner-only destructive permissions by default", () => {
    for (const role of ["co-owner", "manager", "scheduler", "uploader", "moderator", "analyst", "finance"] as const) {
      expect(CHANNEL_ROLE_TEMPLATES[role]).not.toContain("channel.delete");
      expect(CHANNEL_ROLE_TEMPLATES[role]).not.toContain("ownership.transfer");
    }
  });
});
