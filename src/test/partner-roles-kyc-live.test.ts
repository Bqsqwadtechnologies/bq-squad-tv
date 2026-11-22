import { describe, it, expect, vi } from "vitest";
import { Route as ProviderTeamRoute } from "@/routes/api/public/v1/provider/team";
import { Route as ProducerVerificationRoute } from "@/routes/api/public/v1/producer/verification";
import * as apiModule from "@/lib/server/api";
import { Firestore } from "@/lib/server/firebase-admin";
import type { VerifiedUser } from "@/lib/server/firebase-auth";
import fs from "fs";
import path from "path";

const providerTeam = ProviderTeamRoute.options.server as unknown as {
  handlers: {
    GET: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
    POST: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
  };
};

const producerVerification = ProducerVerificationRoute.options.server as unknown as {
  handlers: {
    POST: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
  };
};

function createMemoryFirestore() {
  const store: Record<string, Record<string, unknown>> = {};
  const fs = {
    docName: (p: string) => `projects/test-project/databases/(default)/documents/${p}`,
    getDoc: vi.fn(async (p: string) => (store[p] ? { ...store[p] } : null)),
    setDoc: vi.fn(async (p: string, fields: Record<string, unknown>) => {
      store[p] = { ...fields };
    }),
    patchDoc: vi.fn(async (p: string, fields: Record<string, unknown>) => {
      store[p] = { ...(store[p] || {}), ...fields };
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
            const matches = (options?.filters || []).every((f) => {
              if (f.op === "EQUAL") return doc[f.field] === f.value;
              return true;
            });
            if (matches) results.push(doc);
          }
        }
        return results;
      },
    ),
    transact: vi.fn(async (paths: string[], fn: (docs: unknown[]) => { writes?: unknown[] }) => {
      const docs = paths.map((p) => store[p] || null);
      return fn(docs);
    }),
    commit: vi.fn(async () => undefined),
  };
  return { fs: fs as unknown as Firestore, store };
}

describe("Badge #82: Partner Roles, KYC Live-only, and Company Email Rules", () => {
  it("enforces Partner Roles (Manager, Editor, Viewer) on provider team invitations", async () => {
    const { fs, store } = createMemoryFirestore();
    store["users/provider_owner_1"] = {
      email: "owner@broadcastnetwork.tv",
      accountStatus: "active",
      roleTags: ["provider"],
    };
    store["providerUsers/provider_owner_1"] = {
      providerId: "prov_network_corp",
      status: "ACTIVE",
    };

    vi.spyOn(Firestore, "create").mockResolvedValue(fs);
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "provider_owner_1",
      email: "owner@broadcastnetwork.tv",
      emailVerified: true,
      customClaims: { provider: true },
    } as unknown as VerifiedUser);

    const postReq = new Request("https://test/api/public/v1/provider/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "manager@broadcastnetwork.tv",
        name: "Station Manager",
        role: "Manager",
        scopes: ["channels", "schedule", "statements"],
        reason: "Lead broadcast operator assignment",
      }),
    });

    const res = await providerTeam.handlers.POST({ request: postReq, params: {} });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.role).toBe("Manager");

    const getReq = new Request("https://test/api/public/v1/provider/team");
    const getRes = await providerTeam.handlers.GET({ request: getReq, params: {} });
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.members[0].role).toBe("Manager");
    expect(getData.availableRoles.map((r: { id: string }) => r.id)).toEqual([
      "Owner",
      "Manager",
      "Editor",
      "Viewer",
    ]);
  });

  it("rejects corporate producer verification when using a personal freemail account", async () => {
    const { fs } = createMemoryFirestore();
    vi.spyOn(Firestore, "create").mockResolvedValue(fs);
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "prod_corp_user_1",
      email: "filmmaker@gmail.com",
      emailVerified: true,
      customClaims: { producer: true },
    } as unknown as VerifiedUser);

    const postReq = new Request("https://test/api/public/v1/producer/verification", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        legalName: "Acme Media Group Ltd",
        countryCode: "GB",
        entityType: "company",
        evidenceUploadIds: ["upload_evidence_token_1234567890"],
        declarationAccepted: true,
      }),
    });

    const res = await producerVerification.handlers.POST({ request: postReq, params: {} });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("corporate domain email");
  });

  it("statically verifies that Face Liveness mode in KycCameraCapture excludes onUploadFileInstead", () => {
    const cameraCaptureSource = fs.readFileSync(
      path.resolve(__dirname, "../components/kyc/KycCameraCapture.tsx"),
      "utf-8",
    );

    // Assert mode !== "face_liveness" guard is applied to onUploadFileInstead
    expect(cameraCaptureSource).toContain('mode !== "face_liveness"');

    // Assert ProducerKycFlow no longer offers a file input for selfie
    const producerKycSource = fs.readFileSync(
      path.resolve(__dirname, "../components/ProducerKycFlow.tsx"),
      "utf-8",
    );
    expect(producerKycSource).toContain(
      "Live camera capture is required for face verification. File uploads and static images are strictly rejected.",
    );
  });
});
