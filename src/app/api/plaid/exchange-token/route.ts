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

    // Create accounts for each Plaid account
    const createdAccounts = [];
    for (const plaidAccount of accountsResponse.data.accounts) {
      const account = await prisma.account.create({
        data: {
          name: plaidAccount.name,
          institution: institutionName || "Unknown Institution",
          type: mapPlaidAccountType(plaidAccount.type, plaidAccount.subtype),
          plaidItemId: plaidItem.id,
          plaidAccountId: plaidAccount.account_id,
        },
      });
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
