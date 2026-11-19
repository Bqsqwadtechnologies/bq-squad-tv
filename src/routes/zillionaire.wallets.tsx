import { createFileRoute } from "@tanstack/react-router";
import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import { ConsoleShell } from "@/components/ConsoleShell";
import { FinanceBody } from "./zillionaire.finance";

export const Route = createFileRoute("/zillionaire/wallets")({
  component: WalletsRoute,
  head: () => ({
    meta: [
      { title: "Wallets & Ledger | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function WalletsRoute() {
  return (
    <ConsolePageGuard role="zillionaire" module="finance">
      {({ token, account, onLock }) => (
        <ConsoleShell
          consoleType="zillionaire"
          title="Wallets & Global Ledger"
          tagline="Live viewer wallet liabilities, ledger explorer, and transaction auditing"
          activePath="/zillionaire/wallets"
          account={{
            email: account.email || undefined,
            isOwner: account.isOwner,
            modules: account.modules,
          }}
          onLock={onLock}
        >
          <FinanceBody token={token} account={account} initialTab="ledger" />
        </ConsoleShell>
      )}
    </ConsolePageGuard>
  );
}
