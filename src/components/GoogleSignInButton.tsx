import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              width?: number;
            },
          ) => void;
        };
      };
    };
  }
}

type ConfigState = "loading" | "ready" | "missing" | "error";
type ButtonState = "idle" | "loading" | "ready" | "script-error" | "render-error";

let cachedGoogleClientId: string | null = null;

export function GoogleSignInButton({
  clientId: propClientId,
  onCredential,
  disabled = false,
  onRetry,
}: {
  clientId?: string;
  onCredential: (credential: string) => void;
  disabled?: boolean;
  onRetry?: () => void;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;
  const [clientId, setClientId] = useState(propClientId ?? cachedGoogleClientId ?? "");
  const [configState, setConfigState] = useState<ConfigState>(
    propClientId || cachedGoogleClientId ? "ready" : "loading",
  );
  const [buttonState, setButtonState] = useState<ButtonState>("idle");

  async function loadConfig() {
    setConfigState("loading");
    setButtonState("idle");
    try {
      const response = await fetch("/api/public/v1/auth/web/config", { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const cfg = (await response.json()) as { googleClientId?: string; googleConfigured?: boolean };
      const nextId = cfg.googleClientId?.trim() ?? "";
      cachedGoogleClientId = nextId;
      setClientId(nextId);
      setConfigState(nextId && cfg.googleConfigured !== false ? "ready" : "missing");
    } catch {
      setConfigState("error");
    }
  }

  useEffect(() => {
    if (propClientId !== undefined) {
      const nextId = propClientId.trim();
      setClientId(nextId);
      setConfigState(nextId ? "ready" : "missing");
      return;
    }
    if (cachedGoogleClientId !== null) {
      setClientId(cachedGoogleClientId);
      setConfigState(cachedGoogleClientId ? "ready" : "missing");
      return;
    }
    void loadConfig();
  }, [propClientId]);

  useEffect(() => {
    if (configState !== "ready" || !clientId || disabled) return;
    const element = elementRef.current;
    if (!element) return;
    let cancelled = false;
    setButtonState("loading");

    const render = () => {
      if (cancelled || !window.google || !element.isConnected) return;
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) onCredentialRef.current(response.credential);
            else setButtonState("render-error");
          },
        });
        element.replaceChildren();
        window.google.accounts.id.renderButton(element, {
          theme: "filled_blue",
          size: "large",
          shape: "pill",
          width: Math.min(320, element.clientWidth || 320),
        });
        setButtonState("ready");
      } catch {
        setButtonState("render-error");
      }
    };

    const onScriptError = () => {
      if (!cancelled) setButtonState("script-error");
    };

    let script = document.querySelector<HTMLScriptElement>("script[data-google-identity='true']");
    if (window.google) {
      render();
    } else if (script) {
      script.addEventListener("load", render, { once: true });
      script.addEventListener("error", onScriptError, { once: true });
      // Existing script tags can have completed unsuccessfully before listeners attached.
      if (script.dataset["loadFailed"] === "true") onScriptError();
    } else {
      script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset["googleIdentity"] = "true";
      script.addEventListener("load", render, { once: true });
      script.addEventListener("error", () => {
        script!.dataset["loadFailed"] = "true";
        onScriptError();
      }, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, [clientId, configState, disabled]);

  if (configState !== "ready" || buttonState !== "ready") {
    const message =
      configState === "loading"
        ? "Loading Google sign-in configuration…"
        : configState === "missing"
          ? "Google sign-in is not configured for this website. Ask the site administrator to configure GOOGLE_WEB_CLIENT_ID."
          : configState === "error"
            ? "The sign-in configuration could not be reached. Check your connection and retry."
            : buttonState === "script-error"
              ? "Google Identity Services could not load. Check network access or your content-security policy, then retry."
              : buttonState === "render-error"
                ? "Google sign-in could not initialize. Verify the OAuth client ID and authorized JavaScript origin."
                : "Preparing Google sign-in…";
    return (
      <div className="mt-4 flex flex-col items-center justify-center gap-2">
        <div ref={elementRef} className="min-h-1" />
        <p className="max-w-[320px] text-center text-xs text-amber-200/90" role="status">{message}</p>
        <button
          type="button"
          disabled={disabled || configState === "loading"}
          onClick={() => {
            cachedGoogleClientId = null;
            const oldScript = document.querySelector<HTMLScriptElement>("script[data-google-identity='true']");
            if (oldScript && buttonState === "script-error") oldScript.remove();
            if (onRetry) onRetry();
            if (propClientId === undefined || configState === "error" || configState === "missing") {
              void loadConfig();
            } else {
              setButtonState("idle");
            }
          }}
          className="text-xs text-cyan-300 hover:underline disabled:opacity-50"
        >
          Retry Google sign-in
        </button>
      </div>
    );
  }

  return <div ref={elementRef} className="mt-4 flex min-h-11 justify-center" />;
}
