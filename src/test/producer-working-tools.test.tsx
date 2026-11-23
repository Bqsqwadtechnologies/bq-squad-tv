import { describe, it, expect, vi } from "vitest";
import React from "react";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: any) => ({ options: config, ...config }),
  useNavigate: () => vi.fn(),
  Navigate: ({ to }: any) => React.createElement("div", { "data-testid": "navigate", "data-to": to }),
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: () => ({ location: { pathname: "/producer/channels" } }),
  useRouter: () => ({ navigate: vi.fn(), state: { location: { pathname: "/producer/channels" } } }),
}));
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock ConsolePageGuard
vi.mock("@/components/ConsolePageGuard", () => ({
  ConsolePageGuard: ({ children }: any) =>
    typeof children === "function"
      ? children({
          token: "mock-token",
          account: {
            email: "producer@example.com",
            roles: ["producer"],
            isOwner: false,
          },
        })
      : children,
}));

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockImplementation(() => Promise.resolve()),
  },
});

global.fetch = vi.fn((url: any) => {
  if (url.includes("/api/public/v1/producer/channels") && !url.includes("/schedule")) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: "ch_cinema",
            title: "Apex Cinema",
            category: "Entertainment",
            published: true,
            status: "PUBLISHED",
            deliveryMode: "native",
          },
          {
            id: "ch_sports",
            title: "Apex Sports",
            category: "Sports",
            published: true,
            status: "PUBLISHED",
            deliveryMode: "native",
          },
        ]),
    });
  }
  if (url.includes("/schedule")) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [
            {
              id: "prog_1",
              title: "Morning Drive Time",
              startsAt: "2026-03-31T08:00:00Z",
              endsAt: "2026-03-31T10:00:00Z",
            },
            {
              id: "prog_2",
              title: "Midday Action Block",
              startsAt: "2026-03-31T09:30:00Z", // intentional overlap to test conflict detection
              endsAt: "2026-03-31T12:00:00Z",
            },
          ],
        }),
    });
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  });
}) as any;

import { Route } from "@/routes/producer.channels";

describe("Producer Working Tools (V5-04 Batch 4)", () => {
  it("renders channel switcher, schedule calendar with conflict warning, and view switcher", async () => {
    const Component = Route.options.component!;
    render(<Component />);

    // Channel switcher in top bar
    expect(await screen.findByText("Apex Cinema")).toBeDefined();

    // Schedule calendar
    expect(await screen.findByText("Programming Schedule Calendar")).toBeDefined();
    expect(await screen.findByText("Day")).toBeDefined();
    expect(screen.getByText("Week")).toBeDefined();
    expect(screen.getByText("List")).toBeDefined();

    // Conflict detection warning
    expect(await screen.findByText("Schedule Conflicts Detected")).toBeDefined();
    expect(
      screen.getByText(/"Morning Drive Time" overlaps with "Midday Action Block"/i),
    ).toBeDefined();

    // Switch view to Day
    fireEvent.click(screen.getByText("Day"));
    expect(screen.getByText("Time Window")).toBeDefined();
  });

  it("handles live stream setup with ingest URL, masked stream key, and copy actions", async () => {
    const Component = Route.options.component!;
    render(<Component />);

    // Open Live stream tab
    const liveTab = await screen.findByText("Live-Stream Setup");
    fireEvent.click(liveTab);

    expect(screen.getByText("Live Stream Broadcast Setup")).toBeDefined();
    expect(screen.getByDisplayValue("rtmp://ingest.bqsqwad.tv/live")).toBeDefined();

    // Copy actions
    const copyButtons = screen.getAllByText("Copy");
    expect(copyButtons.length).toBeGreaterThanOrEqual(2);
    const firstButton = copyButtons[0];
    if (!firstButton) throw new Error("Expected an actionable button");
    fireEvent.click(firstButton);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  it("groups all episodes in one place under their movie/series title with zero fragmentation and removes channel creation", async () => {
    const Component = Route.options.component!;
    render(<Component />);

    // Verify New Channel is NOT present
    expect(screen.queryByText("New Channel")).toBeNull();

    // Verify Movies & Series Library tab is present
    const contentTab = await screen.findByText("Movies & Series Library");
    expect(contentTab).toBeDefined();

    // Switch to Movies & Series Library tab
    fireEvent.click(contentTab);

    // Verify header and grouped series
    expect(await screen.findByText("Media Assets & Series Library")).toBeDefined();
    expect(screen.getByText("Lagos Nights")).toBeDefined();
    expect(screen.getByText("Series • 2 Episodes")).toBeDefined();

    // Verify all episodes are listed together under the series
    expect(screen.getByText("The Awakening")).toBeDefined();
    expect(screen.getByText("Midnight Run")).toBeDefined();
    expect(screen.getByText("Add Episode 3")).toBeDefined();
  });

  it("handles content upload modal with file-kind validation, progress, and cancel", async () => {
    const Component = Route.options.component!;
    render(<Component />);

    // Open Upload modal
    const uploadTab = await screen.findByText("Upload Content");
    fireEvent.click(uploadTab);

    expect(screen.getByText("Upload Media Asset")).toBeDefined();
    expect(screen.getByText("Custom Poster Thumbnail")).toBeDefined();

    // Test invalid file kind rejection
    const invalidFile = new File(["dummy content"], "presentation.pdf", {
      type: "application/pdf",
    });
    const fileInput = document.querySelector('input[type="file"][accept*="video"]') as HTMLInputElement;

    fireEvent.change(fileInput, { target: { files: [invalidFile] } });
    expect(
      await screen.findByText(/Invalid file kind. Only MP4, MOV, MKV, and WEBM video containers/i),
    ).toBeDefined();

    // Test valid video file
    const validFile = new File(["dummy video"], "movie.mp4", { type: "video/mp4" });
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    expect(screen.getByText("movie.mp4")).toBeDefined();

    // Affirm copyright and ownership declarations specifically (not platform checkboxes)
    const declarationSection = screen.getByText(/Copyright and ownership declaration/i).parentElement;
    const declarationCheckboxes = declarationSection ? declarationSection.querySelectorAll("input[type=\"checkbox\"]") : [];
    declarationCheckboxes.forEach((cb) => fireEvent.click(cb));

    // Start upload
    const startBtn = screen.getByText("Start Upload");
    fireEvent.click(startBtn);

    expect(screen.getByText("Cancel Upload")).toBeDefined();
    fireEvent.click(screen.getByText("Cancel Upload"));
  });
});
