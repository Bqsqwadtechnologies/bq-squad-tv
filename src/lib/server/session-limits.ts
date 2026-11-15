export const ACTIVE_SESSION_LEASE_MS = 60_000;

export function liveSessionLeases(value: unknown, nowMs: number): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, expiresAt]) =>
      typeof expiresAt === "number" && Number.isSafeInteger(expiresAt) && expiresAt > nowMs,
    ),
  );
}

export function acquireSessionLease(
  value: unknown,
  sessionId: string,
  nowMs: number,
  maxConcurrentSessions: number,
): Record<string, number> | null {
  const sessions = liveSessionLeases(value, nowMs);
  if (Object.keys(sessions).length >= maxConcurrentSessions) return null;
  sessions[sessionId] = nowMs + ACTIVE_SESSION_LEASE_MS;
  return sessions;
}

export function renewSessionLease(
  value: unknown,
  sessionId: string,
  nowMs: number,
): Record<string, number> {
  const sessions = liveSessionLeases(value, nowMs);
  sessions[sessionId] = nowMs + ACTIVE_SESSION_LEASE_MS;
  return sessions;
}

export function releaseSessionLease(
  value: unknown,
  sessionId: string,
  nowMs: number,
): Record<string, number> {
  const sessions = liveSessionLeases(value, nowMs);
  delete sessions[sessionId];
  return sessions;
}
