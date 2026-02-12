"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DeleteBudgetButtonProps {
  id: string;
  category: string;
}

export default function DeleteBudgetButton({ id, category }: DeleteBudgetButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(`Delete budget for "${category.replace(/_/g, " ")}"?`)) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/budgets?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to delete budget");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {error && <span className="text-xs text-danger">{error}</span>}
      <button
        onClick={handleDelete}
        disabled={loading}
        className="text-muted hover:text-danger transition-colors text-sm disabled:opacity-50"
        title="Delete budget"
      >
        {loading ? "..." : "×"}
      </button>
    </>
  );
}
