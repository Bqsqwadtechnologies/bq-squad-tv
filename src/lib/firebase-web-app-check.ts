import { firebaseApiKey, firebaseProjectNumber } from "./firebase-config";

declare global {
  interface Window {
    grecaptcha?: {
      enterprise: {
        ready: (callback: () => void) => void;
        execute: (siteKey: string, options: { action: string }) => Promise<string>;
      };
    };
  }
}

type WebAppCheckConfig = {
  recaptchaSiteKey?: string;
};

type AppCheckExchangeResponse = {
  token?: string;
  ttl?: string;
};

let siteKeyPromise: Promise<string | null> | null = null;
let scriptPromise: Promise<void> | null = null;
let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;

async function getRecaptchaSiteKey(): Promise<string | null> {
  if (!siteKeyPromise) {
    siteKeyPromise = fetch("/api/public/v1/auth/web/config", { cache: "no-store" })
      .then(response => response.json() as Promise<WebAppCheckConfig>)
      .then(config => config.recaptchaSiteKey?.trim() || null)
      .catch(() => null);
  }
  return siteKeyPromise;
}

async function loadRecaptchaEnterprise(siteKey: string): Promise<void> {
  if (window.grecaptcha?.enterprise) return;
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>("script[data-recaptcha-enterprise='true']");
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Could not load reCAPTCHA Enterprise.")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(siteKey)}`;
      script.async = true;
      script.defer = true;
      script.dataset["recaptchaEnterprise"] = "true";
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => reject(new Error("Could not load reCAPTCHA Enterprise.")), { once: true });
      document.head.appendChild(script);
    });
  }
  await scriptPromise;
}

export async function getWebAppCheckToken(): Promise<string | null> {
  const siteKey = await getRecaptchaSiteKey();
  if (!siteKey) return null;
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;

  await loadRecaptchaEnterprise(siteKey);
  const recaptchaToken = await new Promise<string>((resolve, reject) => {
    if (!window.grecaptcha?.enterprise) {
      reject(new Error("reCAPTCHA Enterprise did not initialize."));
      return;
    }
    window.grecaptcha.enterprise.ready(() => {
      void window.grecaptcha?.enterprise.execute(siteKey, { action: "app_check" })
        .then(resolve)
        .catch(reject);
    });
  });

  const response = await fetch(
    `https://firebaseappcheck.googleapis.com/v1/projects/${firebaseProjectNumber}:exchangeRecaptchaEnterpriseToken?key=${firebaseApiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recaptchaEnterpriseToken: recaptchaToken }),
    },
  );
  const result = await response.json() as AppCheckExchangeResponse;
  if (!response.ok || !result.token) {
    throw new Error("Firebase App Check could not verify this website.");
  }
  const ttlSeconds = Number.parseInt((result.ttl ?? "3600s").replace(/s$/, ""), 10);
  cachedToken = result.token;
  cachedTokenExpiresAt = Date.now() + Math.max(60, Number.isFinite(ttlSeconds) ? ttlSeconds : 3600) * 1000 - 60_000;
  return cachedToken;
}

export async function getWebAppCheckHeaders(): Promise<Record<string, string>> {
  const token = await getWebAppCheckToken();
  return token ? { "X-Firebase-AppCheck": token } : {};
}
