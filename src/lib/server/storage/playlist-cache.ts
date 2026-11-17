export type SharedPlaylistKey = {
  assetId: string;
  filmVersion: string;
  replicaId: string;
  windowStartMs: number;
};

type CacheEntry = { value: string; expiresAt: number };
const playlistCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string>>();
const WINDOW_MS = 30 * 60_000;
const MAX_CACHE_ENTRIES = 2_000;

function safePart(value: string): string {
  return value.length > 160 ? value.slice(0, 160) : value;
}

export function sharedPlaylistWindow(nowMs = Date.now()): number {
  return Math.floor(nowMs / WINDOW_MS) * WINDOW_MS;
}

export function sharedPlaylistCacheKey(input: SharedPlaylistKey): string {
  return [
    safePart(input.assetId),
    safePart(input.filmVersion),
    safePart(input.replicaId),
    String(input.windowStartMs),
  ].join(":");
}

function prune(nowMs: number): void {
  for (const [key, entry] of playlistCache) {
    if (entry.expiresAt <= nowMs) playlistCache.delete(key);
  }
  if (playlistCache.size <= MAX_CACHE_ENTRIES) return;
  const oldest = [...playlistCache.entries()]
    .sort((left, right) => left[1].expiresAt - right[1].expiresAt)
    .slice(0, playlistCache.size - MAX_CACHE_ENTRIES);
  for (const [key] of oldest) playlistCache.delete(key);
}

/**
 * Cache a shared variant playlist by immutable film version, replica and
 * 30-minute time window. A single in-flight generation is shared by requests
 * landing on the same runtime instance.
 */
export async function getOrCreateSharedPlaylist(input: {
  key: SharedPlaylistKey;
  generate: () => Promise<string>;
  nowMs?: number;
  cacheUntilMs?: number;
}): Promise<string> {
  const nowMs = input.nowMs ?? Date.now();
  prune(nowMs);
  const key = sharedPlaylistCacheKey(input.key);
  const cached = playlistCache.get(key);
  if (cached && cached.expiresAt > nowMs) return cached.value;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const generation = input.generate();
  inFlight.set(key, generation);
  try {
    const value = await generation;
    const expiresAt = Math.max(nowMs + 1_000, input.cacheUntilMs ?? input.key.windowStartMs + WINDOW_MS);
    playlistCache.set(key, { value, expiresAt });
    return value;
  } finally {
    if (inFlight.get(key) === generation) inFlight.delete(key);
  }
}

/**
 * Signed segment links must remain valid for a viewer joining late in a
 * shared window. This returns the film remainder plus a safety margin, capped
 * by the signing provider's supported maximum lifetime.
 */
export function sharedPlaylistSignedUrlLifetime(input: {
  nowMs?: number;
  filmDurationSeconds: number;
  windowEndMs: number;
  safetyMarginSeconds?: number;
  maxLifetimeSeconds?: number;
}): number {
  const nowMs = input.nowMs ?? Date.now();
  const duration = Number.isFinite(input.filmDurationSeconds) && input.filmDurationSeconds > 0
    ? Math.ceil(input.filmDurationSeconds) : 0;
  const margin = Number.isFinite(input.safetyMarginSeconds) && (input.safetyMarginSeconds ?? 0) >= 0
    ? Math.ceil(input.safetyMarginSeconds ?? 300) : 300;
  const maxLifetime = input.maxLifetimeSeconds ?? 21_600;
  const windowRemainder = Math.max(0, Math.ceil((input.windowEndMs - nowMs) / 1000));
  const filmRemainder = Math.max(0, duration);
  return Math.max(1, Math.min(maxLifetime, Math.max(windowRemainder, filmRemainder) + margin));
}

/** Test/maintenance hook; does not expose playlist contents. */
export function clearSharedPlaylistCache(): void {
  playlistCache.clear();
  inFlight.clear();
}
