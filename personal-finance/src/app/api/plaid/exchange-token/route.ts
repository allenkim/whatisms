import { NextRequest, NextResponse } from "next/server";
import { plaidClient, mapPlaidAccountType } from "@/lib/plaid";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { publicToken, institutionName } = await request.json();

    if (!publicToken) {
      return NextResponse.json(
        { error: "publicToken is required" },
        { status: 400 }
      );
    }

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const { access_token, item_id } = exchangeResponse.data;

    // Get account info from Plaid
    const accountsResponse = await plaidClient.accountsGet({
      access_token,
    });

    // Store the PlaidItem
    const plaidItem = await prisma.plaidItem.create({
      data: {
        itemId: item_id,
        accessToken: access_token,
        institution: institutionName || "Unknown Institution",
      },
    });

    // Create accounts for each Plaid account and store initial balances
    const createdAccounts = [];
    for (const plaidAccount of accountsResponse.data.accounts) {
      const accountType = mapPlaidAccountType(plaidAccount.type, plaidAccount.subtype);
      const account = await prisma.account.create({
        data: {
          name: plaidAccount.name,
          institution: institutionName || "Unknown Institution",
          type: accountType,
          plaidItemId: plaidItem.id,
          plaidAccountId: plaidAccount.account_id,
        },
      });

      // Store initial balance as a Cash holding for bank accounts
      if (accountType === "BANK") {
        const balance = plaidAccount.balances.current ?? plaidAccount.balances.available ?? 0;
        if (balance > 0) {
          await prisma.holding.create({
            data: {
              accountId: account.id,
              name: "Cash",
              ticker: null,
              category: "CASH",
              quantity: 1,
              price: balance,
              value: balance,
              plaidSecurityId: null,
            },
          });
        }
      }

      createdAccounts.push(account);
    }

    return NextResponse.json({
      success: true,
      plaidItemId: plaidItem.id,
      accounts: createdAccounts,
    });
  } catch (error) {
    console.error("Error exchanging token:", error);
    return NextResponse.json(
      { error: "Failed to connect account" },
      { status: 500 }
    );
  }
}
