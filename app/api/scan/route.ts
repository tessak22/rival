import { NextResponse, type NextRequest } from "next/server";

import { generateCompetitorBrief } from "@/lib/brief";
import { prisma } from "@/lib/db/client";
import { scanPage } from "@/lib/scanner";

type ScanRequest = {
  competitorId?: string;
  pageId?: string;
  runBrief?: boolean;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ScanRequest;

  if (!body.competitorId && !body.pageId) {
    return NextResponse.json({ error: "competitorId or pageId is required" }, { status: 400 });
  }

  if (body.pageId) {
    const page = await prisma.competitorPage.findUnique({
      where: { id: body.pageId }
    });
    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    const result = await scanPage({
      competitorId: page.competitorId,
      pageId: page.id,
      label: page.label,
      url: page.url,
      type: page.type,
      geoTarget: page.geoTarget
    });

    return NextResponse.json({ results: [result] });
  }

  const competitor = await prisma.competitor.findUnique({
    where: { id: body.competitorId },
    include: { pages: true }
  });

  if (!competitor) {
    return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
  }

  const results = [];
  for (const page of competitor.pages) {
    const result = await scanPage({
      competitorId: competitor.id,
      pageId: page.id,
      label: page.label,
      url: page.url,
      type: page.type,
      geoTarget: page.geoTarget
    });
    results.push(result);
  }

  if (body.runBrief ?? true) {
    await generateCompetitorBrief(competitor.id, true);
  }

  return NextResponse.json({ results });
}
