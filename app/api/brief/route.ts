import { NextResponse, type NextRequest } from "next/server";

import { generateCompetitorBrief } from "@/lib/brief";

type BriefRequest = {
  competitorId?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as BriefRequest;

  if (!body.competitorId) {
    return NextResponse.json({ error: "competitorId is required" }, { status: 400 });
  }

  try {
    const brief = await generateCompetitorBrief(body.competitorId, true);
    return NextResponse.json({ brief });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate brief";
    const status = message === "Competitor not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
