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

// Plaid spending categories
export const SPENDING_CATEGORY_COLORS: Record<string, string> = {
  FOOD_AND_DRINK: "#ef4444",
  TRANSPORTATION: "#f59e0b",
  SHOPPING: "#8b5cf6",
  ENTERTAINMENT: "#ec4899",
  TRAVEL: "#06b6d4",
  RENT_AND_UTILITIES: "#3b82f6",
  GENERAL_SERVICES: "#6366f1",
  PERSONAL_CARE: "#14b8a6",
  GENERAL_MERCHANDISE: "#f97316",
  HOME_IMPROVEMENT: "#84cc16",
  MEDICAL: "#22c55e",
  BANK_FEES: "#64748b",
  LOAN_PAYMENTS: "#475569",
  TRANSFER_OUT: "#94a3b8",
  OTHER: "#9ca3af",
};

export const SPENDING_CATEGORY_LABELS: Record<string, string> = {
  FOOD_AND_DRINK: "Food & Drink",
  TRANSPORTATION: "Transportation",
  SHOPPING: "Shopping",
  ENTERTAINMENT: "Entertainment",
  TRAVEL: "Travel",
  RENT_AND_UTILITIES: "Rent & Utilities",
  GENERAL_SERVICES: "Services",
  PERSONAL_CARE: "Personal Care",
  GENERAL_MERCHANDISE: "Merchandise",
  HOME_IMPROVEMENT: "Home",
  MEDICAL: "Medical",
  BANK_FEES: "Bank Fees",
  LOAN_PAYMENTS: "Loan Payments",
  TRANSFER_OUT: "Transfers",
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
