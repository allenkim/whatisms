"use client";

import { formatCurrency } from "@/lib/categories";

interface NetWorthCardProps {
  netWorth: number;
  accountCount: number;
  holdingCount: number;
}

export default function NetWorthCard({ netWorth, accountCount, holdingCount }: NetWorthCardProps) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-6">
      <p className="text-sm text-muted font-medium">Total Net Worth</p>
      <p className="text-4xl font-bold mt-2">{formatCurrency(netWorth)}</p>
      <div className="flex gap-6 mt-4 text-sm text-muted">
        <span>{accountCount} account{accountCount !== 1 ? "s" : ""}</span>
        <span>{holdingCount} holding{holdingCount !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}
