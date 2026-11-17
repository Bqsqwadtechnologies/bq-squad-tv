import { describe, expect, it } from "vitest";
import {
  MAX_VIDEO_WORKER_ATTEMPTS,
  videoWorkerLeaseExpiry,
  isVideoWorkerLeaseActive,
  videoWorkerRetry,
  videoWorkerRetryIsDue,
} from "@/lib/server/video-worker-policy";

describe("video worker lease and retry policy", () => {
  it("uses a ten-minute default lease and clamps configured leases", () => {
    const now = Date.UTC(2026, 0, 1);
    expect(Date.parse(videoWorkerLeaseExpiry(now)) - now).toBe(10 * 60_000);
    expect(Date.parse(videoWorkerLeaseExpiry(now, 60)) - now).toBe(30 * 60_000);
    expect(Date.parse(videoWorkerLeaseExpiry(now, 1)) - now).toBe(2 * 60_000);
  });

  it("rejects a stale worker at the exact lease expiry boundary", () => {
    const now = Date.UTC(2026, 0, 1);
    const expiry = videoWorkerLeaseExpiry(now);
    expect(isVideoWorkerLeaseActive(expiry, now + 10 * 60_000 - 1)).toBe(true);
    expect(isVideoWorkerLeaseActive(expiry, now + 10 * 60_000)).toBe(false);
    expect(isVideoWorkerLeaseActive(null, now)).toBe(false);
  });

  it("schedules exponential retry delays and then reaches a terminal state", () => {
    const now = Date.UTC(2026, 0, 1);
    expect([1, 2, 3, 4, 5].map(attempt => videoWorkerRetry(attempt, now).delayMinutes))
      .toEqual([1, 2, 4, 8, 16]);
    expect(videoWorkerRetry(MAX_VIDEO_WORKER_ATTEMPTS, now).terminal).toBe(true);
  });

  it("does not claim a job before its next retry time", () => {
    const now = Date.UTC(2026, 0, 1);
    const retry = videoWorkerRetry(1, now);
    expect(videoWorkerRetryIsDue(retry.nextAttemptAt, now)).toBe(false);
    expect(videoWorkerRetryIsDue(retry.nextAttemptAt, now + 60_000)).toBe(true);
    expect(videoWorkerRetryIsDue(null, now)).toBe(true);
  });
});
