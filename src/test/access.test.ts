import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Firestore } from "@/lib/server/firebase-admin";

vi.mock("@/lib/server/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/api")>();
  return {
    ...actual,
    requireUser: vi.fn(),
  };
});

vi.mock("@/lib/server/video-worker-auth", () => ({
  requireVideoWorker: vi.fn(async () => "worker-test-01"),
}));

import { requireUser } from "@/lib/server/api";
import {
  requireViewer,
  requireZillionaire,
  requireProducer,
  requireProvider,
  requireWorker,
  requireChannelPermission,
} from "@/lib/server/access";

function mockFirestore(docs: Record<string, unknown> = {}) {
  return {
    getDoc: vi.fn(async (p: string) => (docs[p] ? docs[p] : null)),
  } as unknown as Firestore;
}

describe("Central Access Library (src/lib/server/access.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("requireViewer", () => {
    it("returns resolved user, fs, and platform access for authenticated viewer", async () => {
      const mockReqUser = vi.mocked(requireUser);
      mockReqUser.mockResolvedValueOnce({
        uid: "user-1",
        email: "viewer@example.com",
        emailVerified: true,
        authTime: 123456,
      });

      const fs = mockFirestore({
        "users/user-1": { roleTags: [] },
      });

      const req = new Request("http://localhost/api/test");
      const ctx = await requireViewer(req, fs);

      expect(ctx.user.uid).toBe("user-1");
      expect(ctx.access.roles).toContain("viewer");
      expect(ctx.access.isZillionaireOwner).toBe(false);
    });
  });

  describe("requireZillionaire", () => {
    it("allows verified Zillionaire owner across all modules", async () => {
      vi.stubEnv("ZILLIONAIRE_EMAIL", "owner@zillionaire.com");
      const mockReqUser = vi.mocked(requireUser);
      mockReqUser.mockResolvedValueOnce({
        uid: "owner-1",
        email: "owner@zillionaire.com",
        emailVerified: true,
        authTime: 123456,
      });

      const fs = mockFirestore({
        "users/owner-1": { email: "owner@zillionaire.com", roleTags: [] },
      });

      const req = new Request("http://localhost/api/test");
      const ctx = await requireZillionaire(req, "pricing", fs);

      expect(ctx.access.isZillionaireOwner).toBe(true);
      expect(ctx.module).toBe("pricing");
      vi.unstubAllEnvs();
    });

    it("allows delegated staff member with specific module", async () => {
      const mockReqUser = vi.mocked(requireUser);
      mockReqUser.mockResolvedValueOnce({
        uid: "staff-1",
        email: "staff@example.com",
        emailVerified: true,
        authTime: 123456,
      });

      const fs = mockFirestore({
        "users/staff-1": { zillionaireModules: ["security", "wallets"] },
      });

      const req = new Request("http://localhost/api/test");
      const ctx = await requireZillionaire(req, "security", fs);

      expect(ctx.access.zillionaireModules).toContain("security");
      expect(ctx.module).toBe("security");
    });

    it("rejects user without required module with 403 ZILLIONAIRE_SCOPE_REQUIRED", async () => {
      const mockReqUser = vi.mocked(requireUser);
      mockReqUser.mockResolvedValueOnce({
        uid: "viewer-1",
        email: "viewer@example.com",
        emailVerified: true,
        authTime: 123456,
      });

      const fs = mockFirestore({
        "users/viewer-1": { roleTags: [] },
      });

      const req = new Request("http://localhost/api/test");
      await expect(requireZillionaire(req, "pricing", fs)).rejects.toMatchObject({
        status: 403,
        code: "ZILLIONAIRE_SCOPE_REQUIRED",
      });
    });
  });

  describe("requireProducer", () => {
    it("allows verified producer with active plan", async () => {
      const mockReqUser = vi.mocked(requireUser);
      mockReqUser.mockResolvedValueOnce({
        uid: "prod-1",
        email: "producer@example.com",
        emailVerified: true,
        authTime: 123456,
      });

      const fs = mockFirestore({
        "users/prod-1": { roleTags: ["producer"] },
        "producers/prod-1": { planStatus: "ACTIVE", verificationStatus: "APPROVED" },
      });

      const req = new Request("http://localhost/api/test");
      const ctx = await requireProducer(req, fs);

      expect(ctx.producerUid).toBe("prod-1");
      expect(ctx.access.roles).toContain("producer");
    });

    it("rejects non-producer user with 403 FORBIDDEN", async () => {
      const mockReqUser = vi.mocked(requireUser);
      mockReqUser.mockResolvedValueOnce({
        uid: "viewer-1",
        email: "viewer@example.com",
        emailVerified: true,
        authTime: 123456,
      });

      const fs = mockFirestore({
        "users/viewer-1": { roleTags: [] },
      });

      const req = new Request("http://localhost/api/test");
      await expect(requireProducer(req, fs)).rejects.toMatchObject({
        status: 403,
        code: "FORBIDDEN",
      });
    });
  });

  describe("requireProvider", () => {
    it("allows provider representative tied to active provider org", async () => {
      const mockReqUser = vi.mocked(requireUser);
      mockReqUser.mockResolvedValueOnce({
        uid: "prov-rep-1",
        email: "rep@provider.org",
        emailVerified: true,
        authTime: 123456,
      });

      const fs = mockFirestore({
        "users/prov-rep-1": { roleTags: [] },
        "providerUsers/prov-rep-1": { status: "ACTIVE", providerId: "prov-org-42" },
      });

      const req = new Request("http://localhost/api/test");
      const ctx = await requireProvider(req, "prov-org-42", fs);

      expect(ctx.providerId).toBe("prov-org-42");
      expect(ctx.access.roles).toContain("provider");
    });

    it("rejects provider accessing another provider org with 403 PROVIDER_ISOLATION_VIOLATION", async () => {
      const mockReqUser = vi.mocked(requireUser);
      mockReqUser.mockResolvedValueOnce({
        uid: "prov-rep-1",
        email: "rep@provider.org",
        emailVerified: true,
        authTime: 123456,
      });

      const fs = mockFirestore({
        "users/prov-rep-1": { roleTags: [] },
        "providerUsers/prov-rep-1": { status: "ACTIVE", providerId: "prov-org-42" },
      });

      const req = new Request("http://localhost/api/test");
      await expect(requireProvider(req, "prov-other-99", fs)).rejects.toMatchObject({
        status: 403,
        code: "PROVIDER_ISOLATION_VIOLATION",
      });
    });
  });

  describe("requireWorker", () => {
    it("verifies and returns worker context", async () => {
      const fs = mockFirestore();
      const req = new Request("http://localhost/api/worker");
      const ctx = await requireWorker(req, fs);

      expect(ctx.workerId).toBe("worker-test-01");
      expect(ctx.fs).toBe(fs);
    });
  });

  describe("requireChannelPermission", () => {
    it("allows unauthenticated public read on published channel", async () => {
      const fs = mockFirestore({
        "channels/chan-pub": { status: "PUBLISHED" },
      });

      const req = new Request("http://localhost/api/channel");
      const ctx = await requireChannelPermission(req, "chan-pub", "channel.read", fs);

      expect(ctx.isPublicReadOnly).toBe(true);
      expect(ctx.role).toBe("viewer");
    });

    it("allows Zillionaire channels operator full access to any channel", async () => {
      const mockReqUser = vi.mocked(requireUser);
      mockReqUser.mockResolvedValueOnce({
        uid: "zillionaire-channels-1",
        email: "admin@bqsqwad.tv",
        emailVerified: true,
        authTime: 123456,
      });

      const fs = mockFirestore({
        "channels/chan-1": { ownerUid: "producer-other", status: "DRAFT" },
        "users/zillionaire-channels-1": { zillionaireModules: ["channels"] },
      });

      const req = new Request("http://localhost/api/channel", {
        headers: { authorization: "Bearer token" },
      });
      const ctx = await requireChannelPermission(req, "chan-1", "channel.settings", fs);

      expect(ctx.role).toBe("owner");
      expect(ctx.permissions).toContain("channel.settings");
    });

    it("allows licensed provider access to channel belonging to that provider", async () => {
      const mockReqUser = vi.mocked(requireUser);
      mockReqUser.mockResolvedValueOnce({
        uid: "prov-rep-1",
        email: "rep@provider.org",
        emailVerified: true,
        authTime: 123456,
      });

      const fs = mockFirestore({
        "channels/chan-live-prov": { providerId: "prov-org-42", status: "ACTIVE" },
        "users/prov-rep-1": { roleTags: [] },
        "providerUsers/prov-rep-1": { status: "ACTIVE", providerId: "prov-org-42" },
      });

      const req = new Request("http://localhost/api/channel", {
        headers: { authorization: "Bearer token" },
      });
      const ctx = await requireChannelPermission(req, "chan-live-prov", "schedule.write", fs);

      expect(ctx.role).toBe("manager");
      expect(ctx.permissions).toContain("schedule.write");
    });

    it("allows producer owner full permission on their own channel", async () => {
      const mockReqUser = vi.mocked(requireUser);
      mockReqUser.mockResolvedValueOnce({
        uid: "producer-1",
        email: "prod@example.com",
        emailVerified: true,
        authTime: 123456,
      });

      const fs = mockFirestore({
        "channels/chan-prod": { ownerUid: "producer-1", status: "ACTIVE" },
        "users/producer-1": { roleTags: [] },
      });

      const req = new Request("http://localhost/api/channel", {
        headers: { authorization: "Bearer token" },
      });
      const ctx = await requireChannelPermission(req, "chan-prod", "video.upload", fs);

      expect(ctx.role).toBe("owner");
      expect(ctx.permissions).toContain("video.upload");
    });

    it("throws 404 for non-existent channel", async () => {
      const fs = mockFirestore({});
      const req = new Request("http://localhost/api/channel");
      await expect(requireChannelPermission(req, "non-existent", "channel.read", fs))
        .rejects.toMatchObject({ status: 404, code: "CHANNEL_NOT_FOUND" });
    });
  });
});
