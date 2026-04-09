import { NextResponse, type NextRequest } from "next/server";

import { generateCompetitorBrief } from "@/lib/brief";
import { prisma } from "@/lib/db/client";
import { scanPage } from "@/lib/scanner";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const headerSecret = request.headers.get("x-cron-secret");
  const bearer = request.headers.get("authorization");
  return headerSecret === secret || bearer === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const competitors = await prisma.competitor.findMany({
    include: { pages: true }
  });

  const summary: Array<{
    competitorId: string;
    pagesScanned: number;
    briefGenerated: boolean;
    errors: string[];
  }> = [];

  for (const competitor of competitors) {
    const item = {
      competitorId: competitor.id,
      pagesScanned: 0,
      briefGenerated: false,
      errors: [] as string[]
    };

    for (const page of competitor.pages) {
      try {
        await scanPage({
          competitorId: competitor.id,
          pageId: page.id,
          label: page.label,
          url: page.url,
          type: page.type,
          geoTarget: page.geoTarget
        });
        item.pagesScanned += 1;
      } catch (error) {
        item.errors.push(
          `page ${page.id}: ${error instanceof Error ? error.message : "scan failed"}`
        );
      }
    }

    try {
      await generateCompetitorBrief(competitor.id, true);
      item.briefGenerated = true;
    } catch (error) {
      item.errors.push(`brief: ${error instanceof Error ? error.message : "brief failed"}`);
    }

    summary.push(item);
  }

  return NextResponse.json({
    competitors: competitors.length,
    summary
  });
}
