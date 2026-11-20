import { afterEach, describe, expect, it } from "vitest";
import { createStepUpToken, requireStepUp } from "@/lib/server/zillionaire-access";

describe("Zillionaire step-up authorization", () => {
  afterEach(() => {
    delete process.env["SESSION_SECRET"];
  });
  it("accepts a valid short-lived token for its exact actor and action", () => {
    process.env["SESSION_SECRET"] = "test-signing-key";
    const grant = createStepUpToken("owner-1", "wallet_adjust");
    const request = new Request("https://local", {
      headers: { "x-zillionaire-step-up": grant.token },
    });
    expect(() => requireStepUp(request, "owner-1", "wallet_adjust")).not.toThrow();
    expect(grant.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
  it("rejects a token for another action", () => {
    process.env["SESSION_SECRET"] = "test-signing-key";
    const grant = createStepUpToken("owner-1", "wallet_adjust");
    const request = new Request("https://local", {
      headers: { "x-zillionaire-step-up": grant.token },
    });
    expect(() => requireStepUp(request, "owner-1", "payment_reversal")).toThrow(/Re-authenticate/);
  });
  it("rejects tampering, wrong actor, and missing grants", () => {
    process.env["SESSION_SECRET"] = "test-signing-key";
    const grant = createStepUpToken("owner-1", "wallet_adjust");
    const tampered = new Request("https://local", {
      headers: { "x-zillionaire-step-up": `${grant.token}x` },
    });
    const wrongActor = new Request("https://local", {
      headers: { "x-zillionaire-step-up": grant.token },
    });
    expect(() => requireStepUp(tampered, "owner-1", "wallet_adjust")).toThrow(/Re-authenticate/);
    expect(() => requireStepUp(wrongActor, "owner-2", "wallet_adjust")).toThrow(/Re-authenticate/);
    expect(() => requireStepUp(new Request("https://local"), "owner-1", "wallet_adjust")).toThrow(
      /Re-authenticate/,
    );
  });
});
