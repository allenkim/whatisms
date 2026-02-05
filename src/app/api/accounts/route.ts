import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ACCOUNT_TYPES } from "@/lib/categories";

export async function GET() {
  const accounts = await prisma.account.findMany({
    include: { holdings: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(accounts);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { name, institution, type } = body;
    if (!name || !institution || !type) {
      return NextResponse.json(
        { error: "name, institution, and type are required" },
        { status: 400 }
      );
    }
    if (!ACCOUNT_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${ACCOUNT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const account = await prisma.account.create({
      data: { name, institution, type },
    });
    return NextResponse.json(account, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    await prisma.account.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
}
