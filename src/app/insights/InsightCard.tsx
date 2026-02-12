"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

interface Insight {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  isRead: boolean;
  createdAt: Date;
}

interface InsightCardProps {
  insight: Insight;
}

export default function InsightCard({ insight }: InsightCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function markAsRead() {
    if (insight.isRead) return;

    setLoading(true);
    try {
      await fetch("/api/insights", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: insight.id, isRead: true }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const severityStyles = {
    ALERT: "border-danger/30 bg-danger/5",
    WARNING: "border-warning/30 bg-warning/5",
    INFO: "border-card-border bg-card",
  };

  const severityIcons = {
    ALERT: "!",
    WARNING: "⚠",
    INFO: "ℹ",
  };

  const severityColors = {
    ALERT: "text-danger",
    WARNING: "text-warning",
    INFO: "text-accent",
  };

  return (
    <div
      className={`border rounded-xl p-4 transition-opacity ${
        severityStyles[insight.severity as keyof typeof severityStyles] || severityStyles.INFO
      } ${insight.isRead ? "opacity-60" : ""}`}
      onClick={markAsRead}
    >
      <div className="flex items-start gap-3">
        <span
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
            severityColors[insight.severity as keyof typeof severityColors] || severityColors.INFO
          } bg-current/10`}
        >
          {severityIcons[insight.severity as keyof typeof severityIcons] || "ℹ"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-sm">{insight.title}</h4>
            {!insight.isRead && (
              <span className="w-2 h-2 bg-accent rounded-full flex-shrink-0" />
            )}
          </div>
          <p className="text-sm text-muted mt-1">{insight.message}</p>
          <p className="text-xs text-muted mt-2">
            {format(new Date(insight.createdAt), "MMM d, h:mm a")}
          </p>
        </div>
        {loading && <span className="text-xs text-muted">...</span>}
      </div>
    </div>
  );
}
