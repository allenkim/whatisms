import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const holdings = await prisma.holding.findMany({
    include: { account: true },
    orderBy: { value: "desc" },
  });
  return NextResponse.json(holdings);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const holding = await prisma.holding.create({
    data: {
      accountId: body.accountId,
      name: body.name,
      ticker: body.ticker || null,
      category: body.category,
      quantity: body.quantity,
      price: body.price,
      value: body.quantity * body.price,
    },
  });
  return NextResponse.json(holding, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const holding = await prisma.holding.update({
    where: { id: body.id },
    data: {
      name: body.name,
      ticker: body.ticker || null,
      category: body.category,
      quantity: body.quantity,
      price: body.price,
      value: body.quantity * body.price,
    },
  });
  return NextResponse.json(holding);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  await prisma.holding.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
