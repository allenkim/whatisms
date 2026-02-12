import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
    const { score, source } = await request.json();

    if (!score) {
      return NextResponse.json(
        { error: "score is required" },
        { status: 400 }
      );
    }

    if (score < 300 || score > 850) {
      return NextResponse.json(
        { error: "score must be between 300 and 850" },
        { status: 400 }
      );
    }

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
