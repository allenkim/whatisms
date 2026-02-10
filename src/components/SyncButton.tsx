"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SyncButtonProps {
  plaidItemId?: string;
  lastSynced?: Date | null;
}

export default function SyncButton({ plaidItemId, lastSynced }: SyncButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/plaid/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plaidItemId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Sync failed");
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
