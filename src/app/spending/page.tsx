import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/categories";
import SpendingChart from "./SpendingChart";
import RecurringCharges from "./RecurringCharges";
import SyncTransactionsButton from "./SyncTransactionsButton";
import { startOfMonth, subMonths, format } from "date-fns";

export const dynamic = "force-dynamic";

// Plaid category colors
const CATEGORY_COLORS: Record<string, string> = {
  FOOD_AND_DRINK: "#ef4444",
  TRANSPORTATION: "#f59e0b",
  SHOPPING: "#8b5cf6",
  ENTERTAINMENT: "#ec4899",
  TRAVEL: "#06b6d4",
  RENT_AND_UTILITIES: "#3b82f6",
  GENERAL_SERVICES: "#6366f1",
  PERSONAL_CARE: "#14b8a6",
  GENERAL_MERCHANDISE: "#f97316",
  HOME_IMPROVEMENT: "#84cc16",
  MEDICAL: "#22c55e",
  BANK_FEES: "#64748b",
  LOAN_PAYMENTS: "#475569",
  TRANSFER_OUT: "#94a3b8",
  OTHER: "#9ca3af",
};

const CATEGORY_LABELS: Record<string, string> = {
  FOOD_AND_DRINK: "Food & Drink",
  TRANSPORTATION: "Transportation",
  SHOPPING: "Shopping",
  ENTERTAINMENT: "Entertainment",
  TRAVEL: "Travel",
  RENT_AND_UTILITIES: "Rent & Utilities",
  GENERAL_SERVICES: "Services",
  PERSONAL_CARE: "Personal Care",
  GENERAL_MERCHANDISE: "Merchandise",
  HOME_IMPROVEMENT: "Home",
  MEDICAL: "Medical",
  BANK_FEES: "Bank Fees",
  LOAN_PAYMENTS: "Loan Payments",
  TRANSFER_OUT: "Transfers",
  OTHER: "Other",
};

export default async function SpendingPage() {
  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));

  // Get this month's transactions
  const thisMonthTxns = await prisma.transaction.findMany({
    where: {
      date: { gte: thisMonthStart },
      amount: { gt: 0 }, // Spending only
      pending: false,
    },
    include: { account: true },
  });

  // Get last month's transactions
  const lastMonthTxns = await prisma.transaction.findMany({
    where: {
      date: { gte: lastMonthStart, lt: thisMonthStart },
      amount: { gt: 0 },
      pending: false,
    },
  });

  // Get recurring transactions
  const recurringTxns = await prisma.transaction.findMany({
    where: {
      isRecurring: true,
      amount: { gt: 0 },
    },
    orderBy: { merchantName: "asc" },
  });

  // Calculate totals
  const thisMonthTotal = thisMonthTxns.reduce((sum, t) => sum + t.amount, 0);
  const lastMonthTotal = lastMonthTxns.reduce((sum, t) => sum + t.amount, 0);
  const monthChange = lastMonthTotal > 0
    ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100
    : 0;

  // Group by category for this month
  const categoryTotals = new Map<string, number>();
  for (const txn of thisMonthTxns) {
    const cat = txn.category;
    categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + txn.amount);
  }

  // Group by category for last month
  const lastMonthCategoryTotals = new Map<string, number>();
  for (const txn of lastMonthTxns) {
    const cat = txn.category;
    lastMonthCategoryTotals.set(cat, (lastMonthCategoryTotals.get(cat) || 0) + txn.amount);
  }

  // Create category data with month-over-month comparison
  const categoryData = Array.from(categoryTotals.entries())
    .map(([category, amount]) => {
      const lastMonth = lastMonthCategoryTotals.get(category) || 0;
      const change = lastMonth > 0 ? ((amount - lastMonth) / lastMonth) * 100 : 0;
      return {
        category,
        label: CATEGORY_LABELS[category] || category.replace(/_/g, " "),
        color: CATEGORY_COLORS[category] || CATEGORY_COLORS.OTHER,
        amount,
        lastMonth,
        change,
        percent: thisMonthTotal > 0 ? (amount / thisMonthTotal) * 100 : 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  // Group recurring by merchant
  const recurringGroups = new Map<string, { name: string; amount: number; count: number }>();
  for (const txn of recurringTxns) {
    const key = txn.merchantName?.toLowerCase() || txn.name.toLowerCase();
    const existing = recurringGroups.get(key);
    if (existing) {
      existing.count++;
      // Use the most recent amount
      existing.amount = txn.amount;
    } else {
      recurringGroups.set(key, {
        name: txn.merchantName || txn.name,
        amount: txn.amount,
        count: 1,
      });
    }
  }

  const recurringList = Array.from(recurringGroups.values())
    .filter((r) => r.count >= 2) // At least 2 occurrences
    .sort((a, b) => b.amount - a.amount);

  const recurringTotal = recurringList.reduce((sum, r) => sum + r.amount, 0);

  const hasTransactions = thisMonthTxns.length > 0 || lastMonthTxns.length > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Spending</h2>
          <p className="text-muted text-sm mt-1">
            Track where your money goes
          </p>
        </div>
        <SyncTransactionsButton />
      </div>

      {!hasTransactions ? (
        <div className="bg-card border border-card-border rounded-xl p-8 text-center">
          <p className="text-muted text-sm">
            No transactions yet. Connect a bank account and sync transactions to see your spending.
          </p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border border-card-border rounded-xl p-5">
              <p className="text-sm text-muted font-medium">This Month</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(thisMonthTotal)}</p>
              <p className="text-xs text-muted mt-1">{format(now, "MMMM yyyy")}</p>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-5">
              <p className="text-sm text-muted font-medium">vs Last Month</p>
              <p className={`text-2xl font-bold mt-1 ${monthChange > 0 ? "text-danger" : "text-success"}`}>
                {monthChange > 0 ? "+" : ""}{monthChange.toFixed(1)}%
              </p>
              <p className="text-xs text-muted mt-1">
                {formatCurrency(lastMonthTotal)} in {format(subMonths(now, 1), "MMMM")}
              </p>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-5">
              <p className="text-sm text-muted font-medium">Recurring Charges</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(recurringTotal)}</p>
              <p className="text-xs text-muted mt-1">{recurringList.length} {recurringList.length === 1 ? "subscription" : "subscriptions"} detected</p>
            </div>
          </div>

          {/* Category breakdown */}
          <div className="bg-card border border-card-border rounded-xl p-6">
            <h3 className="text-sm font-medium text-muted mb-4">
              Spending by Category - {format(now, "MMMM yyyy")}
            </h3>
            <SpendingChart data={categoryData} total={thisMonthTotal} />
          </div>

          {/* Category details with month-over-month */}
          <div className="bg-card border border-card-border rounded-xl p-6">
            <h3 className="text-sm font-medium text-muted mb-4">Category Details</h3>
            <div className="space-y-3">
              {categoryData.map((cat) => (
                <div key={cat.category}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-medium">{cat.label}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-xs ${cat.change > 10 ? "text-danger" : cat.change < -10 ? "text-success" : "text-muted"}`}>
                        {cat.lastMonth > 0 && (
                          <>
                            {cat.change > 0 ? "↑" : cat.change < 0 ? "↓" : ""}
                            {Math.abs(cat.change).toFixed(0)}% vs last month
                          </>
                        )}
                      </span>
                      <span className="font-semibold w-24 text-right">
                        {formatCurrency(cat.amount)}
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

          {/* Recurring charges */}
          <RecurringCharges charges={recurringList} />
        </>
      )}
    </div>
  );
}
