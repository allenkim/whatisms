import { prisma } from "@/lib/db";
import {
  ASSET_CATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  formatCurrency,
  formatPercent,
} from "@/lib/categories";
import HoldingsTable from "@/components/HoldingsTable";

export const dynamic = "force-dynamic";

export default async function BreakdownPage() {
  const holdings = await prisma.holding.findMany({
    include: { account: true },
    orderBy: { value: "desc" },
  });

  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);

  const categoryBreakdown = ASSET_CATEGORIES.map((category) => {
    const categoryHoldings = holdings.filter((h) => h.category === category);
    const categoryValue = categoryHoldings.reduce((sum, h) => sum + h.value, 0);
    return {
      category,
      label: CATEGORY_LABELS[category],
      color: CATEGORY_COLORS[category],
      value: categoryValue,
      percent: totalValue > 0 ? (categoryValue / totalValue) * 100 : 0,
      holdings: categoryHoldings,
      count: categoryHoldings.length,
    };
  }).filter((c) => c.count > 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Breakdown</h2>
        <p className="text-muted text-sm mt-1">
          Detailed view of your asset allocation
        </p>
      </div>

      {categoryBreakdown.length === 0 ? (
        <div className="bg-card border border-card-border rounded-xl p-8 text-center">
          <p className="text-muted text-sm">
            No holdings yet. Add accounts and holdings to see your breakdown.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-card border border-card-border rounded-xl p-6">
            <h3 className="text-sm font-medium text-muted mb-4">
              Category Summary
            </h3>
            <div className="space-y-3">
              {categoryBreakdown.map((cat) => (
                <div key={cat.category}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-medium">{cat.label}</span>
                      <span className="text-muted">
                        ({cat.count} holding{cat.count !== 1 ? "s" : ""})
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-muted">
                        {formatPercent(cat.percent)}
                      </span>
                      <span className="font-semibold w-28 text-right">
                        {formatCurrency(cat.value)}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-card-border rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${cat.percent}%`,
                        backgroundColor: cat.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {categoryBreakdown.map((cat) => (
            <div
              key={cat.category}
              className="bg-card border border-card-border rounded-xl p-6"
            >
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <h3 className="font-semibold text-sm">{cat.label}</h3>
                <span className="text-xs text-muted">
                  {formatCurrency(cat.value)} ({formatPercent(cat.percent)})
                </span>
              </div>
              <HoldingsTable holdings={cat.holdings} totalValue={totalValue} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
