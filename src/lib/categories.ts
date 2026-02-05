export const ASSET_CATEGORIES = [
  "STOCK",
  "BOND",
  "CASH",
  "CRYPTO",
  "REAL_ESTATE",
  "ETF",
  "MUTUAL_FUND",
  "OTHER",
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const ACCOUNT_TYPES = [
  "BANK",
  "BROKERAGE",
  "CRYPTO_EXCHANGE",
  "REAL_ESTATE",
  "OTHER",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const CATEGORY_COLORS: Record<string, string> = {
  STOCK: "#4f46e5",       // indigo
  BOND: "#0891b2",        // cyan
  CASH: "#16a34a",        // green
  CRYPTO: "#f59e0b",      // amber
  REAL_ESTATE: "#dc2626", // red
  ETF: "#7c3aed",         // violet
  MUTUAL_FUND: "#2563eb", // blue
  OTHER: "#6b7280",       // gray
};

export const CATEGORY_LABELS: Record<string, string> = {
  STOCK: "Stocks",
  BOND: "Bonds",
  CASH: "Cash",
  CRYPTO: "Crypto",
  REAL_ESTATE: "Real Estate",
  ETF: "ETFs",
  MUTUAL_FUND: "Mutual Funds",
  OTHER: "Other",
};

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCurrencyExact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
