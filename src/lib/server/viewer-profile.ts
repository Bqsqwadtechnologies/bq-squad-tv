import { ApiError, type Firestore } from "./firebase-admin";

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export function normalizePublicUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidPublicUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value);
}

/** Assign a stable public username to an ordinary viewer account on first profile access. */
export async function ensureViewerUsername(
  fs: Firestore,
  uid: string,
): Promise<{ username: string; displayName: string; avatarUrl: string | null }> {
  const userPath = "users/" + uid;
  const user = await fs.getDoc(userPath);
  const existingUsername =
    typeof user?.["username"] === "string" ? normalizePublicUsername(user["username"] as string) : "";
  if (existingUsername && isValidPublicUsername(existingUsername)) {
    const mapping = await fs.getDoc("usernames/" + existingUsername);
    if (mapping?.["uid"] === uid) {
      return {
        username: existingUsername,
        displayName: String(user?.["displayName"] || user?.["name"] || "Viewer"),
        avatarUrl: typeof user?.["photoURL"] === "string"
          ? user["photoURL"] as string
          : typeof user?.["avatarUrl"] === "string" ? user["avatarUrl"] as string : null,
      };
    }
  }

  const uidSuffix = uid.toLowerCase().replace(/[^a-z0-9]/g, "").slice(-8) || "member";
  const base = "viewer-" + uidSuffix;
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? base : base + "-" + (attempt + 1);
    const mappingPath = "usernames/" + candidate;
    const mapping = await fs.getDoc(mappingPath);
    if (mapping && mapping["uid"] !== uid) continue;
    if (!mapping) {
      try {
        await fs.setDoc(mappingPath, {
          uid,
          kind: "viewer",
          createdAt: new Date().toISOString(),
        }, { mustNotExist: true });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;
        const raced = await fs.getDoc(mappingPath);
        if (raced?.["uid"] !== uid) continue;
      }
    }
    const now = new Date().toISOString();
    await fs.patchDoc(userPath, { username: candidate, usernameUpdatedAt: now, updatedAt: now });
    return {
      username: candidate,
      displayName: String(user?.["displayName"] || user?.["name"] || "Viewer"),
      avatarUrl: typeof user?.["photoURL"] === "string"
        ? user["photoURL"] as string
        : typeof user?.["avatarUrl"] === "string" ? user["avatarUrl"] as string : null,
    };
  }
  throw new ApiError(503, "USERNAME_ALLOCATION_FAILED", "A public username could not be allocated. Please try again.");
}
