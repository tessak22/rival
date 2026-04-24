import { prisma } from "../db.js";

export async function getCompetitorData(slug: string, pageType?: string) {
  const competitor = await prisma.competitor.findUnique({
    where: { slug },
    select: { id: true, name: true, isSelf: true }
  });

  if (!competitor || competitor.isSelf) {
    return { error: "competitor_not_found", slug };
  }

  const pages = await prisma.competitorPage.findMany({
    where: {
      competitorId: competitor.id,
      ...(pageType ? { type: pageType } : {})
    },
    include: {
      scans: {
        orderBy: { scannedAt: "desc" },
        take: 1,
        select: { scannedAt: true, endpointUsed: true, rawResult: true, markdownResult: true }
      }
    }
  });

  const pagesWithData = pages
    .filter((p) => p.scans.length > 0)
    .filter((p) => p.scans[0].rawResult !== null || p.scans[0].markdownResult !== null)
    .map((p) => {
      const scan = p.scans[0];
      const data: unknown =
        p.type === "changelog" && scan.markdownResult
          ? { content: scan.markdownResult }
          : scan.rawResult;

      return {
        page_type: p.type,
        label: p.label,
        url: p.url,
        scanned_at: scan.scannedAt.toISOString(),
        endpoint_used: scan.endpointUsed,
        data
      };
    });

  return {
    competitor: competitor.name,
    slug,
    pages: pagesWithData
  };
}
