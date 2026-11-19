import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Route as TeamRoute } from "@/routes/api/public/v1/zillionaire/team";
import { Route as TeamMemberRoute } from "@/routes/api/public/v1/zillionaire/team/$uid";
import { Firestore, ApiError } from "@/lib/server/firebase-admin";
import * as apiModule from "@/lib/server/api";
import type { VerifiedUser } from "@/lib/server/firebase-auth";

const OWNER_EMAIL = "zillionaire@bqsqwad.tv";

const teamServer = TeamRoute.options.server as unknown as {
  handlers: {
    GET: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
    POST: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
  };
};

const memberServer = TeamMemberRoute.options.server as unknown as {
  handlers: {
    PUT: (ctx: { request: Request; params: { uid: string } }) => Promise<Response>;
    DELETE: (ctx: { request: Request; params: { uid: string } }) => Promise<Response>;
  };
};

function createMemoryFirestore() {
  const store: Record<string, Record<string, unknown>> = {};

  const fs = {
    docName: (path: string) => `projects/test-project/databases/(default)/documents/${path}`,
    getDoc: vi.fn(async (path: string) => (store[path] ? { ...store[path] } : null)),
    setDoc: vi.fn(async (path: string, fields: Record<string, unknown>) => {
      store[path] = { ...fields };
    }),
    patchDoc: vi.fn(async (path: string, fields: Record<string, unknown>) => {
      store[path] = { ...(store[path] || {}), ...fields };
    }),
    query: vi.fn(
      async (
        collection: string,
        options?: { filters?: Array<{ field: string; op: string; value: unknown }> },
      ) => {
        const results: Array<Record<string, unknown>> = [];
        for (const [key, val] of Object.entries(store)) {
          if (key.startsWith(`${collection}/`)) {
            const docId = key.substring(collection.length + 1);
            const doc: Record<string, unknown> = { ...val, __id: docId, id: docId, uid: docId };
            if (options?.filters) {
              let match = true;
              for (const f of options.filters) {
                if (doc[f.field] !== f.value) match = false;
              }
              if (match) results.push(doc);
            } else {
              results.push(doc);
            }
          }
        }
        return results;
      },
    ),
    transact: vi.fn(async (paths: string[], fn: (docs: unknown[]) => { writes?: unknown[] }) => {
      const docs = paths.map((p) => store[p] || null);
      const res = fn(docs);
      return res;
    }),
    commit: vi.fn(async () => undefined),
  } as unknown as Firestore;

  return { fs, store };
}

describe("Zillionaire Team & Roles Management", () => {
  let fs: Firestore;
  let store: Record<string, Record<string, unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env["ZILLIONAIRE_EMAIL"] = OWNER_EMAIL;

    const memory = createMemoryFirestore();
    fs = memory.fs;
    store = memory.store;

    vi.spyOn(Firestore, "create").mockResolvedValue(fs);

    // Seed owner user
    store["users/owner_uid"] = {
      email: OWNER_EMAIL,
      accountStatus: "active",
      roleTags: ["admin"],
    };

    // Seed operator with roles module
    store["users/roles_op_uid"] = {
      email: "roles-op@bqsqwad.tv",
      accountStatus: "active",
      zillionaireModules: ["roles"],
      roleTags: ["operator"],
    };

    // Seed operator with finance module (no roles module)
    store["users/finance_op_uid"] = {
      email: "finance-op@bqsqwad.tv",
      accountStatus: "active",
      zillionaireModules: ["finance"],
      roleTags: ["operator"],
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows owner and roles-operator to inspect team, rejects others", async () => {
    // 1. Roles operator can inspect
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "roles_op_uid",
      email: "roles-op@bqsqwad.tv",
      emailVerified: true,
    } as VerifiedUser);

    const rolesReq = new Request("https://test/api/public/v1/zillionaire/team");
    const res1 = await teamServer.handlers.GET({
      request: rolesReq,
      params: {},
    });
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.roleTemplates).toBeDefined();
    expect(data1.roleTemplates.content_manager).toBeDefined();

    // 2. Finance operator without roles module is rejected
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "finance_op_uid",
      email: "finance-op@bqsqwad.tv",
      emailVerified: true,
    } as VerifiedUser);

    const finReq = new Request("https://test/api/public/v1/zillionaire/team");
    const res2 = await teamServer.handlers.GET({
      request: finReq,
      params: {},
    });
    expect(res2.status).toBe(403);

    // 3. Unauthenticated is rejected
    vi.spyOn(apiModule, "requireUser").mockRejectedValue(
      new ApiError(401, "UNAUTHENTICATED", "Sign-in required"),
    );

    const anonReq = new Request("https://test/api/public/v1/zillionaire/team");
    const res3 = await teamServer.handlers.GET({
      request: anonReq,
      params: {},
    });
    expect(res3.status).toBe(401);
  });

  it("only owner can invite team members and assign role templates", async () => {
    const invitePayload = {
      email: "newmember@bqsqwad.tv",
      roleTemplate: "content_manager",
      modules: ["channels", "catalog", "video"],
      reason: "Hired new content director for BQ SQWAD TV",
    };

    // 1. Delegated operator cannot invite (owner authority required)
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "roles_op_uid",
      email: "roles-op@bqsqwad.tv",
      emailVerified: true,
    } as VerifiedUser);

    const opReq = new Request("https://test/api/public/v1/zillionaire/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(invitePayload),
    });
    const res1 = await teamServer.handlers.POST({
      request: opReq,
      params: {},
    });
    expect(res1.status).toBe(403);

    // 2. Owner can invite
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "owner_uid",
      email: OWNER_EMAIL,
      emailVerified: true,
    } as VerifiedUser);

    const ownerReq = new Request("https://test/api/public/v1/zillionaire/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(invitePayload),
    });
    const res2 = await teamServer.handlers.POST({
      request: ownerReq,
      params: {},
    });
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.success).toBe(true);
    expect(data2.email).toBe("newmember@bqsqwad.tv");

    // 3. Verify user document updated in Firestore
    const userDoc = store[`users/${data2.uid}`];
    expect(userDoc).toBeDefined();
    expect(userDoc!["zillionaireModules"]).toEqual(["channels", "catalog", "video"]);
    expect(userDoc!["roleTemplate"]).toBe("content_manager");
  });

  it("supports updating member status and instant revocation", async () => {
    // Create an active team member
    const targetUid = "team_target_1";
    store[`users/${targetUid}`] = {
      email: "target@bqsqwad.tv",
      accountStatus: "active",
      zillionaireModules: ["moderation"],
    };

    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "owner_uid",
      email: OWNER_EMAIL,
      emailVerified: true,
    } as VerifiedUser);

    // 1. Update status to suspended
    const updateReq = new Request(`https://test/api/public/v1/zillionaire/team/${targetUid}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "suspended",
        reason: "Temporary investigation of moderation actions",
      }),
    });
    const updateRes = await memberServer.handlers.PUT({
      request: updateReq,
      params: { uid: targetUid },
    });
    expect(updateRes.status).toBe(200);

    const docAfterSuspend = store[`users/${targetUid}`];
    expect(docAfterSuspend!["accountStatus"]).toBe("suspended");

    // 2. Instant revocation via DELETE
    const deleteReq = new Request(`https://test/api/public/v1/zillionaire/team/${targetUid}`, {
      method: "DELETE",
    });
    const deleteRes = await memberServer.handlers.DELETE({
      request: deleteReq,
      params: { uid: targetUid },
    });
    expect(deleteRes.status).toBe(200);
    const deleteData = await deleteRes.json();
    expect(deleteData.revoked).toBe(true);

    const docAfterRevoke = store[`users/${targetUid}`];
    expect(docAfterRevoke!["zillionaireModules"]).toEqual([]);
    expect(docAfterRevoke!["accountStatus"]).toBe("suspended");
    expect(docAfterRevoke!["permissionsRevokedAt"]).toBeDefined();
  });
});
