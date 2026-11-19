import { createFileRoute } from "@tanstack/react-router";
import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import { ConsoleShell, ConsoleWelcomeBanner } from "@/components/ConsoleShell";
import { SecurityEventsView } from "@/components/SecurityEventsView";

export const Route = createFileRoute("/zillionaire/security")({
  component: ZillionaireSecurityRoute,
  head: () => ({
    meta: [
      { title: "Security Operations | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ZillionaireSecurityRoute() {
  return (
    <ConsolePageGuard role="zillionaire" module="security">
      {({ token, account, onLock }) => (
        <ConsoleShell
          consoleType="zillionaire"
          title="Security & Threat Mitigation"
          tagline="Real-time security telemetry, brute force detection, and IP threat remediation"
          activePath="/zillionaire/security"
          account={{
            email: account.email || undefined,
            isOwner: account.isOwner,
            modules: account.modules,
          }}
          onLock={onLock}
        >
          <ConsoleWelcomeBanner
            title="Active Threat Monitoring"
            description="Live detection of credential abuse, anomalous geolocations, signature tampering and rate-limit violations across all clients."
            badgeText="Security Operations"
          />
          <SecurityEventsView sessionToken={token} isOwner={account.isOwner} />
        </ConsoleShell>
      )}
    </ConsolePageGuard>
  );
}
