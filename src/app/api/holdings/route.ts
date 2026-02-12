import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ASSET_CATEGORIES } from "@/lib/categories";

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

    const { accountId, name, category, quantity, price } = body;
    if (!accountId || !name || !category || quantity == null || price == null) {
      return NextResponse.json(
        { error: "accountId, name, category, quantity, and price are required" },
        { status: 400 }
      );
    }
    if (!ASSET_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${ASSET_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof quantity !== "number" || typeof price !== "number") {
      return NextResponse.json(
        { error: "quantity and price must be numbers" },
        { status: 400 }
      );
    }

    const holding = await prisma.holding.create({
      data: {
        accountId,
        name,
        ticker: body.ticker || null,
        category,
        quantity,
        price,
        value: quantity * price,
      },
    });

    // Create initial cost basis entry if costBasisPrice is provided
    if (body.costBasisPrice !== undefined && body.costBasisPrice !== null) {
      await prisma.costBasis.create({
        data: {
          holdingId: holding.id,
          purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : new Date(),
          purchasePrice: body.costBasisPrice,
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

    const { id, name, category, quantity, price } = body;
    if (!id || !name || !category || quantity == null || price == null) {
      return NextResponse.json(
        { error: "id, name, category, quantity, and price are required" },
        { status: 400 }
      );
    }
    if (!ASSET_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${ASSET_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    const holding = await prisma.holding.update({
      where: { id },
      data: {
        name,
        ticker: body.ticker || null,
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
