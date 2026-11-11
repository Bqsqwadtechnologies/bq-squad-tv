import { describe, expect, it, vi } from "vitest";
import { StreamingProviderRegistry } from "@/lib/server/streaming/registry";
import type { ContentAssetDelivery, StreamingProvider } from "@/lib/server/streaming/provider";

function adapter(providerId: string): StreamingProvider {
  return {
    providerId,
    authorizePlayback: vi.fn(async () => ({
      providerId,
      protocol: "hls" as const,
      playbackUrl: "https://playback.example.test/short-lived",
      expiresAt: "2026-11-11T00:05:00.000Z",
    })),
    revokePlayback: vi.fn(async () => undefined),
    healthCheck: vi.fn(async () => ({
      providerId,
      healthy: true,
      checkedAt: "2026-11-11T00:00:00.000Z",
    })),
  };
}

const asset = (overrides: Partial<ContentAssetDelivery> = {}): ContentAssetDelivery => ({
  contentAssetId: "asset_1",
  contentId: "movie_1",
  deliveryMode: "external",
  providerId: "licensed_provider",
  status: "ready",
  ...overrides,
});

describe("hybrid streaming provider registry", () => {
  it("resolves only the adapter registered for the asset delivery mode", () => {
    const registry = new StreamingProviderRegistry();
    const external = adapter("licensed_provider");
    const hosted = adapter("bq_origin");
    registry.register("external", external);
    registry.register("bq_hosted", hosted);

    expect(registry.resolve(asset())).toBe(external);
    expect(registry.resolve(asset({
      deliveryMode: "bq_hosted",
      providerId: "bq_origin",
    }))).toBe(hosted);
    expect(registry.list()).toEqual([
      { providerId: "bq_origin", deliveryMode: "bq_hosted" },
      { providerId: "licensed_provider", deliveryMode: "external" },
    ]);
  });

  it("fails closed when an asset is not ready or its provider is unconfigured", () => {
    const registry = new StreamingProviderRegistry();
    expect(() => registry.resolve(asset())).toThrow(/not configured/);
    expect(() => registry.resolve(asset({ status: "processing" }))).toThrow(/not ready/);
  });

  it("does not allow duplicate provider registrations for the same mode", () => {
    const registry = new StreamingProviderRegistry();
    registry.register("external", adapter("licensed_provider"));
    expect(() => registry.register("external", adapter("licensed_provider"))).toThrow(/already registered/);
  });
});
