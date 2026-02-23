import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createAccountSchema } from "@/lib/validation";

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
    const parsed = createAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { name, institution, type } = parsed.data;

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
