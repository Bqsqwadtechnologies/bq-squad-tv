import { beforeAll, describe, expect, it } from "vitest";
import {
  decryptStreamingSourceUrl,
  encryptStreamingSourceUrl,
} from "@/lib/server/streaming/source-encryption";

const key = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is required for streaming source encryption tests.");
  }
});

describe("streaming source URL encryption", () => {
  it("encrypts and decrypts an HTTPS URL for the same content asset", async () => {
    const envelope = await encryptStreamingSourceUrl(
      "https://media.example.test/manifest.m3u8?token=private",
      "asset_123",
      "v1",
      key,
    );
    expect(envelope.algorithm).toBe("A256GCM");
    expect(envelope.ciphertext).not.toContain("media.example.test");
    await expect(decryptStreamingSourceUrl(envelope, "asset_123", key))
      .resolves.toBe("https://media.example.test/manifest.m3u8?token=private");
  });

  it("uses a fresh nonce for every encryption", async () => {
    const [first, second] = await Promise.all([
      encryptStreamingSourceUrl("https://media.example.test/a.m3u8", "asset_123", "v1", key),
      encryptStreamingSourceUrl("https://media.example.test/a.m3u8", "asset_123", "v1", key),
    ]);
    expect(first.nonce).not.toBe(second.nonce);
  });

  it("binds ciphertext to its content asset and key version", async () => {
    const envelope = await encryptStreamingSourceUrl("https://media.example.test/a.m3u8", "asset_123", "v1", key);
    await expect(decryptStreamingSourceUrl(envelope, "asset_other", key)).rejects.toThrow();
  });

  it("rejects non-HTTPS URLs and embedded credentials", async () => {
    await expect(encryptStreamingSourceUrl("http://media.example.test/a.m3u8", "asset_123", "v1", key)).rejects.toThrow();
    await expect(encryptStreamingSourceUrl("https://user:pass@media.example.test/a.m3u8", "asset_123", "v1", key)).rejects.toThrow();
  });

  it("rejects a key that is not exactly 256 bits", async () => {
    await expect(encryptStreamingSourceUrl("https://media.example.test/a.m3u8", "asset_123", "v1", "AQID")).rejects.toThrow();
  });
});
