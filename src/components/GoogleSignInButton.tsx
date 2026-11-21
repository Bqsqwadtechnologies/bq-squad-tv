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
  const [loadError, setLoadError] = useState(false);
  const [clientId, setClientId] = useState(propClientId || cachedGoogleClientId || "");

  useEffect(() => {
    if (propClientId !== undefined) {
      setClientId(propClientId);
      return;
    }
    if (cachedGoogleClientId !== null) {
      setClientId(cachedGoogleClientId);
      return;
    }
    let active = true;
    fetch("/api/public/v1/auth/web/config", { cache: "no-store" })
      .then((res) => res.json() as Promise<{ googleClientId?: string }>)
      .then((cfg) => {
        cachedGoogleClientId = cfg.googleClientId ?? "";
        if (active) setClientId(cachedGoogleClientId);
      })
      .catch(() => {
        if (active) setClientId("");
      });
    return () => {
      active = false;
    };
  }, [propClientId]);

  useEffect(() => {
    const element = elementRef.current;
    if (!clientId) {
      setLoadError(true);
      return;
    }
    if (!element) return;

    let cancelled = false;

    const renderButton = () => {
      if (cancelled || !window.google || !element.isConnected) return;
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => onCredentialRef.current(response.credential),
        });
        element.innerHTML = "";
        window.google.accounts.id.renderButton(element, {
          theme: "filled_blue",
          size: "large",
          shape: "pill",
          width: Math.min(320, element.clientWidth || 320),
        });
        setLoadError(false);
      } catch (err) {
        setLoadError(true);
        void fetch("/api/public/v1/monitoring/client-errors", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: "Google GSI render error: " + String(err),
            context: "google-auth-button",
          }),
        }).catch(() => undefined);
      }
    };

    let script = document.querySelector<HTMLScriptElement>("script[data-google-identity='true']");
    if (window.google) {
      renderButton();
    } else if (script) {
      script.addEventListener("load", renderButton, { once: true });
      script.addEventListener(
        "error",
        () => {
          if (!cancelled) {
            setLoadError(true);
            void fetch("/api/public/v1/monitoring/client-errors", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                message: "Google GSI script load failure",
                context: "google-auth-script",
              }),
            }).catch(() => undefined);
          }
        },
        { once: true },
      );
    } else {
      script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset["googleIdentity"] = "true";
      script.addEventListener("load", renderButton, { once: true });
      script.addEventListener(
        "error",
        () => {
          if (!cancelled) {
            setLoadError(true);
            void fetch("/api/public/v1/monitoring/client-errors", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                message: "Google GSI script load failure",
                context: "google-auth-script",
              }),
            }).catch(() => undefined);
          }
        },
        { once: true },
      );
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!clientId || loadError) {
    return (
      <div className="mt-4 flex flex-col items-center justify-center gap-1.5">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="flex h-11 w-full max-w-[320px] items-center justify-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 text-sm font-medium text-white/50 cursor-not-allowed"
        >
          <svg className="h-4 w-4 opacity-50" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>
        <p className="max-w-[320px] text-center text-xs text-amber-200/90" role="status">
          {!clientId
            ? "Google sign-in is not configured for this website deployment."
            : "Google sign-in could not load. Check your connection and retry."}
        </p>
        <button
          type="button"
          onClick={() => {
            setLoadError(false);
            cachedGoogleClientId = null;
            if (onRetry) {
              onRetry();
            } else {
              fetch("/api/public/v1/auth/web/config", { cache: "no-store" })
                .then((res) => res.json() as Promise<{ googleClientId?: string }>)
                .then((cfg) => {
                  cachedGoogleClientId = cfg.googleClientId ?? "";
                  setClientId(cachedGoogleClientId);
                })
                .catch(() => setClientId(""));
            }
          }}
          className="text-xs text-cyan-300 hover:underline"
        >
          Google sign-in unavailable. Tap to retry.
        </button>
      </div>
    );
  }

  return <div ref={elementRef} className="mt-4 flex min-h-11 justify-center" />;
}
