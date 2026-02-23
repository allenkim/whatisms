import { z } from "zod";
import { ACCOUNT_TYPES, ASSET_CATEGORIES } from "@/lib/categories";

// --- Budgets ---

export const createBudgetSchema = z.object({
  category: z.string().min(1),
  limit: z.number().positive(),
});

// --- Bills ---

export const createBillSchema = z.object({
  name: z.string().min(1),
  amount: z.number(),
  dueDay: z.number().int().min(1).max(31),
  category: z.string().min(1),
  isAutoPay: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

export const updateBillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  amount: z.number().optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  category: z.string().min(1).optional(),
  isAutoPay: z.boolean().optional(),
  isPaid: z.boolean().optional(),
  paidDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// --- Insights ---

export const updateInsightSchema = z.object({
  id: z.string().min(1),
  isRead: z.boolean().optional(),
});

// --- Accounts ---

export const createAccountSchema = z.object({
  name: z.string().min(1),
  institution: z.string().min(1),
  type: z.enum(ACCOUNT_TYPES),
});

// --- Credit Score ---

export const createCreditScoreSchema = z.object({
  score: z.number().int().min(300).max(850),
  source: z.string().optional(),
});

// --- Holdings ---

export const createHoldingSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(ASSET_CATEGORIES),
  quantity: z.number(),
  price: z.number(),
  ticker: z.string().optional().nullable(),
  costBasisPrice: z.number().optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
});

export const updateHoldingSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(ASSET_CATEGORIES),
  quantity: z.number(),
  price: z.number(),
  ticker: z.string().optional().nullable(),
});

// --- Plaid ---

export const exchangeTokenSchema = z.object({
  publicToken: z.string().min(1),
  institutionName: z.string().optional(),
});

export const plaidSyncTransactionsSchema = z.object({
  plaidItemId: z.string().optional(),
});

export const plaidSyncSchema = z.object({
  plaidItemId: z.string().optional(),
});

// --- SnapTrade ---

export const snapTradeCallbackSchema = z.object({
  authorizationId: z.string().min(1),
  userId: z.string().min(1),
  userSecret: z.string().min(1),
});

export const snapTradeSyncSchema = z.object({
  snapTradeConnectionId: z.string().optional(),
});
