import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { Route } from "@/routes/index";

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
    useRouterState: vi.fn(() => "/"),
    useNavigate: vi.fn(() => vi.fn()),
  };
});

describe("Viewer Home Dashboard (V5-05 Batch 2 / V5-06 Batch 2)", () => {
  const HomeComponent = Route.options.component!;

  it("renders the welcome banner and call-to-action buttons", () => {
    render(<HomeComponent />);

    expect(screen.getByText(/PREMIUM ENTERTAINMENT ON BQ SQWAD TV/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /Start Watching/i })).toBeDefined();
  });

  it("renders the 4 KPI cards with truthful initial metrics", () => {
    render(<HomeComponent />);

    expect(screen.getByText(/Watch Time/i)).toBeDefined();
    expect(screen.getByText(/0\.0 hrs/i)).toBeDefined();

    expect(screen.getByText(/Available Balance/i)).toBeDefined();
    expect(screen.getByText(/0\.00/i)).toBeDefined();

    expect(screen.getAllByText(/^Rewards$/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/0 pts/i)).toBeDefined();

    expect(screen.getByText(/Referrals/i)).toBeDefined();
    expect(screen.getByText("0")).toBeDefined();
  });

  it("renders quick access navigation tiles for Live TV, Movies, Series, and Kids", () => {
    render(<HomeComponent />);

    expect(screen.getAllByRole("link", { name: /Live TV/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Movies/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Series/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Kids/i }).length).toBeGreaterThan(0);
  });

  it("renders live now, trending, activity, and referral sections", () => {
    render(<HomeComponent />);

    expect(screen.getByText(/Live Now/i)).toBeDefined();
    expect(screen.getByText(/Trending Now/i)).toBeDefined();
    expect(screen.getByText(/For You/i)).toBeDefined();
    expect(screen.getByText(/Your Activity/i)).toBeDefined();
    expect(screen.getByText(/Refer Friends & Earn Rewards/i)).toBeDefined();
  });

  it("opens referral modal with referral code when clicking Refer Now button", () => {
    render(<HomeComponent />);

    const referButton = screen.getByRole("button", { name: /Refer Now/i });
    fireEvent.click(referButton);

    expect(screen.getByText(/Your Referral Code/i)).toBeDefined();
  });
});
