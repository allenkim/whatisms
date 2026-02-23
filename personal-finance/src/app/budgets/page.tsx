import { prisma } from "@/lib/db";
import { formatCurrency, SPENDING_CATEGORY_LABELS } from "@/lib/categories";
import AddBudgetForm from "./AddBudgetForm";
import DeleteBudgetButton from "./DeleteBudgetButton";
import { startOfMonth } from "date-fns";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const budgets = await prisma.budgetGoal.findMany({
    orderBy: { category: "asc" },
  });

  // Get current month spending per category
  const now = new Date();
  const monthStart = startOfMonth(now);

  const spending = await prisma.transaction.groupBy({
    by: ["category"],
    where: {
      date: { gte: monthStart },
      amount: { gt: 0 },
      pending: false,
    },
    _sum: { amount: true },
  });

  const spendingMap = new Map(
    spending.map((s) => [s.category, s._sum.amount || 0])
  );

  // Get all categories that have spending but no budget
  const unbugdetedCategories = spending
    .filter((s) => !budgets.find((b) => b.category === s.category))
    .map((s) => s.category);

  const budgetsWithSpending = budgets.map((budget) => {
    const spent = spendingMap.get(budget.category) || 0;
    return {
      ...budget,
      spent,
      remaining: budget.limit - spent,
      percentUsed: (spent / budget.limit) * 100,
    };
  });

  const totalBudget = budgets.reduce((sum, b) => sum + b.limit, 0);
  const totalSpent = budgetsWithSpending.reduce((sum, b) => sum + b.spent, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Budget Goals</h2>
          <p className="text-muted text-sm mt-1">
            Set monthly spending limits by category
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-5">
          <p className="text-sm text-muted font-medium">Total Budget</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalBudget)}</p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-5">
          <p className="text-sm text-muted font-medium">Total Spent</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalSpent)}</p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-5">
          <p className="text-sm text-muted font-medium">Remaining</p>
          <p className={`text-2xl font-bold mt-1 ${totalBudget - totalSpent < 0 ? "text-danger" : "text-success"}`}>
            {formatCurrency(totalBudget - totalSpent)}
          </p>
        </div>
      </div>

      {/* Add budget form */}
      <div className="bg-card border border-card-border rounded-xl p-6">
        <h3 className="text-sm font-medium text-muted mb-4">Add Budget Goal</h3>
        <AddBudgetForm existingCategories={budgets.map((b) => b.category)} />
      </div>

      {/* Budget list */}
      {budgetsWithSpending.length === 0 ? (
        <div className="bg-card border border-card-border rounded-xl p-8 text-center">
          <p className="text-muted text-sm">
            No budget goals yet. Add your first budget above.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-medium text-muted">Your Budgets</h3>
          {budgetsWithSpending.map((budget) => (
            <div key={budget.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">
                    {SPENDING_CATEGORY_LABELS[budget.category] || budget.category.replace(/_/g, " ")}
                  </span>
                  <span className="text-muted text-sm ml-2">
                    {formatCurrency(budget.spent)} / {formatCurrency(budget.limit)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-sm font-medium ${
                      budget.percentUsed >= 100
                        ? "text-danger"
                        : budget.percentUsed >= 80
                        ? "text-warning"
                        : "text-success"
                    }`}
                  >
                    {budget.percentUsed.toFixed(0)}%
                  </span>
                  <DeleteBudgetButton id={budget.id} category={budget.category} />
                </div>
              </div>
              <div className="w-full bg-card-border rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    budget.percentUsed >= 100
                      ? "bg-danger"
                      : budget.percentUsed >= 80
                      ? "bg-warning"
                      : "bg-success"
                  }`}
                  style={{ width: `${Math.min(100, budget.percentUsed)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Unbudgeted spending alert */}
      {unbugdetedCategories.length > 0 && (
        <div className="bg-card border border-warning/30 rounded-xl p-6">
          <h3 className="text-sm font-medium text-warning mb-2">
            Unbudgeted Spending Detected
          </h3>
          <p className="text-sm text-muted mb-3">
            You have spending in categories without budgets:
          </p>
          <div className="flex flex-wrap gap-2">
            {unbugdetedCategories.map((cat) => (
              <span
                key={cat}
                className="px-2 py-1 bg-warning/10 text-warning text-xs rounded"
              >
                {SPENDING_CATEGORY_LABELS[cat] || cat.replace(/_/g, " ")} ({formatCurrency(spendingMap.get(cat) || 0)})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
