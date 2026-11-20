import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Route as ZillionaireTeamRoute } from "@/routes/api/public/v1/zillionaire/team";
import { Route as ZillionaireMemberRoute } from "@/routes/api/public/v1/zillionaire/team/$uid";
import { Route as ProducerTeamRoute } from "@/routes/api/public/v1/producer/team";
import { Route as ProviderTeamRoute } from "@/routes/api/public/v1/provider/team";
import { Firestore, ApiError } from "@/lib/server/firebase-admin";
import * as apiModule from "@/lib/server/api";
import type { VerifiedUser } from "@/lib/server/firebase-auth";
import { createStepUpToken } from "@/lib/server/zillionaire-access";
import { DASHBOARD_PERMISSIONS } from "@/lib/team-types";

const OWNER_EMAIL = "zillionaire@bqsqwad.tv";

const zillionaireTeam = ZillionaireTeamRoute.options.server as unknown as {
  handlers: {
    GET: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
    POST: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
  };
};

const zillionaireMember = ZillionaireMemberRoute.options.server as unknown as {
  handlers: {
    PUT: (ctx: { request: Request; params: { uid: string } }) => Promise<Response>;
    DELETE: (ctx: { request: Request; params: { uid: string } }) => Promise<Response>;
  };
};

const producerTeam = ProducerTeamRoute.options.server as unknown as {
  handlers: {
    GET: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
    POST: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
    PUT: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
    DELETE: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
  };
};

const providerTeam = ProviderTeamRoute.options.server as unknown as {
  handlers: {
    GET: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
    POST: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
    PUT: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
    DELETE: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
  };
};

function stepUpHeader() {
  process.env["SESSION_SECRET"] = "batch9-test-signing-key";
  return { "x-zillionaire-step-up": createStepUpToken("owner_uid", "team_manage").token };
}

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

describe("Batch 9: Granular Roles, Team Scopes & Escalation Prevention", () => {
  let fs: Firestore;
  let store: Record<string, Record<string, unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env["ZILLIONAIRE_EMAIL"] = OWNER_EMAIL;

    const memory = createMemoryFirestore();
    fs = memory.fs;
    store = memory.store;

    vi.spyOn(Firestore, "create").mockResolvedValue(fs);

    // Seed Owner
    store["users/owner_uid"] = {
      email: OWNER_EMAIL,
      accountStatus: "active",
      roleTags: ["admin"],
    };

    // Seed Delegated operator with roles module
    store["users/op_uid"] = {
      email: "operator@bqsqwad.tv",
      accountStatus: "active",
      zillionaireModules: ["roles", "content"],
      roleTags: ["operator"],
    };

    // Seed Producers
    store["users/producer_1"] = {
      email: "producer1@studio.tv",
      accountStatus: "active",
      roleTags: ["producer"],
    };
    store["producers/producer_1"] = {
      planStatus: "ACTIVE",
      verificationStatus: "APPROVED",
    };

    store["users/producer_2"] = {
      email: "producer2@otherstudio.tv",
      accountStatus: "active",
      roleTags: ["producer"],
    };
    store["producers/producer_2"] = {
      planStatus: "ACTIVE",
      verificationStatus: "APPROVED",
    };

    // Seed Providers
    store["users/provider_1"] = {
      email: "provider1@network.tv",
      accountStatus: "active",
      roleTags: ["provider"],
    };
    store["providerUsers/provider_1"] = {
      providerId: "prov_network_1",
      status: "ACTIVE",
    };

    store["users/provider_2"] = {
      email: "provider2@othernetwork.tv",
      accountStatus: "active",
      roleTags: ["provider"],
    };
    store["providerUsers/provider_2"] = {
      providerId: "prov_network_2",
      status: "ACTIVE",
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes all 17 dashboard jobs as selectable permissions", async () => {
    expect(DASHBOARD_PERMISSIONS).toHaveLength(17);
    const permIds = DASHBOARD_PERMISSIONS.map((p) => p.id);
    expect(permIds).toContain("users");
    expect(permIds).toContain("content_review");
    expect(permIds).toContain("rights_review");
    expect(permIds).toContain("live_approvals");
    expect(permIds).toContain("channels");
    expect(permIds).toContain("pricing");
    expect(permIds).toContain("finance");
    expect(permIds).toContain("payouts");
    expect(permIds).toContain("ads");
    expect(permIds).toContain("notifications");
    expect(permIds).toContain("moderation");
    expect(permIds).toContain("support");
    expect(permIds).toContain("security");
    expect(permIds).toContain("pages");
    expect(permIds).toContain("storage");
    expect(permIds).toContain("reports");
    expect(permIds).toContain("team_view");
  });

  it("allows owner to create custom role templates and delegate with expiry", async () => {
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "owner_uid",
      email: OWNER_EMAIL,
      emailVerified: true,
    } as VerifiedUser);

    // 1. Create custom role template
    const roleReq = new Request("https://test/api/public/v1/zillionaire/team", {
      method: "POST",
      headers: { "content-type": "application/json", ...stepUpHeader() },
      body: JSON.stringify({
        action: "create_role",
        roleName: "Festival Live Coordinator",
        description: "Oversees live streams and moderation during festival",
        modules: ["live_approvals", "moderation", "channels"],
        reason: "New festival operations role",
      }),
    });
    const roleRes = await zillionaireTeam.handlers.POST({ request: roleReq, params: {} });
    expect(roleRes.status).toBe(200);
    const roleData = await roleRes.json();
    expect(roleData.success).toBe(true);
    expect(roleData.roleKey).toBe("festival_live_coordinator");

    // 2. Assign user to this custom role with expiry
    const inviteReq = new Request("https://test/api/public/v1/zillionaire/team", {
      method: "POST",
      headers: { "content-type": "application/json", ...stepUpHeader() },
      body: JSON.stringify({
        action: "invite",
        email: "coordinator@bqsqwad.tv",
        roleTemplate: "festival_live_coordinator",
        modules: ["live_approvals", "moderation", "channels"],
        expiryDate: "2026-12-31T23:59:59.000Z",
        reason: "Assigned for festival coverage",
      }),
    });
    const inviteRes = await zillionaireTeam.handlers.POST({ request: inviteReq, params: {} });
    expect(inviteRes.status).toBe(200);
    const inviteData = await inviteRes.json();
    expect(inviteData.success).toBe(true);

    const targetUser = store[`users/${inviteData.uid}`];
    expect(targetUser).toBeDefined();
    expect(targetUser!["permissionsExpiryDate"]).toBe("2026-12-31T23:59:59.000Z");
    expect(targetUser!["zillionaireModules"]).toEqual(["live_approvals", "moderation", "channels"]);
  });

  it("strictly prevents delegated operators from changing their own or other roles", async () => {
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "op_uid",
      email: "operator@bqsqwad.tv",
      emailVerified: true,
    } as VerifiedUser);

    // 1. Delegated operator cannot invite or create roles
    const inviteReq = new Request("https://test/api/public/v1/zillionaire/team", {
      method: "POST",
      headers: { "content-type": "application/json", ...stepUpHeader() },
      body: JSON.stringify({
        email: "hacker@test.com",
        modules: ["security", "finance"],
        reason: "Unauthorized attempt",
      }),
    });
    const res1 = await zillionaireTeam.handlers.POST({ request: inviteReq, params: {} });
    expect(res1.status).toBe(403);
    const data1 = await res1.json();
    expect(data1.error).toContain("People with a delegated role cannot change their own role or anyone else's");

    // 2. Delegated operator cannot modify another member
    const putReq = new Request("https://test/api/public/v1/zillionaire/team/target_user", {
      method: "PUT",
      headers: { "content-type": "application/json", ...stepUpHeader() },
      body: JSON.stringify({
        modules: ["security"],
        reason: "Escalation attempt",
      }),
    });
    const res2 = await zillionaireMember.handlers.PUT({ request: putReq, params: { uid: "target_user" } });
    expect(res2.status).toBe(403);
    const data2 = await res2.json();
    expect(data2.error).toContain("People with a delegated role cannot change their own role or anyone else's");
  });

  it("supports producer adding team members with scoped permissions (upload, analytics, comments, collaboration)", async () => {
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "producer_1",
      email: "producer1@studio.tv",
      emailVerified: true,
      customClaims: { producer: true },
    } as unknown as VerifiedUser);

    // 1. Add producer team member
    const addReq = new Request("https://test/api/public/v1/producer/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "editor@studio.tv",
        name: "Video Editor",
        scopes: ["upload", "comments"],
        reason: "Adding video editor for Series A",
      }),
    });
    const addRes = await producerTeam.handlers.POST({ request: addReq, params: {} });
    expect(addRes.status).toBe(200);
    const addData = await addRes.json();
    expect(addData.success).toBe(true);
    expect(addData.scopes).toEqual(["upload", "comments"]);

    // 2. Query team members - producer sees their own team
    const listReq = new Request("https://test/api/public/v1/producer/team");
    const listRes = await producerTeam.handlers.GET({ request: listReq, params: {} });
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.members).toHaveLength(1);
    expect(listData.members[0].email).toBe("editor@studio.tv");

    // 3. Different producer cannot manage this member
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "producer_2",
      email: "producer2@otherstudio.tv",
      emailVerified: true,
      customClaims: { producer: true },
    } as unknown as VerifiedUser);

    const deleteReq = new Request("https://test/api/public/v1/producer/team", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        memberId: addData.memberId,
        reason: "Unauthorized cross-tenant deletion",
      }),
    });
    const delRes = await producerTeam.handlers.DELETE({ request: deleteReq, params: {} });
    expect(delRes.status).toBe(403);
  });

  it("supports provider adding team members with scoped permissions (channels, schedule, statements)", async () => {
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "provider_1",
      email: "provider1@network.tv",
      emailVerified: true,
      customClaims: { provider: true },
    } as unknown as VerifiedUser);

    // 1. Add provider team member
    const addReq = new Request("https://test/api/public/v1/provider/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "broadcast_op@network.tv",
        name: "Broadcast Operator",
        scopes: ["channels", "schedule"],
        reason: "Adding EPG scheduler",
      }),
    });
    const addRes = await providerTeam.handlers.POST({ request: addReq, params: {} });
    expect(addRes.status).toBe(200);
    const addData = await addRes.json();
    expect(addData.success).toBe(true);
    expect(addData.scopes).toEqual(["channels", "schedule"]);

    // 2. Provider queries team
    const listReq = new Request("https://test/api/public/v1/provider/team");
    const listRes = await providerTeam.handlers.GET({ request: listReq, params: {} });
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.members).toHaveLength(1);
    expect(listData.members[0].email).toBe("broadcast_op@network.tv");

    // 3. Cross-tenant access is rejected
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "provider_2",
      email: "provider2@othernetwork.tv",
      emailVerified: true,
      customClaims: { provider: true },
    } as unknown as VerifiedUser);

    const updateReq = new Request("https://test/api/public/v1/provider/team", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        memberId: addData.memberId,
        scopes: ["statements"],
        reason: "Cross-tenant update attempt",
      }),
    });
    const updateRes = await providerTeam.handlers.PUT({ request: updateReq, params: {} });
    expect(updateRes.status).toBe(403);
  });
});
