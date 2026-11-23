import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Route } from "@/routes/live-tv";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: any) => {
    const Comp = config.component;
    Comp.useParams = () => ({ channelId: "demo" });
    return Comp;
  },
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: () => ({ location: { pathname: "/live-tv" } }),
}));

vi.mock("@/components/ProfileAccountHub", () => ({
  ProfileAccountHub: () => <div data-testid="profile-hub">Account Hub</div>,
}));

vi.mock("@/components/ViewerBottomNav", () => ({
  ViewerBottomNav: ({ activeTab }: any) => <nav data-testid="bottom-nav">Active: {activeTab}</nav>,
}));

vi.mock("@/components/BrandLogo", () => ({
  BrandLogo: () => <div data-testid="brand-logo">BQ SQWAD TV</div>,
}));

describe("Live TV Screen (V5-05 Batch 3)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders live channels grid with LIVE badges and viewer counts", () => {
    const LiveTv = Route as any;
    render(<LiveTv />);

    expect(screen.getByText("Live TV Channels & Programme Guide")).toBeInTheDocument();
    expect(screen.getByText("BQ SQWAD Prime Live")).toBeInTheDocument();
    expect(screen.getByText("Super League Football")).toBeInTheDocument();

    const liveBadges = screen.getAllByText("LIVE");
    expect(liveBadges.length).toBeGreaterThan(0);
    expect(screen.getByText("2,480")).toBeInTheDocument();
  });

  it("renders Now Showing and Up Next programme info", () => {
    const LiveTv = Route as any;
    render(<LiveTv />);

    const nowShowingLabels = screen.getAllByText("Now Showing");
    expect(nowShowingLabels.length).toBeGreaterThan(0);

    const upNextLabels = screen.getAllByText("Up Next");
    expect(upNextLabels.length).toBeGreaterThan(0);

    expect(screen.getByText("Prime Global Showcase — Live Concert")).toBeInTheDocument();
    expect(screen.getByText("Late Night African Beats")).toBeInTheDocument();
  });

  it("toggles between channels grid and electronic programme guide views", () => {
    const LiveTv = Route as any;
    render(<LiveTv />);

    const guideToggle = screen.getByRole("button", { name: /Programme Guide/i });
    fireEvent.click(guideToggle);

    expect(screen.getByText("Full Electronic Programme Guide")).toBeInTheDocument();
    expect(screen.getByText("Pan-African Evening News Bulletin")).toBeInTheDocument();

    const gridToggle = screen.getByRole("button", { name: /Channels Grid/i });
    fireEvent.click(gridToggle);

    expect(screen.getByText("BQ SQWAD Prime Live")).toBeInTheDocument();
  });

  it("allows setting and removing upcoming programme reminders in localStorage", async () => {
    const LiveTv = Route as any;
    render(<LiveTv />);

    const remindButtons = screen.getAllByRole("button", { name: /Remind Me/i });
    expect(remindButtons.length).toBeGreaterThan(0);

    const firstButton = remindButtons[0];
    if (!firstButton) throw new Error("Expected an actionable button");
    fireEvent.click(firstButton);

    await waitFor(() => {
      expect(screen.getAllByText("Reminder Set").length).toBeGreaterThan(0);
    });

    const stored = JSON.parse(localStorage.getItem("bq_programme_reminders") || "{}");
    expect(Object.keys(stored).length).toBeGreaterThan(0);
  });
});
