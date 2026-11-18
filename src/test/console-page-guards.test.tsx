import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// Mock @tanstack/react-router's Link so it can render outside a full RouterProvider in unit tests
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, className, ...props }: any) => (
      <a href={typeof to === "string" ? to : "/"} className={className} {...props}>
        {children}
      </a>
    ),
  };
});

// Mock firebase-web-auth
vi.mock("@/lib/firebase-web-auth", () => ({
  restoreWebSession: vi.fn(),
  getWebAuthHeaders: vi.fn().mockResolvedValue({ authorization: "Bearer fake-token" }),
  signInWithEmailPassword: vi.fn(),
}));

import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import { Route as AdminRoute } from "@/routes/admin.index";
import { Route as ProducerRoute } from "@/routes/producer.index";
import { Route as ProviderRoute } from "@/routes/provider.index";
import { restoreWebSession } from "@/lib/firebase-web-auth";

describe("Batch 08: Console Page Guards", () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchedUrls: string[];

  beforeEach(() => {
    fetchedUrls = [];
    originalFetch = globalThis.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function setupMockFetch(accountData: any = null, status = 200) {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url.toString();
      fetchedUrls.push(urlString);

      if (urlString.includes("/api/public/v1/auth/web/me")) {
        if (!accountData || status !== 200) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: status === 200 ? 401 : status,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify(accountData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Default mock response for other console endpoints
      return new Response(JSON.stringify({ ok: true, data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
  }

  describe("HTML Head Robots Meta", () => {
    it("ensures /admin route sets noindex, nofollow, noarchive", () => {
      const head = (AdminRoute.options.head as any)?.();
      const robots = head?.meta?.find((m: any) => m.name === "robots");
      expect(robots?.content).toBe("noindex, nofollow, noarchive");
    });

    it("ensures /producer route sets noindex, nofollow, noarchive", () => {
      const head = (ProducerRoute.options.head as any)?.();
      const robots = head?.meta?.find((m: any) => m.name === "robots");
      expect(robots?.content).toBe("noindex, nofollow, noarchive");
    });

    it("ensures /provider route sets noindex, nofollow, noarchive", () => {
      const head = (ProviderRoute.options.head as any)?.();
      const robots = head?.meta?.find((m: any) => m.name === "robots");
      expect(robots?.content).toBe("noindex, nofollow, noarchive");
    });
  });

  describe("Anonymous visitors (unauthenticated)", () => {
    beforeEach(() => {
      vi.mocked(restoreWebSession).mockResolvedValue(null);
      setupMockFetch(null);
    });

    it("renders plain 404 page not found for anonymous visitor on /admin", async () => {
      render(
        <ConsolePageGuard role="admin">
          <div data-testid="admin-content">Admin Dashboard</div>
        </ConsolePageGuard>
      );

      await waitFor(() => {
        expect(screen.getByText("404")).toBeInTheDocument();
        expect(screen.getByText("Page not found")).toBeInTheDocument();
        expect(
          screen.getByText("The page you're looking for doesn't exist or has been moved.")
        ).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Go home" })).toBeInTheDocument();
      });

      expect(screen.queryByTestId("admin-content")).not.toBeInTheDocument();
      // Ensure no admin data was fetched
      expect(fetchedUrls.some((u) => u.includes("/admin/"))).toBe(false);
    });

    it("renders plain 404 page not found for anonymous visitor on /producer", async () => {
      render(
        <ConsolePageGuard role="producer">
          <div data-testid="producer-content">Producer Dashboard</div>
        </ConsolePageGuard>
      );

      await waitFor(() => {
        expect(screen.getByText("404")).toBeInTheDocument();
        expect(screen.getByText("Page not found")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("producer-content")).not.toBeInTheDocument();
      expect(fetchedUrls.some((u) => u.includes("/producer/"))).toBe(false);
    });

    it("renders plain 404 page not found for anonymous visitor on /provider", async () => {
      render(
        <ConsolePageGuard role="provider">
          <div data-testid="provider-content">Provider Dashboard</div>
        </ConsolePageGuard>
      );

      await waitFor(() => {
        expect(screen.getByText("404")).toBeInTheDocument();
        expect(screen.getByText("Page not found")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("provider-content")).not.toBeInTheDocument();
      expect(fetchedUrls.some((u) => u.includes("/provider/"))).toBe(false);
    });
  });

  describe("Viewer role (no elevated permissions)", () => {
    beforeEach(() => {
      vi.mocked(restoreWebSession).mockResolvedValue("viewer-jwt-token");
      setupMockFetch({
        uid: "viewer-1",
        email: "viewer@example.com",
        emailVerified: true,
        roles: ["viewer"],
        isOwner: false,
        modules: [],
      });
    });

    it("renders 404 and denies viewer on /admin without fetching admin data", async () => {
      render(
        <ConsolePageGuard role="admin">
          <div data-testid="admin-content">Admin Secret</div>
        </ConsolePageGuard>
      );

      await waitFor(() => {
        expect(screen.getByText("404")).toBeInTheDocument();
        expect(screen.getByText("Page not found")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("admin-content")).not.toBeInTheDocument();
      expect(fetchedUrls.some((u) => u.includes("/admin/overview"))).toBe(false);
    });

    it("renders 404 and denies viewer on /producer without fetching producer data", async () => {
      render(
        <ConsolePageGuard role="producer">
          <div data-testid="producer-content">Producer Secret</div>
        </ConsolePageGuard>
      );

      await waitFor(() => {
        expect(screen.getByText("404")).toBeInTheDocument();
        expect(screen.getByText("Page not found")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("producer-content")).not.toBeInTheDocument();
      expect(fetchedUrls.some((u) => u.includes("/producer/mobile-summary"))).toBe(false);
    });

    it("renders 404 and denies viewer on /provider without fetching provider data", async () => {
      render(
        <ConsolePageGuard role="provider">
          <div data-testid="provider-content">Provider Secret</div>
        </ConsolePageGuard>
      );

      await waitFor(() => {
        expect(screen.getByText("404")).toBeInTheDocument();
        expect(screen.getByText("Page not found")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("provider-content")).not.toBeInTheDocument();
      expect(fetchedUrls.some((u) => u.includes("/provider/dashboard"))).toBe(false);
    });
  });

  describe("Producer role isolation across consoles", () => {
    beforeEach(() => {
      vi.mocked(restoreWebSession).mockResolvedValue("producer-jwt-token");
      setupMockFetch({
        uid: "producer-1",
        email: "producer@example.com",
        emailVerified: true,
        roles: ["viewer", "producer"],
        isOwner: false,
        modules: [],
        producerPlanActive: true,
      });
    });

    it("denies producer on /admin with 404 page", async () => {
      render(
        <ConsolePageGuard role="admin">
          <div data-testid="admin-content">Admin Secret</div>
        </ConsolePageGuard>
      );

      await waitFor(() => {
        expect(screen.getByText("404")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("admin-content")).not.toBeInTheDocument();
    });

    it("denies producer on /provider with 404 page", async () => {
      render(
        <ConsolePageGuard role="provider">
          <div data-testid="provider-content">Provider Secret</div>
        </ConsolePageGuard>
      );

      await waitFor(() => {
        expect(screen.getByText("404")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("provider-content")).not.toBeInTheDocument();
    });

    it("authorizes producer on /producer and renders console", async () => {
      render(
        <ConsolePageGuard role="producer">
          {({ token, account }) => (
            <div data-testid="producer-content">
              Welcome Producer {account.email} with token {token}
            </div>
          )}
        </ConsolePageGuard>
      );

      await waitFor(() => {
        expect(screen.getByTestId("producer-content")).toBeInTheDocument();
      });
      expect(screen.getByText(/Welcome Producer producer@example.com/)).toBeInTheDocument();
    });
  });

  describe("Provider role isolation across consoles", () => {
    beforeEach(() => {
      vi.mocked(restoreWebSession).mockResolvedValue("provider-jwt-token");
      setupMockFetch({
        uid: "provider-rep-1",
        email: "provider@partner.com",
        emailVerified: true,
        roles: ["viewer", "provider"],
        isOwner: false,
        modules: [],
        providerId: "partner-network-1",
      });
    });

    it("denies provider on /admin with 404 page", async () => {
      render(
        <ConsolePageGuard role="admin">
          <div data-testid="admin-content">Admin Secret</div>
        </ConsolePageGuard>
      );

      await waitFor(() => {
        expect(screen.getByText("404")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("admin-content")).not.toBeInTheDocument();
    });

    it("denies provider on /producer with 404 page", async () => {
      render(
        <ConsolePageGuard role="producer">
          <div data-testid="producer-content">Producer Secret</div>
        </ConsolePageGuard>
      );

      await waitFor(() => {
        expect(screen.getByText("404")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("producer-content")).not.toBeInTheDocument();
    });

    it("authorizes provider on /provider and renders console", async () => {
      render(
        <ConsolePageGuard role="provider">
          {({ token, account }) => (
            <div data-testid="provider-content">
              Welcome Partner {account.providerId} with token {token}
            </div>
          )}
        </ConsolePageGuard>
      );

      await waitFor(() => {
        expect(screen.getByTestId("provider-content")).toBeInTheDocument();
      });
      expect(screen.getByText(/Welcome Partner partner-network-1/)).toBeInTheDocument();
    });
  });

  describe("Zillionaire Owner and Delegated Operators", () => {
    it("authorizes Zillionaire owner on /admin and renders dashboard", async () => {
      vi.mocked(restoreWebSession).mockResolvedValue("owner-jwt-token");
      setupMockFetch({
        uid: "owner-uid",
        email: "owner@bqsqwad.tv",
        emailVerified: true,
        roles: ["viewer"],
        isOwner: true,
        modules: ["overview", "roles", "finance", "channels"],
      });

      render(
        <ConsolePageGuard role="admin">
          {({ account }) => (
            <div data-testid="admin-content">
              Zillionaire Dashboard - Owner: {String(account.isOwner)}
            </div>
          )}
        </ConsolePageGuard>
      );

      await waitFor(() => {
        expect(screen.getByTestId("admin-content")).toBeInTheDocument();
      });
      expect(screen.getByText(/Owner: true/)).toBeInTheDocument();
    });

    it("authorizes delegated operator with modules on /admin", async () => {
      vi.mocked(restoreWebSession).mockResolvedValue("operator-jwt-token");
      setupMockFetch({
        uid: "operator-uid",
        email: "operator@bqsqwad.tv",
        emailVerified: true,
        roles: ["viewer"],
        isOwner: false,
        modules: ["support", "moderation"],
      });

      render(
        <ConsolePageGuard role="admin">
          <div data-testid="admin-content">Operator Dashboard</div>
        </ConsolePageGuard>
      );

      await waitFor(() => {
        expect(screen.getByTestId("admin-content")).toBeInTheDocument();
      });
    });

    it("denies Zillionaire on /producer if they do not have the producer role", async () => {
      vi.mocked(restoreWebSession).mockResolvedValue("owner-jwt-token");
      setupMockFetch({
        uid: "owner-uid",
        email: "owner@bqsqwad.tv",
        emailVerified: true,
        roles: ["viewer"],
        isOwner: true,
        modules: ["overview"],
      });

      render(
        <ConsolePageGuard role="producer">
          <div data-testid="producer-content">Producer Dashboard</div>
        </ConsolePageGuard>
      );

      await waitFor(() => {
        expect(screen.getByText("404")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("producer-content")).not.toBeInTheDocument();
    });

    it("denies Zillionaire on /provider if they do not have the provider role", async () => {
      vi.mocked(restoreWebSession).mockResolvedValue("owner-uid");
      setupMockFetch({
        uid: "owner-uid",
        email: "owner@bqsqwad.tv",
        emailVerified: true,
        roles: ["viewer"],
        isOwner: true,
        modules: ["overview"],
      });

      render(
        <ConsolePageGuard role="provider">
          <div data-testid="provider-content">Provider Dashboard</div>
        </ConsolePageGuard>
      );

      await waitFor(() => {
        expect(screen.getByText("404")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("provider-content")).not.toBeInTheDocument();
    });
  });
});
