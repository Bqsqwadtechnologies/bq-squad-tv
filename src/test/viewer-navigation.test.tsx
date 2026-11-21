import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { ViewerBottomNav } from "@/components/ViewerBottomNav";
import { ProfileAccountHub } from "@/components/ProfileAccountHub";
import { getWebAccount, signOutWeb } from "@/lib/firebase-web-auth";

vi.mock("@/lib/firebase-web-auth", () => ({
  getWebAccount: vi.fn(),
  signOutWeb: vi.fn(),
}));

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

describe("Viewer Navigation & Account Hub (V5-05 Batch 1)", () => {
  it("renders 5 bottom navigation tabs in standard order: Home, Live TV, Library, Downloads, Settings", () => {
    render(<ViewerBottomNav activeTab="home" />);
    
    const nav = screen.getByRole("navigation", { name: "Viewer Bottom Navigation" });
    expect(nav).toBeDefined();

    const links = screen.getAllByRole("link");
    expect(links.length).toBe(5);

    const labels = links.map((el) => el.textContent?.trim());
    expect(labels).toEqual(["Home", "Live TV", "Library", "Downloads", "Settings"]);
  });

  it("applies active cyan/blue styling to the currently active navigation tab", () => {
    const { rerender } = render(<ViewerBottomNav activeTab="live-tv" />);
    const liveTvLink = screen.getByRole("link", { name: /Live TV/i });
    expect(liveTvLink.className).toContain("text-[#00D8F5]");

    rerender(<ViewerBottomNav activeTab="downloads" />);
    const downloadsLink = screen.getByRole("link", { name: /Downloads/i });
    expect(downloadsLink.className).toContain("text-[#00D8F5]");
  });

  it("renders the account profile avatar and hub trigger", () => {
    vi.mocked(getWebAccount).mockResolvedValue(null);
    render(<ProfileAccountHub />);
    const trigger = screen.getByRole("button", { name: /Open Account Hub/i });
    expect(trigger).toBeDefined();
  });

  it("shows sign-in actions and never fabricates a viewer email for anonymous visitors", async () => {
    vi.mocked(getWebAccount).mockResolvedValue(null);
    render(<ProfileAccountHub />);
    screen.getByRole("button", { name: /Open Account Hub/i }).click();
    expect(await screen.findByRole("button", { name: /Sign In \/ Create Account/i })).toBeInTheDocument();
    expect(screen.queryByText(/viewer@bqsqwad\.tv/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Sign Out")).not.toBeInTheDocument();
    expect(screen.queryByText("Producer Console")).not.toBeInTheDocument();
  });

  it("shows account links and sign out only for a confirmed authenticated account", async () => {
    vi.mocked(getWebAccount).mockResolvedValue({
      uid: "firebase-user-1",
      email: "viewer@example.com",
      emailVerified: true,
    });
    render(<ProfileAccountHub />);
    screen.getByRole("button", { name: /Open Account Hub/i }).click();
    expect(await screen.findByText("viewer@example.com")).toBeInTheDocument();
    expect(screen.getByText("Sign Out")).toBeInTheDocument();
    expect(screen.getByText("Wallet & Balance")).toBeInTheDocument();
  });

  it("does not show signed-in links when session verification fails", async () => {
    vi.mocked(getWebAccount).mockRejectedValue(new Error("network unavailable"));
    render(<ProfileAccountHub />);
    screen.getByRole("button", { name: /Open Account Hub/i }).click();
    expect(await screen.findByRole("button", { name: /Sign In \/ Create Account/i })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/could not verify your session/i);
    expect(screen.queryByText("Sign Out")).not.toBeInTheDocument();
  });
});
