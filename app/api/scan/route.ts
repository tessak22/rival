import { NextResponse, type NextRequest } from "next/server";

import { generateCompetitorBrief } from "@/lib/brief";
import { hasValidInternalApiKey } from "@/app/api/_lib/auth";
import { prisma } from "@/lib/db/client";
import { scanPage } from "@/lib/scanner";

type ScanRequest = {
  competitorId?: string;
  pageId?: string;
  runBrief?: boolean;
  briefNocache?: boolean;
};

export async function POST(request: NextRequest) {
  if (!hasValidInternalApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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

    const results = await Promise.all(
      competitor.pages.map((page) =>
        scanPage({
          competitorId: competitor.id,
          pageId: page.id,
          label: page.label,
          url: page.url,
          type: page.type,
          geoTarget: page.geoTarget
        })
      )
    );

    if (body.runBrief === true) {
      try {
        await generateCompetitorBrief(competitor.id, body.briefNocache ?? false);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Brief generation failed";
        return NextResponse.json({ results, briefError: message }, { status: 409 });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan request failed";
    const status = message.toLowerCase().includes("json") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
