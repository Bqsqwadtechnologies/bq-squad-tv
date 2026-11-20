import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Route } from "@/routes/settings";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: any) => config.component,
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: () => ({ location: { pathname: "/settings" } }),
}));

vi.mock("@/components/BrandLogo", () => ({
  BrandLogo: () => <div data-testid="brand-logo">BQ SQWAD TV</div>,
}));

vi.mock("@/lib/firebase-web-auth", () => ({
  getWebAccount: vi.fn().mockResolvedValue(null),
  signOutWeb: vi.fn().mockResolvedValue(undefined),
}));

describe("Kids Mode and Parental Controls (V5-05 Batch 6)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows kids safe mode, parental controls, notifications, and playback preferences", () => {
    const Settings = Route as any;
    render(<Settings />);

    expect(screen.getByText("Kids Safe Mode")).toBeInTheDocument();
    expect(screen.getByText("Parental Controls")).toBeInTheDocument();
    expect(screen.getByText("Playback Quality")).toBeInTheDocument();
    expect(screen.getByText("Notifications")).toBeInTheDocument();
  });

  it("requires parental controls before kids mode can be switched on", async () => {
    const Settings = Route as any;
    render(<Settings />);

    const kidsModeToggle = screen.getByRole("button", { name: /Toggle Kids Safe Mode/i });
    fireEvent.click(kidsModeToggle);

    await waitFor(() => {
      expect(screen.getByText("Parental Controls PIN")).toBeInTheDocument();
    });
  });
});
