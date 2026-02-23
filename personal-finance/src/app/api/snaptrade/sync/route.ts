import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { snaptradeClient, mapSnapTradeCategory } from "@/lib/snaptrade";
import { decrypt } from "@/lib/crypto";
import { snapTradeSyncSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = snapTradeSyncSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { snapTradeConnectionId } = parsed.data;

    // Get all SnapTradeConnections to sync (or just one if specified)
    const connections = snapTradeConnectionId
      ? await prisma.snapTradeConnection.findMany({
          where: { id: snapTradeConnectionId },
        })
      : await prisma.snapTradeConnection.findMany();

    if (connections.length === 0) {
      return NextResponse.json(
        { error: "No SnapTrade connections found" },
        { status: 404 }
      );
    }

    const results = [];

    for (const connection of connections) {
      try {
        const { userId } = connection;
        const userSecret = decrypt(connection.userSecret);

        // Get our accounts linked to this connection
        const ourAccounts = await prisma.account.findMany({
          where: { snapTradeConnectionId: connection.id },
        });

        const accountMap = new Map(
          ourAccounts.map((a) => [a.snapTradeAccountId, a])
        );

        let holdingsCount = 0;

        // Fetch holdings for each account
        for (const [snapTradeAccountId, account] of accountMap) {
          if (!snapTradeAccountId) continue;

          try {
            const holdingsResponse =
              await snaptradeClient.accountInformation.getUserHoldings({
                accountId: snapTradeAccountId,
                userId,
                userSecret,
              });

            const { positions, balances } = holdingsResponse.data;

            // Process positions (holdings)
            if (positions) {
              for (const position of positions) {
                const universalSymbol = position.symbol?.symbol;
                const symbolId =
                  universalSymbol?.id || position.symbol?.id || null;
                const ticker = universalSymbol?.symbol || null;
                const name =
                  universalSymbol?.description ||
                  universalSymbol?.symbol ||
                  "Unknown Security";
                const quantity = position.units ?? 0;
                const price = position.price ?? 0;
                const value = quantity * price;
                const category = mapSnapTradeCategory(
                  universalSymbol?.type?.code,
                  position.cash_equivalent
                );

                const holdingData = {
                  name,
                  ticker,
                  category,
                  quantity,
                  price,
                  value,
                  snapTradeSymbolId: symbolId,
                };

                // Upsert: match by snapTradeSymbolId within this account
                const existingHolding = symbolId
                  ? await prisma.holding.findFirst({
                      where: {
                        accountId: account.id,
                        snapTradeSymbolId: symbolId,
                      },
                    })
                  : null;

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

                holdingsCount++;
              }
            }

            // Process cash balances
            if (balances) {
              for (const balance of balances) {
                const cashAmount = balance.cash ?? 0;
                if (cashAmount <= 0) continue;

                const currencyCode =
                  balance.currency?.code || "USD";
                const cashName = `Cash (${currencyCode})`;

                const existingCash = await prisma.holding.findFirst({
                  where: {
                    accountId: account.id,
                    category: "CASH",
                    snapTradeSymbolId: null,
                    plaidSecurityId: null,
                  },
                });

                const cashData = {
                  name: cashName,
                  ticker: null,
                  category: "CASH",
                  quantity: 1,
                  price: cashAmount,
                  value: cashAmount,
                  snapTradeSymbolId: null,
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
          } catch (accountError) {
            console.error(
              `Error syncing SnapTrade account ${snapTradeAccountId}:`,
              accountError
            );
          }
        }

        // Update lastSynced timestamp
        await prisma.snapTradeConnection.update({
          where: { id: connection.id },
          data: { lastSynced: new Date() },
        });

        results.push({
          connectionId: connection.id,
          institution: connection.institution,
          success: true,
          holdingsCount,
        });
      } catch (connectionError) {
        console.error(
          `Error syncing SnapTrade connection ${connection.id}:`,
          connectionError
        );
        results.push({
          connectionId: connection.id,
          institution: connection.institution,
          success: false,
          error: "Failed to sync",
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Error syncing SnapTrade holdings:", error);
    return NextResponse.json(
      { error: "Failed to sync holdings" },
      { status: 500 }
    );
  }
}
