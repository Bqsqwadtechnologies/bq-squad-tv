import { ApiError } from "../firebase-admin";
import type {
  ContentAssetDelivery,
  StreamingDeliveryMode,
  StreamingProvider,
} from "./provider";

/**
 * Runtime registry for configured provider adapters. A content asset can only
 * resolve to an adapter registered for its explicit delivery mode.
 */
export class StreamingProviderRegistry {
  private readonly adapters = new Map<string, {
    deliveryMode: StreamingDeliveryMode;
    adapter: StreamingProvider;
  }>();

  register(deliveryMode: StreamingDeliveryMode, adapter: StreamingProvider): void {
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(adapter.providerId)) {
      throw new ApiError(500, "STREAM_PROVIDER_ID_INVALID", "The configured streaming provider id is invalid.");
    }
    const key = this.key(adapter.providerId, deliveryMode);
    if (this.adapters.has(key)) {
      throw new ApiError(500, "STREAM_PROVIDER_DUPLICATE", "The streaming provider is already registered for this delivery mode.");
    }
    this.adapters.set(key, { deliveryMode, adapter });
  }

  resolve(asset: ContentAssetDelivery): StreamingProvider {
    if (asset.status !== "ready") {
      throw new ApiError(409, "CONTENT_ASSET_NOT_READY", "The content asset is not ready for playback.");
    }
    if (asset.deliveryMode !== "external" && asset.deliveryMode !== "bq_hosted") {
      throw new ApiError(503, "STREAM_DELIVERY_MODE_INVALID", "The content asset has an unsupported delivery mode.");
    }
    const entry = this.adapters.get(this.key(asset.providerId, asset.deliveryMode));
    if (!entry) {
      throw new ApiError(503, "STREAM_PROVIDER_NOT_CONFIGURED", "The required streaming provider is not configured.");
    }
    return entry.adapter;
  }

  list(): Array<{ providerId: string; deliveryMode: StreamingDeliveryMode }> {
    return [...this.adapters.entries()]
      .map(([key, value]) => ({
        providerId: key.slice(key.indexOf(":") + 1),
        deliveryMode: value.deliveryMode,
      }))
      .sort((a, b) => a.deliveryMode.localeCompare(b.deliveryMode) || a.providerId.localeCompare(b.providerId));
  }

  private key(providerId: string, deliveryMode: StreamingDeliveryMode): string {
    return deliveryMode + ":" + providerId;
  }
}
