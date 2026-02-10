import { NextRequest, NextResponse } from "next/server";
import { plaidClient, mapPlaidTypeToCategory } from "@/lib/plaid";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { plaidItemId } = await request.json();

    // Get all PlaidItems to sync (or just one if specified)
    const plaidItems = plaidItemId
      ? await prisma.plaidItem.findMany({ where: { id: plaidItemId } })
      : await prisma.plaidItem.findMany();

    if (plaidItems.length === 0) {
      return NextResponse.json({ error: "No Plaid connections found" }, { status: 404 });
    }

    const results = [];

    for (const item of plaidItems) {
      try {
        // Fetch holdings from Plaid
        const holdingsResponse = await plaidClient.investmentsHoldingsGet({
          access_token: item.accessToken,
        });

        const { accounts, holdings, securities } = holdingsResponse.data;

        // Create a map of security_id to security info
        const securityMap = new Map(
          securities.map((s) => [s.security_id, s])
        );

        // Get our accounts linked to this PlaidItem
        const ourAccounts = await prisma.account.findMany({
          where: { plaidItemId: item.id },
        });

        const accountMap = new Map(
          ourAccounts.map((a) => [a.plaidAccountId, a])
        );

        // Process each holding
        for (const holding of holdings) {
          const security = securityMap.get(holding.security_id);
          const account = accountMap.get(holding.account_id);

          if (!account) continue;

          const holdingData = {
            name: security?.name || "Unknown Security",
            ticker: security?.ticker_symbol || null,
            category: mapPlaidTypeToCategory(security?.type || null, null),
            quantity: holding.quantity,
            price: holding.institution_price,
            value: holding.institution_value,
            plaidSecurityId: holding.security_id,
          };

          // Upsert the holding (update if exists by plaidSecurityId, create if not)
          const existingHolding = await prisma.holding.findFirst({
            where: {
              accountId: account.id,
              plaidSecurityId: holding.security_id,
            },
          });

          if (existingHolding) {
            await prisma.holding.update({
              where: { id: existingHolding.id },
              data: holdingData,
            });
          } else {
            await prisma.holding.create({
              data: {
                accountId: account.id,
                ...holdingData,
              },
            });
          }
        }

        // Also sync cash balances from accounts
        for (const plaidAccount of accounts) {
          const account = accountMap.get(plaidAccount.account_id);
          if (!account) continue;

          // Check if there's a cash balance
          const cashBalance = plaidAccount.balances.available || plaidAccount.balances.current;
          if (cashBalance && cashBalance > 0) {
            const existingCash = await prisma.holding.findFirst({
              where: {
                accountId: account.id,
                category: "CASH",
                plaidSecurityId: null,
              },
            });

            const cashData = {
              name: "Cash",
              ticker: null,
              category: "CASH",
              quantity: 1,
              price: cashBalance,
              value: cashBalance,
              plaidSecurityId: null,
            };

            if (existingCash) {
              await prisma.holding.update({
                where: { id: existingCash.id },
                data: cashData,
              });
            } else {
              await prisma.holding.create({
                data: {
                  accountId: account.id,
                  ...cashData,
                },
              });
            }
          }
        }

        // Update lastSynced timestamp
        await prisma.plaidItem.update({
          where: { id: item.id },
          data: { lastSynced: new Date() },
        });

        results.push({
          itemId: item.id,
          institution: item.institution,
          success: true,
          holdingsCount: holdings.length,
        });
      } catch (itemError) {
        console.error(`Error syncing item ${item.id}:`, itemError);
        results.push({
          itemId: item.id,
          institution: item.institution,
          success: false,
          error: "Failed to sync",
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Error syncing holdings:", error);
    return NextResponse.json(
      { error: "Failed to sync holdings" },
      { status: 500 }
    );
  }
}
