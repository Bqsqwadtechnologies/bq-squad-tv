import { useCallback, useEffect, useState } from "react";
import { formatMinorCurrency as formatMoney } from "@/lib/format-money";
import { createFileRoute } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import { Wallet as WalletIcon, RefreshCw, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import {
  getActiveWebIdToken,
  getWebAccount,
  getWebAuthHeaders,
  restoreWebSession,
} from "@/lib/firebase-web-auth";

type Wallet = {
  balanceMinor: number;
  accountId?: string | null;
  countryCode?: string | null;
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

const DEFAULT_NGN_PACKAGES: Topup[] = [
  { packageId: "ngn_200", currency: "NGN", amountMinor: 20000, creditMinor: 20000 },
  { packageId: "ngn_500", currency: "NGN", amountMinor: 50000, creditMinor: 50000 },
  { packageId: "ngn_1000", currency: "NGN", amountMinor: 100000, creditMinor: 100000 },
  { packageId: "ngn_1500", currency: "NGN", amountMinor: 150000, creditMinor: 150000 },
  { packageId: "ngn_2000", currency: "NGN", amountMinor: 200000, creditMinor: 200000 },
  { packageId: "ngn_2500", currency: "NGN", amountMinor: 250000, creditMinor: 250000 },
  { packageId: "ngn_5000", currency: "NGN", amountMinor: 500000, creditMinor: 500000 },
  { packageId: "ngn_10000", currency: "NGN", amountMinor: 1000000, creditMinor: 1000000 },
  { packageId: "ngn_15000", currency: "NGN", amountMinor: 1500000, creditMinor: 1500000 },
  { packageId: "ngn_20000", currency: "NGN", amountMinor: 2000000, creditMinor: 2000000 },
  { packageId: "ngn_100000", currency: "NGN", amountMinor: 10000000, creditMinor: 10000000 },
  { packageId: "ngn_200000", currency: "NGN", amountMinor: 20000000, creditMinor: 20000000 },
];

function formatChipAmount(amountMinor: number, currency: string) {
  if (currency === "NGN") {
    const whole = Math.round(amountMinor / 100);
    return `₦${whole.toLocaleString("en-US")}`;
  }
  return formatMoney(amountMinor, currency);
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
  const [wallet, setWallet] = useState<Wallet | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const cached = localStorage.getItem("bqtv_cached_wallet");
      return cached ? (JSON.parse(cached) as Wallet) : null;
    } catch {
      return null;
    }
  });

  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [topups, setTopups] = useState<Topup[]>([]);
  const [email, setEmail] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem("bqtv_cached_email") || "";
    } catch {
      return "";
    }
  });
  const [verified, setVerified] = useState<boolean>(true);
  const [busyPackage, setBusyPackage] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Pending payment state
  const [pendingReference, setPendingReference] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return sessionStorage.getItem("bqtv_pending_paystack_ref") || "";
    } catch {
      return "";
    }
  });
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  // Selected topup chip or custom amount
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const [customAmountNgn, setCustomAmountNgn] = useState<string>("");
  const [isCustom, setIsCustom] = useState<boolean>(false);

  // Unified single-token source with 401 retry
  const fetchWithAuth = useCallback(async (url: string, init: RequestInit = {}): Promise<Response> => {
    let token = await getActiveWebIdToken();
    if (!token) {
      token = await restoreWebSession();
    }
    if (!token) throw new Error("Sign in to continue.");

    let headers = {
      ...(await getWebAuthHeaders(token)),
      ...(init.headers || {}),
    };

    let response = await fetch(url, { ...init, headers, cache: "no-store" });
    if (response.status === 401) {
      // Refresh token once and retry once
      token = await restoreWebSession();
      if (!token) throw new Error("Your session expired. Sign in again to continue.");
      headers = {
        ...(await getWebAuthHeaders(token)),
        ...(init.headers || {}),
      };
      response = await fetch(url, { ...init, headers, cache: "no-store" });
    }
    return response;
  }, []);

  const loadWallet = useCallback(async () => {
    try {
      const [walletRes, ledgerRes, topupsRes] = await Promise.all([
        fetchWithAuth("/api/public/v1/wallet"),
        fetchWithAuth("/api/public/v1/wallet/ledger?limit=25"),
        fetchWithAuth("/api/public/v1/wallet/topups"),
      ]);

      const [walletData, ledgerData, topupData] = await Promise.all([
        walletRes.json(),
        ledgerRes.json(),
        topupsRes.json(),
      ]);

      if (!walletRes.ok) throw new Error(walletData.error ?? "Could not load your wallet.");
      if (!ledgerRes.ok) throw new Error(ledgerData.error ?? "Could not load wallet history.");

      const loadedWallet = walletData as Wallet;
      setWallet(loadedWallet);
      if (loadedWallet.currency !== "NGN") setIsCustom(false);
      try {
        localStorage.setItem("bqtv_cached_wallet", JSON.stringify(loadedWallet));
      } catch {}

      setLedger((ledgerData.items ?? []) as LedgerItem[]);

      if (topupsRes.ok && Array.isArray(topupData)) {
        const effective =
          topupData.length > 0
            ? (topupData as Topup[])
            : loadedWallet.currency === "NGN"
            ? DEFAULT_NGN_PACKAGES
            : [];
        setTopups(effective);
        if (effective.length > 0 && (!selectedPackageId || !effective.some((offer: Topup) => offer.packageId === selectedPackageId))) {
          setSelectedPackageId(effective[0].packageId);
        } else if (effective.length === 0) {
          setSelectedPackageId("");
          setIsCustom(false);
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your wallet.");
    }
  }, [fetchWithAuth, selectedPackageId]);

  const verifyPaymentReference = useCallback(async (ref: string) => {
    setVerifyingPayment(true);
    setError("");
    setMessage("");
    try {
      const response = await fetchWithAuth("/api/public/v1/payments/paystack/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reference: ref }),
      });
      const result = (await response.json()) as { error?: string; message?: string; credited?: boolean };
      if (!response.ok) throw new Error(result.message ?? result.error ?? "The payment could not be confirmed.");

      setMessage(
        result.credited
          ? "Payment confirmed. Your wallet has been credited."
          : "This payment was already processed.",
      );
      setPendingReference("");
      try {
        sessionStorage.removeItem("bqtv_pending_paystack_ref");
      } catch {}
      window.history.replaceState({}, "", "/wallet");
      await loadWallet();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not verify payment status.");
    } finally {
      setVerifyingPayment(false);
    }
  }, [fetchWithAuth, loadWallet]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        let token = await getActiveWebIdToken();
        if (!token) {
          token = await restoreWebSession();
        }
        if (!token || !active) {
          setBusy(false);
          return;
        }

        const account = await getWebAccount();
        if (account && active) {
          const userEmail = account.email ?? "";
          setEmail(userEmail);
          setVerified(account.emailVerified);
          try {
            localStorage.setItem("bqtv_cached_email", userEmail);
          } catch {}
        }

        await loadWallet();

        const query = new URLSearchParams(window.location.search);
        const ref = query.get("reference") ?? query.get("trxref");
        if (ref) {
          setPendingReference(ref);
          try {
            sessionStorage.setItem("bqtv_pending_paystack_ref", ref);
          } catch {}
          await verifyPaymentReference(ref);
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Could not load your wallet.");
        }
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadWallet, verifyPaymentReference]);

  async function purchase(packageIdToBuy?: string) {
    const pkgId = packageIdToBuy || (isCustom ? "custom" : selectedPackageId);
    if (!pkgId) {
      setError("Please select a top-up amount.");
      return;
    }

    let customMinor: number | undefined;
    if (isCustom || pkgId === "custom") {
      const parsed = Number(customAmountNgn);
      if (isNaN(parsed) || parsed < 200) {
        setError("Minimum custom top-up amount is ₦200 for NGN wallets.");
        return;
      }
      customMinor = Math.round(parsed * 100);
    }

    setBusyPackage(pkgId);
    setError("");
    setMessage("");
    try {
      const response = await fetchWithAuth("/api/public/v1/payments/paystack/initialize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          packageId: isCustom ? "custom" : pkgId,
          customAmountMinor: customMinor,
        }),
      });

      const result = (await response.json()) as {
        authorizationUrl?: string;
        reference?: string;
        error?: string;
        message?: string;
      };

      if (!response.ok || !result.authorizationUrl) {
        throw new Error(result.message ?? result.error ?? "Could not start checkout.");
      }

      if (result.reference) {
        setPendingReference(result.reference);
        try {
          sessionStorage.setItem("bqtv_pending_paystack_ref", result.reference);
        } catch {}
      }

      window.location.assign(result.authorizationUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start checkout.");
      setBusyPackage("");
    }
  }

  const currentCurrency = wallet?.currency || "USD";

  // Check whether signed in (token, email, or cached wallet)
  const isSignedIn = Boolean(email || wallet || !busy);

  return (
    <main className="min-h-screen bg-[#030b2a] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <a href="/" aria-label="BQ SQWAD TV home">
            <BrandLogo variant="horizontal" className="h-8 w-auto" />
          </a>
          <nav className="flex gap-4 text-sm text-blue-100/70">
            <a href="/account" className="hover:text-white">
              Account
            </a>
            <a href="/" className="hover:text-white">
              Home
            </a>
          </nav>
        </header>

        {/* Pending Payment Notification Card */}
        {pendingReference ? (
          <section className="mt-8 rounded-2xl border border-amber-300/30 bg-amber-500/10 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 text-amber-300 shrink-0" />
                <div>
                  <p className="font-bold text-amber-200">Payment pending verification</p>
                  <p className="text-xs text-amber-100/70 mt-1">
                    Reference: <span className="font-mono text-amber-300">{pendingReference}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void verifyPaymentReference(pendingReference)}
                disabled={verifyingPayment}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-[#031039] hover:bg-amber-300 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${verifyingPayment ? "animate-spin" : ""}`} />
                {verifyingPayment ? "Checking status…" : "Check status"}
              </button>
            </div>
          </section>
        ) : null}

        <section className="mt-8 rounded-3xl border border-cyan-200/15 bg-gradient-to-br from-[#0c235f] to-[#07143d] p-6 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Your wallet</p>
          <h1 className="mt-3 text-3xl font-black">Balance and top-ups</h1>

          {busy && !wallet ? (
            <p className="mt-7 text-sm text-blue-100/60">Loading your wallet…</p>
          ) : !wallet && !isSignedIn ? (
            <div className="mt-7">
              <p className="text-sm text-blue-100/70">
                Sign in to view your wallet and payment history.
              </p>
              <a
                href="/account"
                className="mt-4 inline-flex rounded-xl bg-cyan-300 px-5 py-3 font-bold text-[#031039]"
              >
                Sign in
              </a>
            </div>
          ) : (
            <>
              <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-blue-100/60">Available balance</p>
                  <p className="mt-2 text-4xl font-black tabular-nums">
                    {formatMoney(wallet ? wallet.balanceMinor : 0, wallet?.currency || "USD")}
                  </p>
                  {email ? <p className="mt-2 break-all text-xs text-blue-100/45">{email}</p> : null}
                  {wallet?.accountId ? (
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-cyan-200/80">
                      Account ID: <span className="font-mono font-bold text-cyan-100">{wallet.accountId}</span>
                      <button type="button" onClick={() => void navigator.clipboard?.writeText(wallet.accountId || "")} className="underline hover:text-white">Copy</button>
                    </p>
                  ) : null}
                  {wallet?.countryCode ? (
                    <p className="mt-1 text-xs text-blue-100/50">Country: {wallet.countryCode} · Wallet currency: {currentCurrency}</p>
                  ) : null}
                </div>
                <a
                  href="/account"
                  className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5"
                >
                  Account settings
                </a>
              </div>

              {wallet && wallet.balanceMinor <= 0 ? (
                <div className="mt-6 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4">
                  <p className="font-bold text-amber-100">Your balance is empty</p>
                  <p className="mt-1 text-sm text-amber-100/75">
                    Add wallet credits before starting a paid stream.
                  </p>
                  <a
                    href="#topups"
                    className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-cyan-300 px-4 text-sm font-extrabold text-[#031039]"
                  >
                    View top-up options
                  </a>
                </div>
              ) : null}

              {!verified ? (
                <p className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100">
                  Verify your email before purchasing wallet credits.{" "}
                  <a href="/account" className="font-bold underline">
                    Verify account
                  </a>
                </p>
              ) : (
                <div id="topups" className="mt-8 scroll-mt-6">
                  <h2 className="text-lg font-bold">Add wallet credits</h2>
                  <p className="mt-1 text-xs text-blue-100/60">
                    Top-up amounts are displayed in your wallet currency ({currentCurrency}).
                  </p>

                  {/* Currency-specific top-up offers supplied by the wallet API */}
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-300/80">
                      Choose amount · {currentCurrency}
                    </p>
                    {topups.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                        {topups.map((offer) => {
                          const isSelected = !isCustom && selectedPackageId === offer.packageId;
                          return (
                            <button
                              key={offer.packageId}
                              type="button"
                              onClick={() => {
                                setSelectedPackageId(offer.packageId);
                                setIsCustom(false);
                              }}
                              className={isSelected
                                ? "rounded-xl border border-cyan-300 bg-cyan-400/20 p-3 text-center font-bold text-white ring-2 ring-cyan-400/30"
                                : "rounded-xl border border-white/10 bg-[#030b2a]/60 p-3 text-center text-blue-100/80 hover:border-white/20 hover:bg-white/5"}
                            >
                              <span className="text-xs font-extrabold sm:text-sm">
                                {formatChipAmount(offer.amountMinor, offer.currency)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-100">
                        Paystack cannot process top-ups in {currentCurrency} for this account. Please use the BQ SQWAD TV app to top up your wallet.
                      </p>
                    )}
                  </div>

                  {currentCurrency === "NGN" ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-[#030b2a]/40 p-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isCustom}
                          onChange={(e) => setIsCustom(e.target.checked)}
                          className="rounded border-white/20 bg-black/40 text-cyan-400 focus:ring-cyan-400"
                        />
                        <span className="text-sm font-semibold text-white">Enter a custom amount (₦200 minimum)</span>
                      </label>
                      {isCustom ? (
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-sm font-bold text-slate-400">₦</span>
                            <input
                              type="number"
                              min="200"
                              step="50"
                              value={customAmountNgn}
                              onChange={(e) => setCustomAmountNgn(e.target.value)}
                              placeholder="e.g. 750"
                              className="w-40 rounded-xl border border-white/15 bg-black/50 py-2 pl-8 pr-3 text-sm font-bold text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                            />
                          </div>
                          <span className="text-xs text-blue-100/50">Minimum ₦200</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Primary Checkout Button */}
                  <div className="mt-5">
                    <button
                      type="button"
                      disabled={busyPackage !== "" || (!isCustom && !selectedPackageId)}
                      onClick={() => void purchase()}
                      className="inline-flex min-h-12 w-full sm:w-auto items-center justify-center rounded-xl bg-cyan-300 px-6 py-3 font-extrabold text-[#031039] hover:bg-cyan-200 disabled:opacity-50"
                    >
                      {busyPackage !== "" ? "Opening checkout…" : "Continue to Paystack"}
                    </button>
                  </div>

                  {/* Configured Packages List (if any custom from API) */}
                  {topups.length > 0 && (
                    <div className="mt-8 border-t border-white/10 pt-6">
                      <h3 className="text-sm font-semibold text-blue-100/70 mb-3">Available packages</h3>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {topups.map((item) => (
                          <article
                            key={item.packageId}
                            className="rounded-2xl border border-white/10 bg-[#030b2a]/55 p-4"
                          >
                            <p className="text-xs uppercase tracking-[0.14em] text-cyan-200">
                              {item.packageId}
                            </p>
                            <p className="mt-2 text-xl font-extrabold">
                              {formatMoney(item.creditMinor, item.currency)} credit
                            </p>
                            <p className="mt-1 text-sm text-blue-100/60">
                              Pay{" "}
                              {formatMoney(
                                item.displayAmountMinor ?? item.amountMinor,
                                item.currency,
                              )}
                            </p>
                            <button
                              type="button"
                              disabled={busyPackage !== ""}
                              onClick={() => void purchase(item.packageId)}
                              className="mt-4 w-full rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-extrabold text-[#031039] disabled:opacity-50"
                            >
                              {busyPackage === item.packageId
                                ? "Opening checkout…"
                                : "Top up with Paystack"}
                            </button>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {message && (
          <p
            role="status"
            className="mt-5 rounded-xl border border-emerald-300/15 bg-emerald-300/5 p-4 text-sm text-emerald-100 flex items-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-300 shrink-0" />
            {message}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-rose-300/15 bg-rose-300/5 p-4 text-sm text-rose-100 flex items-center gap-2"
          >
            <AlertCircle className="h-4 w-4 text-rose-300 shrink-0" />
            {error}
          </p>
        )}

        {wallet ? (
          <section className="mt-8 rounded-3xl border border-cyan-200/15 bg-[#07143d] p-6 sm:p-8">
            <h2 className="text-xl font-bold">Today’s usage</h2>
            <p className="mt-1 text-sm text-blue-100/60">
              Based on your wallet’s recorded daily spend.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-wider text-blue-100/55">Spent today</p>
                <p className="mt-2 text-2xl font-black tabular-nums">
                  {formatMoney(wallet.spentTodayMinor, currentCurrency)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-wider text-blue-100/55">Daily limit</p>
                <p className="mt-2 text-2xl font-black tabular-nums">
                  {wallet.dailySpendLimitMinor === null
                    ? "No limit set"
                    : formatMoney(wallet.dailySpendLimitMinor, currentCurrency)}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section
          id="transactions"
          className="mt-8 rounded-3xl border border-white/10 bg-[#07143d] p-6 sm:p-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Recent transactions</h2>
            <span className="text-xs text-blue-100/45">Newest first · up to 25 entries</span>
          </div>
          {ledger.length ? (
            <div className="mt-5 divide-y divide-white/10">
              {ledger.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <div>
                    <p className="font-semibold">{item.description}</p>
                    <p className="mt-1 text-xs text-blue-100/45">
                      {new Date(item.createdAt).toLocaleString("en-NG")}
                    </p>
                  </div>
                  <p
                    className={
                      item.amountMinor >= 0
                        ? "font-bold tabular-nums text-emerald-200"
                        : "font-bold tabular-nums text-blue-100"
                    }
                  >
                    {item.amountMinor >= 0 ? "+" : "−"}
                    {formatMoney(Math.abs(item.amountMinor), (item as any).currency ?? wallet?.currency ?? "USD")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#0C1738]/50 p-8 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#00D8F5]/15 text-[#00D8F5]">
                <WalletIcon size={24} />
              </div>
              <p className="mt-3 text-sm font-semibold text-white">No transactions yet</p>
              <p className="mt-1 text-xs text-slate-400">
                Top up your wallet to start watching channels and movies.
              </p>
            </div>
          )}
        </section>
        <p className="mt-6 text-center text-xs text-blue-100/35">
          Payments are verified server-side before wallet credits are applied.
        </p>
      </div>
    </main>
  );
}
