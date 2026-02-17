"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SyncButtonProps {
  plaidItemId?: string;
  snapTradeConnectionId?: string;
  lastSynced?: Date | null;
}

export default function SyncButton({ plaidItemId, snapTradeConnectionId, lastSynced }: SyncButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setError(null);
    try {
      const fetches: Promise<Response>[] = [];

      if (snapTradeConnectionId) {
        // Sync specific SnapTrade connection
        fetches.push(
          fetch("/api/snaptrade/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ snapTradeConnectionId }),
          })
        );
      } else if (plaidItemId) {
        // Sync specific Plaid item
        fetches.push(
          fetch("/api/plaid/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plaidItemId }),
          })
        );
      } else {
        // Global sync: sync both providers in parallel
        fetches.push(
          fetch("/api/plaid/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }),
          fetch("/api/snaptrade/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          })
        );
      }

      const results = await Promise.allSettled(fetches);
      const errors: string[] = [];

      for (const result of results) {
        if (result.status === "rejected") {
          errors.push("Sync failed");
        } else if (!result.value.ok) {
          const data = await result.value.json().catch(() => null);
          // Ignore "no connections found" for global sync
          if (!plaidItemId && !snapTradeConnectionId && data?.error?.includes("No")) continue;
          errors.push(data?.error || "Sync failed");
        }
      }

      if (errors.length > 0) {
        throw new Error(errors.join("; "));
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSync}
        disabled={loading}
        className="px-3 py-1.5 text-sm text-accent hover:text-accent/80 transition-colors font-medium disabled:opacity-50"
      >
        {loading ? "Syncing..." : "Sync Now"}
      </button>
      {lastSynced && (
        <span className="text-xs text-muted">
          Last synced: {new Date(lastSynced).toLocaleString()}
        </span>
      )}
      {error && (
        <span className="text-xs text-danger">{error}</span>
      )}
    </div>
  );
}
