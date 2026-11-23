import { describe, expect, it } from "vitest";
import { readBoundedStorageObjectResponse } from "./transfers";

describe("readBoundedStorageObjectResponse", () => {
  it("reads a standard 206 range response and uses the total object size", async () => {
    const response = new Response(new Uint8Array([0, 1, 2, 3]), {
      status: 206,
      headers: {
        "content-range": "bytes 0-3/4096",
        "content-type": "video/mp4",
      },
    });

    const result = await readBoundedStorageObjectResponse(response);

    expect(result.sizeBytes).toBe(4096);
    expect(Array.from(result.headerBytes)).toEqual([0, 1, 2, 3]);
    expect(result.contentType).toBe("video/mp4");
  });

  it("accepts gateways that ignore Range without downloading the full object", async () => {
    let cancelled = false;
    const bytes = new Uint8Array(8192).map((_, index) => index % 256);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
      },
      cancel() {
        cancelled = true;
      },
    });
    const response = new Response(stream, {
      status: 200,
      headers: {
        "content-length": "987654",
        "content-type": "video/mp4",
      },
    });

    const result = await readBoundedStorageObjectResponse(response);

    expect(result.sizeBytes).toBe(987654);
    expect(result.headerBytes.byteLength).toBe(512);
    expect(Array.from(result.headerBytes.slice(0, 4))).toEqual([0, 1, 2, 3]);
    expect(result.contentType).toBe("video/mp4");
    expect(cancelled).toBe(true);
  });

  it("rejects responses that do not identify the total object size", async () => {
    await expect(
      readBoundedStorageObjectResponse(
        new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
      ),
    ).rejects.toMatchObject({ code: "STORAGE_SIZE_UNAVAILABLE" });
  });

  it("rejects missing objects rather than accepting an error body as media", async () => {
    await expect(
      readBoundedStorageObjectResponse(
        new Response("not found", { status: 404 }),
      ),
    ).rejects.toMatchObject({ code: "UPLOAD_OBJECT_MISSING" });
  });
});
