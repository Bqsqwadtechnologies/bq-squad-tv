import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Route } from "@/routes/library";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: any) => config.component,
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: () => ({ location: { pathname: "/library" } }),
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

describe("Viewer Library Screen (V5-05 Batch 4)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders watchlist items and tab buttons", () => {
    const Library = Route as any;
    render(<Library />);

    expect(screen.getByText("My Entertainment Library")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Watchlist/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue Watching/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /My Purchases/i })).toBeInTheDocument();
    expect(screen.getByText(/Downloads \(Offline Viewer\)/i)).toBeInTheDocument();

    expect(screen.getByText("Lagos Nights: Shadows of Victoria Island")).toBeInTheDocument();
    expect(screen.getByText("Abidjan Hustle Season 1")).toBeInTheDocument();
  });

  it("filters items by continue watching progress when switching tabs", () => {
    const Library = Route as any;
    render(<Library />);

    const continueBtn = screen.getByRole("button", { name: /Continue Watching/i });
    fireEvent.click(continueBtn);

    expect(screen.getByText("45% watched")).toBeInTheDocument();
    expect(screen.getByText("80% watched")).toBeInTheDocument();
  });

  it("filters items by purchases when switching to My Purchases tab", () => {
    const Library = Route as any;
    render(<Library />);

    const purchasesBtn = screen.getByRole("button", { name: /My Purchases/i });
    fireEvent.click(purchasesBtn);

    expect(screen.getByText("Golden Savannah Documentary")).toBeInTheDocument();
    const purchasedBadges = screen.getAllByText("Purchased");
    expect(purchasedBadges.length).toBeGreaterThan(0);
  });

  it("filters items by content type", () => {
    const Library = Route as any;
    render(<Library />);

    const seriesBtn = screen.getByRole("button", { name: /^series$/i });
    fireEvent.click(seriesBtn);

    expect(screen.getByText("Abidjan Hustle Season 1")).toBeInTheDocument();
    expect(screen.queryByText("Lagos Nights: Shadows of Victoria Island")).not.toBeInTheDocument();
  });

  it("allows removing items from library with persistence", () => {
    const Library = Route as any;
    render(<Library />);

    const removeBtn = screen.getByLabelText("Remove Lagos Nights: Shadows of Victoria Island");
    fireEvent.click(removeBtn);

    expect(screen.queryByText("Lagos Nights: Shadows of Victoria Island")).not.toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem("bq_viewer_library") || "[]");
    expect(stored.find((item: any) => item.id === "mov_lagos_nights")).toBeUndefined();
  });
});
