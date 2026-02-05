"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ASSET_CATEGORIES } from "@/lib/categories";

interface AddHoldingFormProps {
  accountId: string;
}

export default function AddHoldingForm({ accountId }: AddHoldingFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const data = {
      accountId,
      name: form.get("name") as string,
      ticker: (form.get("ticker") as string) || null,
      category: form.get("category") as string,
      quantity: parseFloat(form.get("quantity") as string),
      price: parseFloat(form.get("price") as string),
    };

    try {
      const res = await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Request failed (${res.status})`);
      }

      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-accent hover:text-accent/80 transition-colors font-medium"
      >
        + Add Holding
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-card-border rounded-lg p-4 space-y-3 bg-background"
    >
      <h4 className="font-medium text-sm">Add Holding</h4>

      {error && (
        <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <label className="block text-xs text-muted mb-1">Name</label>
          <input
            name="name"
            required
            placeholder="e.g. Apple Inc."
            className="w-full px-3 py-1.5 bg-card border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Ticker</label>
          <input
            name="ticker"
            placeholder="e.g. AAPL"
            className="w-full px-3 py-1.5 bg-card border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Category</label>
          <select
            name="category"
            required
            className="w-full px-3 py-1.5 bg-card border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {ASSET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Quantity</label>
          <input
            name="quantity"
            type="number"
            step="any"
            required
            placeholder="0"
            className="w-full px-3 py-1.5 bg-card border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Price</label>
          <input
            name="price"
            type="number"
            step="any"
            required
            placeholder="0.00"
            className="w-full px-3 py-1.5 bg-card border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-3 py-1.5 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {loading ? "Adding..." : "Add"}
        </button>
      </div>
    </form>
  );
}
