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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = [
      "Name: " + name.trim(),
      "Reply email: " + email.trim(),
      "",
      message.trim(),
    ].join("\n");
    const mailto = "mailto:tv@bqsqwad.com?subject=" + encodeURIComponent(subject.trim())
      + "&body=" + encodeURIComponent(body);
    window.location.assign(mailto);
    setNotice("Your email app should open with this message addressed to tv@bqsqwad.com. If it does not open, email us directly at tv@bqsqwad.com.");
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
          <button type="submit" className="min-h-11 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
            Open email to send
          </button>
        </form>
        <p role="status" className="mt-4 text-sm text-muted-foreground">{notice}</p>
        <p className="mt-5 text-sm text-muted-foreground">This form opens your device’s email app. It does not send a message directly from this website.</p>
        <a className="mt-2 inline-block font-semibold text-primary underline underline-offset-4" href="mailto:tv@bqsqwad.com">tv@bqsqwad.com</a>
      </section>
    </main>
  );
}
