import { prisma } from "../db.js";

function computeHealthScore(logs: Array<{ resultQuality: string | null }>): number {
  if (logs.length === 0) return 0;
  const score = logs.reduce((sum, l) => {
    return sum + (l.resultQuality === "full" ? 1 : l.resultQuality === "partial" ? 0.5 : 0);
  }, 0);
  return Math.round((score / logs.length) * 100);
}

export async function getCompetitor(slug: string) {
  const competitor = await prisma.competitor.findUnique({
    where: { slug },
    include: {
      pages: {
        include: {
          scans: {
            orderBy: { scannedAt: "desc" },
            take: 1,
            select: { scannedAt: true, hasChanges: true, diffSummary: true }
          }
        }
      },
      apiLogs: {
        where: { isDemo: false },
        orderBy: { calledAt: "desc" },
        take: 50,
        select: { resultQuality: true }
      }
    }
  });

  if (!competitor || competitor.isSelf) {
    return { error: "competitor_not_found", slug };
  }

  const manual = (competitor.manualData ?? {}) as Record<string, unknown>;

  return {
    name: competitor.name,
    slug: competitor.slug,
    base_url: competitor.baseUrl,
    threat_tier: competitor.threatLevel?.toLowerCase() ?? "unknown",
    health_score: computeHealthScore(competitor.apiLogs),
    manual_data: {
      founded: manual.founded ?? null,
      employee_count: manual.employee_count ?? manual.employees ?? null,
      total_funding: manual.total_funding ?? null,
      last_round: manual.last_round ?? null,
      monthly_traffic: manual.monthly_traffic ?? null,
      traffic_growth_qoq: manual.traffic_growth_qoq ?? null,
      domain_authority: manual.domain_authority ?? null,
      g2_rating: manual.g2_rating ?? null,
      g2_review_count: manual.g2_review_count ?? null,
      capterra_rating: manual.capterra_rating ?? null,
      capterra_review_count: manual.capterra_review_count ?? null,
      praise_themes: manual.praise_themes ?? [],
      complaint_themes: manual.complaint_themes ?? [],
      dev_pain_points: manual.dev_pain_points ?? []
    },
    tracked_pages: competitor.pages.map((p) => {
      const latestScan = p.scans[0] ?? null;
      const latestChange = p.scans.find((s) => s.hasChanges) ?? null;
      return {
        page_type: p.type,
        label: p.label,
        url: p.url,
        geo_target: p.geoTarget ?? null,
        last_checked_at: latestScan?.scannedAt.toISOString() ?? null,
        last_changed_at: latestChange?.scannedAt.toISOString() ?? null,
        latest_summary: latestChange?.diffSummary ?? null
      };
    })
  };
}
