import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";

export type PageQualityRow = {
  competitor_id: string;
  page_id: string;
  result_quality: string;
  page_type: string | null;
};

function scoreFromQuality(q: string): number {
  if (q === "full") return 1;
  if (q === "partial") return 0.5;
  return 0;
}

/**
 * Average quality score (0–100) for an array of per-page quality rows.
 * Each row represents the most-recent scan result for one page.
 */
export function calcHealthScore(rows: PageQualityRow[]): number {
  if (rows.length === 0) return 0;
  const sum = rows.reduce((acc, r) => acc + scoreFromQuality(r.result_quality), 0);
  return Math.round((sum / rows.length) * 100);
}

/**
 * Returns the most-recent resultQuality per (competitor, page) pair for the
 * given competitor IDs. Uses DISTINCT ON so only one row per page is returned,
 * regardless of how many times that page has been scanned.
 *
 * Only page-level logs (page_id IS NOT NULL) are included — brief/profile
 * generation logs are competitor-level and excluded from extraction health.
 * Demo logs are excluded.
 */
export async function latestQualityPerPage(competitorIds: string[]): Promise<PageQualityRow[]> {
  if (competitorIds.length === 0) return [];

  return prisma.$queryRaw<PageQualityRow[]>(Prisma.sql`
    SELECT DISTINCT ON (l.competitor_id, l.page_id)
      l.competitor_id::text,
      l.page_id::text,
      l.result_quality,
      p.type AS page_type
    FROM api_logs l
    LEFT JOIN competitor_pages p ON p.id = l.page_id
    WHERE l.competitor_id = ANY(${competitorIds}::uuid[])
      AND l.page_id IS NOT NULL
      AND l.result_quality IS NOT NULL
      AND l.is_demo = FALSE
    ORDER BY l.competitor_id, l.page_id, l.called_at DESC
  `);
}

/**
 * Returns a Map of competitorId → health score (0–100) for each given ID.
 * Competitors with no scanned pages get 0.
 */
export async function competitorHealthScores(competitorIds: string[]): Promise<Map<string, number>> {
  const rows = await latestQualityPerPage(competitorIds);

  const byCompetitor = new Map<string, PageQualityRow[]>();
  for (const row of rows) {
    const list = byCompetitor.get(row.competitor_id) ?? [];
    list.push(row);
    byCompetitor.set(row.competitor_id, list);
  }

  return new Map(competitorIds.map((id) => [id, calcHealthScore(byCompetitor.get(id) ?? [])]));
}
