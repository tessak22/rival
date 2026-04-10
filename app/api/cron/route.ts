import { NextResponse, type NextRequest } from "next/server";

import { generateCompetitorBrief } from "@/lib/brief";
import { prisma } from "@/lib/db/client";
import { scanPage } from "@/lib/scanner";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[api/cron] CRON_SECRET is not configured.");
    return false;
  }
  const headerSecret = request.headers.get("x-cron-secret");
  const bearer = request.headers.get("authorization");
  return headerSecret === secret || bearer === `Bearer ${secret}`;
}

const DEFAULT_CONCURRENCY = 3;

async function processCompetitor(
  competitor: {
    id: string;
    pages: Array<{
      id: string;
      label: string;
      url: string;
      type: string;
      geoTarget: string | null;
    }>;
  },
  briefNocache: boolean
) {
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
      item.errors.push(`page ${page.id}: ${error instanceof Error ? error.message : "scan failed"}`);
    }
  }

  try {
    await generateCompetitorBrief(competitor.id, briefNocache);
    item.briefGenerated = true;
  } catch (error) {
    item.errors.push(`brief: ${error instanceof Error ? error.message : "brief failed"}`);
  }

  return item;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const competitors = await prisma.competitor.findMany({
    include: { pages: true }
  });

  const briefNocache = process.env.CRON_BRIEF_NOCACHE === "true";
  const concurrency = Number(process.env.CRON_CONCURRENCY ?? DEFAULT_CONCURRENCY);
  const safeConcurrency = Number.isFinite(concurrency) ? Math.max(1, Math.min(10, concurrency)) : DEFAULT_CONCURRENCY;

  const summary: Awaited<ReturnType<typeof processCompetitor>>[] = [];
  for (let index = 0; index < competitors.length; index += safeConcurrency) {
    const chunk = competitors.slice(index, index + safeConcurrency);
    const results = await Promise.all(chunk.map((competitor) => processCompetitor(competitor, briefNocache)));
    summary.push(...results);
  }

  return NextResponse.json({
    competitors: competitors.length,
    summary
  });
}
