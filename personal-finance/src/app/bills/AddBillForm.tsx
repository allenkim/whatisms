"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = [
  "Utilities",
  "Subscriptions",
  "Insurance",
  "Rent/Mortgage",
  "Phone",
  "Internet",
  "Loans",
  "Credit Cards",
  "Other",
];

export default function AddBillForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [category, setCategory] = useState("");
  const [isAutoPay, setIsAutoPay] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !amount || !dueDay || !category) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          amount: parseFloat(amount),
          dueDay: parseInt(dueDay),
          category,
          isAutoPay,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to add bill");
      }

      setName("");
      setAmount("");
      setDueDay("");
      setCategory("");
      setIsAutoPay(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add bill");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Bill Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Netflix"
            className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="15.99"
            min="0"
            step="0.01"
            className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Due Day</label>
          <input
            type="number"
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
            placeholder="15"
            min="1"
            max="31"
            className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm"
            required
          >
            <option value="">Select...</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isAutoPay}
              onChange={(e) => setIsAutoPay(e.target.checked)}
              className="rounded border-card-border"
            />
            Auto-pay
          </label>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Adding..." : "Add"}
          </button>
        </div>
      </div>
    </form>
  );
}
