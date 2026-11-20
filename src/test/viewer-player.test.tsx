import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Route } from "@/routes/content.$assetId";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: any) => {
    const Comp = config.component;
    Comp.useParams = () => ({ assetId: "test_asset_123" });
    return Comp;
  },
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: () => ({ location: { pathname: "/content/test_asset_123" } }),
}));

vi.mock("@/lib/firebase-web-auth", () => ({
  restoreWebSession: vi.fn().mockResolvedValue("mock_token"),
  getWebAuthHeaders: vi.fn().mockResolvedValue({ Authorization: "Bearer mock_token" }),
}));

const mockContent = {
  id: "test_asset_123",
  channelId: "channel_prime",
  title: "Super Eagles: African Kings",
  description: "Epic journey of Nigeria national football team to continental glory.",
  category: "Sports",
  posterUrl: "/brand/og-image.png",
  averageStars: 4.8,
  ratingCount: 156,
  contentRating: "13+",
  deliveryMode: "bq_hosted",
  currency: "NGN",
  ratePerMinuteMinor: 500, // 5 NGN per minute
  rightsCurrent: true,
};

describe("Viewer Player Experience (V5-05 Batch 5)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/content-assets/test_asset_123/comments")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      if (url.includes("/content-assets/test_asset_123")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ content: mockContent }),
        });
      }
      if (url.includes("/sessions/start")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              sessionId: "sess_xyz_789",
              playbackUrl: "https://stream.bqsqwad.tv/live/test.m3u8",
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });
  });

  it("renders content title, details, rate per minute, and Watch Now button", async () => {
    const ContentPage = Route as any;
    render(<ContentPage />);

    await waitFor(() => {
      expect(screen.getByText("Super Eagles: African Kings")).toBeInTheDocument();
      expect(screen.getByText("Watch now")).toBeInTheDocument();
      expect(screen.getByText("Channel: channel_prime")).toBeInTheDocument();
      expect(screen.getByText(/5\.00 per minute/i)).toBeInTheDocument();
    });
  });

  it("starts playback and displays live viewing meter with cost transparency", async () => {
    const ContentPage = Route as any;
    render(<ContentPage />);

    await waitFor(() => {
      expect(screen.getByText("Watch now")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Watch now"));

    await waitFor(() => {
      expect(screen.getByText("Live Viewing Meter")).toBeInTheDocument();
      expect(screen.getByText(/Elapsed:/i)).toBeInTheDocument();
      expect(screen.getByText("End playback")).toBeInTheDocument();
      expect(screen.getByText("Viewer #YZ_789")).toBeInTheDocument();
    });
  });

  it("renders player preferences for speed, subtitles, audio, and quality", async () => {
    const ContentPage = Route as any;
    render(<ContentPage />);

    await waitFor(() => {
      expect(screen.getByText("Watch now")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Watch now"));

    await waitFor(() => {
      expect(screen.getByText("Speed")).toBeInTheDocument();
      expect(screen.getByText("Subtitles")).toBeInTheDocument();
      expect(screen.getByText("Audio")).toBeInTheDocument();
      expect(screen.getByText("Quality")).toBeInTheDocument();
    });
  });

  it("handles copy link when clicking share button", async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    const ContentPage = Route as any;
    render(<ContentPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /share/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => {
      expect(screen.getByText("Link Copied")).toBeInTheDocument();
    });
  });
});
