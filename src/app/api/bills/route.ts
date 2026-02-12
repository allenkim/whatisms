import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET all bills
export async function GET() {
  try {
    const bills = await prisma.bill.findMany({
      orderBy: { dueDay: "asc" },
    });

    // Calculate status for each bill
    const now = new Date();
    const currentDay = now.getDate();

    const billsWithStatus = bills.map((bill) => {
      let status: "paid" | "due_soon" | "overdue" | "upcoming" = "upcoming";

      if (bill.isPaid) {
        status = "paid";
      } else if (currentDay > bill.dueDay) {
        status = "overdue";
      } else if (bill.dueDay - currentDay <= 3) {
        status = "due_soon";
      }

      return { ...bill, status };
    });

    return NextResponse.json(billsWithStatus);
  } catch (error) {
    console.error("Error fetching bills:", error);
    return NextResponse.json(
      { error: "Failed to fetch bills" },
      { status: 500 }
    );
  }
}

// POST create a new bill
export async function POST(request: NextRequest) {
  try {
    const { name, amount, dueDay, category, isAutoPay, notes } =
      await request.json();

    if (!name || amount === undefined || !dueDay || !category) {
      return NextResponse.json(
        { error: "name, amount, dueDay, and category are required" },
        { status: 400 }
      );
    }

    const bill = await prisma.bill.create({
      data: {
        name,
        amount,
        dueDay: Math.min(31, Math.max(1, dueDay)),
        category,
        isAutoPay: isAutoPay || false,
        notes,
      },
    });

    return NextResponse.json(bill);
  } catch (error) {
    console.error("Error creating bill:", error);
    return NextResponse.json(
      { error: "Failed to create bill" },
      { status: 500 }
    );
  }
}

// PUT update a bill (mark as paid, update details)
export async function PUT(request: NextRequest) {
  try {
    const { id, ...data } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // If marking as paid, set paidDate
    if (data.isPaid === true && !data.paidDate) {
      data.paidDate = new Date();
    }

    const bill = await prisma.bill.update({
      where: { id },
      data,
    });

    return NextResponse.json(bill);
  } catch (error) {
    console.error("Error updating bill:", error);
    return NextResponse.json(
      { error: "Failed to update bill" },
      { status: 500 }
    );
  }
}

// DELETE a bill
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await prisma.bill.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting bill:", error);
    return NextResponse.json(
      { error: "Failed to delete bill" },
      { status: 500 }
    );
  }
}
