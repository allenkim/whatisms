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
      // Register a new SnapTrade user (or re-register if already exists)
      try {
        const registerResponse =
          await snaptradeClient.authentication.registerSnapTradeUser({
            userId: SNAPTRADE_USER_ID,
          });

        userId = registerResponse.data.userId ?? SNAPTRADE_USER_ID;
        userSecret = registerResponse.data.userSecret!;
      } catch (regError: unknown) {
        // If user already exists (400), delete and re-register
        const status = (regError as { status?: number })?.status ??
          (regError as { response?: { status?: number } })?.response?.status;
        if (status === 400) {
          await snaptradeClient.authentication.deleteSnapTradeUser({
            userId: SNAPTRADE_USER_ID,
          });
          const registerResponse =
            await snaptradeClient.authentication.registerSnapTradeUser({
              userId: SNAPTRADE_USER_ID,
            });
          userId = registerResponse.data.userId ?? SNAPTRADE_USER_ID;
          userSecret = registerResponse.data.userSecret!;
        } else {
          throw regError;
        }
      }
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const detail = (error as { response?: { data?: unknown } })?.response?.data;
    console.error("Error creating SnapTrade login link:", message, detail ?? "");
    return NextResponse.json(
      { error: "Failed to create login link", detail: detail ?? message },
      { status: 500 }
    );
  }
}
