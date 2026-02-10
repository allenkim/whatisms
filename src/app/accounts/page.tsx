import { prisma } from "@/lib/db";
import AccountCard from "@/components/AccountCard";
import HoldingsTable from "@/components/HoldingsTable";
import PlaidLinkButton from "@/components/PlaidLinkButton";
import SyncButton from "@/components/SyncButton";
import AddAccountForm from "./AddAccountForm";
import AddHoldingForm from "./AddHoldingForm";
import DeleteButton from "./DeleteButton";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const accounts = await prisma.account.findMany({
    include: { holdings: true, plaidItem: true },
    orderBy: { createdAt: "desc" },
  });

  const plaidItems = await prisma.plaidItem.findMany({
    orderBy: { createdAt: "desc" },
  });

  const totalValue = accounts.reduce(
    (sum, a) => sum + a.holdings.reduce((s, h) => s + h.value, 0),
    0
  );

  const hasPlaidConnections = plaidItems.length > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Accounts</h2>
          <p className="text-muted text-sm mt-1">
            Manage your accounts and holdings
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasPlaidConnections && <SyncButton />}
          <PlaidLinkButton />
        </div>
      </div>

      {/* Plaid connections info */}
      {hasPlaidConnections && (
        <div className="bg-card border border-card-border rounded-xl p-4">
          <h3 className="text-sm font-medium mb-2">Connected Institutions</h3>
          <div className="flex flex-wrap gap-2">
            {plaidItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 px-3 py-1.5 bg-accent-light rounded-lg text-sm"
              >
                <span className="font-medium text-accent">{item.institution}</span>
                {item.lastSynced && (
                  <span className="text-xs text-muted">
                    (synced {new Date(item.lastSynced).toLocaleDateString()})
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual account form */}
      <details className="group">
        <summary className="cursor-pointer text-sm text-muted hover:text-foreground transition-colors">
          + Add manual account (for accounts not supported by Plaid)
        </summary>
        <div className="mt-3">
          <AddAccountForm />
        </div>
      </details>

      {accounts.length === 0 ? (
        <div className="bg-card border border-card-border rounded-xl p-8 text-center">
          <p className="text-muted text-sm">
            No accounts yet. Connect your bank or brokerage above to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {accounts.map((account) => {
            const accountValue = account.holdings.reduce(
              (sum, h) => sum + h.value,
              0
            );
            const isPlaidAccount = !!account.plaidItemId;

            return (
              <div
                key={account.id}
                className="bg-card border border-card-border rounded-xl p-6 space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <AccountCard
                      compact
                      name={account.name}
                      institution={account.institution}
                      type={account.type}
                      totalValue={accountValue}
                      holdingCount={account.holdings.length}
                    />
                    {isPlaidAccount && (
                      <span className="text-xs px-2 py-1 rounded-full bg-success/10 text-success font-medium">
                        Auto-synced
                      </span>
                    )}
                  </div>
                  {!isPlaidAccount && (
                    <DeleteButton
                      id={account.id}
                      type="account"
                      name={account.name}
                    />
                  )}
                </div>

                <div className="border-t border-card-border pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-muted">Holdings</h4>
                    {isPlaidAccount && account.plaidItem && (
                      <SyncButton
                        plaidItemId={account.plaidItem.id}
                        lastSynced={account.plaidItem.lastSynced}
                      />
                    )}
                  </div>
                  <HoldingsTable
                    holdings={account.holdings}
                    totalValue={totalValue}
                  />
                  {!isPlaidAccount && (
                    <div className="mt-4">
                      <AddHoldingForm accountId={account.id} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
