import { IntelFeed } from "@/components/dashboard/IntelFeed";
import { ThreatMatrix } from "@/components/dashboard/ThreatMatrix";
import { prisma } from "@/lib/db/client";

async function loadDashboardData() {
  const competitors = await prisma.competitor.findMany({
    orderBy: { name: "asc" }
  });

  const matrix = await Promise.all(
    competitors.map(async (competitor) => {
      const [lastScan, changeCount, logs] = await Promise.all([
        prisma.scan.findFirst({
          where: { page: { competitorId: competitor.id } },
          orderBy: { scannedAt: "desc" },
          select: { scannedAt: true }
        }),
        prisma.scan.count({
          where: {
            page: { competitorId: competitor.id },
            hasChanges: true
          }
        }),
        prisma.apiLog.findMany({
          where: { competitorId: competitor.id, resultQuality: { not: null } },
          select: { resultQuality: true },
          take: 200
        })
      ]);

      const scored: number[] = logs.map((log) =>
        log.resultQuality === "full" ? 1 : log.resultQuality === "partial" ? 0.5 : 0
      );
      const schemaHealth = scored.length === 0 ? 0 : scored.reduce((acc, value) => acc + value, 0) / scored.length;

      return {
        id: competitor.id,
        slug: competitor.slug,
        name: competitor.name,
        threatLevel: competitor.threatLevel,
        schemaHealth,
        hasRecentChanges: changeCount > 0,
        lastScanAt: lastScan?.scannedAt ?? null
      };
    })
  );

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
      diffSummary: item.diffSummary
    }))
  };
}

export default async function HomePage() {
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
