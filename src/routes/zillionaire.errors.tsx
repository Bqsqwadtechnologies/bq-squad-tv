import { createFileRoute } from "@tanstack/react-router";
import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import { ConsoleShell, ConsoleWelcomeBanner } from "@/components/ConsoleShell";
import { ErrorCenterView } from "@/components/ErrorCenterView";

export const Route = createFileRoute("/zillionaire/errors")({
  component: ZillionaireErrorsRoute,
  head: () => ({
    meta: [
      { title: "Error Telemetry | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ZillionaireErrorsRoute() {
  return (
    <ConsolePageGuard role="zillionaire" module="system">
      {({ token, account, onLock }) => (
        <ConsoleShell
          consoleType="zillionaire"
          title="Runtime Error Center"
          tagline="Aggregated exception fingerprints, stack traces, and affected viewer counts"
          activePath="/zillionaire/errors"
          account={{
            email: account.email || undefined,
            isOwner: account.isOwner,
            modules: account.modules,
          }}
          onLock={onLock}
        >
          <ConsoleWelcomeBanner
            title="Unhandled Exceptions & Faults"
            description="Automated fingerprinting groups similar errors across web, mobile, and FAST playback engines to pinpoint regressions."
            badgeText="System Reliability"
          />
          <ErrorCenterView sessionToken={token} />
        </ConsoleShell>
      )}
    </ConsolePageGuard>
  );
}
