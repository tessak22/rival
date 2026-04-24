import { prisma } from "../db.js";

const MAX_LIMIT = 100;

export async function searchIntel(query: string, since?: string, limit = 25) {
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const safeLimit = Math.min(limit, MAX_LIMIT);

  const scans = await prisma.scan.findMany({
    where: {
      hasChanges: true,
      scannedAt: { gte: sinceDate },
      page: { competitor: { isSelf: false } },
      OR: [
        { diffSummary: { contains: query, mode: "insensitive" } },
        { summary: { contains: query, mode: "insensitive" } }
      ]
    },
    include: {
      page: {
        include: { competitor: { select: { name: true, slug: true } } }
      }
    },
    orderBy: { scannedAt: "desc" },
    take: safeLimit + 1
  });

  const hasMore = scans.length > safeLimit;
  const entries = scans.slice(0, safeLimit);

  return {
    entries: entries.map((s) => ({
      id: s.id,
      competitor: s.page.competitor.name,
      competitor_slug: s.page.competitor.slug,
      page_type: s.page.type,
      detected_at: s.scannedAt.toISOString(),
      summary: s.diffSummary ?? null,
      source_url: s.page.url
    })),
    total: entries.length,
    has_more: hasMore
  };
}
