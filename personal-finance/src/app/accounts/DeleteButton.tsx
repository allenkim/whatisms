"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiUrl } from "@/lib/api";

interface DeleteButtonProps {
  id: string;
  type: "account" | "holding";
  name: string;
}

export default function DeleteButton({ id, type, name }: DeleteButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(`Delete ${type} "${name}"? This cannot be undone.`)) return;

    setLoading(true);
    setError(null);
    try {
      const endpoint = type === "account" ? "/api/accounts" : "/api/holdings";
      const res = await fetch(apiUrl(`${endpoint}?id=${id}`), { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to delete ${type}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to delete ${type}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleDelete}
        disabled={loading}
        className="text-xs text-muted hover:text-danger transition-colors disabled:opacity-50"
        title={`Delete ${type}`}
      >
        {loading ? "..." : "Delete"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
