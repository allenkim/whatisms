"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { formatCurrency } from "@/lib/categories";
import { format } from "date-fns";

interface SnapshotData {
  date: string;
  netWorth: number;
}

interface NetWorthHistoryProps {
  data: SnapshotData[];
}

export default function NetWorthHistory({ data }: NetWorthHistoryProps) {
  if (data.length === 0) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-6">
        <h3 className="text-sm font-medium text-muted mb-4">Net Worth Over Time</h3>
        <div className="flex items-center justify-center h-64 text-muted text-sm">
          No snapshots yet. Snapshots are created when you save your portfolio state.
        </div>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    date: format(new Date(d.date), "MMM d"),
    fullDate: format(new Date(d.date), "MMM d, yyyy"),
    netWorth: d.netWorth,
  }));

  return (
    <div className="bg-card border border-card-border rounded-xl p-6">
      <h3 className="text-sm font-medium text-muted mb-4">Net Worth Over Time</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: "var(--muted)" }}
              axisLine={{ stroke: "var(--card-border)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "var(--muted)" }}
              axisLine={{ stroke: "var(--card-border)" }}
              tickLine={false}
              tickFormatter={(val) => formatCurrency(val)}
              width={80}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [formatCurrency(Number(value)), "Net Worth"]}
              labelFormatter={(label) => String(label)}
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--card-border)",
                borderRadius: "8px",
                fontSize: "13px",
              }}
            />
            <Line
              type="monotone"
              dataKey="netWorth"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
