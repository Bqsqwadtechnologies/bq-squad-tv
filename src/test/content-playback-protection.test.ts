import { describe, expect, it } from "vitest";
import { signPlaybackToken, verifyPlaybackToken } from "../lib/server/storage/security";
import { isAllowedStreamingOrigin } from "../lib/server/streaming/forensics";

describe("Content and playback protection (Batch 7)", () => {
  const secret = "test-streaming-hmac-secret-min-32-bytes-long!";

  it("signs and verifies tokens bound to user, device and time", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signPlaybackToken(
      {
        sid: "session_123",
        uid: "user_456",
        path: "assets/video_1/master.m3u8",
        iat: now,
        exp: now + 300,
        deviceId: "device_789",
      },
      secret,
    );

    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(2);

    // Verifies with matching expected claims
    const verified = await verifyPlaybackToken(
      token,
      {
        sid: "session_123",
        uid: "user_456",
        path: "assets/video_1/master.m3u8",
        deviceId: "device_789",
      },
      secret,
      now,
    );

    expect(verified.sid).toBe("session_123");
    expect(verified.uid).toBe("user_456");
    expect(verified.deviceId).toBe("device_789");
  });

  it("rejects token when deviceId does not match expected device", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signPlaybackToken(
      {
        sid: "session_123",
        uid: "user_456",
        path: "assets/video_1/master.m3u8",
        iat: now,
        exp: now + 300,
        deviceId: "device_original",
      },
      secret,
    );

    await expect(
      verifyPlaybackToken(
        token,
        {
          sid: "session_123",
          uid: "user_456",
          path: "assets/video_1/master.m3u8",
          deviceId: "device_different",
        },
        secret,
        now,
      ),
    ).rejects.toThrow();
  });

  it("enforces hotlink protection origins strictly", () => {
    expect(isAllowedStreamingOrigin(null)).toBe(true);
    expect(isAllowedStreamingOrigin("https://bqsqwad.tv/watch")).toBe(true);
    expect(isAllowedStreamingOrigin("https://app.bqsqwad.tv/channels/ch1")).toBe(true);
    expect(isAllowedStreamingOrigin("http://localhost:5173/")).toBe(true);
    expect(isAllowedStreamingOrigin("android-app://com.bqsqwad.tv")).toBe(true);

    // Reject pirate / unauthorized streaming sites
    expect(isAllowedStreamingOrigin("https://pirate-streams.com/embed")).toBe(false);
    expect(isAllowedStreamingOrigin("https://evil-restreamer.org")).toBe(false);
  });
});
