import { prisma } from "@/lib/db";
import NetWorthHistory from "@/components/NetWorthHistory";
import { formatCurrency } from "@/lib/categories";
import { format } from "date-fns";
import TakeSnapshotButton from "./TakeSnapshotButton";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const snapshots = await prisma.snapshot.findMany({
    orderBy: { createdAt: "asc" },
    include: { holdings: true },
  });

  const chartData = snapshots.map((s) => ({
    date: s.createdAt.toISOString(),
    netWorth: s.netWorth,
  }));

  const descending = [...snapshots].reverse();

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">History</h2>
          <p className="text-muted text-sm mt-1">
            Track your net worth over time
          </p>
        </div>
        <TakeSnapshotButton />
      </div>

      <NetWorthHistory data={chartData} />

      {descending.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-muted mb-4">
            Snapshot History
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-left text-muted">
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium text-right">Net Worth</th>
                  <th className="pb-3 font-medium text-right">Holdings</th>
                  <th className="pb-3 font-medium text-right">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {descending.map((snapshot, index) => {
                  const prevSnapshot = descending[index + 1];
                  const change = prevSnapshot
                    ? snapshot.netWorth - prevSnapshot.netWorth
                    : 0;
                  const changePercent =
                    prevSnapshot && prevSnapshot.netWorth > 0
                      ? (change / prevSnapshot.netWorth) * 100
                      : 0;

                  return (
                    <tr key={snapshot.id}>
                      <td className="py-3">
                        {format(new Date(snapshot.createdAt), "MMM d, yyyy h:mm a")}
                      </td>
                      <td className="py-3 text-right font-medium tabular-nums">
                        {formatCurrency(snapshot.netWorth)}
                      </td>
                      <td className="py-3 text-right text-muted tabular-nums">
                        {snapshot.holdings.length}
                      </td>
                      <td className="py-3 text-right tabular-nums">
                        {prevSnapshot ? (
                          <span
                            className={
                              change >= 0 ? "text-success" : "text-danger"
                            }
                          >
                            {change >= 0 ? "+" : ""}
                            {formatCurrency(change)} ({changePercent.toFixed(1)}
                            %)
                          </span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
