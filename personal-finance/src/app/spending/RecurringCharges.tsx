import { formatCurrency } from "@/lib/categories";

interface RecurringCharge {
  name: string;
  amount: number;
  count: number;
}

interface RecurringChargesProps {
  charges: RecurringCharge[];
}

export default function RecurringCharges({ charges }: RecurringChargesProps) {
  if (charges.length === 0) {
    return null;
  }

  // Estimate monthly total (assuming each charge is monthly)
  const monthlyTotal = charges.reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="bg-card border border-card-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-muted">Recurring Charges</h3>
        <div className="text-right">
          <span className="text-xs text-muted">Est. Monthly Total</span>
          <p className="font-semibold">{formatCurrency(monthlyTotal)}</p>
        </div>
      </div>

      <div className="space-y-3">
        {charges.map((charge) => (
          <div
            key={charge.name}
            className="flex items-center justify-between py-2 border-b border-card-border last:border-0"
          >
            <div>
              <p className="font-medium text-sm">{charge.name}</p>
              <p className="text-xs text-muted">
                {charge.count} charges detected
              </p>
            </div>
            <div className="text-right">
              <p className="font-medium text-sm">{formatCurrency(charge.amount)}</p>
              <p className="text-xs text-muted">per charge</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted mt-4">
        Recurring charges are detected automatically based on transaction patterns.
        Review these to identify subscriptions you may have forgotten about.
      </p>
    </div>
  );
}
