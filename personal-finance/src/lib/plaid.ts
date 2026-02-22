import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV as keyof typeof PlaidEnvironments] || PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);

// Map Plaid security types to our asset categories
export function mapPlaidTypeToCategory(type: string | null, subtype: string | null): string {
  if (!type) return "OTHER";

  const t = type.toLowerCase();
  const st = subtype?.toLowerCase() || "";

  if (t === "cash" || st === "money market" || st === "cd") return "CASH";
  if (t === "fixed income" || st === "bond") return "BOND";
  if (t === "mutual fund") return "MUTUAL_FUND";
  if (t === "etf") return "ETF";
  if (t === "cryptocurrency") return "CRYPTO";
  if (t === "equity" || t === "stock") return "STOCK";
  if (t === "derivative") return "OTHER";

  return "OTHER";
}

// Map Plaid account types to our account types
export function mapPlaidAccountType(type: string | null, subtype: string | null): string {
  if (!type) return "OTHER";

  const t = type.toLowerCase();
  const st = subtype?.toLowerCase() || "";

  if (t === "investment" || t === "brokerage") return "BROKERAGE";
  if (t === "depository" || st === "checking" || st === "savings") return "BANK";

  return "OTHER";
}
