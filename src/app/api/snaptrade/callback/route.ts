import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { snaptradeClient } from "@/lib/snaptrade";

export async function POST(request: NextRequest) {
  try {
    const { authorizationId, userId, userSecret } = await request.json();

    if (!authorizationId || !userId || !userSecret) {
      return NextResponse.json(
        { error: "authorizationId, userId, and userSecret are required" },
        { status: 400 }
      );
    }

    // Check if this authorization already exists
    const existing = await prisma.snapTradeConnection.findUnique({
      where: { authorizationId },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        snapTradeConnectionId: existing.id,
        message: "Connection already exists",
      });
    }

    // Get connection details to find institution name
    const connectionDetail =
      await snaptradeClient.connections.detailBrokerageAuthorization({
        authorizationId,
        userId,
        userSecret,
      });

    const institutionName =
      connectionDetail.data.brokerage?.name || "Unknown Institution";

    // Fetch accounts for this user
    const accountsResponse =
      await snaptradeClient.accountInformation.listUserAccounts({
        userId,
        userSecret,
      });

    // Filter accounts that belong to this authorization
    const connectionAccounts = accountsResponse.data.filter(
      (a) => a.brokerage_authorization === authorizationId
    );

    // Create the SnapTradeConnection record
    const snapTradeConnection = await prisma.snapTradeConnection.create({
      data: {
        userId,
        userSecret,
        authorizationId,
        institution: institutionName,
      },
    });

    // Create Account records for each SnapTrade account
    const createdAccounts = [];
    for (const stAccount of connectionAccounts) {
      const account = await prisma.account.create({
        data: {
          name: stAccount.name || stAccount.number || "Account",
          institution: institutionName,
          type: "BROKERAGE",
          snapTradeConnectionId: snapTradeConnection.id,
          snapTradeAccountId: stAccount.id,
        },
      });
      createdAccounts.push(account);
    }

    return NextResponse.json({
      success: true,
      snapTradeConnectionId: snapTradeConnection.id,
      accounts: createdAccounts,
    });
  } catch (error) {
    console.error("Error processing SnapTrade callback:", error);
    return NextResponse.json(
      { error: "Failed to process connection" },
      { status: 500 }
    );
  }
}
