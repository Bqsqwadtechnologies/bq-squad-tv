import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, CircleHelp, Mail } from "lucide-react";

const topics = [
  {
    question: "How do I create an account?",
    answer:
      "Open Account, choose to create an account, and complete the requested sign-in and profile steps. Keep your sign-in details private.",
  },
  {
    question: "Why can't I see a channel?",
    answer:
      "Only published channels available to your account and region are shown. Some content may also have age or distribution restrictions.",
  },
  {
    question: "How does the wallet work?",
    answer:
      "Your wallet currency is assigned when your wallet is first established. Review the displayed price and available balance before starting a paid viewing session.",
  },
  {
    question: "What if a payment is delayed?",
    answer:
      "Return to your Wallet page and allow the payment status to refresh. Do not pay again while the first transaction is still being confirmed.",
  },
  {
    question: "How do I protect my account?",
    answer:
      "Use a unique password, verify your email address, and sign out on devices you no longer use. Never share verification codes.",
  },
];

export const Route = createFileRoute("/help")({
  component: HelpPage,
  head: () => ({
    meta: [
      { title: "Help centre | BQ SQWAD TV" },
      { name: "description", content: "Account, wallet and viewing help for BQ SQWAD TV." },
    ],
  }),
});

function HelpPage() {
  return (
    <main className="legacy-light-surface min-h-screen bg-[#f7f9fe] px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-blue-700">
          <ArrowLeft size={17} /> Home
        </a>
        <section className="mt-8 rounded-3xl border border-blue-100 bg-white p-6 shadow-sm sm:p-9">
          <div className="flex items-center gap-3 text-blue-700">
            <CircleHelp size={23} />
            <span className="text-xs font-bold uppercase tracking-[0.18em]">Support</span>
          </div>
          <h1 className="mt-4 text-3xl font-black sm:text-4xl">Help centre</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Quick answers about your account, wallet and viewing experience.
          </p>
          <div className="mt-7 divide-y divide-blue-100">
            {topics.map((topic) => (
              <details key={topic.question} className="group py-4">
                <summary className="cursor-pointer list-none pr-5 text-sm font-bold marker:hidden">
                  {topic.question}
                </summary>
                <p className="mt-3 text-sm leading-6 text-slate-600">{topic.answer}</p>
              </details>
            ))}
          </div>
          <div className="mt-7 rounded-2xl bg-blue-50 p-5">
            <div className="flex items-center gap-2 text-blue-800">
              <Mail size={18} />
              <h2 className="font-bold">Contact support</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              If you still need help, email our support team. Never include passwords or
              verification codes in your message.
            </p>
            <a
              href="mailto:tv@bqsqwad.com"
              className="mt-3 inline-flex rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white"
            >
              Email tv@bqsqwad.com
            </a>
          </div>
        </section>
        <footer className="py-8 text-center text-xs text-slate-500">
          BQ SQWAD TV · Bq Sqwad Technologies
        </footer>
      </div>
    </main>
  );
}
