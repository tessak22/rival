import { IntelFeed } from "@/components/dashboard/IntelFeed";
import { ThreatMatrix } from "@/components/dashboard/ThreatMatrix";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

async function loadDashboardData() {
  const competitors = await prisma.competitor.findMany({
    orderBy: { name: "asc" }
  });
  const competitorIds = competitors.map((competitor) => competitor.id);

  const [recentScans, recentLogs] = await Promise.all([
    prisma.scan.findMany({
      where: { page: { competitorId: { in: competitorIds } } },
      select: {
        hasChanges: true,
        scannedAt: true,
        page: { select: { competitorId: true } }
      },
      orderBy: { scannedAt: "desc" },
      take: 5000
    }),
    prisma.apiLog.findMany({
      where: {
        competitorId: { in: competitorIds },
        resultQuality: { not: null }
      },
      select: {
        competitorId: true,
        resultQuality: true
      },
      orderBy: { calledAt: "desc" },
      take: 5000
    })
  ]);

  const latestScanByCompetitor = new Map<string, Date>();
  const changedScansByCompetitor = new Map<string, number>();
  for (const scan of recentScans) {
    const competitorId = scan.page.competitorId;
    if (!latestScanByCompetitor.has(competitorId)) {
      latestScanByCompetitor.set(competitorId, scan.scannedAt);
    }
    if (scan.hasChanges) {
      changedScansByCompetitor.set(competitorId, (changedScansByCompetitor.get(competitorId) ?? 0) + 1);
    }
  }

  const schemaScores = new Map<string, number[]>();
  for (const log of recentLogs) {
    if (!log.competitorId || !log.resultQuality) continue;
    const score = log.resultQuality === "full" ? 1 : log.resultQuality === "partial" ? 0.5 : 0;
    schemaScores.set(log.competitorId, [...(schemaScores.get(log.competitorId) ?? []), score]);
  }

  const matrix = competitors.map((competitor) => {
    const scores = schemaScores.get(competitor.id) ?? [];
    const schemaHealth = scores.length === 0 ? 0 : scores.reduce((acc, value) => acc + value, 0) / scores.length;
    return {
      id: competitor.id,
      slug: competitor.slug,
      name: competitor.name,
      threatLevel: competitor.threatLevel,
      schemaHealth,
      hasRecentChanges: (changedScansByCompetitor.get(competitor.id) ?? 0) > 0,
      lastScanAt: latestScanByCompetitor.get(competitor.id) ?? null
    };
  });

  const feed = await prisma.scan.findMany({
    where: { hasChanges: true },
    include: {
      page: true
    },
    orderBy: { scannedAt: "desc" },
    take: 25
  });
  const competitorNames = new Map(competitors.map((competitor) => [competitor.id, competitor.name]));

  return {
    matrix,
    feed: feed.map((item) => ({
      id: item.id,
      competitorName: competitorNames.get(item.page.competitorId) ?? "Unknown competitor",
      pageLabel: item.page.label,
      scannedAt: item.scannedAt,
      diffSummary: item.diffSummary,
      pageType: item.page.type
    }))
  };
}

export default async function HomePage() {
  // TODO(auth): protect dashboard routes before exposing a public deployment.
  const data = await loadDashboardData();

  return (
    <main className="dashboard-page">
      <header className="page-header">
        <h1>Rival Command</h1>
        <p>Threat posture, schema quality, and fresh competitor movement.</p>
      </header>

      <ThreatMatrix competitors={data.matrix} />
      <IntelFeed items={data.feed} />
    </main>
  );
}
