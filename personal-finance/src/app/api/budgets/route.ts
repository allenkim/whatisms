import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createBudgetSchema } from "@/lib/validation";

// GET all budget goals with current spending
export async function GET() {
  try {
    const budgets = await prisma.budgetGoal.findMany({
      orderBy: { category: "asc" },
    });

    // Get current month spending per category
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const spending = await prisma.transaction.groupBy({
      by: ["category"],
      where: {
        date: { gte: monthStart },
        amount: { gt: 0 },
        pending: false,
      },
      _sum: { amount: true },
    });

    const spendingMap = new Map(
      spending.map((s) => [s.category, s._sum.amount || 0])
    );

    const budgetsWithSpending = budgets.map((budget) => ({
      ...budget,
      spent: spendingMap.get(budget.category) || 0,
      remaining: budget.limit - (spendingMap.get(budget.category) || 0),
      percentUsed:
        ((spendingMap.get(budget.category) || 0) / budget.limit) * 100,
    }));

    return NextResponse.json(budgetsWithSpending);
  } catch (error) {
    console.error("Error fetching budgets:", error);
    return NextResponse.json(
      { error: "Failed to fetch budgets" },
      { status: 500 }
    );
  }
}

// POST create or update a budget goal
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createBudgetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { category, limit } = parsed.data;

    const budget = await prisma.budgetGoal.upsert({
      where: { category },
      update: { limit },
      create: { category, limit },
    });

    return NextResponse.json(budget);
  } catch (error) {
    console.error("Error creating budget:", error);
    return NextResponse.json(
      { error: "Failed to create budget" },
      { status: 500 }
    );
  }
}

// DELETE a budget goal
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await prisma.budgetGoal.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting budget:", error);
    return NextResponse.json(
      { error: "Failed to delete budget" },
      { status: 500 }
    );
  }
}
