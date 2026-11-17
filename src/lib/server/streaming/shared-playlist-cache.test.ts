import { afterEach, describe, expect, it } from "vitest";
import { clearSharedPlaylistCacheForTests, getSharedSignedObjects, sharedPlaylistWindow } from "./shared-playlist-cache";

afterEach(() => clearSharedPlaylistCacheForTests());

describe("shared signed playlist cache", () => {
  it("shares signed object links for viewers in the same film replica window", async () => {
    const window = sharedPlaylistWindow(1_900_000);
    let generated = 0;
    const create = async () => {
      generated++;
      return new Map([["segment_00001.ts", "https://storage.example/signed"]]);
    };
    const key = "asset-v4:replica-b:index:" + window.windowStartMs;
    const first = await getSharedSignedObjects({ key, expiresAtMs: window.windowEndMs + 21_600_000, nowMs: 1_900_000, create });
    const second = await getSharedSignedObjects({ key, expiresAtMs: window.windowEndMs + 21_600_000, nowMs: 2_000_000, create });
    expect(first).toEqual(second);
    expect(generated).toBe(1);
  });

  it("retains late-window links through the signed expiry margin", async () => {
    const window = sharedPlaylistWindow(1_900_000);
    const expiry = window.windowEndMs + 21_600_000;
    let generated = 0;
    const result = await getSharedSignedObjects({
      key: "late-joiner",
      expiresAtMs: expiry,
      nowMs: window.windowEndMs - 1,
      create: async () => { generated++; return new Map([["segment_00001.ts", "https://storage.example/late"]]); },
    });
    expect(result.get("segment_00001.ts")).toContain("late");
    expect(expiry).toBeGreaterThan(window.windowEndMs);
    expect(generated).toBe(1);
  });

  it("regenerates after a window's signed links expire", async () => {
    let generated = 0;
    const create = async () => new Map([["segment_00001.ts", "https://storage.example/" + ++generated]]);
    await getSharedSignedObjects({ key: "expired-window", expiresAtMs: 100, nowMs: 1, create });
    const next = await getSharedSignedObjects({ key: "expired-window", expiresAtMs: 300, nowMs: 101, create });
    expect(next.get("segment_00001.ts")).toBe("https://storage.example/2");
    expect(generated).toBe(2);
  });
});
