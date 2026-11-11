import type { ContentDeliveryMode } from "../content-access";

export type PlaybackAuthorizationRequest = {
  sessionId: string;
  contentAssetId: string;
  territory: string;
  platform: "android" | "web";
  expiresAt: string;
};

export type PlaybackGrant = {
  providerAuthorizationId: string;
  playbackUrl: string;
  expiresAt: string;
  /** Optional DRM configuration is provider-issued and safe for the client. */
  drm?: {
    scheme: "widevine" | "fairplay" | "playready";
    licenseUrl: string;
    requestHeaders?: Record<string, string>;
  };
};

export type ProviderHealth = {
  healthy: boolean;
  checkedAt: string;
  code?: string;
};

export interface StreamingProviderAdapter {
  readonly providerId: string;
  readonly deliveryMode: ContentDeliveryMode;
  authorize(request: PlaybackAuthorizationRequest): Promise<PlaybackGrant>;
  revoke(providerAuthorizationId: string): Promise<void>;
  healthCheck(): Promise<ProviderHealth>;
}

/**
 * Server-only registry. Provider credentials and source URLs belong inside
 * concrete adapter implementations and must never be returned by this API.
 */
export class StreamingProviderRegistry {
  private readonly adapters = new Map<string, StreamingProviderAdapter>();

  register(adapter: StreamingProviderAdapter): void {
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(adapter.providerId)) {
      throw new Error("Streaming provider id is invalid.");
    }
    if (this.adapters.has(adapter.providerId)) {
      throw new Error("Streaming provider is already registered.");
    }
    this.adapters.set(adapter.providerId, adapter);
  }

  get(providerId: string, deliveryMode: ContentDeliveryMode): StreamingProviderAdapter | null {
    const adapter = this.adapters.get(providerId);
    return adapter?.deliveryMode === deliveryMode ? adapter : null;
  }

  listProviderIds(): string[] {
    return [...this.adapters.keys()].sort();
  }
}
