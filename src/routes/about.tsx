import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => ({
    meta: [
      { title: "About BQ SQWAD TV" },
      { name: "description", content: "Learn about BQ SQWAD TV and Bq Sqwad Technologies." },
    ],
  }),
});
function AboutPage() {
  return (
    <main className="min-h-screen bg-background px-5 py-12 text-foreground">
      <article className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-6 sm:p-10">
        <a href="/" className="text-sm font-semibold text-primary">
          BQ SQWAD TV
        </a>
        <h1 className="mt-6 text-3xl font-black">Watch on your terms</h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          BQ SQWAD TV is a viewing platform from Bq Sqwad Technologies. We bring channels,
          programmes and replays together with clear account and wallet information.
        </p>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          Our goal is to make viewing straightforward: show what is available, explain any viewing
          charge before playback, and protect the account and payment information entrusted to us.
        </p>
        <p className="mt-8 text-sm text-muted-foreground">
          Questions or feedback?{" "}
          <a className="font-semibold text-primary underline" href="mailto:tv@bqsqwad.com">
            Contact our team
          </a>
          .
        </p>
      </article>
    </main>
  );
}
