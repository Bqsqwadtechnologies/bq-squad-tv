import { describe, expect, it } from "vitest";
import { rewritePlaylistWithSignedObjects } from "./direct-playlist";

describe("rewritePlaylistWithSignedObjects", () => {
  it("signs thousands of segment paths in one adapter call and rewrites all references", async () => {
    const playlist = [
      "#EXTM3U",
      ...Array.from(
        { length: 3000 },
        (_, index) => "#EXTINF:4,\nsegment_" + String(index).padStart(5, "0") + ".ts",
      ),
    ].join("\n");
    let calls = 0;
    let received = 0;
    const result = await rewritePlaylistWithSignedObjects({
      playlist,
      playlistPath: "hls/asset_1/a1/index.m3u8",
      signObjects: async (paths) => {
        calls++;
        received = paths.length;
        return new Map(paths.map((path) => [path, "https://storage.example/" + path]));
      },
    });
    expect(calls).toBe(1);
    expect(received).toBe(3000);
    expect(result.objectPaths).toHaveLength(3000);
    expect(result.playlist.match(/https:\/\/storage\.example\//g)).toHaveLength(3000);
  });

  it("deduplicates repeated references and preserves non-storage data URIs", async () => {
    const playlist =
      '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="data:text/plain;base64,AA=="\nsegment_00001.ts\nsegment_00001.ts';
    let received: string[] = [];
    const result = await rewritePlaylistWithSignedObjects({
      playlist,
      playlistPath: "hls/asset_1/a1/index.m3u8",
      signObjects: async (paths) => {
        received = paths;
        return new Map(paths.map((path) => [path, "https://storage.example/" + path]));
      },
    });
    expect(received).toHaveLength(1);
    expect(result.playlist).toContain('URI="data:text/plain;base64,AA=="');
    expect(result.playlist.match(/https:\/\/storage\.example\//g)).toHaveLength(2);
  });

  it("keeps nested playlists on the session-checked API route", async () => {
    const result = await rewritePlaylistWithSignedObjects({
      playlist: "#EXTM3U\nvariant_720.m3u8\nsegment_00001.ts",
      playlistPath: "hls/asset_1/a1/master.m3u8",
      signObjects: async (paths) =>
        new Map(paths.map((path) => [path, "https://storage.example/" + path])),
      playlistUrl: async (path) => "/api/public/v1/streaming/hls/" + path + "?token=signed",
    });
    expect(result.objectPaths).toEqual(["hls/asset_1/a1/segment_00001.ts"]);
    expect(result.playlist).toContain(
      "/api/public/v1/streaming/hls/hls/asset_1/a1/variant_720.m3u8?token=signed",
    );
    expect(result.playlist).toContain("https://storage.example/hls/asset_1/a1/segment_00001.ts");
  });

  it("rejects source-file and unsafe path references before signing", async () => {
    let called = false;
    await expect(
      rewritePlaylistWithSignedObjects({
        playlist: "#EXTM3U\n../../source.mp4",
        playlistPath: "hls/asset_1/a1/index.m3u8",
        signObjects: async () => {
          called = true;
          return new Map();
        },
      }),
    ).rejects.toThrow();
    expect(called).toBe(false);
  });

  it("routes encrypted key references through the session key endpoint", async () => {
    const result = await rewritePlaylistWithSignedObjects({
      playlist: '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="/api/public/v1/streaming/key/asset_1"',
      playlistPath: "hls/asset_1/a1/index.m3u8",
      signObjects: async (paths) =>
        new Map(paths.map((path) => [path, "https://storage.example/" + path])),
      keyUrl: async (id) => "/api/public/v1/streaming/key/" + id + "?sid=session&token=signed",
    });
    expect(result.playlist).toContain(
      "/api/public/v1/streaming/key/asset_1?sid=session&token=signed",
    );
  });
});
