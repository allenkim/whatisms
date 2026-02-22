import { Snaptrade } from "snaptrade-typescript-sdk";

const globalForSnapTrade = globalThis as unknown as {
  snaptradeClient: Snaptrade | undefined;
};

function createSnapTradeClient() {
  return new Snaptrade({
    clientId: process.env.SNAPTRADE_CLIENT_ID!,
    consumerKey: process.env.SNAPTRADE_CONSUMER_KEY!,
  });
}

export const snaptradeClient =
  globalForSnapTrade.snaptradeClient ?? createSnapTradeClient();

if (process.env.NODE_ENV !== "production")
  globalForSnapTrade.snaptradeClient = snaptradeClient;

// Single-user app: use a fixed userId for SnapTrade
export const SNAPTRADE_USER_ID = "personal-finance-user";

// Map SnapTrade security type code to our holding categories
// See SecurityType.code values: cs, et, bnd, oef, crypto, pm, etc.
export function mapSnapTradeCategory(
  typeCode: string | null | undefined,
  cashEquivalent: boolean | null | undefined
): string {
  if (cashEquivalent) return "CASH";
  if (!typeCode) return "OTHER";

  switch (typeCode) {
    case "cs":
    case "ps":
    case "ad":
      return "STOCK";
    case "et":
      return "ETF";
    case "bnd":
      return "BOND";
    case "oef":
    case "cef":
      return "MUTUAL_FUND";
    case "crypto":
      return "CRYPTO";
    default:
      return "OTHER";
  }
}
