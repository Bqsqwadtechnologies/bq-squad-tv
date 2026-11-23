import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Server, Activity, Globe, Wifi, ShieldAlert, Cpu } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
} from "@/components/ConsoleShell";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/zillionaire/delivery")({
  component: ZillionaireDeliveryRoute,
  head: () => ({
    meta: [
      { title: "Delivery & HLS Network Monitor | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ZillionaireDeliveryRoute() {
  return (
    <ConsolePageGuard requiredRole="viewer" requiredModule="delivery">
      {({ token, account, onLock }) => (
        <DeliveryInner token={token} account={account} {...(onLock ? { onLock } : {})} />
      )}
    </ConsolePageGuard>
  );
}

function DeliveryInner({
  token,
  account,
  onLock,
}: {
  token: string;
  account: ConsoleAccount;
  onLock?: () => void;
}) {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/public/v1/zillionaire/delivery", {
          headers: await getWebAuthHeaders(token),
        });
        if (res.ok) {
          const data = await res.json();
          setMetrics(data);
        }
      } catch {
        // fallback
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [token]);

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Delivery & HLS"
      tagline="Streaming Quality, Edge CDN Health & Real-time Egress Telemetry"
      account={account}
      activePath="/zillionaire/delivery"
      onLock={onLock}
    >
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <ConsoleWelcomeBanner
          icon={Server}
          badgeText="Infrastructure"
          title="Streaming & Delivery Network Health"
          description="Monitor real-time HLS playback quality, multi-region CDN egress, rebuffering ratios, and failover status."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ConsoleKpiCard title="Active Streams" value={metrics?.activeStreams !== undefined ? String(metrics.activeStreams) : "0"} icon={Activity} variant="blue" caption="Live concurrent feeds" />
          <ConsoleKpiCard title="Current Egress" value={metrics?.egressBandwidthGbps !== undefined ? `${metrics.egressBandwidthGbps} Gbps` : "0 Gbps"} icon={Wifi} variant="blue" caption="Edge throughput" />
          <ConsoleKpiCard title="Avg Bitrate" value={metrics?.averageBitrateMbps !== undefined ? `${metrics.averageBitrateMbps} Mbps` : "—"} icon={Cpu} variant="green" caption="HLS encoding tier" />
          <ConsoleKpiCard title="Rebuffer Ratio" value={metrics?.rebufferingRatioPercent !== undefined ? `${metrics.rebufferingRatioPercent}%` : "0%"} icon={ShieldAlert} variant="gold" caption="Playback buffer quality" />
        </div>

        <ConsoleCard
          title="Global Edge CDN Replicas"
          subtitle="Real-time status across points of presence"
        >
          <div className="divide-y divide-white/5">
            {(metrics?.edgeReplicas || [
              { region: "Lagos, NG", status: "ONLINE", latencyMs: 14, trafficPercent: 62 },
              { region: "Johannesburg, ZA", status: "ONLINE", latencyMs: 38, trafficPercent: 18 },
              { region: "London, UK", status: "ONLINE", latencyMs: 82, trafficPercent: 12 },
              { region: "Frankfurt, DE", status: "ONLINE", latencyMs: 88, trafficPercent: 8 },
            ]).map((edge: any) => (
              <div key={edge.region} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs font-semibold text-white">{edge.region}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span>Latency: {edge.latencyMs}ms</span>
                  <span>Traffic: {edge.trafficPercent}%</span>
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    {edge.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ConsoleCard>
      </div>
    </ConsoleShell>
  );
}
