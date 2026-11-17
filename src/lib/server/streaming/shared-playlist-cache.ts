type CacheEntry = {
  expiresAtMs: number;
  value: Promise<Map<string, string>>;
};

const sharedSignedObjectCache = new Map<string, CacheEntry>();
const MAX_ENTRIES = 2_000;

/** 30-minute shared playlist window, with signed objects retained until expiry. */
export function sharedPlaylistWindow(nowMs = Date.now()): { windowStartMs: number; windowEndMs: number } {
  const windowStartMs = Math.floor(nowMs / 1_800_000) * 1_800_000;
  return { windowStartMs, windowEndMs: windowStartMs + 1_800_000 };
}

/**
 * Shares signed segment URLs across sessions for the same film version,
 * selected replica, playlist and half-hour window. Session-specific playlist
 * route tokens are still rendered separately by the caller.
 */
export async function getSharedSignedObjects(input: {
  key: string;
  expiresAtMs: number;
  nowMs?: number;
  create: () => Promise<Map<string, string>>;
}): Promise<Map<string, string>> {
  const now = input.nowMs ?? Date.now();
  if (!input.key || input.key.length > 512 || !Number.isFinite(input.expiresAtMs) ||
      input.expiresAtMs <= now) {
    throw new Error("Shared playback cache key or expiry is invalid.");
  }
  for (const [key, entry] of sharedSignedObjectCache) {
    if (entry.expiresAtMs <= now) sharedSignedObjectCache.delete(key);
  }
  const existing = sharedSignedObjectCache.get(input.key);
  if (existing && existing.expiresAtMs > now) return existing.value;

  const value = input.create();
  sharedSignedObjectCache.set(input.key, { expiresAtMs: input.expiresAtMs, value });
  while (sharedSignedObjectCache.size > MAX_ENTRIES) {
    const oldest = sharedSignedObjectCache.keys().next().value;
    if (typeof oldest !== "string") break;
    sharedSignedObjectCache.delete(oldest);
  }
  try {
    return await value;
  } catch (error) {
    if (sharedSignedObjectCache.get(input.key)?.value === value) sharedSignedObjectCache.delete(input.key);
    throw error;
  }
}

export function clearSharedPlaylistCacheForTests(): void {
  sharedSignedObjectCache.clear();
}
