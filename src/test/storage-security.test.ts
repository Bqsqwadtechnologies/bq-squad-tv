import { describe, expect, it } from "vitest";
import {
  assertMediaMatchesExtension, detectMediaKind, isSafeStoragePath, redactSensitiveText,
  signPlaybackToken, verifyPlaybackToken,
} from "@/lib/server/storage/security";
import { resolveHlsReference, rewriteHlsPlaylist } from "@/lib/server/streaming/hls-playlist";

const secret = "test-only-secret-with-at-least-thirty-two-bytes";

describe("storage path and media validation", () => {
  it("rejects traversal, encoded separators and malformed paths", () => {
    for (const path of ["../secret.mp4", "a/../../secret", "a/%2fsecret", "a\\secret", "a//b", "/absolute"]) {
      expect(isSafeStoragePath(path)).toBe(false);
    }
    expect(isSafeStoragePath("producers/u1/channel1/content1/video.mp4")).toBe(true);
    expect(isSafeStoragePath("a/%252fsecret")).toBe(false);
  });

  it("detects common container signatures and rejects extension spoofing", () => {
    const mp4 = new Uint8Array(12);
    mp4.set(new TextEncoder().encode("....ftypisom"));
    expect(detectMediaKind(mp4)).toBe("mp4");
    expect(assertMediaMatchesExtension(mp4, "clip.mp4")).toBe("mp4");
    expect(() => assertMediaMatchesExtension(mp4, "clip.webm")).toThrow();
    expect(detectMediaKind(new TextEncoder().encode("#EXTM3U\n#EXT-X-VERSION:3"))).toBe("hls");
    expect(detectMediaKind(new TextEncoder().encode("WEBVTT\n"))).toBe("vtt");
  });
});

describe("session-bound playback tokens", () => {
  it("verifies session, user, path and expiry", async () => {
    const claims = { sid: "session1", uid: "user1", path: "streaming/movie/master.m3u8", iat: 1000, exp: 1100 };
    const token = await signPlaybackToken(claims, secret);
    await expect(verifyPlaybackToken(token, { sid: "session1", uid: "user1", path: claims.path }, secret, 1050)).resolves.toMatchObject(claims);
    await expect(verifyPlaybackToken(token, { sid: "session2", uid: "user1", path: claims.path }, secret, 1050)).rejects.toThrow();
    await expect(verifyPlaybackToken(token, { sid: "session1", uid: "user1", path: "streaming/other.m3u8" }, secret, 1050)).rejects.toThrow();
    await expect(verifyPlaybackToken(token, { sid: "session1", uid: "user1", path: claims.path }, secret, 1100)).rejects.toThrow();
  });

  it("rejects token tampering", async () => {
    const claims = { sid: "s1", uid: "u1", path: "streaming/a.m3u8", iat: 100, exp: 200 };
    const token = await signPlaybackToken(claims, secret);
    await expect(verifyPlaybackToken(token + "x", { sid: "s1", uid: "u1", path: claims.path }, secret, 150)).rejects.toThrow();
  });
});

describe("HLS resource-tree rewriting", () => {
  it("rewrites nested playlists, segments and URI attributes", () => {
    const input = "#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI=\"audio/en.m3u8\"\n#EXT-X-KEY:METHOD=AES-128,URI=\"keys/key.bin\"\nvariant/low.m3u8\n";
    const output = rewriteHlsPlaylist(input, "streaming/movie/master.m3u8", path => "/proxy/" + path);
    expect(output).toContain('URI="/proxy/streaming/movie/audio/en.m3u8"');
    expect(output).toContain('URI="/proxy/streaming/movie/keys/key.bin"');
    expect(output).toContain("/proxy/streaming/movie/variant/low.m3u8");
  });

  it("blocks absolute URLs and path escape", () => {
    expect(() => resolveHlsReference("streaming/a/master.m3u8", "../../../outside.ts")).toThrow();
    expect(() => resolveHlsReference("streaming/a/master.m3u8", "https://evil.example/x.ts")).toThrow();
  });
});

describe("sensitive log redaction", () => {
  it("redacts tokens, bearer credentials and signed storage URLs", () => {
    const value = "token=abc123 Bearer eyJhbGciOiJIUzI1NiJ9 https://x.test/storage/v1/object/sign/bucket/file?token=secret";
    const redacted = redactSensitiveText(value);
    expect(redacted).not.toContain("abc123");
    expect(redacted).not.toContain("secret");
    expect(redacted).not.toContain("eyJhbGci");
  });
});
