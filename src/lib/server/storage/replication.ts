import { ApiError } from "../firebase-admin";
import type { StorageProviderAdapter, StorageObjectInfo } from "./providers";

export type ReplicaCopyPhase = "files" | "playlists" | "master";

export function replicaCopyPhase(key: string): ReplicaCopyPhase {
  const name = key.split("/").pop()?.toLowerCase() ?? "";
  if (name === "master.m3u8") return "master";
  if (name.endsWith(".m3u8")) return "playlists";
  return "files";
}

export function sortReplicaObjects(
  objects: Array<{ key: string; sizeBytes: number }>,
): Array<{ key: string; sizeBytes: number }> {
  return [...objects].sort((left, right) => {
    const phaseOrder: Record<ReplicaCopyPhase, number> = { files: 0, playlists: 1, master: 2 };
    return phaseOrder[replicaCopyPhase(left.key)] - phaseOrder[replicaCopyPhase(right.key)] ||
      left.key.localeCompare(right.key);
  });
}

export async function copyReplicaObject(
  source: StorageProviderAdapter,
  target: StorageProviderAdapter,
  key: string,
  targetKey = key,
): Promise<StorageObjectInfo> {
  const original = await source.getObject(key);
  if (!Number.isSafeInteger(original.info.sizeBytes) || original.info.sizeBytes < 1 ||
      original.body.byteLength !== original.info.sizeBytes) {
    throw new ApiError(409, "STORAGE_REPLICA_SOURCE_INVALID", "A source file could not be verified for copying.");
  }
  await target.putObject(targetKey, original.body, original.info.contentType ?? "application/octet-stream");
  const copied = await target.headObject(targetKey);
  if (!copied || copied.sizeBytes !== original.info.sizeBytes) {
    throw new ApiError(409, "STORAGE_REPLICA_COPY_UNVERIFIED", "A copied file did not pass its size check.");
  }
  return copied;
}

export function verifyReplicaListing(
  source: Array<{ key: string; sizeBytes: number }>,
  replica: Array<{ key: string; sizeBytes: number }>,
): { verified: boolean; objectCount: number; totalBytes: number } {
  const expected = new Map<string, number>();
  for (const item of source) {
    if (!item.key || !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes < 1 || expected.has(item.key)) {
      throw new ApiError(409, "STORAGE_REPLICA_SOURCE_LIST_INVALID", "The source file list is incomplete or inconsistent.");
    }
    expected.set(item.key, item.sizeBytes);
  }
  const actual = new Map<string, number>();
  for (const item of replica) {
    if (!item.key || !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes < 1 || actual.has(item.key)) {
      throw new ApiError(409, "STORAGE_REPLICA_TARGET_LIST_INVALID", "The copied file list is incomplete or inconsistent.");
    }
    actual.set(item.key, item.sizeBytes);
  }
  const totalBytes = [...expected.values()].reduce((sum, value) => sum + value, 0);
  const verified = expected.size === actual.size &&
    [...expected.entries()].every(([key, size]) => actual.get(key) === size);
  return { verified, objectCount: expected.size, totalBytes };
}
