import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptProviderCredential,
  encryptProviderCredential,
} from "@/lib/server/streaming/provider-credentials";

describe("provider credential encryption", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("encrypts and decrypts a provider key with its versioned keyring", async () => {
    vi.stubEnv("STREAMING_PROVIDER_CREDENTIALS_KEYS_JSON", JSON.stringify({ v1: "A".repeat(43) }));
    vi.stubEnv("STREAMING_PROVIDER_CREDENTIALS_ACTIVE_KEY_VERSION", "v1");
    const encrypted = await encryptProviderCredential("provider-secret-key-123", "channel_123", "example_provider");
    expect(encrypted.ciphertext).not.toContain("provider-secret-key-123");
    await expect(decryptProviderCredential(encrypted, "channel_123", "example_provider"))
      .resolves.toBe("provider-secret-key-123");
  });

  it("rejects a credential encrypted for a different channel", async () => {
    vi.stubEnv("STREAMING_PROVIDER_CREDENTIALS_KEYS_JSON", JSON.stringify({ v1: "A".repeat(43) }));
    vi.stubEnv("STREAMING_PROVIDER_CREDENTIALS_ACTIVE_KEY_VERSION", "v1");
    const encrypted = await encryptProviderCredential("provider-secret-key-123", "channel_123", "example_provider");
    await expect(decryptProviderCredential(encrypted, "channel_456", "example_provider")).rejects.toThrow();
  });

  it("fails closed when the encryption keyring is absent", async () => {
    vi.stubEnv("STREAMING_PROVIDER_CREDENTIALS_KEYS_JSON", "");
    vi.stubEnv("STREAMING_PROVIDER_CREDENTIALS_ACTIVE_KEY_VERSION", "");
    await expect(encryptProviderCredential("provider-secret-key-123", "channel_123", "example_provider")).rejects.toThrow();
  });
});
