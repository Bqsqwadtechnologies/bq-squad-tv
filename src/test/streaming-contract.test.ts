import { describe, expect, it, vi } from "vitest";
import {
  StreamingProviderRegistry,
  type StreamingProviderAdapter,
} from "@/lib/server/streaming/contract";

function fakeAdapter(providerId: string, deliveryMode: "external" | "bq_hosted"): StreamingProviderAdapter {
  return {
    providerId,
    deliveryMode,
    authorize: vi.fn(async () => ({
      providerAuthorizationId: "test-grant",
      playbackUrl: "https://playback.example.test/short-lived",
      expiresAt: "2026-11-11T00:05:00.000Z",
    })),
    revoke: vi.fn(async () => undefined),
    healthCheck: vi.fn(async () => ({ healthy: true, checkedAt: "2026-11-11T00:00:00.000Z" })),
  };
}

describe("hybrid streaming provider contract", () => {
  it("resolves adapters only for their configured delivery mode", () => {
    const registry = new StreamingProviderRegistry();
    const external = fakeAdapter("licensed-provider", "external");
    const hosted = fakeAdapter("bq-origin", "bq_hosted");
    registry.register(external);
    registry.register(hosted);
    expect(registry.get("licensed-provider", "external")).toBe(external);
    expect(registry.get("licensed-provider", "bq_hosted")).toBeNull();
    expect(registry.get("bq-origin", "bq_hosted")).toBe(hosted);
    expect(registry.listProviderIds()).toEqual(["bq-origin", "licensed-provider"]);
  });

  it("rejects invalid and duplicate provider identifiers", () => {
    const registry = new StreamingProviderRegistry();
    registry.register(fakeAdapter("licensed-provider", "external"));
    expect(() => registry.register(fakeAdapter("licensed-provider", "external"))).toThrow(/already registered/);
    expect(() => registry.register(fakeAdapter("UPPER CASE", "external"))).toThrow(/id is invalid/);
  });
});
