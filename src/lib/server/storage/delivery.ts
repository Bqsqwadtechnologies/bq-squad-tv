import type { StorageProviderType } from "./registry";

/**
 * Direct signed delivery sends media bytes from the storage provider to the
 * player. API proxy remains available as a compatibility fallback.
 * edge_token is deliberately disabled and is not selectable by configuration.
 */
export type DeliveryMode = "direct_signed" | "api_proxy";
type DeliveryModeSetting = DeliveryMode | "edge_token";

export type DeliveryPolicy = {
  mode: DeliveryMode;
  proxyFallback: boolean;
};

export type DeliveryDestination = {
  destinationId: string;
  providerType: StorageProviderType;
  mode?: string | null;
  enabled?: boolean;
};

export function resolveDeliveryPolicy(input: {
  destination: DeliveryDestination;
  configuredMode?: DeliveryModeSetting | null;
  proxyFallback?: boolean;
}): DeliveryPolicy {
  const destinationMode = input.destination.mode;
  const requested =
    input.configuredMode === "direct_signed" || input.configuredMode === "api_proxy"
      ? input.configuredMode
      : destinationMode === "api_proxy" || destinationMode === "direct_signed"
        ? destinationMode
        : "direct_signed";

  // The edge-token mode is intentionally unavailable until an owner enables
  // and implements a separately reviewed paid edge integration.
  const mode: DeliveryMode = requested === "api_proxy" ? "api_proxy" : "direct_signed";
  return {
    mode,
    proxyFallback: input.proxyFallback !== false,
  };
}

export function deliverySupportsDirectSigning(providerType: StorageProviderType): boolean {
  return providerType === "backblaze_b2" || providerType === "lovable_storage";
}

export function chooseDeliveryMode(
  policy: DeliveryPolicy,
  providerType: StorageProviderType,
): DeliveryMode {
  if (policy.mode === "direct_signed" && deliverySupportsDirectSigning(providerType)) {
    return "direct_signed";
  }
  return policy.proxyFallback ? "api_proxy" : "direct_signed";
}
