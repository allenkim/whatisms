"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/categories";

interface Bill {
  id: string;
  name: string;
  amount: number;
  dueDay: number;
  category: string;
  isPaid: boolean;
  isAutoPay: boolean;
  status: "paid" | "due_soon" | "overdue" | "upcoming";
}

interface BillCardProps {
  bill: Bill;
}

export default function BillCard({ bill }: BillCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function togglePaid() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/bills", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: bill.id,
          isPaid: !bill.isPaid,
          paidDate: !bill.isPaid ? new Date() : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to update bill");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setLoading(false);
    }
  }

  async function deleteBill() {
    if (!confirm(`Delete "${bill.name}"?`)) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/bills?id=${bill.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to delete bill");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setLoading(false);
    }
  }

  const statusColors = {
    paid: "border-success/30 bg-success/5",
    due_soon: "border-warning/30 bg-warning/5",
    overdue: "border-danger/30 bg-danger/5",
    upcoming: "border-card-border",
  };

  return (
    <div className={`bg-card border rounded-xl p-4 ${statusColors[bill.status]}`}>
      {error && <p className="text-xs text-danger mb-2">{error}</p>}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium">{bill.name}</h4>
            {bill.isAutoPay && (
              <span className="text-xs px-1.5 py-0.5 bg-accent/10 text-accent rounded">
                Auto
              </span>
            )}
          </div>
          <p className="text-sm text-muted mt-0.5">{bill.category}</p>
          <p className="text-lg font-semibold mt-2">{formatCurrency(bill.amount)}</p>
          <p className="text-xs text-muted">Due: {getOrdinal(bill.dueDay)} of month</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={togglePaid}
            disabled={loading}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors disabled:opacity-50 ${
              bill.isPaid
                ? "bg-success/20 text-success hover:bg-success/30"
                : "bg-card-border text-muted hover:text-foreground"
            }`}
          >
            {loading ? "..." : bill.isPaid ? "Paid ✓" : "Mark Paid"}
          </button>
          <button
            onClick={deleteBill}
            disabled={loading}
            className="text-xs text-muted hover:text-danger transition-colors disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
