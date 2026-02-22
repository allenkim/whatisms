"use client";

import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CATEGORY_COLORS, CATEGORY_LABELS, formatCurrency, formatPercent } from "@/lib/categories";

interface AllocationData {
  category: string;
  value: number;
}

interface AllocationChartProps {
  data: AllocationData[];
}

export default function AllocationChart({ data }: AllocationChartProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-6">
        <h3 className="text-sm font-medium text-muted mb-4">Asset Allocation</h3>
        <div className="flex items-center justify-center h-64 text-muted text-sm">
          No holdings yet. Add accounts and holdings to see your allocation.
        </div>
      </div>
    );
  }

  const chartData = data
    .filter((d) => d.value > 0)
    .map((d) => ({
      name: CATEGORY_LABELS[d.category] || d.category,
      value: d.value,
      color: CATEGORY_COLORS[d.category] || CATEGORY_COLORS.OTHER,
      percent: (d.value / total) * 100,
    }));

  return (
    <div className="bg-card border border-card-border rounded-xl p-6">
      <h3 className="text-sm font-medium text-muted mb-4">Asset Allocation</h3>
      <div className="flex items-center gap-8">
        <div className="w-48 h-48">
          {mounted ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => formatCurrency(Number(value))}
                contentStyle={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--card-border)",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          ) : <div className="w-48 h-48" />}
        </div>
        <div className="flex-1 space-y-2">
          {chartData.map((entry) => (
            <div key={entry.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span>{entry.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted">{formatPercent(entry.percent)}</span>
                <span className="font-medium w-24 text-right">{formatCurrency(entry.value)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
