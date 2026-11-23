import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Route as ReactionsRoute } from "@/routes/api/public/v1/reactions";
import { Route as LikedLibraryRoute } from "@/routes/api/public/v1/user/library/liked";
import { Route as CommentReportsRoute } from "@/routes/api/public/v1/comment-reports";
import { Route as WatchPartiesRoute } from "@/routes/api/public/v1/watch-parties/index";
import { Route as WatchPartyInstanceRoute } from "@/routes/api/public/v1/watch-parties/$partyId";
import { Route as NotificationPrefsRoute } from "@/routes/api/public/v1/user/notification-preferences";
import { Firestore, ApiError } from "@/lib/server/firebase-admin";
import * as apiModule from "@/lib/server/api";
import type { VerifiedUser } from "@/lib/server/firebase-auth";

const reactions = ReactionsRoute.options.server as unknown as {
  handlers: {
    GET: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
    POST: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
  };
};

const likedLibrary = LikedLibraryRoute.options.server as unknown as {
  handlers: {
    GET: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
  };
};

const commentReports = CommentReportsRoute.options.server as unknown as {
  handlers: {
    POST: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
  };
};

const watchParties = WatchPartiesRoute.options.server as unknown as {
  handlers: {
    GET: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
    POST: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
  };
};

const watchPartyInstance = WatchPartyInstanceRoute.options.server as unknown as {
  handlers: {
    GET: (ctx: { request: Request; params: { partyId: string } }) => Promise<Response>;
    POST: (ctx: { request: Request; params: { partyId: string } }) => Promise<Response>;
  };
};

const notificationPrefs = NotificationPrefsRoute.options.server as unknown as {
  handlers: {
    GET: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
    POST: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
  };
};

class MemoryFirestore {
  docs = new Map<string, Record<string, unknown>>();

  async getDoc(path: string): Promise<Record<string, unknown> | null> {
    const data = this.docs.get(path);
    return data ? JSON.parse(JSON.stringify(data)) : null;
  }

  async setDoc(path: string, data: Record<string, unknown>): Promise<void> {
    this.docs.set(path, JSON.parse(JSON.stringify(data)));
  }

  async patchDoc(path: string, patch: Record<string, unknown>): Promise<void> {
    const existing = this.docs.get(path) ?? {};
    this.docs.set(path, { ...existing, ...JSON.parse(JSON.stringify(patch)) });
  }

  async deleteDoc(path: string): Promise<void> {
    this.docs.delete(path);
  }

  async listDocs(prefix: string): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
    const results: Array<{ id: string; data: Record<string, unknown> }> = [];
    for (const [key, val] of this.docs.entries()) {
      if (key.startsWith(prefix + "/")) {
        const id = key.slice(prefix.length + 1);
        results.push({ id, data: JSON.parse(JSON.stringify(val)) });
      }
    }
    return results;
  }

  async transact<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return fn({
      getDoc: (p: string) => this.getDoc(p),
      setDoc: (p: string, d: Record<string, unknown>) => this.setDoc(p, d),
      patchDoc: (p: string, patch: Record<string, unknown>) => this.patchDoc(p, patch),
      deleteDoc: (p: string) => this.deleteDoc(p),
    });
  }
}

describe("Batch 10 Viewer features", () => {
  let memoryDb: MemoryFirestore;
  let currentUser: VerifiedUser;

  beforeEach(() => {
    memoryDb = new MemoryFirestore();
    vi.spyOn(Firestore, "create").mockImplementation(async () => memoryDb as unknown as Firestore);

    currentUser = {
      uid: "viewer_101",
      email: "viewer@bqsqwad.tv",
      emailVerified: true,
      authTime: Math.floor(Date.now() / 1000),
      issuedAt: Math.floor(Date.now() / 1000),
      customClaims: {},
      role: "viewer",
      claims: {},
    } as any;

    vi.spyOn(apiModule, "requireUser").mockImplementation(async () => currentUser);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles like and dislike reactions and updates liked library", async () => {
    // 1. Post a like
    const likeRes = await reactions.handlers.POST({
      request: new Request("http://localhost/api/public/v1/reactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType: "video",
          targetId: "mov_nollywood_gold",
          reaction: "like",
          title: "Nollywood Gold",
        }),
      }),
      params: {},
    });
    expect(likeRes.status).toBe(200);
    const likeData = await likeRes.json();
    expect(likeData.likeCount).toBe(1);
    expect(likeData.dislikeCount).toBe(0);
    expect(likeData.userReaction).toBe("like");

    // 2. Verify item is in user's liked library
    const libraryRes = await likedLibrary.handlers.GET({
      request: new Request("http://localhost/api/public/v1/user/library/liked"),
      params: {},
    });
    expect(libraryRes.status).toBe(200);
    const libraryItems = await libraryRes.json();
    expect(libraryItems).toHaveLength(1);
    expect(libraryItems[0].targetId).toBe("mov_nollywood_gold");
    expect(libraryItems[0].title).toBe("Nollywood Gold");

    // 3. Switch vote from like to dislike
    const dislikeRes = await reactions.handlers.POST({
      request: new Request("http://localhost/api/public/v1/reactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType: "video",
          targetId: "mov_nollywood_gold",
          reaction: "dislike",
        }),
      }),
      params: {},
    });
    expect(dislikeRes.status).toBe(200);
    const dislikeData = await dislikeRes.json();
    expect(dislikeData.likeCount).toBe(0);
    expect(dislikeData.dislikeCount).toBe(1);
    expect(dislikeData.userReaction).toBe("dislike");

    // 4. Verify removed from liked library
    const updatedLibraryRes = await likedLibrary.handlers.GET({
      request: new Request("http://localhost/api/public/v1/user/library/liked"),
      params: {},
    });
    const updatedItems = await updatedLibraryRes.json();
    expect(updatedItems).toHaveLength(0);
  });

  it("creates watch party, enforces kids safe mode, and handles room sync & billing", async () => {
    // 1. Create party
    const createRes = await watchParties.handlers.POST({
      request: new Request("http://localhost/api/public/v1/watch-parties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType: "movie",
          targetId: "mov_action_pack",
          title: "Action Pack Movie",
          maxParticipants: 15,
          contentRating: "PG-13",
        }),
      }),
      params: {},
    });
    expect(createRes.status).toBe(200);
    const createData = await createRes.json();
    expect(createData.success).toBe(true);
    expect(createData.party.roomCode).toHaveLength(6);
    expect(createData.party.maxParticipants).toBe(15);

    const partyId = createData.party.id;

    // 2. Second viewer joins
    currentUser = { ...currentUser, uid: "friend_202", email: "friend@bqsqwad.tv" };
    const joinRes = await watchPartyInstance.handlers.POST({
      request: new Request(`http://localhost/api/public/v1/watch-parties/${partyId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "join" }),
      }),
      params: { partyId },
    });
    expect(joinRes.status).toBe(200);

    // 3. Independent heartbeat billing tracks watch minutes per viewer
    const hbRes = await watchPartyInstance.handlers.POST({
      request: new Request(`http://localhost/api/public/v1/watch-parties/${partyId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "heartbeat" }),
      }),
      params: { partyId },
    });
    expect(hbRes.status).toBe(200);
    const hbData = await hbRes.json();
    expect(hbData.billedMinutes).toBe(1);

    // 4. Test Kids mode restriction: user with kidsModeLocked cannot create or join 18+ party
    currentUser = { ...currentUser, uid: "child_user", email: "child@bqsqwad.tv" };
    await memoryDb.setDoc("users/child_user", { isUnder18: true, kidsModeLocked: true });

    const kidsRestrictedRes = await watchParties.handlers.POST({
      request: new Request("http://localhost/api/public/v1/watch-parties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType: "movie",
          targetId: "mov_adult_rated",
          title: "Mature Thriller",
          contentRating: "18+",
        }),
      }),
      params: {},
    });
    expect(kidsRestrictedRes.status).toBe(403);
    const kidsRestrictedData = await kidsRestrictedRes.json();
    expect(kidsRestrictedData.code).toBe("AGE_RESTRICTED");
  });

  it("submits comment report and updates flag counters", async () => {
    // Seed a comment
    await memoryDb.setDoc("content_comments/cmt_abc", {
      id: "cmt_abc",
      body: "Spam comment here",
      flagCount: 0,
      moderationStatus: "approved",
    });

    const reportRes = await commentReports.handlers.POST({
      request: new Request("http://localhost/api/public/v1/comment-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commentId: "cmt_abc",
          assetId: "mov_123",
          reason: "spam",
          details: "Promoting phishing links",
        }),
      }),
      params: {},
    });

    expect(reportRes.status).toBe(200);
    const reportData = await reportRes.json();
    expect(reportData.success).toBe(true);

    const updatedComment = await memoryDb.getDoc("content_comments/cmt_abc");
    expect(updatedComment?.["flagCount"]).toBe(1);
  });

  it("gets and updates user notification preferences", async () => {
    // 1. Initial GET
    const getRes = await notificationPrefs.handlers.GET({
      request: new Request("http://localhost/api/public/v1/user/notification-preferences"),
      params: {},
    });
    expect(getRes.status).toBe(200);
    const initialPrefs = await getRes.json();
    expect(initialPrefs.emailWatchlist).toBe(true);

    // 2. Update preferences
    const postRes = await notificationPrefs.handlers.POST({
      request: new Request("http://localhost/api/public/v1/user/notification-preferences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          emailWatchlist: false,
          pushLiveBroadcasts: true,
          watchPartyInvites: true,
          billingReceipts: true,
          marketingUpdates: true,
        }),
      }),
      params: {},
    });
    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.preferences.emailWatchlist).toBe(false);
    expect(postData.preferences.marketingUpdates).toBe(true);

    // 3. Verify persistence
    const reGetRes = await notificationPrefs.handlers.GET({
      request: new Request("http://localhost/api/public/v1/user/notification-preferences"),
      params: {},
    });
    const savedPrefs = await reGetRes.json();
    expect(savedPrefs.emailWatchlist).toBe(false);
    expect(savedPrefs.marketingUpdates).toBe(true);
  });
});
