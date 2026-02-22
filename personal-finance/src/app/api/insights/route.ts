import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { startOfMonth, subMonths, format } from "date-fns";

// GET all insights
export async function GET() {
  try {
    const insights = await prisma.insight.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json(insights);
  } catch (error) {
    console.error("Error fetching insights:", error);
    return NextResponse.json(
      { error: "Failed to fetch insights" },
      { status: 500 }
    );
  }
}

// POST generate new insights (analyze spending patterns)
export async function POST() {
  try {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const twoMonthsAgoStart = startOfMonth(subMonths(now, 2));

    // Get this month's spending by category
    const thisMonthSpending = await prisma.transaction.groupBy({
      by: ["category"],
      where: {
        date: { gte: thisMonthStart },
        amount: { gt: 0 },
        pending: false,
      },
      _sum: { amount: true },
    });

    // Get last month's spending by category
    const lastMonthSpending = await prisma.transaction.groupBy({
      by: ["category"],
      where: {
        date: { gte: lastMonthStart, lt: thisMonthStart },
        amount: { gt: 0 },
        pending: false,
      },
      _sum: { amount: true },
    });

    // Get two months ago spending for trend analysis
    const twoMonthsAgoSpending = await prisma.transaction.groupBy({
      by: ["category"],
      where: {
        date: { gte: twoMonthsAgoStart, lt: lastMonthStart },
        amount: { gt: 0 },
        pending: false,
      },
      _sum: { amount: true },
    });

    const lastMonthMap = new Map(
      lastMonthSpending.map((s) => [s.category, s._sum.amount || 0])
    );
    const twoMonthsMap = new Map(
      twoMonthsAgoSpending.map((s) => [s.category, s._sum.amount || 0])
    );

    const newInsights: {
      type: string;
      title: string;
      message: string;
      severity: string;
      data?: string;
    }[] = [];

    // Check budget goals
    const budgets = await prisma.budgetGoal.findMany();
    const thisMonthMap = new Map(
      thisMonthSpending.map((s) => [s.category, s._sum.amount || 0])
    );

    for (const budget of budgets) {
      const spent = thisMonthMap.get(budget.category) || 0;
      const percentUsed = (spent / budget.limit) * 100;

      if (percentUsed >= 100) {
        newInsights.push({
          type: "BUDGET_ALERT",
          title: `Budget Exceeded: ${budget.category.replace(/_/g, " ")}`,
          message: `You've spent $${spent.toFixed(2)} of your $${budget.limit.toFixed(2)} budget (${percentUsed.toFixed(0)}%).`,
          severity: "ALERT",
          data: JSON.stringify({ category: budget.category, spent, limit: budget.limit }),
        });
      } else if (percentUsed >= 80) {
        newInsights.push({
          type: "BUDGET_ALERT",
          title: `Budget Warning: ${budget.category.replace(/_/g, " ")}`,
          message: `You've used ${percentUsed.toFixed(0)}% of your ${budget.category.replace(/_/g, " ")} budget.`,
          severity: "WARNING",
          data: JSON.stringify({ category: budget.category, spent, limit: budget.limit }),
        });
      }
    }

    // Check for spending anomalies (50%+ increase from last month)
    for (const cat of thisMonthSpending) {
      const thisMonth = cat._sum.amount || 0;
      const lastMonth = lastMonthMap.get(cat.category) || 0;

      if (lastMonth > 0 && thisMonth > lastMonth * 1.5) {
        const increase = ((thisMonth - lastMonth) / lastMonth) * 100;
        newInsights.push({
          type: "SPENDING_ANOMALY",
          title: `Spending Spike: ${cat.category.replace(/_/g, " ")}`,
          message: `Your ${cat.category.replace(/_/g, " ")} spending is up ${increase.toFixed(0)}% compared to last month ($${thisMonth.toFixed(2)} vs $${lastMonth.toFixed(2)}).`,
          severity: "WARNING",
          data: JSON.stringify({ category: cat.category, thisMonth, lastMonth }),
        });
      }
    }

    // Check for consistent overspending trends (increasing 2+ months)
    for (const cat of thisMonthSpending) {
      const thisMonth = cat._sum.amount || 0;
      const lastMonth = lastMonthMap.get(cat.category) || 0;
      const twoMonths = twoMonthsMap.get(cat.category) || 0;

      if (twoMonths > 0 && lastMonth > twoMonths && thisMonth > lastMonth) {
        newInsights.push({
          type: "SPENDING_ANOMALY",
          title: `Rising Trend: ${cat.category.replace(/_/g, " ")}`,
          message: `${cat.category.replace(/_/g, " ")} spending has increased for 3 consecutive months.`,
          severity: "INFO",
          data: JSON.stringify({ category: cat.category, trend: [twoMonths, lastMonth, thisMonth] }),
        });
      }
    }

    // Generate weekly summary
    const totalThisMonth = thisMonthSpending.reduce(
      (sum, cat) => sum + (cat._sum.amount || 0),
      0
    );
    const totalLastMonth = lastMonthSpending.reduce(
      (sum, cat) => sum + (cat._sum.amount || 0),
      0
    );
    const monthlyChange = totalLastMonth > 0
      ? ((totalThisMonth - totalLastMonth) / totalLastMonth) * 100
      : 0;

    const topCategory = thisMonthSpending.sort(
      (a, b) => (b._sum.amount || 0) - (a._sum.amount || 0)
    )[0];

    if (totalThisMonth > 0) {
      newInsights.push({
        type: "WEEKLY_SUMMARY",
        title: `${format(now, "MMMM")} Spending Summary`,
        message: `You've spent $${totalThisMonth.toFixed(2)} this month${monthlyChange !== 0 ? ` (${monthlyChange > 0 ? "+" : ""}${monthlyChange.toFixed(0)}% vs last month)` : ""}. Top category: ${topCategory?.category.replace(/_/g, " ") || "N/A"}.`,
        severity: "INFO",
        data: JSON.stringify({ total: totalThisMonth, change: monthlyChange, topCategory: topCategory?.category }),
      });
    }

    // Save new insights (avoid duplicates by checking recent ones)
    const recentInsights = await prisma.insight.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
      },
    });

    const recentTitles = new Set(recentInsights.map((i) => i.title));
    const uniqueInsights = newInsights.filter((i) => !recentTitles.has(i.title));

    if (uniqueInsights.length > 0) {
      await prisma.insight.createMany({
        data: uniqueInsights,
      });
    }

    return NextResponse.json({
      generated: uniqueInsights.length,
      insights: uniqueInsights,
    });
  } catch (error) {
    console.error("Error generating insights:", error);
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 500 }
    );
  }
}

// PUT mark insight as read
export async function PUT(request: NextRequest) {
  try {
    const { id, isRead } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const insight = await prisma.insight.update({
      where: { id },
      data: { isRead: isRead ?? true },
    });

    return NextResponse.json(insight);
  } catch (error) {
    console.error("Error updating insight:", error);
    return NextResponse.json(
      { error: "Failed to update insight" },
      { status: 500 }
    );
  }
}
