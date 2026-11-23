import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ProviderRegistrationFlow, type SandboxCredentials } from "@/components/ProviderRegistrationFlow";

describe("Provider Registration & Onboarding Flow (V5-04 Batch 9)", () => {
  it("renders 5-step stepper and navigates through steps", async () => {
    const mockSubmit = vi.fn().mockResolvedValue({
      providerId: "prov_999",
      sandboxCredentials: {
        rtmpIngestUrl: "rtmp://ingest-sandbox.bqsqwad.tv/live",
        streamKey: "sk_sandbox_test_123",
        srtUrl: "srt://ingest-sandbox.bqsqwad.tv:9998?streamid=sandbox_prov_999",
        issuedAt: new Date().toISOString(),
        status: "active",
      },
      estimatedReviewTime: "24-48 hours",
    });

    render(<ProviderRegistrationFlow submitRegistration={mockSubmit} />);

    // Step 1: Company Info
    expect(screen.getByText(/Step 1: Company & Entity Information/i)).toBeDefined();
    const companyInput = screen.getByPlaceholderText(/Apex Global Broadcast Networks Ltd/i);
    fireEvent.change(companyInput, { target: { value: "Metro Global Media Ltd" } });
    const emailInput = screen.getByPlaceholderText("ops@example.com");
    fireEvent.change(emailInput, { target: { value: "ops@metroglobal.com" } });

    // Click continue to Step 2
    fireEvent.click(screen.getByRole("button", { name: /Continue to Legal & Tax/i }));

    // Step 2: Legal & Tax
    expect(screen.getByText(/Step 2: Legal & Tax Registration/i)).toBeDefined();
    const regInput = screen.getByPlaceholderText(/RC-1928471/i);
    fireEvent.change(regInput, { target: { value: "RC-998877" } });
    const taxInput = screen.getByPlaceholderText(/29103847-0001/i);
    fireEvent.change(taxInput, { target: { value: "TIN-445566" } });
    const addressInput = screen.getByPlaceholderText(/Street address, city/i);
    fireEvent.change(addressInput, { target: { value: "45 Marina Boulevard, Lagos Island" } });

    // Click continue to Step 3
    fireEvent.click(screen.getByRole("button", { name: /Continue to Ingest Profile/i }));

    // Step 3: Technical Profile
    expect(screen.getByText(/Step 3: Ingest Technical Profile/i)).toBeDefined();
    // Click continue to Step 4
    fireEvent.click(screen.getByRole("button", { name: /Continue to Settlement Account/i }));

    // Step 4: Settlement Account
    expect(screen.getByText(/Step 4: Settlement Bank Account/i)).toBeDefined();
    const bankInput = screen.getByPlaceholderText(/Zenith Bank/i);
    fireEvent.change(bankInput, { target: { value: "Access Bank Plc" } });
    const accountInput = screen.getByPlaceholderText(/1012938472/i);
    fireEvent.change(accountInput, { target: { value: "0011223344" } });
    const beneficiaryInput = screen.getByPlaceholderText(/Apex Global Broadcast Networks Ltd/i);
    fireEvent.change(beneficiaryInput, { target: { value: "Metro Global Media Ltd" } });

    // Click continue to Step 5
    fireEvent.click(screen.getByRole("button", { name: /Continue to Agreement E-Signature/i }));

    // Step 5: E-Signature
    expect(screen.getByText(/Step 5: Master Distribution Agreement E-Signature/i)).toBeDefined();
    const signatoryInput = screen.getByPlaceholderText(/Adebayo Ogunlesi/i);
    fireEvent.change(signatoryInput, { target: { value: "Emeka Okonkwo" } });

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    // Submit
    const submitButton = screen.getByRole("button", { name: /Submit Partner Application/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledTimes(1);
    });

    const callArg = mockSubmit.mock.calls[0]?.[0];
    if (!callArg) throw new Error("Expected a registration submission");
    expect(callArg.name).toBe("Metro Global Media Ltd");
    expect(callArg.contactEmail).toBe("ops@metroglobal.com");
    expect(callArg.registrationNumber).toBe("RC-998877");
    expect(callArg.eSignatureName).toBe("Emeka Okonkwo");
  });

  it("displays onboarding checklist and sandbox ingest credentials when in pending review", () => {
    const mockCreds: SandboxCredentials = {
      rtmpIngestUrl: "rtmp://ingest-sandbox.bqsqwad.tv/live",
      streamKey: "sk_sandbox_prov_777_xyz89",
      srtUrl: "srt://ingest-sandbox.bqsqwad.tv:9998?streamid=sandbox_prov_777",
      issuedAt: "2026-03-31T00:00:00Z",
      status: "active",
    };

    render(
      <ProviderRegistrationFlow
        initialStatus="pending_approval"
        initialSandboxCredentials={mockCreds}
        submitRegistration={vi.fn()}
      />,
    );

    // Header review status banner
    expect(screen.getByText(/Partner Registration Under Review/i)).toBeDefined();
    expect(screen.getByText(/24-48 hours/i)).toBeDefined();
    expect(screen.getByText(/Pending Operations Approval/i)).toBeDefined();

    // Sandbox Credentials Card
    expect(screen.getByText(/Sandbox Ingest Testing Credentials/i)).toBeDefined();
    expect(screen.getByText("rtmp://ingest-sandbox.bqsqwad.tv/live")).toBeDefined();
    expect(screen.getByText("sk_sandbox_prov_777_xyz89")).toBeDefined();
    expect(screen.getByText("srt://ingest-sandbox.bqsqwad.tv:9998?streamid=sandbox_prov_777")).toBeDefined();

    // Onboarding checklist items
    expect(screen.getByText(/Partner Onboarding Checklist/i)).toBeDefined();
    expect(screen.getByText(/1\. Corporate & Legal Verification/i)).toBeDefined();
    expect(screen.getByText(/2\. Master Distribution Agreement Signed/i)).toBeDefined();
    expect(screen.getByText(/3\. Ingest Technical Profile & Sandbox Issued/i)).toBeDefined();
    expect(screen.getByText(/4\. Operations Compliance Review/i)).toBeDefined();
    expect(screen.getByText(/5\. Production Edge Ingest Provisioning/i)).toBeDefined();
  });
});
