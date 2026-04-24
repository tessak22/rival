import { prisma } from "../db.js";

const TRUNCATE_AT = 8000;

function truncate(s: string | null): { content: string | null; truncated: boolean } {
  if (!s) return { content: null, truncated: false };
  if (s.length <= TRUNCATE_AT) return { content: s, truncated: false };
  return { content: s.slice(0, TRUNCATE_AT) + "...[truncated]", truncated: true };
}

function rawToText(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  return JSON.stringify(v, null, 2);
}

export async function getCompetitorDiff(competitor: string, pageType: string, at?: string) {
  const comp = await prisma.competitor.findUnique({
    where: { slug: competitor },
    select: { id: true, name: true, isSelf: true }
  });

  if (!comp || comp.isSelf) return { error: "competitor_not_found", competitor };

  const page = await prisma.competitorPage.findFirst({
    where: { competitorId: comp.id, type: pageType }
  });

  if (!page) return { error: "page_type_not_tracked", competitor, page_type: pageType };

  const atFilter = at ? { scannedAt: { lte: new Date(at) } } : {};

  const scan = await prisma.scan.findFirst({
    where: { pageId: page.id, hasChanges: true, ...atFilter },
    orderBy: { scannedAt: "desc" }
  });

  if (!scan) return { error: "no_diff_available", competitor, page_type: pageType };

  // Get the previous scan to form the "before" content
  const prevScan = await prisma.scan.findFirst({
    where: { pageId: page.id, scannedAt: { lt: scan.scannedAt } },
    orderBy: { scannedAt: "desc" }
  });

  const afterText = rawToText(scan.rawResult) ?? scan.markdownResult;
  const beforeText = rawToText(prevScan?.rawResult) ?? prevScan?.markdownResult ?? null;

  const afterTrunc = truncate(afterText ?? null);
  const beforeTrunc = truncate(beforeText);

  return {
    competitor: comp.name,
    page_type: pageType,
    detected_at: scan.scannedAt.toISOString(),
    source_url: page.url,
    before: beforeTrunc.content,
    after: afterTrunc.content,
    summary: scan.diffSummary ?? null,
    truncated: afterTrunc.truncated || beforeTrunc.truncated
  };
}
