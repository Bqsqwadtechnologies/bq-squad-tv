import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { KycCameraCapture } from "@/components/kyc/KycCameraCapture";

describe("Batch A6: Camera Capture, Liveness & ID Framing", () => {
  beforeEach(() => {
    // Mock navigator.mediaDevices.getUserMedia
    Object.defineProperty(global.navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [
            {
              stop: vi.fn(),
            },
          ],
        }),
      },
    });
  });

  it("renders ID card framing mode with alignment box, mode switcher, and phone handoff", async () => {
    const handleCapture = vi.fn();
    const handleUploadInstead = vi.fn();

    render(
      <KycCameraCapture
        mode="id_card_front"
        onCapture={handleCapture}
        onUploadFileInstead={handleUploadInstead}
      />
    );

    expect(screen.getByText(/Capture Front of ID/i)).toBeDefined();
    expect(screen.getByText(/Fit entire document within box/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /ID Card/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Passport Page/i })).toBeDefined();

    // Toggle to passport page mode
    fireEvent.click(screen.getByRole("button", { name: /Passport Page/i }));

    // Upload file instead
    const uploadBtn = screen.getAllByRole("button", { name: /Upload file instead/i })[0]!;
    fireEvent.click(uploadBtn);
    expect(handleUploadInstead).toHaveBeenCalledTimes(1);

    // Continue on phone opens QR modal
    const phoneBtn = screen.getByRole("button", { name: /Continue on phone/i });
    fireEvent.click(phoneBtn);
    expect(screen.getByText(/Phone Handoff/i)).toBeDefined();
    expect(screen.getByText(/Scan with your phone's camera/i)).toBeDefined();
  });

  it("renders face liveness mode with circular guide and challenge prompts", async () => {
    const handleCapture = vi.fn();

    render(
      <KycCameraCapture
        mode="face_liveness"
        onCapture={handleCapture}
      />
    );

    expect(screen.getByText(/Liveness Face Verification/i)).toBeDefined();
    expect(screen.getByText(/Follow on-screen instructions for liveness confirmation/i)).toBeDefined();
  });

  it("displays clear permission-denied guidance when camera access is blocked", async () => {
    // Mock getUserMedia rejecting
    Object.defineProperty(global.navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error("Permission denied")),
      },
    });

    render(
      <KycCameraCapture
        mode="id_card_front"
        onCapture={vi.fn()}
        onUploadFileInstead={vi.fn()}
      />
    );

    // Permission requests must originate from a user gesture.
    expect(screen.getByRole("button", { name: /Enable Camera/i })).toBeDefined();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Enable Camera/i }));

    // Wait for permission denied state
    expect(await screen.findByText(/Camera Access Required/i)).toBeDefined();
    expect(screen.getByText(/How to unblock/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Try Again/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Upload File Instead/i })).toBeDefined();
  });
});
