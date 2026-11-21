import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

describe("Google sign-in button diagnostics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.querySelector("script[data-google-identity='true']")?.remove();
  });

  it("reports a missing OAuth client ID as a configuration issue", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ googleClientId: "", googleConfigured: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ));
    render(<GoogleSignInButton onCredential={vi.fn()} />);
    expect(await screen.findByText(/not configured.*GOOGLE_WEB_CLIENT_ID/i)).toBeInTheDocument();
  });

  it("reports config network failure separately from missing configuration", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
    render(<GoogleSignInButton onCredential={vi.fn()} />);
    expect(await screen.findByText(/configuration could not be reached/i)).toBeInTheDocument();
  });

  it("reports Google Identity Services script load failure separately", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        googleClientId: "web-client-id.apps.googleusercontent.com",
        googleConfigured: true,
      }), { status: 200, headers: { "content-type": "application/json" } }),
    ));
    render(<GoogleSignInButton onCredential={vi.fn()} />);
    await waitFor(() => {
      expect(document.querySelector("script[data-google-identity='true']")).not.toBeNull();
    });
    const script = document.querySelector<HTMLScriptElement>("script[data-google-identity='true']");
    script?.dispatchEvent(new Event("error"));
    expect(await screen.findByText(/Google Identity Services could not load/i)).toBeInTheDocument();
  });

  it("offers a retry action after a configuration request fails", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        googleClientId: "",
        googleConfigured: false,
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<GoogleSignInButton onCredential={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Retry Google sign-in/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/not configured/i)).toBeInTheDocument();
  });
});
