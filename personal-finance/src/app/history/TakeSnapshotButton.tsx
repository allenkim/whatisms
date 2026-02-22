"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";

export default function TakeSnapshotButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSnapshot() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/snapshots"), { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to save snapshot");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save snapshot");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSnapshot}
        disabled={loading}
        className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
      >
        {loading ? "Saving..." : "Take Snapshot"}
      </button>
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  );
}
