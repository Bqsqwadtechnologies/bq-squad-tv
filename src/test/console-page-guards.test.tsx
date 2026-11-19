import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// Mock @tanstack/react-router's Link so it can render outside a full RouterProvider in unit tests
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({
      to,
      children,
      className,
      ...props
    }: {
      to?: unknown;
      children?: React.ReactNode;
      className?: string;
      [key: string]: unknown;
    }) => (
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
import { Route as AdminRoute } from "@/routes/zillionaire.index";
import { Route as ProducerRoute } from "@/routes/producer.index";
import { Route as ProviderRoute } from "@/routes/provider.index";
import { restoreWebSession } from "@/lib/firebase-web-auth";

interface MetaItem {
  name?: string;
  content?: string;
  [key: string]: unknown;
}

type HeadFunction = () => { meta?: MetaItem[] };

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

  function setupMockFetch(accountData: Record<string, unknown> | null = null, status = 200) {
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
      const headFn = AdminRoute.options.head as unknown as HeadFunction | undefined;
      const head = headFn?.();
      const robots = head?.meta?.find((m) => m.name === "robots");
      expect(robots?.content).toBe("noindex, nofollow, noarchive");
    });

    it("ensures /producer route sets noindex, nofollow, noarchive", () => {
      const headFn = ProducerRoute.options.head as unknown as HeadFunction | undefined;
      const head = headFn?.();
      const robots = head?.meta?.find((m) => m.name === "robots");
      expect(robots?.content).toBe("noindex, nofollow, noarchive");
    });

    it("ensures /provider route sets noindex, nofollow, noarchive", () => {
      const headFn = ProviderRoute.options.head as unknown as HeadFunction | undefined;
      const head = headFn?.();
      const robots = head?.meta?.find((m) => m.name === "robots");
      expect(robots?.content).toBe("noindex, nofollow, noarchive");
    });
  });

  describe("Anonymous visitors (unauthenticated)", () => {
    beforeEach(() => {
      vi.mocked(restoreWebSession).mockResolvedValue(null);
      setupMockFetch(null);
    });

    it("shows 404 parity on /admin and does not leak admin console", async () => {
      render(
        <ConsolePageGuard role="admin">
          <div data-testid="secret-admin-console">Admin Console Content</div>
        </ConsolePageGuard>,
      );

      await waitFor(() => {
        expect(screen.getByText("Page not found")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("secret-admin-console")).not.toBeInTheDocument();
      expect(screen.getByText(/doesn't exist or has been moved/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /go home/i })).toBeInTheDocument();
    });

    it("shows 404 parity on /producer and does not leak producer console", async () => {
      render(
        <ConsolePageGuard role="producer">
          <div data-testid="secret-producer-console">Producer Console Content</div>
        </ConsolePageGuard>,
      );

      await waitFor(() => {
        expect(screen.getByText("Page not found")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("secret-producer-console")).not.toBeInTheDocument();
    });

    it("shows 404 parity on /provider and does not leak provider console", async () => {
      render(
        <ConsolePageGuard role="provider">
          <div data-testid="secret-provider-console">Provider Console Content</div>
        </ConsolePageGuard>,
      );

      await waitFor(() => {
        expect(screen.getByText("Page not found")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("secret-provider-console")).not.toBeInTheDocument();
    });
  });

  describe("Standard viewer (logged in, no admin/producer/provider role)", () => {
    beforeEach(() => {
      vi.mocked(restoreWebSession).mockResolvedValue({
        uid: "viewer-123",
        email: "viewer@example.com",
      } as unknown as Awaited<ReturnType<typeof restoreWebSession>>);

      setupMockFetch({
        uid: "viewer-123",
        email: "viewer@example.com",
        emailVerified: true,
        roles: ["viewer"],
        isOwner: false,
        modules: [],
        producerPlanActive: false,
        providerId: null,
      });
    });

    it("denies /admin with exact 404 parity", async () => {
      render(
        <ConsolePageGuard role="admin">
          <div data-testid="secret-admin-console">Admin Console Content</div>
        </ConsolePageGuard>,
      );

      await waitFor(() => {
        expect(screen.getByText("Page not found")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("secret-admin-console")).not.toBeInTheDocument();
    });

    it("denies /producer with exact 404 parity", async () => {
      render(
        <ConsolePageGuard role="producer">
          <div data-testid="secret-producer-console">Producer Console Content</div>
        </ConsolePageGuard>,
      );

      await waitFor(() => {
        expect(screen.getByText("Page not found")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("secret-producer-console")).not.toBeInTheDocument();
    });

    it("denies /provider with exact 404 parity", async () => {
      render(
        <ConsolePageGuard role="provider">
          <div data-testid="secret-provider-console">Provider Console Content</div>
        </ConsolePageGuard>,
      );

      await waitFor(() => {
        expect(screen.getByText("Page not found")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("secret-provider-console")).not.toBeInTheDocument();
    });
  });

  describe("Producer visitor isolation", () => {
    beforeEach(() => {
      vi.mocked(restoreWebSession).mockResolvedValue({
        uid: "producer-123",
        email: "producer@example.com",
      } as unknown as Awaited<ReturnType<typeof restoreWebSession>>);

      setupMockFetch({
        uid: "producer-123",
        email: "producer@example.com",
        emailVerified: true,
        roles: ["viewer", "producer"],
        isOwner: false,
        modules: [],
        producerPlanActive: true,
        providerId: null,
      });
    });

    it("allows /producer when producerPlanActive is true", async () => {
      render(
        <ConsolePageGuard role="producer">
          <div data-testid="producer-console">Producer Console Content</div>
        </ConsolePageGuard>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("producer-console")).toBeInTheDocument();
      });

      expect(screen.queryByText("Page not found")).not.toBeInTheDocument();
    });

    it("denies /admin with exact 404 parity for producer", async () => {
      render(
        <ConsolePageGuard role="admin">
          <div data-testid="secret-admin-console">Admin Console Content</div>
        </ConsolePageGuard>,
      );

      await waitFor(() => {
        expect(screen.getByText("Page not found")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("secret-admin-console")).not.toBeInTheDocument();
    });

    it("denies /provider with exact 404 parity for producer", async () => {
      render(
        <ConsolePageGuard role="provider">
          <div data-testid="secret-provider-console">Provider Console Content</div>
        </ConsolePageGuard>,
      );

      await waitFor(() => {
        expect(screen.getByText("Page not found")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("secret-provider-console")).not.toBeInTheDocument();
    });
  });

  describe("Provider visitor isolation", () => {
    beforeEach(() => {
      vi.mocked(restoreWebSession).mockResolvedValue({
        uid: "provider-123",
        email: "provider@example.com",
      } as unknown as Awaited<ReturnType<typeof restoreWebSession>>);

      setupMockFetch({
        uid: "provider-123",
        email: "provider@example.com",
        emailVerified: true,
        roles: ["viewer", "provider"],
        isOwner: false,
        modules: [],
        producerPlanActive: false,
        providerId: "prov-fastly-1",
      });
    });

    it("allows /provider when providerId is present", async () => {
      render(
        <ConsolePageGuard role="provider">
          <div data-testid="provider-console">Provider Console Content</div>
        </ConsolePageGuard>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("provider-console")).toBeInTheDocument();
      });

      expect(screen.queryByText("Page not found")).not.toBeInTheDocument();
    });

    it("denies /admin with exact 404 parity for provider", async () => {
      render(
        <ConsolePageGuard role="admin">
          <div data-testid="secret-admin-console">Admin Console Content</div>
        </ConsolePageGuard>,
      );

      await waitFor(() => {
        expect(screen.getByText("Page not found")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("secret-admin-console")).not.toBeInTheDocument();
    });

    it("denies /producer with exact 404 parity for provider", async () => {
      render(
        <ConsolePageGuard role="producer">
          <div data-testid="secret-producer-console">Producer Console Content</div>
        </ConsolePageGuard>,
      );

      await waitFor(() => {
        expect(screen.getByText("Page not found")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("secret-producer-console")).not.toBeInTheDocument();
    });
  });

  describe("Owner and Zillionaire Delegate", () => {
    it("allows Owner into /admin", async () => {
      vi.mocked(restoreWebSession).mockResolvedValue({
        uid: "owner-123",
        email: "owner@example.com",
      } as unknown as Awaited<ReturnType<typeof restoreWebSession>>);

      setupMockFetch({
        uid: "owner-123",
        email: "owner@example.com",
        emailVerified: true,
        roles: ["viewer", "admin", "owner"],
        isOwner: true,
        modules: ["*"],
        producerPlanActive: true,
        providerId: "prov-main",
      });

      render(
        <ConsolePageGuard role="admin">
          <div data-testid="admin-console">Admin Console Content</div>
        </ConsolePageGuard>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("admin-console")).toBeInTheDocument();
      });

      expect(screen.queryByText("Page not found")).not.toBeInTheDocument();
    });

    it("allows delegate with specific module into module-guarded route", async () => {
      vi.mocked(restoreWebSession).mockResolvedValue({
        uid: "delegate-123",
        email: "delegate@example.com",
      } as unknown as Awaited<ReturnType<typeof restoreWebSession>>);

      setupMockFetch({
        uid: "delegate-123",
        email: "delegate@example.com",
        emailVerified: true,
        roles: ["viewer", "admin"],
        isOwner: false,
        modules: ["catalog_read", "catalog_write"],
        producerPlanActive: false,
        providerId: null,
      });

      render(
        <ConsolePageGuard role="admin" module="catalog_write">
          <div data-testid="catalog-admin-console">Catalog Admin Content</div>
        </ConsolePageGuard>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("catalog-admin-console")).toBeInTheDocument();
      });
    });

    it("denies delegate missing the required module with exact 404 parity", async () => {
      vi.mocked(restoreWebSession).mockResolvedValue({
        uid: "delegate-123",
        email: "delegate@example.com",
      } as unknown as Awaited<ReturnType<typeof restoreWebSession>>);

      setupMockFetch({
        uid: "delegate-123",
        email: "delegate@example.com",
        emailVerified: true,
        roles: ["viewer", "admin"],
        isOwner: false,
        modules: ["catalog_read"],
        producerPlanActive: false,
        providerId: null,
      });

      render(
        <ConsolePageGuard role="admin" module="financials">
          <div data-testid="financials-admin-console">Financials Admin Content</div>
        </ConsolePageGuard>,
      );

      await waitFor(() => {
        expect(screen.getByText("Page not found")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("financials-admin-console")).not.toBeInTheDocument();
    });
  });

  describe("API Failure / Network Error Parity", () => {
    it("renders 404 parity when server endpoint returns 500", async () => {
      vi.mocked(restoreWebSession).mockResolvedValue({
        uid: "user-123",
        email: "user@example.com",
      } as unknown as Awaited<ReturnType<typeof restoreWebSession>>);

      setupMockFetch(null, 500);

      render(
        <ConsolePageGuard role="admin">
          <div data-testid="secret-admin-console">Admin Console Content</div>
        </ConsolePageGuard>,
      );

      await waitFor(() => {
        expect(screen.getByText("Page not found")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("secret-admin-console")).not.toBeInTheDocument();
    });
  });
});
