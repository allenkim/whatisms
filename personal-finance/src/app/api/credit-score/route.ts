import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createCreditScoreSchema } from "@/lib/validation";

// GET credit score history
export async function GET() {
  try {
    const scores = await prisma.creditScore.findMany({
      orderBy: { createdAt: "desc" },
      take: 12, // Last 12 entries
    });

    const latest = scores[0] || null;
    const previous = scores[1] || null;
    const change = latest && previous ? latest.score - previous.score : 0;

    // Calculate credit rating
    let rating = "Unknown";
    if (latest) {
      if (latest.score >= 800) rating = "Exceptional";
      else if (latest.score >= 740) rating = "Very Good";
      else if (latest.score >= 670) rating = "Good";
      else if (latest.score >= 580) rating = "Fair";
      else rating = "Poor";
    }

    return NextResponse.json({
      current: latest,
      change,
      rating,
      history: scores.reverse(), // Oldest first for charting
    });
  } catch (error) {
    console.error("Error fetching credit scores:", error);
    return NextResponse.json(
      { error: "Failed to fetch credit scores" },
      { status: 500 }
    );
  }
}

// POST add a new credit score entry
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createCreditScoreSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { score, source } = parsed.data;

    const creditScore = await prisma.creditScore.create({
      data: {
        score,
        source: source || "manual",
      },
    });

    return NextResponse.json(creditScore);
  } catch (error) {
    console.error("Error creating credit score:", error);
    return NextResponse.json(
      { error: "Failed to create credit score" },
      { status: 500 }
    );
  }
}
