"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddCreditScoreForm() {
  const router = useRouter();
  const [score, setScore] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!score) return;

    const scoreNum = parseInt(score);
    if (scoreNum < 300 || scoreNum > 850) {
      setError("Score must be between 300 and 850");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/credit-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: scoreNum, source: "manual" }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to save score");
      }

      setScore("");
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="px-3 py-1.5 text-sm text-muted border border-card-border rounded-lg hover:text-foreground hover:border-foreground transition-colors"
      >
        Update Score
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      {error && <span className="text-xs text-danger">{error}</span>}
      <div>
        <label className="block text-xs text-muted mb-1">Score (300-850)</label>
        <input
          type="number"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          min="300"
          max="850"
          placeholder="750"
          className="w-24 px-2 py-1.5 bg-background border border-card-border rounded-lg text-sm"
          autoFocus
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="px-3 py-1.5 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 disabled:opacity-50"
      >
        {loading ? "..." : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setShowForm(false)}
        className="px-3 py-1.5 text-sm text-muted hover:text-foreground"
      >
        Cancel
      </button>
    </form>
  );
}
