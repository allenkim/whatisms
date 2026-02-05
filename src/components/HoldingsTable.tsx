import { CATEGORY_COLORS, CATEGORY_LABELS, formatCurrencyExact } from "@/lib/categories";

interface HoldingsTableProps {
  holdings: {
    id: string;
    name: string;
    ticker: string | null;
    category: string;
    quantity: number;
    price: number;
    value: number;
  }[];
  totalValue: number;
}

export default function HoldingsTable({ holdings, totalValue }: HoldingsTableProps) {
  if (holdings.length === 0) {
    return (
      <div className="text-center py-12 text-muted text-sm">
        No holdings yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-card-border text-left text-muted">
            <th className="pb-3 font-medium">Name</th>
            <th className="pb-3 font-medium">Category</th>
            <th className="pb-3 font-medium text-right">Quantity</th>
            <th className="pb-3 font-medium text-right">Price</th>
            <th className="pb-3 font-medium text-right">Value</th>
            <th className="pb-3 font-medium text-right">% of Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {holdings.map((holding) => (
            <tr key={holding.id} className="hover:bg-accent-light/30 transition-colors">
              <td className="py-3">
                <div>
                  <span className="font-medium">{holding.name}</span>
                  {holding.ticker && (
                    <span className="ml-2 text-xs text-muted">{holding.ticker}</span>
                  )}
                </div>
              </td>
              <td className="py-3">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: CATEGORY_COLORS[holding.category] || CATEGORY_COLORS.OTHER }}
                  />
                  {CATEGORY_LABELS[holding.category] || holding.category}
                </span>
              </td>
              <td className="py-3 text-right tabular-nums">{holding.quantity.toLocaleString()}</td>
              <td className="py-3 text-right tabular-nums">{formatCurrencyExact(holding.price)}</td>
              <td className="py-3 text-right font-medium tabular-nums">{formatCurrencyExact(holding.value)}</td>
              <td className="py-3 text-right text-muted tabular-nums">
                {totalValue > 0 ? ((holding.value / totalValue) * 100).toFixed(1) : 0}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
