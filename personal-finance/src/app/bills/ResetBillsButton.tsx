"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";

export default function ResetBillsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    if (!confirm("Reset all bills to unpaid for the new month?")) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch all bills and reset their paid status
      const res = await fetch(apiUrl("/api/bills"));
      if (!res.ok) throw new Error("Failed to fetch bills");

      const bills = await res.json();

      // Update each paid bill to unpaid
      for (const bill of bills) {
        if (bill.isPaid) {
          const updateRes = await fetch(apiUrl("/api/bills"), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: bill.id,
              isPaid: false,
              paidDate: null,
            }),
          });
          if (!updateRes.ok) {
            console.error("Failed to reset bill:", bill.name);
          }
        }
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset bills");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {error && <p className="text-sm text-danger mb-2">{error}</p>}
      <button
        onClick={handleReset}
        disabled={loading}
        className="px-3 py-1.5 text-sm text-muted border border-card-border rounded-lg hover:text-foreground hover:border-foreground transition-colors disabled:opacity-50"
      >
        {loading ? "Resetting..." : "New Month Reset"}
      </button>
    </div>
  );
}
