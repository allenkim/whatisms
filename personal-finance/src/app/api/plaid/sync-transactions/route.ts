import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { RemovedTransaction, Transaction } from "plaid";
import { plaidSyncTransactionsSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = plaidSyncTransactionsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { plaidItemId } = parsed.data;

    // Get all PlaidItems to sync (or just one if specified)
    const plaidItems = plaidItemId
      ? await prisma.plaidItem.findMany({ where: { id: plaidItemId } })
      : await prisma.plaidItem.findMany();

    if (plaidItems.length === 0) {
      return NextResponse.json({ error: "No Plaid connections found" }, { status: 404 });
    }

    const results = [];

    for (const item of plaidItems) {
      try {
        // Get our accounts linked to this PlaidItem
        const ourAccounts = await prisma.account.findMany({
          where: { plaidItemId: item.id },
        });

        const accountMap = new Map(
          ourAccounts.map((a) => [a.plaidAccountId, a])
        );

        let cursor = item.transactionsCursor || undefined;
        let hasMore = true;
        let addedCount = 0;
        let modifiedCount = 0;
        let removedCount = 0;

        // Paginate through all transactions
        while (hasMore) {
          const response = await plaidClient.transactionsSync({
            access_token: decrypt(item.accessToken),
            cursor,
            count: 500,
          });

          const { added, modified, removed, next_cursor, has_more } = response.data;

          // Process added transactions
          for (const txn of added) {
            const account = accountMap.get(txn.account_id);
            if (!account) continue;

            await upsertTransaction(account.id, txn);
            addedCount++;
          }

          // Process modified transactions
          for (const txn of modified) {
            const account = accountMap.get(txn.account_id);
            if (!account) continue;

            await upsertTransaction(account.id, txn);
            modifiedCount++;
          }

          // Process removed transactions
          for (const removed_txn of removed) {
            await removeTransaction(removed_txn);
            removedCount++;
          }

          cursor = next_cursor;
          hasMore = has_more;
        }

        // Update cursor and last sync time
        await prisma.plaidItem.update({
          where: { id: item.id },
          data: {
            transactionsCursor: cursor,
            lastTransactionSync: new Date(),
          },
        });

        // Detect recurring transactions
        await detectRecurringTransactions(item.id);

        results.push({
          itemId: item.id,
          institution: item.institution,
          success: true,
          added: addedCount,
          modified: modifiedCount,
          removed: removedCount,
        });
      } catch (itemError) {
        console.error(`Error syncing transactions for item ${item.id}:`, itemError);
        results.push({
          itemId: item.id,
          institution: item.institution,
          success: false,
          error: "Failed to sync transactions",
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Error syncing transactions:", error);
    return NextResponse.json(
      { error: "Failed to sync transactions" },
      { status: 500 }
    );
  }
}

async function upsertTransaction(accountId: string, txn: Transaction) {
  const category = txn.personal_finance_category?.primary ||
    txn.category?.[0] ||
    "OTHER";

  const subcategory = txn.personal_finance_category?.detailed ||
    txn.category?.[1] ||
    null;

  const data = {
    accountId,
    name: txn.name,
    merchantName: txn.merchant_name || null,
    amount: txn.amount, // Positive = money out (spending), negative = money in
    category,
    subcategory,
    date: new Date(txn.date),
    pending: txn.pending,
  };

  await prisma.transaction.upsert({
    where: { plaidTransactionId: txn.transaction_id },
    update: data,
    create: {
      plaidTransactionId: txn.transaction_id,
      ...data,
    },
  });
}

async function removeTransaction(removed: RemovedTransaction) {
  if (removed.transaction_id) {
    await prisma.transaction.deleteMany({
      where: { plaidTransactionId: removed.transaction_id },
    });
  }
}

async function detectRecurringTransactions(plaidItemId: string) {
  // Get all accounts for this item
  const accounts = await prisma.account.findMany({
    where: { plaidItemId },
    select: { id: true },
  });

  const accountIds = accounts.map((a) => a.id);

  // Get transactions from the last 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const transactions = await prisma.transaction.findMany({
    where: {
      accountId: { in: accountIds },
      date: { gte: ninetyDaysAgo },
      amount: { gt: 0 }, // Only look at spending
    },
    orderBy: { date: "asc" },
  });

  // Group by merchant name and look for patterns
  const merchantGroups = new Map<string, typeof transactions>();

  for (const txn of transactions) {
    const key = txn.merchantName?.toLowerCase() || txn.name.toLowerCase();
    const group = merchantGroups.get(key) || [];
    group.push(txn);
    merchantGroups.set(key, group);
  }

  // Detect recurring: 3+ transactions with similar amounts and regular intervals
  const recurringIds: string[] = [];

  for (const [, group] of merchantGroups) {
    if (group.length < 3) continue;

    // Check if amounts are similar (within 10%)
    const amounts = group.map((t) => t.amount);
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const amountsSimilar = amounts.every(
      (a) => Math.abs(a - avgAmount) / avgAmount < 0.1
    );

    if (!amountsSimilar) continue;

    // Check for regular intervals (weekly, monthly, etc.)
    const dates = group.map((t) => t.date.getTime()).sort((a, b) => a - b);
    const intervals: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24)); // Days
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

    // Check if intervals are consistent (within 5 days of average)
    const intervalsConsistent = intervals.every(
      (i) => Math.abs(i - avgInterval) < 5
    );

    // If intervals are consistent and between 7 and 35 days, mark as recurring
    if (intervalsConsistent && avgInterval >= 7 && avgInterval <= 35) {
      recurringIds.push(...group.map((t) => t.id));
    }
  }

  // Update recurring flag
  if (recurringIds.length > 0) {
    await prisma.transaction.updateMany({
      where: { id: { in: recurringIds } },
      data: { isRecurring: true },
    });
  }

  // Reset non-recurring
  await prisma.transaction.updateMany({
    where: {
      accountId: { in: accountIds },
      id: { notIn: recurringIds },
    },
    data: { isRecurring: false },
  });
}
