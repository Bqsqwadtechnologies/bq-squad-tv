import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";
import { Database, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SchemaReport = {
  projectId: string;
  collections: Array<{ name: string; fields: Record<string, string> }>;
};

const firebaseProjectId = "bq-sqwad-tv";
const firebaseApiKey = "AIzaSyD6QfAIfn_T0YWxxYKDbw8lZfj_s81N2ow"; //gitleaks:allow Firebase web client API key; not a server credential

export const Route = createFileRoute("/zillionaire/firebase-schema")({
  component: FirebaseSchemaPage,
  head: () => ({
    meta: [
      { title: "Data structure | BQ SQWAD TV" },
      { name: "description", content: "Private platform data structure." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { property: "og:title", content: "Data structure | BQ SQWAD TV" },
      { property: "og:description", content: "Private platform data structure." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function FirebaseSchemaPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [report, setReport] = useState<SchemaReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function inspectSchema(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setReport(null);

    try {
      const signInResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, returnSecureToken: true }),
        },
      );
      setPassword("");
      const signInData = (await signInResponse.json()) as {
        idToken?: string;
        error?: { message?: string };
      };
      if (!signInResponse.ok || !signInData.idToken) {
        throw new Error(
          signInData.error?.message === "OPERATION_NOT_ALLOWED"
            ? "Email and password sign-in is not enabled for this Platform."
            : "Sign-in failed. Check your sign-in details and try again.",
        );
      }

      const response = await fetch("/api/public/firebase-schema-inspect", {
        headers: await getWebAuthHeaders(signInData.idToken),
      });
      const result = (await response.json()) as SchemaReport & { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "We could not load this information. Try again.");
      }
      setReport(result);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "We could not load this information. Try again.",
      );
    } finally {
      setPassword("");
      setBusy(false);
    }
  }

  function clearReport() {
    setReport(null);
    setError(null);
    setEmail("");
    setPassword("");
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-5">
          <span className="grid size-10 place-items-center rounded-md bg-primary text-primary-foreground">
            <Database size={20} />
          </span>
          <div>
            <p className="text-sm font-bold">BQ SQWAD TV</p>
            <p className="text-xs text-muted-foreground">Data structure</p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <ShieldCheck size={17} /> Owner access
          </p>
          <h1 className="mt-4 text-3xl font-bold">Data structure</h1>
          <p className="mt-3 leading-7 text-muted-foreground">
            Sign in with an owner account to view the platform's data structure. Private record
            contents are not displayed.
          </p>
        </div>

        {!report ? (
          <form onSubmit={inspectSchema} className="mt-9 grid max-w-md gap-5">
            <div className="grid gap-2">
              <Label htmlFor="owner-email">Owner email</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={busy} className="w-fit">
              {busy ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
              {busy ? "Checking access…" : "View data structure"}
            </Button>
          </form>
        ) : (
          <div className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-4 border-y border-border py-4">
              <div>
                <p className="text-sm text-muted-foreground">Project</p>
                <p className="font-semibold">{report.projectId}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Data groups</p>
                <p className="font-semibold">{report.collections.length}</p>
              </div>
              <Button variant="outline" onClick={clearReport}>
                <LogOut /> Sign out
              </Button>
            </div>
            {report.collections.length === 0 ? (
              <p className="py-10 text-muted-foreground">No data groups were found.</p>
            ) : (
              <div className="mt-6 divide-y divide-border">
                {report.collections.map((collection) => (
                  <article key={collection.name} className="py-5">
                    <h2 className="font-semibold">{collection.name}</h2>
                    {Object.keys(collection.fields).length === 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        No information fields to display
                      </p>
                    ) : (
                      <dl className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                        {Object.entries(collection.fields).map(([field, type]) => (
                          <div
                            key={field}
                            className="flex min-w-0 justify-between gap-3 border-b border-border/60 py-1.5 text-sm"
                          >
                            <dt className="truncate text-muted-foreground">{field}</dt>
                            <dd className="shrink-0 font-mono text-xs">{type}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
