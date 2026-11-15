import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  getActiveWebIdToken,
  getWebAccount,
  getWebAuthHeaders,
  restoreWebSession,
} from "@/lib/firebase-web-auth";

type Wallet = {
  balanceMinor: number;
  currency: string;
  dailySpendLimitMinor: number | null;
  spentTodayMinor: number;
};

type LedgerItem = {
  id: string;
  description: string;
  amountMinor: number;
  createdAt: string;
  kind: string;
  currency?: string;
};

type Topup = {
  packageId: string;
  amountMinor: number;
  displayAmountMinor?: number;
  creditMinor: number;
  currency: string;
};

function formatMoney(amountMinor: number, currency = "USD") {
  const digits = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amountMinor / (10 ** digits));
}

export const Route = createFileRoute("/wallet")({
  component: WalletPage,
  head: () => ({
    meta: [
      { title: "Wallet | BQ SQWAD TV" },
      { name: "description", content: "View your BQ SQWAD TV wallet and top up securely." },
    ],
  }),
});

function WalletPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [topups, setTopups] = useState<Topup[]>([]);
  const [email, setEmail] = useState("");
  const [verified, setVerified] = useState(false);
  const [busyPackage, setBusyPackage] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadWallet = useCallback(async (idToken: string) => {
    const headers = await getWebAuthHeaders(idToken);
    const [walletResponse, ledgerResponse, topupsResponse] = await Promise.all([
      fetch("/api/public/v1/wallet", { headers, cache: "no-store" }),
      fetch("/api/public/v1/wallet/ledger?limit=25", { headers, cache: "no-store" }),
      fetch("/api/public/v1/wallet/topups", { headers, cache: "no-store" }),
    ]);
    const [walletData, ledgerData, topupData] = await Promise.all([
      walletResponse.json(),
      ledgerResponse.json(),
      topupsResponse.json(),
    ]);
    if (!walletResponse.ok) throw new Error(walletData.error ?? "Could not load your wallet.");
    if (!ledgerResponse.ok) throw new Error(ledgerData.error ?? "Could not load wallet history.");
    if (!topupsResponse.ok) throw new Error(topupData.error ?? "Could not load wallet packages.");
    setWallet(walletData as Wallet);
    setLedger((ledgerData.items ?? []) as LedgerItem[]);
    setTopups(topupData as Topup[]);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await restoreWebSession();
        if (!token || !active) {
          setBusy(false);
          return;
        }
        const account = await getWebAccount();
        if (!active || !account) {
          setBusy(false);
          return;
        }
        setEmail(account.email ?? "");
        setVerified(account.emailVerified);
        await loadWallet(token);

        const query = new URLSearchParams(window.location.search);
        const reference = query.get("reference") ?? query.get("trxref");
        if (reference) {
          const currentToken = await getActiveWebIdToken();
          if (!currentToken) throw new Error("Your session expired. Sign in again to confirm the payment.");
          const response = await fetch("/api/public/v1/payments/paystack/verify", {
            method: "POST",
            headers: {
              ...(await getWebAuthHeaders(currentToken)),
              "content-type": "application/json",
            },
            body: JSON.stringify({ reference }),
          });
          const result = await response.json() as { error?: string; credited?: boolean };
          if (!response.ok) throw new Error(result.error ?? "The payment could not be confirmed.");
          setMessage(result.credited ? "Payment confirmed. Your wallet has been credited." : "This payment was already processed.");
          window.history.replaceState({}, "", "/wallet");
          await loadWallet(currentToken);
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load your wallet.");
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadWallet]);

  async function purchase(packageId: string) {
    setBusyPackage(packageId);
    setError("");
    setMessage("");
    try {
      const token = await getActiveWebIdToken();
      if (!token) throw new Error("Sign in to continue.");
      const response = await fetch("/api/public/v1/payments/paystack/initialize", {
        method: "POST",
        headers: {
          ...(await getWebAuthHeaders(token)),
          "content-type": "application/json",
        },
        body: JSON.stringify({ packageId }),
      });
      const result = await response.json() as { authorizationUrl?: string; error?: string };
      if (!response.ok || !result.authorizationUrl) {
        throw new Error(result.error ?? "Could not start Paystack checkout.");
      }
      window.location.assign(result.authorizationUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start checkout.");
      setBusyPackage("");
    }
  }

  return (
    <main className="min-h-screen bg-[#030b2a] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <a href="/" className="text-xl font-black tracking-[0.12em] text-cyan-200">BQ SQWAD TV</a>
          <nav className="flex gap-4 text-sm text-blue-100/70">
            <a href="/account" className="hover:text-white">Account</a>
            <a href="/" className="hover:text-white">Home</a>
          </nav>
        </header>

        <section className="mt-10 rounded-3xl border border-cyan-200/15 bg-gradient-to-br from-[#0c235f] to-[#07143d] p-6 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Your wallet</p>
          <h1 className="mt-3 text-3xl font-black">Balance and top-ups</h1>
          {busy ? (
            <p className="mt-7 text-sm text-blue-100/60">Loading your wallet…</p>
          ) : !wallet ? (
            <div className="mt-7">
              <p className="text-sm text-blue-100/70">Sign in to view your wallet and payment history.</p>
              <a href="/account" className="mt-4 inline-flex rounded-xl bg-cyan-300 px-5 py-3 font-bold text-[#031039]">Sign in</a>
            </div>
          ) : (
            <>
              <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-blue-100/60">Available balance</p>
                  <p className="mt-2 text-4xl font-black tabular-nums">{formatMoney(wallet.balanceMinor, wallet.currency)}</p>
                  <p className="mt-2 break-all text-xs text-blue-100/45">{email}</p>
                </div>
                <a href="/account" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5">Account settings</a>
              </div>
              {!verified ? (
                <p className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100">
                  Verify your email before purchasing wallet credits. <a href="/account" className="font-bold underline">Verify account</a>
                </p>
              ) : (
                <div className="mt-8">
                  <h2 className="text-lg font-bold">Add wallet credits</h2>
                  {topups.length ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {topups.map(item => (
                        <article key={item.packageId} className="rounded-2xl border border-white/10 bg-[#030b2a]/55 p-4">
                          <p className="text-xs uppercase tracking-[0.14em] text-cyan-200">{item.packageId}</p>
                          <p className="mt-2 text-xl font-extrabold">{formatMoney(item.creditMinor, item.currency)} credit</p>
                          <p className="mt-1 text-sm text-blue-100/60">Pay {formatMoney(item.displayAmountMinor ?? item.amountMinor, item.currency)}</p>
                          <button
                            type="button"
                            disabled={busyPackage !== ""}
                            onClick={() => void purchase(item.packageId)}
                            className="mt-4 w-full rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-extrabold text-[#031039] disabled:opacity-50"
                          >
                            {busyPackage === item.packageId ? "Opening checkout…" : "Top up with Paystack"}
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-blue-100/55">Wallet packages have not been configured yet.</p>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {message && <p role="status" className="mt-5 rounded-xl border border-emerald-300/15 bg-emerald-300/5 p-4 text-sm text-emerald-100">{message}</p>}
        {error && <p role="alert" className="mt-5 rounded-xl border border-rose-300/15 bg-rose-300/5 p-4 text-sm text-rose-100">{error}</p>}

        <section className="mt-8 rounded-3xl border border-white/10 bg-[#07143d] p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Recent transactions</h2>
            <span className="text-xs text-blue-100/45">Newest first · up to 25 entries</span>
          </div>
          {ledger.length ? (
            <div className="mt-5 divide-y divide-white/10">
              {ledger.map(item => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-semibold">{item.description}</p>
                    <p className="mt-1 text-xs text-blue-100/45">{new Date(item.createdAt).toLocaleString("en-NG")}</p>
                  </div>
                  <p className={item.amountMinor >= 0 ? "font-bold tabular-nums text-emerald-200" : "font-bold tabular-nums text-blue-100"}>
                    {item.amountMinor >= 0 ? "+" : "−"}{formatMoney(Math.abs(item.amountMinor), wallet?.currency ?? "NGN")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-blue-100/55">Your wallet transactions will appear here.</p>
          )}
        </section>
        <p className="mt-6 text-center text-xs text-blue-100/35">Payments are verified server-side before wallet credits are applied.</p>
      </div>
    </main>
  );
}
