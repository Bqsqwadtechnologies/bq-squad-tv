import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { restoreWebSession } from "@/lib/firebase-web-auth";

type Contract = {
  id: string;
  agreementReference: string;
  territories: string[];
  platforms: string[];
  revenueModel: string;
  settlementCurrency: string;
  validFrom: string | null;
  validUntil: string | null;
  version: number;
  status: string;
};

export const Route = createFileRoute("/provider/contracts")({
  component: ProviderContractsPage,
  head: () => ({
    meta: [
      { title: "Contract | Partner Portal" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ProviderContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await restoreWebSession();
        if (!token) {
          setError("Please sign in from the partner portal home.");
          setBusy(false);
          return;
        }
        const res = await fetch("/api/public/v1/provider/contracts", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load contract details");
        const data = (await res.json()) as { contracts: Contract[] };
        if (active) setContracts(data.contracts || []);
      } catch (err: unknown) {
        if (active) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/provider"
              aria-label="Back to partner dashboard"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="font-bold text-lg text-white">Licence Agreement</h1>
          </div>
          <Link
            to="/provider"
            aria-label="Return to partner dashboard"
            className="text-xs text-cyan-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 rounded"
          >
            Partner Dashboard
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full" role="main">
        {busy ? (
          <div className="py-24 text-center" role="status" aria-live="polite">
            <LoaderCircle className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading agreement summary...</p>
          </div>
        ) : error ? (
          <div
            className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
            role="alert"
          >
            {error}
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Channel Distribution Terms</h2>
              <p className="text-xs text-slate-400">
                Executed distribution rights, revenue share terms and territory bounds.
              </p>
            </div>

            {contracts.length === 0 ? (
              <div
                tabIndex={0}
                className="p-8 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                role="region"
                aria-label="Standard channel distribution agreement"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Standard Channel Distribution Agreement
                    </h3>
                    <p className="text-xs text-slate-400">Reference: AGR-ONLINE-PROV-STD</p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                    Active
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400 block mb-1">Revenue Model</span>
                    <span className="text-sm font-semibold text-white">
                      Gross Profit Share (25.0%)
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">Settlement Currency</span>
                    <span className="text-sm font-semibold text-white">NGN (Naira)</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">Platforms</span>
                    <span className="text-sm font-semibold text-white">Web, Android App</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-300 space-y-2">
                  <div className="font-semibold text-white">Key Distribution Terms:</div>
                  <ul className="list-disc pl-5 space-y-1 text-slate-400">
                    <li>
                      Gross profit is defined as gross viewing receipts minus direct processing and
                      delivery costs.
                    </li>
                    <li>
                      Payment settlements occur monthly within 15 business days of ledger closing.
                    </li>
                    <li>
                      Channel partner warrants full licensing and transmission rights in declared
                      territories.
                    </li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="space-y-4" role="region" aria-label="Active contracts and agreements">
                {contracts.map((c) => (
                  <div
                    key={c.id}
                    tabIndex={0}
                    className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-base font-bold text-white">{c.agreementReference}</h3>
                        <p className="text-xs text-slate-400">Version {c.version}</p>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                        {c.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-800 text-xs">
                      <div>
                        <span className="text-slate-400 block mb-1">Revenue Model</span>
                        <span className="text-sm font-semibold text-white">
                          See your signed agreement
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-1">Settlement Currency</span>
                        <span className="text-sm font-semibold text-white">
                          {c.settlementCurrency}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-1">Territories</span>
                        <span className="text-sm font-semibold text-white">
                          {c.territories.join(", ")}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
