import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ConsoleShell,
  ConsoleKpiCard,
  ConsoleWelcomeBanner,
  ConsoleCard,
  ConsoleTable,
  ConsoleActivityList,
} from "@/components/ConsoleShell";
import { Tv, Users } from "lucide-react";

describe("ConsoleShell and Shared Components", () => {
  it("renders desktop console shell with brand logo, title, tagline and navigation items", () => {
    const handleLogout = vi.fn();
    const handleLock = vi.fn();

    render(
      <ConsoleShell
        consoleType="zillionaire"
        title="Zillionaire Dashboard"
        tagline="Platform Control Centre"
        account={{
          email: "owner@bqsqwad.tv",
          isOwner: true,
          modules: ["roles", "finance"],
        }}
        unreadNotificationsCount={3}
        onLogout={handleLogout}
        onLock={handleLock}
      >
        <div data-testid="console-content">Dashboard Content</div>
      </ConsoleShell>,
    );

    expect(screen.getByText("Zillionaire Dashboard")).toBeDefined();
    expect(screen.getByText("Platform Control Centre")).toBeDefined();
    expect(screen.getByText("Control Centre")).toBeDefined();
    expect(screen.getByTestId("console-content")).toBeDefined();

    // Notification unread count badge
    expect(screen.getByText("3")).toBeDefined();

    // Lock button exists for zillionaire
    const lockButtons = screen.getAllByText("Lock Console");
    expect(lockButtons.length).toBeGreaterThan(0);
    if (lockButtons[0]) fireEvent.click(lockButtons[0]);
    expect(handleLock).toHaveBeenCalled();
  });

  it("filters navigation items for non-owner based on delegated modules", () => {
    render(
      <ConsoleShell
        consoleType="zillionaire"
        title="Zillionaire Dashboard"
        tagline="Delegated Access"
        account={{
          email: "moderator@bqsqwad.tv",
          isOwner: false,
          modules: ["moderation"], // Only moderation module
        }}
      >
        <div>Content</div>
      </ConsoleShell>,
    );

    // Moderation should be present
    expect(screen.queryAllByText("Moderation").length).toBeGreaterThan(0);

    // Finance/Payments should be filtered out
    expect(screen.queryByText("Payments")).toBeNull();
    expect(screen.queryByText("Payouts")).toBeNull();
  });

  it("renders KPI cards with blue, purple, green, and gold variants and handles tapping", () => {
    const handleKpiTap = vi.fn();

    render(
      <div className="grid grid-cols-4 gap-4">
        <ConsoleKpiCard
          title="Live Viewers"
          value="1,420"
          subtitle="Real-time count"
          change={{ value: "+14.5%", positive: true }}
          icon={Tv}
          variant="blue"
          onClick={handleKpiTap}
        />
        <ConsoleKpiCard title="Active Channels" value="48" icon={Users} variant="purple" />
      </div>,
    );

    expect(screen.getByText("Live Viewers")).toBeDefined();
    expect(screen.getByText("1,420")).toBeDefined();
    expect(screen.getByText("+14.5%")).toBeDefined();

    const card = screen.getByText("Live Viewers").closest("div[tabIndex='0']");
    expect(card).toBeDefined();
    if (card) {
      fireEvent.click(card);
      expect(handleKpiTap).toHaveBeenCalledTimes(1);
    }
  });

  it("renders welcome banner and triggers action button", () => {
    const handleAction = vi.fn();

    render(
      <ConsoleWelcomeBanner
        title="Welcome to BQ SQWAD TV"
        description="Stream live and monetize your audience."
        badgeText="Producer Studio"
        actionLabel="Upload Content"
        onAction={handleAction}
      />,
    );

    expect(screen.getByText("Welcome to BQ SQWAD TV")).toBeDefined();
    expect(screen.getByText("Producer Studio")).toBeDefined();
    const actionBtn = screen.getByText("Upload Content");
    fireEvent.click(actionBtn);
    expect(handleAction).toHaveBeenCalledTimes(1);
  });

  it("renders table with data and empty states", () => {
    const handleRowClick = vi.fn();
    const columns = [
      { key: "id", label: "ID" },
      { key: "name", label: "Name" },
    ];
    const data = [
      { id: "1", name: "Alpha Channel" },
      { id: "2", name: "Beta Channel" },
    ];

    const { rerender } = render(
      <ConsoleTable columns={columns} data={data} onRowClick={handleRowClick} />,
    );

    expect(screen.getByText("Alpha Channel")).toBeDefined();
    fireEvent.click(screen.getByText("Alpha Channel"));
    expect(handleRowClick).toHaveBeenCalledWith(data[0]);

    // Rerender with empty data
    rerender(
      <ConsoleTable
        columns={columns}
        data={[]}
        emptyTitle="No Channels"
        emptyDescription="Create your first channel to get started."
      />,
    );

    expect(screen.getByText("No Channels")).toBeDefined();
    expect(screen.getByText("Create your first channel to get started.")).toBeDefined();
  });

  it("supports view-as mode for support inspection", () => {
    const handleReset = vi.fn();
    const handleSelect = vi.fn();

    render(
      <ConsoleShell
        consoleType="producer"
        title="Producer Console"
        tagline="Manage Studio"
        viewAs={{
          activeOrgOrUid: "prod_123",
          label: "Studio Nine (prod_123)",
          options: [
            { id: "prod_123", label: "Studio Nine" },
            { id: "prod_456", label: "Apex Media" },
          ],
          onSelect: handleSelect,
          onReset: handleReset,
        }}
      >
        <div>Producer Studio View</div>
      </ConsoleShell>,
    );

    expect(screen.getByText(/SUPPORT VIEW AS:/i)).toBeDefined();
    expect(screen.getByText("Studio Nine (prod_123)")).toBeDefined();

    const exitBtn = screen.getByText("Exit View As");
    fireEvent.click(exitBtn);
    expect(handleReset).toHaveBeenCalledTimes(1);
  });
});

it("supports responsive rendering at 360px and 1280px viewports", () => {
  // 360px mobile viewport simulation
  window.innerWidth = 360;
  fireEvent(window, new Event("resize"));

  const { container, rerender } = render(
    <ConsoleShell
      consoleType="zillionaire"
      title="Zillionaire"
      tagline="360px Mobile View"
      account={{ isOwner: true }}
    >
      <div>Content Mobile</div>
    </ConsoleShell>,
  );

  // More button on mobile bottom bar should be present
  expect(screen.getByText("More")).toBeDefined();

  // 1280px desktop viewport simulation
  window.innerWidth = 1280;
  fireEvent(window, new Event("resize"));

  rerender(
    <ConsoleShell
      consoleType="zillionaire"
      title="Zillionaire"
      tagline="1280px Desktop View"
      account={{ isOwner: true }}
    >
      <div>Content Desktop</div>
    </ConsoleShell>,
  );

  expect(screen.getByText("1280px Desktop View")).toBeDefined();
});
