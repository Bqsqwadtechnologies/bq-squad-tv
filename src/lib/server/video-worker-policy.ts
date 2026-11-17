export const MAX_VIDEO_WORKER_ATTEMPTS = 6;

export function videoWorkerLeaseExpiry(now = Date.now(), leaseMinutes = 10): string {
  const minutes = Number.isFinite(leaseMinutes) ? Math.min(30, Math.max(2, Math.floor(leaseMinutes))) : 10;
  return new Date(now + minutes * 60_000).toISOString();
}

export function videoWorkerRetry(attempts: number, now = Date.now()): {
  terminal: boolean;
  nextAttemptAt: string | null;
  delayMinutes: number | null;
} {
  const attempt = Number.isSafeInteger(attempts) ? Math.max(1, attempts) : 1;
  if (attempt >= MAX_VIDEO_WORKER_ATTEMPTS) {
    return { terminal: true, nextAttemptAt: null, delayMinutes: null };
  }
  const delayMinutes = 2 ** (attempt - 1);
  return {
    terminal: false,
    delayMinutes,
    nextAttemptAt: new Date(now + delayMinutes * 60_000).toISOString(),
  };
}

export function videoWorkerRetryIsDue(nextAttemptAt: unknown, now = Date.now()): boolean {
  if (typeof nextAttemptAt !== "string") return true;
  const timestamp = Date.parse(nextAttemptAt);
  return !Number.isFinite(timestamp) || timestamp <= now;
}

export function isVideoWorkerLeaseActive(leaseExpiresAt: unknown, now = Date.now()): boolean {
  if (typeof leaseExpiresAt !== "string") return false;
  const expiry = Date.parse(leaseExpiresAt);
  return Number.isFinite(expiry) && expiry > now;
}
