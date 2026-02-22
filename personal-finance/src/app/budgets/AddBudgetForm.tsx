"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = [
  { value: "FOOD_AND_DRINK", label: "Food & Drink" },
  { value: "TRANSPORTATION", label: "Transportation" },
  { value: "SHOPPING", label: "Shopping" },
  { value: "ENTERTAINMENT", label: "Entertainment" },
  { value: "TRAVEL", label: "Travel" },
  { value: "RENT_AND_UTILITIES", label: "Rent & Utilities" },
  { value: "GENERAL_SERVICES", label: "Services" },
  { value: "PERSONAL_CARE", label: "Personal Care" },
  { value: "GENERAL_MERCHANDISE", label: "Merchandise" },
  { value: "HOME_IMPROVEMENT", label: "Home" },
  { value: "MEDICAL", label: "Medical" },
  { value: "BANK_FEES", label: "Bank Fees" },
  { value: "LOAN_PAYMENTS", label: "Loan Payments" },
  { value: "OTHER", label: "Other" },
];

interface AddBudgetFormProps {
  existingCategories: string[];
}

export default function AddBudgetForm({ existingCategories }: AddBudgetFormProps) {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableCategories = CATEGORIES.filter(
    (c) => !existingCategories.includes(c.value)
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category || !limit) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          limit: parseFloat(limit),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to create budget");
      }

      setCategory("");
      setLimit("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create budget");
    } finally {
      setLoading(false);
    }
  }

  if (availableCategories.length === 0) {
    return (
      <p className="text-sm text-muted">
        All categories have budgets assigned.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm"
            required
          >
            <option value="">Select category...</option>
            {availableCategories.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Monthly Limit</label>
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="500.00"
            min="0"
            step="0.01"
            className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm"
            required
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Adding..." : "Add Budget"}
          </button>
        </div>
      </div>
    </form>
  );
}
