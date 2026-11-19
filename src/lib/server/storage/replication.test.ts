import { describe, expect, it } from "vitest";
import type { StorageProviderAdapter } from "./providers";
import { copyReplicaObject, sortReplicaObjects, verifyReplicaListing } from "./replication";

function fakeAdapter(objects: Map<string, Uint8Array>): StorageProviderAdapter {
  return {
    async healthCheck() {
      return { healthy: true };
    },
    async putObject(key, body) {
      objects.set(key, body instanceof Uint8Array ? body : new Uint8Array(body));
    },
    async getObject(key) {
      const body = objects.get(key);
      if (!body) throw new Error("missing");
      return {
        body: Uint8Array.from(body).buffer,
        info: { sizeBytes: body.byteLength, etag: null, contentType: "video/mp2t" },
      };
    },
    async headObject(key) {
      const body = objects.get(key);
      return body ? { sizeBytes: body.byteLength, etag: null, contentType: "video/mp2t" } : null;
    },
    async listObjects(prefix) {
      return {
        objects: [...objects.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, body]) => ({ key, sizeBytes: body.byteLength })),
        nextCursor: null,
      };
    },
    async deleteObject(key) {
      objects.delete(key);
    },
  };
}

describe("storage replica verification", () => {
  it("copies media files before variant playlists and the master playlist last", () => {
    const objects = [
      { key: "hls/a/master.m3u8", sizeBytes: 10 },
      { key: "hls/a/720p/index.m3u8", sizeBytes: 8 },
      { key: "hls/a/720p/seg-001.ts", sizeBytes: 100 },
      { key: "hls/a/480p/seg-001.ts", sizeBytes: 80 },
    ];
    expect(sortReplicaObjects(objects).map((item) => item.key)).toEqual([
      "hls/a/480p/seg-001.ts",
      "hls/a/720p/seg-001.ts",
      "hls/a/720p/index.m3u8",
      "hls/a/master.m3u8",
    ]);
  });

  it("copies one object and verifies the target size before accepting it", async () => {
    const source = fakeAdapter(new Map([["hls/a/seg-001.ts", new Uint8Array([1, 2, 3, 4])]]));
    const target = fakeAdapter(new Map());
    await expect(copyReplicaObject(source, target, "hls/a/seg-001.ts")).resolves.toMatchObject({
      sizeBytes: 4,
    });
    expect(await target.headObject("hls/a/seg-001.ts")).toMatchObject({ sizeBytes: 4 });
  });

  it("verifies exact object names and sizes, not only total bytes", () => {
    const source = [
      { key: "hls/a/seg-1.ts", sizeBytes: 10 },
      { key: "hls/a/master.m3u8", sizeBytes: 5 },
    ];
    expect(verifyReplicaListing(source, source).verified).toBe(true);
    expect(
      verifyReplicaListing(source, [
        { key: "hls/a/seg-1.ts", sizeBytes: 10 },
        { key: "hls/a/master.m3u8", sizeBytes: 4 },
      ]).verified,
    ).toBe(false);
  });
});
