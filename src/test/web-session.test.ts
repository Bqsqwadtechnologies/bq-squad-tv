import { describe, expect, it } from "vitest";
import {
  ApiError,
  decodeFields,
  type Firestore,
  type FirestoreWrite,
} from "@/lib/server/firebase-admin";
import {
  assertWebRefreshSessionActive,
  clearWebRefreshCookie,
  readWebRefreshCookie,
  requireSameOrigin,
  revokeWebRefreshSession,
  rotateWebRefreshSession,
  webRefreshCookie,
} from "@/lib/server/web-session";

function memoryFirestore(): { fs: Firestore; documents: Map<string, Record<string, unknown>> } {
  const documents = new Map<string, Record<string, unknown>>();
  const fs = {
    docName: (path: string) => path,
    getDoc: async (path: string) => documents.get(path) ?? null,
    transact: async <T>(
      paths: string[],
      callback: (
        docs: Array<Record<string, unknown> | null>,
      ) =>
        Promise<{ result: T; writes: FirestoreWrite[] }> | { result: T; writes: FirestoreWrite[] },
    ): Promise<T> => {
      const snapshots = paths.map((path) => documents.get(path) ?? null);
      const outcome = await callback(snapshots);
      for (const write of outcome.writes) {
        if ("update" in write) {
          if (write.currentDocument?.exists === false && documents.has(write.update.name)) {
            throw new Error("Document already exists");
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
  return { fs, documents };
}

describe("secure website session cookies", () => {
  it("reads only the named refresh cookie", () => {
    const request = new Request("https://tv.example.test/account", {
      headers: { cookie: "theme=dark; __Host-bq_sqwad_refresh=refresh%2Btoken" },
    });
    expect(readWebRefreshCookie(request)).toBe("refresh+token");
  });

  it("rejects malformed cookie encoding safely", () => {
    const request = new Request("https://tv.example.test/account", {
      headers: { cookie: "__Host-bq_sqwad_refresh=%E0%A4%A" },
    });
    expect(readWebRefreshCookie(request)).toBeNull();
  });

  it("sets and clears refresh tokens with secure cookie attributes", () => {
    const setCookie = webRefreshCookie("opaque-refresh-token");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=");
    const clearCookie = clearWebRefreshCookie();
    expect(clearCookie).toContain("Max-Age=0");
    expect(clearCookie).toContain("HttpOnly");
    expect(clearCookie).toContain("Secure");
  });

  it("rotates refresh tokens and tombstones the previous token", async () => {
    const { fs } = memoryFirestore();
    await rotateWebRefreshSession(fs, "legacy-refresh-token", "next-refresh-token", "uid-1");
    await expect(assertWebRefreshSessionActive(fs, "legacy-refresh-token")).rejects.toThrow(
      ApiError,
    );
    await expect(assertWebRefreshSessionActive(fs, "next-refresh-token")).resolves.toBeUndefined();
  });

  it("revokes the active refresh token on sign-out", async () => {
    const { fs } = memoryFirestore();
    await rotateWebRefreshSession(fs, "first-token", "active-token", "uid-2");
    await revokeWebRefreshSession(fs, "active-token");
    await expect(assertWebRefreshSessionActive(fs, "active-token")).rejects.toThrow(ApiError);
  });

  it("does not allow a refresh session to be rebound to another account", async () => {
    const { fs } = memoryFirestore();
    await rotateWebRefreshSession(fs, "first-token", "active-token", "uid-3");
    await expect(
      rotateWebRefreshSession(fs, "active-token", "attacker-token", "uid-other"),
    ).rejects.toThrow(ApiError);
  });

  it("blocks cross-origin session actions", () => {
    const sameOrigin = new Request("https://tv.example.test/api/session", {
      method: "POST",
      headers: { origin: "https://tv.example.test" },
    });
    expect(() => requireSameOrigin(sameOrigin)).not.toThrow();

    const crossOrigin = new Request("https://tv.example.test/api/session", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });
    expect(() => requireSameOrigin(crossOrigin)).toThrow(ApiError);
  });
});
