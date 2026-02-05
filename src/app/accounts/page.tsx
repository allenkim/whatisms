import { prisma } from "@/lib/db";
import AccountCard from "@/components/AccountCard";
import HoldingsTable from "@/components/HoldingsTable";
import AddAccountForm from "./AddAccountForm";
import AddHoldingForm from "./AddHoldingForm";
import DeleteButton from "./DeleteButton";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const accounts = await prisma.account.findMany({
    include: { holdings: true },
    orderBy: { createdAt: "desc" },
  });

  const totalValue = accounts.reduce(
    (sum, a) => sum + a.holdings.reduce((s, h) => s + h.value, 0),
    0
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Accounts</h2>
          <p className="text-muted text-sm mt-1">
            Manage your accounts and holdings
          </p>
        </div>
      </div>

      <AddAccountForm />

      {accounts.length === 0 ? (
        <div className="bg-card border border-card-border rounded-xl p-8 text-center">
          <p className="text-muted text-sm">
            No accounts yet. Add your first account above.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {accounts.map((account) => {
            const accountValue = account.holdings.reduce(
              (sum, h) => sum + h.value,
              0
            );
            return (
              <div
                key={account.id}
                className="bg-card border border-card-border rounded-xl p-6 space-y-4"
              >
                <div className="flex items-start justify-between">
                  <AccountCard
                    id={account.id}
                    name={account.name}
                    institution={account.institution}
                    type={account.type}
                    totalValue={accountValue}
                    holdingCount={account.holdings.length}
                  />
                  <DeleteButton
                    id={account.id}
                    type="account"
                    name={account.name}
                  />
                </div>

                <div className="border-t border-card-border pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-muted">Holdings</h4>
                  </div>
                  <HoldingsTable
                    holdings={account.holdings}
                    totalValue={totalValue}
                  />
                  <div className="mt-4">
                    <AddHoldingForm accountId={account.id} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
