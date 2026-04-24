import { prisma } from "../db.js";

const MAX_LIMIT = 200;

export async function listRecentIntel(params: {
  since?: string;
  until?: string;
  competitor?: string;
  page_type?: string;
  limit?: number;
}) {
  const since = params.since ? new Date(params.since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const until = params.until ? new Date(params.until) : new Date();
  const limit = Math.min(params.limit ?? 50, MAX_LIMIT);

  const competitorFilter = params.competitor
    ? { page: { competitor: { slug: params.competitor } } }
    : { page: { competitor: { isSelf: false } } };

  const scans = await prisma.scan.findMany({
    where: {
      hasChanges: true,
      scannedAt: { gte: since, lte: until },
      ...(params.page_type ? { page: { ...competitorFilter.page, type: params.page_type } } : competitorFilter)
    },
    include: {
      page: {
        include: { competitor: { select: { name: true, slug: true } } }
      }
    },
    orderBy: { scannedAt: "desc" },
    take: limit + 1
  });

  const hasMore = scans.length > limit;
  const entries = scans.slice(0, limit);

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
