import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createHoldingSchema, updateHoldingSchema } from "@/lib/validation";

export async function GET() {
  const holdings = await prisma.holding.findMany({
    include: {
      account: true,
      costBasis: true,
    },
    orderBy: { value: "desc" },
  });

  // Calculate gains/losses for each holding
  const holdingsWithPerformance = holdings.map((holding) => {
    const totalCostBasis = holding.costBasis.reduce(
      (sum, cb) => sum + cb.purchasePrice * cb.quantity,
      0
    );
    const totalCostQuantity = holding.costBasis.reduce(
      (sum, cb) => sum + cb.quantity,
      0
    );
    const avgCostPerUnit = totalCostQuantity > 0
      ? totalCostBasis / totalCostQuantity
      : 0;

    const gainLoss = holding.value - totalCostBasis;
    const gainLossPercent = totalCostBasis > 0
      ? ((holding.value - totalCostBasis) / totalCostBasis) * 100
      : 0;

    return {
      ...holding,
      totalCostBasis,
      avgCostPerUnit,
      gainLoss,
      gainLossPercent,
    };
  });

  return NextResponse.json(holdingsWithPerformance);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createHoldingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { accountId, name, category, quantity, price, ticker, costBasisPrice, purchaseDate } = parsed.data;

    const holding = await prisma.holding.create({
      data: {
        accountId,
        name,
        ticker: ticker || null,
        category,
        quantity,
        price,
        value: quantity * price,
      },
    });

    // Create initial cost basis entry if costBasisPrice is provided
    if (costBasisPrice !== undefined && costBasisPrice !== null) {
      await prisma.costBasis.create({
        data: {
          holdingId: holding.id,
          purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
          purchasePrice: costBasisPrice,
          quantity,
        },
      });
    }

    return NextResponse.json(holding, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create holding" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = updateHoldingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { id, name, category, quantity, price, ticker } = parsed.data;

    const holding = await prisma.holding.update({
      where: { id },
      data: {
        name,
        ticker: ticker || null,
        category,
        quantity,
        price,
        value: quantity * price,
      },
    });
    return NextResponse.json(holding);
  } catch {
    return NextResponse.json({ error: "Failed to update holding" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    await prisma.holding.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Holding not found" }, { status: 404 });
  }
}
