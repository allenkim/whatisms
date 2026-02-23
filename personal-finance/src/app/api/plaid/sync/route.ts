import { NextRequest, NextResponse } from "next/server";
import { plaidClient, mapPlaidTypeToCategory } from "@/lib/plaid";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { plaidSyncSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = plaidSyncSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { plaidItemId } = parsed.data;

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
        // Get our accounts linked to this PlaidItem
        const ourAccounts = await prisma.account.findMany({
          where: { plaidItemId: item.id },
        });

        const accountMap = new Map(
          ourAccounts.map((a) => [a.plaidAccountId, a])
        );

        let holdingsCount = 0;

        // Try to fetch investment holdings (will fail for bank-only accounts)
        try {
          const holdingsResponse = await plaidClient.investmentsHoldingsGet({
            access_token: decrypt(item.accessToken),
          });

          const { accounts, holdings, securities } = holdingsResponse.data;

          // Create a map of security_id to security info
          const securityMap = new Map(
            securities.map((s) => [s.security_id, s])
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

          // Sync cash balances from investment accounts
          for (const plaidAccount of accounts) {
            const account = accountMap.get(plaidAccount.account_id);
            if (!account) continue;

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

          holdingsCount = holdings.length;
        } catch {
          // investmentsHoldingsGet fails for non-investment accounts — that's expected
        }

        // Fetch balances for all accounts (works for bank accounts too)
        const accountsResponse = await plaidClient.accountsGet({
          access_token: decrypt(item.accessToken),
        });

        for (const plaidAccount of accountsResponse.data.accounts) {
          const account = accountMap.get(plaidAccount.account_id);
          if (!account || account.type !== "BANK") continue;

          const balance = plaidAccount.balances.current ?? plaidAccount.balances.available ?? 0;
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
            price: balance,
            value: balance,
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

        // Update lastSynced timestamp
        await prisma.plaidItem.update({
          where: { id: item.id },
          data: { lastSynced: new Date() },
        });

        results.push({
          itemId: item.id,
          institution: item.institution,
          success: true,
          holdingsCount,
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
