import { prisma } from "@/lib/db";
import AccountCard from "@/components/AccountCard";
import HoldingsTable from "@/components/HoldingsTable";
import PlaidLinkButton from "@/components/PlaidLinkButton";
import SnapTradeLinkButton from "@/components/SnapTradeLinkButton";
import SyncButton from "@/components/SyncButton";
import AddAccountForm from "./AddAccountForm";
import AddHoldingForm from "./AddHoldingForm";
import DeleteButton from "./DeleteButton";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const accounts = await prisma.account.findMany({
    include: { holdings: true, plaidItem: true, snapTradeConnection: true },
    orderBy: { createdAt: "desc" },
  });

  const plaidItems = await prisma.plaidItem.findMany({
    orderBy: { createdAt: "desc" },
  });

  const snapTradeConnections = await prisma.snapTradeConnection.findMany({
    orderBy: { createdAt: "desc" },
  });

  const totalValue = accounts.reduce(
    (sum, a) => sum + a.holdings.reduce((s, h) => s + h.value, 0),
    0
  );

  const hasConnections = plaidItems.length > 0 || snapTradeConnections.length > 0;

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
          {hasConnections && <SyncButton />}
          <PlaidLinkButton />
          <SnapTradeLinkButton />
        </div>
      </div>

      {/* Connected institutions info */}
      {hasConnections && (
        <div className="bg-card border border-card-border rounded-xl p-4">
          <h3 className="text-sm font-medium mb-2">Connected Institutions</h3>
          <div className="flex flex-wrap gap-2">
            {plaidItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 px-3 py-1.5 bg-accent-light rounded-lg text-sm"
              >
                <span className="font-medium text-accent">{item.institution}</span>
                <span className="text-xs text-muted">(Plaid)</span>
                {item.lastSynced && (
                  <span className="text-xs text-muted">
                    synced {new Date(item.lastSynced).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
            {snapTradeConnections.map((conn) => (
              <div
                key={conn.id}
                className="flex items-center gap-2 px-3 py-1.5 bg-accent-light rounded-lg text-sm"
              >
                <span className="font-medium text-accent">{conn.institution}</span>
                <span className="text-xs text-muted">(SnapTrade)</span>
                {conn.lastSynced && (
                  <span className="text-xs text-muted">
                    synced {new Date(conn.lastSynced).toLocaleDateString()}
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
          + Add manual account (for accounts not supported by Plaid or SnapTrade)
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
            const isAutoSynced = !!account.plaidItemId || !!account.snapTradeConnectionId;

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
                    {isAutoSynced && (
                      <span className="text-xs px-2 py-1 rounded-full bg-success/10 text-success font-medium">
                        Auto-synced
                      </span>
                    )}
                  </div>
                  {!isAutoSynced && (
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
                    {account.plaidItem && (
                      <SyncButton
                        plaidItemId={account.plaidItem.id}
                        lastSynced={account.plaidItem.lastSynced}
                      />
                    )}
                    {account.snapTradeConnection && (
                      <SyncButton
                        snapTradeConnectionId={account.snapTradeConnection.id}
                        lastSynced={account.snapTradeConnection.lastSynced}
                      />
                    )}
                  </div>
                  <HoldingsTable
                    holdings={account.holdings}
                    totalValue={totalValue}
                  />
                  {!isAutoSynced && (
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
