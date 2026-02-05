"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TakeSnapshotButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSnapshot() {
    setLoading(true);
    await fetch("/api/snapshots", { method: "POST" });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleSnapshot}
      disabled={loading}
      className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
    >
      {loading ? "Saving..." : "Take Snapshot"}
    </button>
  );
}
