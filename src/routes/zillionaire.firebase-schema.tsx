import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Database, LoaderCircle, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ConsoleShell, ConsoleWelcomeBanner, ConsoleCard } from "@/components/ConsoleShell";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

type SchemaReport = {
  projectId: string;
  collections: Array<{ name: string; fields: Record<string, string> }>;
};

export const Route = createFileRoute("/zillionaire/firebase-schema")({
  component: FirebaseSchemaPage,
  head: () => ({
    meta: [
      { title: "Data structure | BQ SQWAD TV" },
      { name: "description", content: "Private platform data structure." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function FirebaseSchemaPage() {
  return (
    <ConsolePageGuard
      role="zillionaire"
      module="system"
      title="Data structure"
      description="Inspect the Firebase collection and field structure without exposing private record contents."
    >
      {({ token, account, onLock }) => (
        <FirebaseSchemaContent token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function FirebaseSchemaContent({
  token,
  account,
  onLock,
}: {
  token: string;
  account: ConsoleAccount;
  onLock?: () => void;
}) {
  const [report, setReport] = useState<SchemaReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function inspectSchema() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/public/firebase-schema-inspect", {
        headers: await getWebAuthHeaders(token),
        cache: "no-store",
      });
      const result = (await response.json()) as SchemaReport & { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "We could not load the data structure. Try again.");
      }
      setReport(result);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "We could not load this information. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Data structure"
      tagline="Owner-only overview of Firebase collections and field types."
      account={account}
      activePath="/zillionaire/firebase-schema"
      onLock={onLock}
    >
      <div className="space-y-6">
        <ConsoleWelcomeBanner
          title="Firebase data structure"
          description="Inspect collection names and field types. Private user, payment and content record values are not displayed."
          badgeText="Owner only"
        />
        <ConsoleCard title="Schema inspection">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <Database size={20} />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">Firebase project structure</p>
                <p className="mt-1 text-xs text-slate-400">Read-only · collection names and field types only</p>
              </div>
            </div>
            <Button type="button" onClick={() => void inspectSchema()} disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              {busy ? "Inspecting…" : report ? "Refresh structure" : "Inspect structure"}
            </Button>
          </div>
          {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        </ConsoleCard>
        {report && (
          <ConsoleCard title="Collections and fields" subtitle={report.projectId}>
            <div className="mb-4 text-xs text-slate-400">{report.collections.length} collections discovered</div>
            {report.collections.length === 0 ? (
              <p className="py-8 text-sm text-slate-400">No collections were found.</p>
            ) : (
              <div className="divide-y divide-slate-800">
                {report.collections.map((collection) => (
                  <article key={collection.name} className="py-5">
                    <h2 className="text-sm font-semibold text-white">{collection.name}</h2>
                    {Object.keys(collection.fields).length === 0 ? (
                      <p className="mt-2 text-xs text-slate-400">No field information available.</p>
                    ) : (
                      <dl className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                        {Object.entries(collection.fields).map(([field, type]) => (
                          <div key={field} className="flex min-w-0 justify-between gap-3 border-b border-slate-800 py-1.5 text-sm">
                            <dt className="truncate text-slate-400">{field}</dt>
                            <dd className="shrink-0 font-mono text-xs text-slate-200">{type}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </article>
                ))}
              </div>
            )}
          </ConsoleCard>
        )}
      </div>
    </ConsoleShell>
  );
}
