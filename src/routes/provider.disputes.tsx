import React, { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ConsoleShell } from "@/components/ConsoleShell";
import {
  SharedDisputeSystem,
  type DisputeItem,
  type DisputeStatus,
} from "@/components/SharedDisputeSystem";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/provider/disputes")({
  component: ProviderDisputesPage,
  head: () => ({
    meta: [
      { title: "Disputes & Settlements | Partner Portal" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ProviderDisputesPage() {
  return (
    <ConsolePageGuard role="provider">
      {({ token, account, onLock }) => (
        <ProviderDisputesInner token={token} account={account} {...(onLock ? { onLock } : {})} />
      )}
    </ConsolePageGuard>
  );
}

function ProviderDisputesInner({
  token,
  account,
  onLock,
}: {
  token: string;
  account: ConsoleAccount;
  onLock?: () => void;
}) {
  const [disputes, setDisputes] = useState<DisputeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notification, setNotification] = useState("");

  async function loadDisputes(authToken: string) {
    setLoading(true);
    setError("");
    try {
      const headers = await getWebAuthHeaders(authToken);
      const res = await fetch("/api/public/v1/provider/disputes", {
        headers,
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load dispute records");
      const data = await res.json();
      const list = Array.isArray(data.disputes) ? data.disputes : [];

      if (list.length > 0) {
        setDisputes(
          list.map((d: any) => ({
            id: d.id,
            subject: d.subject,
            category: d.category || "Revenue Share Calculation",
            statementId: d.statementId || null,
            channelId: d.channelId || null,
            claimedAmountMinor: Number(d.claimedAmountMinor || 0),
            claimedAmountCurrency: d.claimedAmountCurrency || "USD",
            evidenceFileName: d.evidenceFileName || null,
            status: (d.status || "open") as DisputeStatus,
            createdAt: d.createdAt || new Date().toISOString(),
            updatedAt: d.updatedAt || d.createdAt || new Date().toISOString(),
            messages: Array.isArray(d.messages) ? d.messages : [],
            resolution: d.resolution || null,
          })),
        );
      } else {
        setDisputes([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading disputes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDisputes(token);
  }, [token]);

  async function handleCreateDispute(formData: {
    subject: string;
    category: string;
    statementId: string;
    claimedAmountMinor: number;
    claimedAmountCurrency: string;
    evidenceFileName?: string;
    message: string;
  }) {
    const headers = await getWebAuthHeaders(token);
    const res = await fetch("/api/public/v1/provider/disputes", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!res.ok) throw new Error("Failed to file dispute");
    setNotification("Dispute ticket successfully created.");
    setTimeout(() => setNotification(""), 4000);
    await loadDisputes(token);
  }

  async function handleSendReply(disputeId: string, messageText: string) {
    const headers = await getWebAuthHeaders(token);
    const res = await fetch("/api/public/v1/provider/disputes", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ disputeId, message: messageText }),
    });
    if (!res.ok) throw new Error("Failed to send message to thread");
    await loadDisputes(token);
  }

  return (
    <ConsoleShell
      consoleType="provider"
      title="Provider Console"
      tagline="Disputes & Settlement Adjustments"
      account={account}
      activePath="/provider/disputes"
      onLock={onLock}
      onRefresh={() => void loadDisputes(token)}
      isRefreshing={loading}
    >
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        {notification && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-300">
            {notification}
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
            {error}
          </div>
        )}

        <SharedDisputeSystem
          mode="provider"
          disputes={disputes}
          onCreateDispute={handleCreateDispute}
          onSendReply={handleSendReply}
          isLoading={loading}
        />
      </div>
    </ConsoleShell>
  );
}
