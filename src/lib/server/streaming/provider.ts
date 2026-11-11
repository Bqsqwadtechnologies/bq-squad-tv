export type StreamingDeliveryMode = "external" | "bq_hosted";
export type StreamingProtocol = "hls" | "dash";

export type ProviderPlaybackRequest = {
  contentId: string;
  contentAssetId: string;
  viewerId: string;
  sessionId: string;
  platform: "android" | "web" | "android_tv";
  territory: string;
  expiresInSeconds: number;
};

export type ProviderPlaybackAuthorization = {
  providerId: string;
  protocol: StreamingProtocol;
  playbackUrl: string;
  expiresAt: string;
  drm?: {
    scheme: "widevine" | "playready" | "fairplay";
    licenseUrl: string;
  };
  requestHeaders?: Record<string, string>;
};

export type ProviderHealth = {
  providerId: string;
  healthy: boolean;
  checkedAt: string;
  latencyMs?: number;
  errorCode?: string;
};

export type ProviderUsage = {
  providerId: string;
  contentAssetId: string;
  windowStart: string;
  windowEnd: string;
  deliveredBytes?: number;
  viewerSeconds?: number;
  estimatedCostMinor?: number;
  currency?: string;
};

/**
 * Server-only adapter contract. Implementations must keep provider credentials
 * in the secret store and return only short-lived, viewer-scoped playback data.
 */
export interface StreamingProvider {
  readonly providerId: string;
  authorizePlayback(request: ProviderPlaybackRequest): Promise<ProviderPlaybackAuthorization>;
  revokePlayback(sessionId: string): Promise<void>;
  healthCheck(): Promise<ProviderHealth>;
  getUsage?(contentAssetId: string, windowStart: string, windowEnd: string): Promise<ProviderUsage>;
}

export type ContentAssetDelivery = {
  contentAssetId: string;
  contentId: string;
  deliveryMode: StreamingDeliveryMode;
  providerId: string;
  status: "draft" | "processing" | "ready" | "suspended" | "failed";
};
