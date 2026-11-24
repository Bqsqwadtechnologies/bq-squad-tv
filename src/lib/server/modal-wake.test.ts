import { afterEach, describe, expect, it, vi } from "vitest";
import { wakeModalVideoWorker } from "@/lib/server/modal-wake";
import type { Firestore } from "@/lib/server/firebase-admin";

const originalUrl = process.env["MODAL_WAKE_URL"];
const originalSecret = process.env["MODAL_WAKE_SECRET"];

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalUrl === undefined) delete process.env["MODAL_WAKE_URL"];
  else process.env["MODAL_WAKE_URL"] = originalUrl;
  if (originalSecret === undefined) delete process.env["MODAL_WAKE_SECRET"];
  else process.env["MODAL_WAKE_SECRET"] = originalSecret;
});

describe("Modal video worker wake guard", () => {
  it("does not call Modal when there is no eligible queued job", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const fs = { query: vi.fn().mockResolvedValue([]) } as unknown as Firestore;

    await wakeModalVideoWorker(fs);

    expect(fs.query).toHaveBeenCalledWith("videoTranscodeJobs", expect.objectContaining({
      filters: [{ field: "status", op: "EQUAL", value: "queued" }],
    }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("wakes Modal only when a queued job is ready to claim", async () => {
    process.env["MODAL_WAKE_URL"] = "https://worker.example.com/wake";
    process.env["MODAL_WAKE_SECRET"] = "a".repeat(40);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const fs = {
      query: vi.fn().mockResolvedValue([{ __id: "asset_1", nextAttemptAt: null }]),
    } as unknown as Firestore;

    await wakeModalVideoWorker(fs);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBeInstanceOf(URL);
  });

  it("does not wake Modal before a retry backoff expires", async () => {
    process.env["MODAL_WAKE_URL"] = "https://worker.example.com/wake";
    process.env["MODAL_WAKE_SECRET"] = "a".repeat(40);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const fs = {
      query: vi.fn().mockResolvedValue([{ __id: "asset_1", nextAttemptAt: new Date(Date.now() + 60_000).toISOString() }]),
    } as unknown as Firestore;

    await wakeModalVideoWorker(fs);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
