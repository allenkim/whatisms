"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GenerateInsightsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ generated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/insights", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to generate insights");
      }

      const data = await res.json();
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-sm text-danger">{error}</span>}
      {result && (
        <span className="text-sm text-success">
          {result.generated} new insight{result.generated !== 1 ? "s" : ""}
        </span>
      )}
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
      >
        {loading ? "Analyzing..." : "Generate Insights"}
      </button>
    </div>
  );
}
