import { describe, expect, it } from "vitest";
import { listAllStorageObjects } from "@/lib/server/storage/listing";

describe("bounded HLS storage listing", () => {
  it("verifies a 6,000-object package with fewer than 30 listing calls", async () => {
    const all = Array.from({ length: 6000 }, (_, index) => ({
      key: `hls/asset/a1/v720/segment_${String(index).padStart(5, "0")}.ts`,
      sizeBytes: 1024 + index,
    }));
    let calls = 0;
    const adapter = {
      async listObjects(prefix: string, cursor: string | null) {
        calls += 1;
        expect(prefix).toBe("hls/asset/a1");
        const offset = cursor ? Number(cursor) : 0;
        const objects = all.slice(offset, offset + 1000);
        const nextOffset = offset + objects.length;
        return { objects, nextCursor: nextOffset < all.length ? String(nextOffset) : null };
      },
    };
    const result = await listAllStorageObjects(adapter, "hls/asset/a1");
    expect(result).toHaveLength(6000);
    expect(calls).toBe(6);
    expect(calls).toBeLessThan(30);
  });

  it("rejects duplicate keys and objects outside the assigned prefix", async () => {
    const duplicate = {
      async listObjects() {
        return {
          objects: [
            { key: "hls/asset/a1/segment.ts", sizeBytes: 5 },
            { key: "hls/asset/a1/segment.ts", sizeBytes: 5 },
          ],
          nextCursor: null,
        };
      },
    };
    await expect(listAllStorageObjects(duplicate, "hls/asset/a1")).rejects.toThrow();
    const outside = {
      async listObjects() {
        return { objects: [{ key: "hls/other/segment.ts", sizeBytes: 5 }], nextCursor: null };
      },
    };
    await expect(listAllStorageObjects(outside, "hls/asset/a1")).rejects.toThrow();
  });
});
