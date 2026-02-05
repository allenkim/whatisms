"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface DeleteButtonProps {
  id: string;
  type: "account" | "holding";
  name: string;
}

export default function DeleteButton({ id, type, name }: DeleteButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete ${type} "${name}"? This cannot be undone.`)) return;

    setLoading(true);
    const endpoint = type === "account" ? "/api/accounts" : "/api/holdings";
    await fetch(`${endpoint}?id=${id}`, { method: "DELETE" });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-xs text-muted hover:text-danger transition-colors disabled:opacity-50"
      title={`Delete ${type}`}
    >
      {loading ? "..." : "Delete"}
    </button>
  );
}
