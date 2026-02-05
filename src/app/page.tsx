import { prisma } from "@/lib/db";
import NetWorthCard from "@/components/NetWorthCard";
import AllocationChart from "@/components/AllocationChart";
import AccountCard from "@/components/AccountCard";
import { ASSET_CATEGORIES } from "@/lib/categories";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const accounts = await prisma.account.findMany({
    include: { holdings: true },
    orderBy: { createdAt: "desc" },
  });

  const allHoldings = accounts.flatMap((a) => a.holdings);
  const netWorth = allHoldings.reduce((sum, h) => sum + h.value, 0);

  const allocationData = ASSET_CATEGORIES.map((category) => ({
    category,
    value: allHoldings
      .filter((h) => h.category === category)
      .reduce((sum, h) => sum + h.value, 0),
  }));

  const accountSummaries = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    institution: account.institution,
    type: account.type,
    totalValue: account.holdings.reduce((sum, h) => sum + h.value, 0),
    holdingCount: account.holdings.length,
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-muted text-sm mt-1">Overview of your portfolio</p>
      </div>

      <NetWorthCard
        netWorth={netWorth}
        accountCount={accounts.length}
        holdingCount={allHoldings.length}
      />

      <AllocationChart data={allocationData} />

      {accountSummaries.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-muted mb-3">Accounts</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accountSummaries.map((account) => (
              <AccountCard key={account.id} {...account} />
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-xl p-8 text-center">
          <p className="text-muted text-sm">
            No accounts yet. Go to{" "}
            <a href="/accounts" className="text-accent hover:underline">
              Accounts
            </a>{" "}
            to add your first account.
          </p>
        </div>
      )}
    </div>
  );
}
