import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { snaptradeClient, SNAPTRADE_USER_ID } from "@/lib/snaptrade";

export async function POST() {
  try {
    // Check if we already have a SnapTrade user registered (reuse credentials)
    const existingConnection = await prisma.snapTradeConnection.findFirst({
      select: { userId: true, userSecret: true },
    });

    let userId = existingConnection?.userId;
    let userSecret = existingConnection?.userSecret;

    if (!userId || !userSecret) {
      // Register a new SnapTrade user
      const registerResponse =
        await snaptradeClient.authentication.registerSnapTradeUser({
          userId: SNAPTRADE_USER_ID,
        });

      userId = registerResponse.data.userId ?? SNAPTRADE_USER_ID;
      userSecret = registerResponse.data.userSecret!;
    }

    // Generate a login link for the connection portal
    const loginResponse =
      await snaptradeClient.authentication.loginSnapTradeUser({
        userId,
        userSecret,
        connectionType: "read",
      });

    const redirectURI = (loginResponse.data as { redirectURI?: string })
      .redirectURI;

    if (!redirectURI) {
      return NextResponse.json(
        { error: "Failed to generate login link" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      loginLink: redirectURI,
      userId,
      userSecret,
    });
  } catch (error) {
    console.error("Error creating SnapTrade login link:", error);
    return NextResponse.json(
      { error: "Failed to create login link" },
      { status: 500 }
    );
  }
}
