import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () => ({ meta: [
    { title: "Contact BQ SQWAD TV" },
    { name: "description", content: "Contact the BQ SQWAD TV support team." },
  ] }),
});

function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("General enquiry");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/public/v1/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });
      const result = await response.json() as { sent?: boolean; error?: string };
      if (!response.ok || result.sent !== true) {
        throw new Error(result.error ?? "Your message could not be sent. Please try again.");
      }
      setNotice("Your message has been sent to our support team.");
      setMessage("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Your message could not be sent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-6">
      <section className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-6 sm:p-9">
        <a href="/" className="text-sm font-semibold text-primary">BQ SQWAD TV</a>
        <h1 className="mt-5 text-3xl font-black">Contact our team</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Tell us how we can help. Do not include passwords, sign-in codes or payment card details.</p>
        <form onSubmit={submit} className="mt-7 grid gap-4">
          <label className="grid gap-2 text-sm font-semibold">Your name
            <input value={name} onChange={event => setName(event.target.value)} required maxLength={100}
              className="min-h-11 rounded-xl border border-input bg-background px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">Reply email
            <input type="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254}
              className="min-h-11 rounded-xl border border-input bg-background px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">Subject
            <select value={subject} onChange={event => setSubject(event.target.value)}
              className="min-h-11 rounded-xl border border-input bg-background px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option>General enquiry</option><option>Account help</option><option>Wallet or payment</option>
              <option>Playback issue</option><option>Producer support</option><option>Rights or copyright</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold">Message
            <textarea value={message} onChange={event => setMessage(event.target.value)} required minLength={10} maxLength={5000} rows={6}
              className="rounded-xl border border-input bg-background px-3 py-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60">
            {busy ? "Sending…" : "Send message"}
          </button>
        </form>
        <p role="status" aria-live="polite" className="mt-4 text-sm text-muted-foreground">{notice}</p>
        <p className="mt-5 text-sm text-muted-foreground">Messages are sent to our support mailbox. You can also email us directly at <a className="font-semibold text-primary underline underline-offset-4" href="mailto:tv@bqsqwad.com">tv@bqsqwad.com</a>.</p>
      </section>
    </main>
  );
}
