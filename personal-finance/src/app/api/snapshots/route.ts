import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const snapshots = await prisma.snapshot.findMany({
    include: { holdings: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(snapshots);
}

export async function POST() {
  try {
    const holdings = await prisma.holding.findMany();
    const netWorth = holdings.reduce((sum, h) => sum + h.value, 0);

    const snapshot = await prisma.snapshot.create({
      data: {
        netWorth,
        holdings: {
          create: holdings.map((h) => ({
            name: h.name,
            category: h.category,
            value: h.value,
          })),
        },
      },
      include: { holdings: true },
    });

    return NextResponse.json(snapshot, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create snapshot" }, { status: 500 });
  }
}
