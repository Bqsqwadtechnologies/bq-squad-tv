import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROUTE_RATE_LIMITS,
  scoreChatSpam,
} from "./abuse-protection";

describe("Abuse and Rate Limit Protection", () => {
  describe("Default Route Rate Limits", () => {
    it("defines secure default limits for critical authentication, payment, and media routes", () => {
      expect(DEFAULT_ROUTE_RATE_LIMITS["auth_signin"]).toBeDefined();
      expect(DEFAULT_ROUTE_RATE_LIMITS["auth_signin"]?.maxRequests).toBeLessThanOrEqual(10);
      expect(DEFAULT_ROUTE_RATE_LIMITS["wallet_topup"]).toBeDefined();
      expect(DEFAULT_ROUTE_RATE_LIMITS["wallet_topup"]?.maxRequests).toBeLessThanOrEqual(15);
      expect(DEFAULT_ROUTE_RATE_LIMITS["live_chat"]).toBeDefined();
      expect(DEFAULT_ROUTE_RATE_LIMITS["stream_grant"]).toBeDefined();
      expect(DEFAULT_ROUTE_RATE_LIMITS["video_upload"]).toBeDefined();
    });

    it("enforces positive windows and request allowances across all default route configs", () => {
      for (const [route, config] of Object.entries(DEFAULT_ROUTE_RATE_LIMITS)) {
        expect(config.maxRequests, `Route ${route} maxRequests`).toBeGreaterThan(0);
        expect(config.windowSeconds, `Route ${route} windowSeconds`).toBeGreaterThan(0);
        expect(config.description, `Route ${route} description`).toBeTruthy();
      }
    });
  });

  describe("Chat Spam Scoring Engine", () => {
    it("evaluates a standard conversational message as non-spam", () => {
      const result = scoreChatSpam("Loving this live broadcast! Great picture quality.");
      expect(result.isSpam).toBe(false);
      expect(result.isSevere).toBe(false);
      expect(result.spamScore).toBeLessThan(40);
    });

    it("detects rapid message bursts within 1200ms", () => {
      const now = 1700000000000;
      const result = scoreChatSpam("First message", {
        lastMessageTimeMs: now - 500,
        nowMs: now,
      });
      expect(result.reasons).toContain("BURST_SPEED");
      expect(result.spamScore).toBeGreaterThanOrEqual(30);
    });

    it("detects exact duplicate messages in recent channel history", () => {
      const result = scoreChatSpam("Subscribe to my page now!", {
        recentMessages: ["Hello", "Subscribe to my page now!"],
      });
      expect(result.reasons).toContain("DUPLICATE_MESSAGE");
      expect(result.isSpam).toBe(true);
    });

    it("flags aggressive link posting and repeated scam patterns", () => {
      const result = scoreChatSpam("CLAIM FREE TOKENS NOW http://free-crypto-giveaway.xyz/claim");
      expect(result.isSpam).toBe(true);
      expect(result.reasons.some((r) => r.includes("LINK") || r.includes("SPAM") || r.includes("CAPS"))).toBe(true);
    });

    it("flags excessive character elongation and all-caps yelling", () => {
      const result = scoreChatSpam("WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW");
      expect(result.spamScore).toBeGreaterThan(30);
    });
  });
});
