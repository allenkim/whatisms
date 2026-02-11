"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SyncResult {
  itemId: string;
  institution: string;
  success: boolean;
  added?: number;
  modified?: number;
  removed?: number;
  error?: string;
}

export default function SyncTransactionsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SyncResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const res = await fetch("/api/plaid/sync-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to sync transactions");
      }

      const data = await res.json();
      setResults(data.results);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleSync}
        disabled={loading}
        className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors text-sm font-medium disabled:opacity-50"
      >
        {loading ? "Syncing Transactions..." : "Sync Transactions"}
      </button>

      {error && (
        <p className="text-sm text-danger">{error}</p>
      )}

      {results && (
        <div className="text-sm space-y-1">
          {results.map((result) => (
            <div key={result.itemId} className="flex items-center gap-2">
              <span className={result.success ? "text-success" : "text-danger"}>
                {result.success ? "✓" : "✗"}
              </span>
              <span>{result.institution}</span>
              {result.success && (
                <span className="text-muted">
                  +{result.added} added, {result.modified} modified, {result.removed} removed
                </span>
              )}
              {!result.success && result.error && (
                <span className="text-danger">{result.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
