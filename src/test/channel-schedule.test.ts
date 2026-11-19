import { describe, expect, it } from "vitest";
import {
  ApiError,
  decodeFields,
  type Firestore,
  type FirestoreWrite,
} from "@/lib/server/firebase-admin";
import {
  channelScheduleSchema,
  deleteChannelSchedule,
  saveChannelSchedule,
} from "@/lib/server/channel-schedule";

function memoryFirestore(): Firestore {
  const documents = new Map<string, Record<string, unknown>>();
  return {
    docName: (path: string) => path,
    getDoc: async (path: string) => documents.get(path) ?? null,
    query: async (collectionPath: string) => {
      const prefix = collectionPath + "/";
      return [...documents.entries()]
        .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
        .map(([path, value]) => ({ ...value, __id: path.slice(prefix.length) }));
    },
    setDoc: async (
      path: string,
      fields: Record<string, unknown>,
      options?: { mustNotExist?: boolean },
    ) => {
      if (options?.mustNotExist && documents.has(path))
        throw new ApiError(409, "CONFLICT", "Exists");
      documents.set(path, fields);
    },
    transact: async <T>(
      paths: string[],
      callback: (
        docs: Array<Record<string, unknown> | null>,
      ) =>
        Promise<{ result: T; writes: FirestoreWrite[] }> | { result: T; writes: FirestoreWrite[] },
    ): Promise<T> => {
      const outcome = await callback(paths.map((path) => documents.get(path) ?? null));
      for (const write of outcome.writes) {
        if ("update" in write) {
          if (write.currentDocument?.exists === false && documents.has(write.update.name)) {
            throw new ApiError(409, "CONFLICT", "Exists");
          }
          documents.set(write.update.name, {
            ...(documents.get(write.update.name) ?? {}),
            ...decodeFields(write.update.fields),
          });
        } else if ("delete" in write) {
          documents.delete(write.delete);
        }
      }
      return outcome.result;
    },
  } as unknown as Firestore;
}

function programme(title: string, startsAt: string, endsAt: string, programmeId?: string) {
  return channelScheduleSchema.parse({
    ...(programmeId ? { programmeId } : {}),
    title,
    startsAt,
    endsAt,
  });
}

describe("transactional channel scheduling", () => {
  it("rejects overlapping programmes and accepts adjacent time slots", async () => {
    const fs = memoryFirestore();
    const first = await saveChannelSchedule(
      fs,
      "channel-1",
      "producer-1",
      programme("Morning Show", "2026-11-16T09:00:00.000Z", "2026-11-16T10:00:00.000Z"),
    );
    await expect(
      saveChannelSchedule(
        fs,
        "channel-1",
        "producer-1",
        programme("Overlapping Show", "2026-11-16T09:30:00.000Z", "2026-11-16T10:30:00.000Z"),
      ),
    ).rejects.toThrow(/overlaps/);
    const adjacent = await saveChannelSchedule(
      fs,
      "channel-1",
      "producer-1",
      programme("Next Show", "2026-11-16T10:00:00.000Z", "2026-11-16T11:00:00.000Z"),
    );
    expect(first.created).toBe(true);
    expect(adjacent.created).toBe(true);
  });

  it("updates a programme without conflicting with itself and deletes its reservation", async () => {
    const fs = memoryFirestore();
    const first = await saveChannelSchedule(
      fs,
      "channel-2",
      "producer-2",
      programme("Original", "2026-11-17T09:00:00.000Z", "2026-11-17T10:00:00.000Z"),
    );
    const updated = await saveChannelSchedule(
      fs,
      "channel-2",
      "producer-2",
      programme(
        "Updated",
        "2026-11-17T10:00:00.000Z",
        "2026-11-17T11:00:00.000Z",
        first.programmeId,
      ),
    );
    expect(updated).toEqual({ programmeId: first.programmeId, created: false });
    await deleteChannelSchedule(fs, "channel-2", first.programmeId);
    const replacement = await saveChannelSchedule(
      fs,
      "channel-2",
      "producer-2",
      programme("Replacement", "2026-11-17T10:00:00.000Z", "2026-11-17T11:00:00.000Z"),
    );
    expect(replacement.created).toBe(true);
  });

  it("rejects invalid programme durations", async () => {
    const fs = memoryFirestore();
    await expect(
      saveChannelSchedule(
        fs,
        "channel-3",
        "producer-3",
        programme("Too Long", "2026-11-18T00:00:00.000Z", "2026-11-19T01:00:00.000Z"),
      ),
    ).rejects.toThrow(ApiError);
  });
});
