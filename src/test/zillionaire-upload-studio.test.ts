import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Route as UploadRoute } from "@/routes/api/public/v1/zillionaire/upload/index";
import { Firestore } from "@/lib/server/firebase-admin";
import * as apiModule from "@/lib/server/api";
import * as rolesModule from "@/lib/server/roles";
import * as auditModule from "@/lib/server/audit";

function createMemoryFirestore() {
  const storedDocs: Record<string, Record<string, unknown>> = {
    "channels/ch_main": {
      __id: "ch_main",
      title: "BQ SQWAD Action Channel",
      published: true,
    },
  };

  const fs = {
    docName: (path: string) => `projects/test-project/databases/(default)/documents/${path}`,
    getDoc: vi.fn(async (path: string) => {
      return storedDocs[path] ? { ...storedDocs[path] } : null;
    }),
    setDoc: vi.fn(
      async (path: string, fields: Record<string, unknown>, opts?: { merge?: boolean }) => {
        if (opts?.merge && storedDocs[path]) {
          storedDocs[path] = { ...storedDocs[path], ...fields };
        } else {
          storedDocs[path] = { ...fields };
        }
      },
    ),
    patchDoc: vi.fn(async (path: string, fields: Record<string, unknown>) => {
      storedDocs[path] = { ...(storedDocs[path] || {}), ...fields };
    }),
    deleteDoc: vi.fn(async (path: string) => {
      delete storedDocs[path];
    }),
    query: vi.fn(async (collectionId: string, options: unknown) => {
      if (collectionId === "contentAssets") {
        return Object.entries(storedDocs)
          .filter(([k]) => k.startsWith("contentAssets/"))
          .map(([k, v]) => ({ __id: k.replace("contentAssets/", ""), ...v }));
      }
      if (collectionId === "channels") {
        return [
          {
            __id: "ch_main",
            title: "BQ SQWAD Action Channel",
            published: true,
          },
        ];
      }
      return [];
    }),
    storedDocs,
  };

  return fs;
}

describe("Zillionaire Upload Studio API", () => {
  let memFs: ReturnType<typeof createMemoryFirestore>;

  beforeEach(() => {
    memFs = createMemoryFirestore();
    vi.spyOn(Firestore, "create").mockResolvedValue(memFs as unknown as Firestore);
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "user_owner_1",
      email: "owner@bqsqwad.tv",
      customClaims: {},
      emailVerified: true,
    });
    vi.spyOn(rolesModule, "requireZillionaireModule").mockResolvedValue(undefined as never);
    vi.spyOn(auditModule, "writeAuditLog").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET returns uploads, channels, and stats", async () => {
    const handler = (UploadRoute.options.server as unknown as { handlers: { GET: (ctx: unknown) => Promise<Response> } }).handlers.GET;
    const req = new Request("http://localhost/api/public/v1/zillionaire/upload/");
    const res = await handler({ request: req });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { uploads: unknown[]; channels: unknown[]; stats: { total: number } };
    expect(Array.isArray(body.uploads)).toBe(true);
    expect(body.channels.length).toBeGreaterThanOrEqual(1);
    expect(typeof body.stats.total).toBe("number");
  });

  it("POST INITIATE_UPLOAD validates extensions and registers new asset", async () => {
    const handler = (UploadRoute.options.server as unknown as { handlers: { POST: (ctx: unknown) => Promise<Response> } }).handlers.POST;

    // Reject invalid extension
    const badReq = new Request("http://localhost/api/public/v1/zillionaire/upload/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "INITIATE_UPLOAD",
        channelId: "ch_main",
        title: "Test File",
        filename: "malware.exe",
        sizeBytes: 1024,
        mimeType: "application/octet-stream",
      }),
    });
    const badRes = await handler({ request: badReq });
    expect(badRes.status).toBe(400);

    // Accept valid MP4 upload
    const goodReq = new Request("http://localhost/api/public/v1/zillionaire/upload/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "INITIATE_UPLOAD",
        channelId: "ch_main",
        title: "Lagos Action Movie",
        mediaType: "Movie",
        genre: "Action",
        language: "English",
        ageRating: "PG-13",
        licenseType: "owned",
        copyrightHolderName: "BQ Test Studio",
        productionYear: 2025,
        contentWarnings: [],
        filename: "lagos_action.mp4",
        sizeBytes: 15_000_000,
        mimeType: "video/mp4",
        directPublish: true,
      }),
    });
    const goodRes = await handler({ request: goodReq });
    expect(goodRes.status).toBe(200);
    const body = (await goodRes.json()) as { assetId: string; totalChunks: number; directPublish: boolean };
    expect(body.assetId).toMatch(/^ast_/);
    expect(body.totalChunks).toBe(3); // 15MB / 5MB chunks = 3
    expect(body.directPublish).toBe(false);
  });

  it("POST UPLOAD_CHUNK tracks chunk progression and verifies last chunk", async () => {
    const handler = (UploadRoute.options.server as unknown as { handlers: { POST: (ctx: unknown) => Promise<Response> } }).handlers.POST;

    memFs.storedDocs["contentAssets/ast_chunk_test"] = {
      channelId: "ch_main",
      status: "uploading",
      chunksReceived: 0,
      totalChunks: 2,
      declaredSizeBytes: 10_000_000,
    };

    // First chunk
    const chunk1Req = new Request("http://localhost/api/public/v1/zillionaire/upload/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "UPLOAD_CHUNK",
        assetId: "ast_chunk_test",
        chunkIndex: 0,
        totalChunks: 2,
        chunkBytesLength: 5_000_000,
      }),
    });
    const res1 = await handler({ request: chunk1Req });
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as { progress: number; status: string };
    expect(body1.progress).toBe(50);
    expect(body1.status).toBe("uploading");

    // Second (last) chunk
    const chunk2Req = new Request("http://localhost/api/public/v1/zillionaire/upload/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "UPLOAD_CHUNK",
        assetId: "ast_chunk_test",
        chunkIndex: 1,
        totalChunks: 2,
        chunkBytesLength: 5_000_000,
      }),
    });
    const res2 = await handler({ request: chunk2Req });
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { progress: number; status: string };
    expect(body2.progress).toBe(100);
    expect(body2.status).toBe("verifying");
  });

  it("POST COMPLETE_UPLOAD never publishes directly when processing is not configured", async () => {
    const handler = (UploadRoute.options.server as unknown as { handlers: { POST: (ctx: unknown) => Promise<Response> } }).handlers.POST;

    memFs.storedDocs["contentAssets/ast_direct_test"] = {
      channelId: "ch_main",
      status: "verifying",
      sourceFilename: "lagos_night.mp4",
      sourcePath: "producers/user1/ch_main/lagos_night.mp4",
      directPublish: true,
    };

    const compReq = new Request("http://localhost/api/public/v1/zillionaire/upload/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "COMPLETE_UPLOAD",
        assetId: "ast_direct_test",
        directPublish: true,
        durationSeconds: 3600,
      }),
    });
    const res = await handler({ request: compReq });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; contentStatus: string; approvalRequired: boolean; processingAvailable: boolean };
    expect(body.status).toBe("needs_review");
    expect(body.contentStatus).toBe("draft");
    expect(body.approvalRequired).toBe(true);
    expect(body.processingAvailable).toBe(false);

    const doc = memFs.storedDocs["contentAssets/ast_direct_test"];
    expect(doc["status"]).toBe("needs_review");
    expect(doc["contentStatus"]).toBe("draft");
    expect(doc["directPublish"]).toBe(false);
  });

  it("POST ACTION_UPLOAD direct_publish is rejected and cannot publish", async () => {
    const handler = (UploadRoute.options.server as unknown as { handlers: { POST: (ctx: unknown) => Promise<Response> } }).handlers.POST;

    memFs.storedDocs["contentAssets/ast_action_test"] = {
      channelId: "ch_main",
      status: "needs_review",
      sourceFilename: "indie_pilot.mp4",
    };

    const actionReq = new Request("http://localhost/api/public/v1/zillionaire/upload/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ACTION_UPLOAD",
        assetId: "ast_action_test",
        operation: "direct_publish",
        reason: "Owner manual direct publish sign-off",
      }),
    });
    const res = await handler({ request: actionReq });
    expect(res.status).toBe(403);

    const doc = memFs.storedDocs["contentAssets/ast_action_test"];
    expect(doc["status"]).toBe("needs_review");
    expect(doc["contentStatus"]).not.toBe("published");
    expect(auditModule.writeAuditLog).not.toHaveBeenCalled();
  });
it("deletes only the requested asset and audits the destructive upload action", async () => {
    memFs.storedDocs["contentAssets/ast_delete_test"] = { channelId: "ch_main", status: "needs_review" };
    const handler = (UploadRoute.options.server as unknown as { handlers: { POST: (ctx: unknown) => Promise<Response> } }).handlers.POST;
    const res = await handler({ request: new Request("http://localhost/api/public/v1/zillionaire/upload/", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ACTION_UPLOAD", assetId: "ast_delete_test", operation: "delete", reason: "Remove duplicate test asset" }),
    }) });
    expect(res.status).toBe(200);
    expect(memFs.storedDocs["contentAssets/ast_delete_test"]).toBeUndefined();
    expect(auditModule.writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "content.upload_delete", targetId: "ast_delete_test" }));
  });
it("resumes a paused upload and clears the prior failure reason", async () => {
    memFs.storedDocs["contentAssets/ast_resume_test"] = { channelId: "ch_main", status: "paused", failureReason: "Temporary interruption" };
    const handler = (UploadRoute.options.server as unknown as { handlers: { POST: (ctx: unknown) => Promise<Response> } }).handlers.POST;
    const res = await handler({ request: new Request("http://localhost/api/public/v1/zillionaire/upload/", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ACTION_UPLOAD", assetId: "ast_resume_test", operation: "resume", reason: "Continue interrupted upload" }),
    }) });
    expect(res.status).toBe(200);
    expect(memFs.storedDocs["contentAssets/ast_resume_test"]).toMatchObject({ status: "uploading", failureReason: null });
  });
});
