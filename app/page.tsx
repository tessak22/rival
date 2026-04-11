import { IntelFeed } from "@/components/dashboard/IntelFeed";
import { ThreatMatrix } from "@/components/dashboard/ThreatMatrix";
import { prisma } from "@/lib/db/client";
import type { ReviewsData } from "@/lib/schemas/reviews";

export const dynamic = "force-dynamic";

/**
 * Compute reviews change events for a scan.
 *
 * Emits:
 * - rating_changed: overall_rating moved by more than 0.1
 * - complaint_theme_added: a new recurring complaint theme appeared (highest-signal)
 */
function computeReviewsEvents(
  current: ReviewsData,
  previous: ReviewsData | null
): Array<
  | { type: "rating_changed"; platform: string; fromRating: number; toRating: number }
  | { type: "complaint_theme_added"; platform: string; theme: string }
> {
  if (!previous) return [];

  const platform = current.platform ?? previous.platform ?? "review platform";
  const events: ReturnType<typeof computeReviewsEvents> = [];

  if (
    current.overall_rating != null &&
    previous.overall_rating != null &&
    Math.abs(current.overall_rating - previous.overall_rating) > 0.1
  ) {
    events.push({
      type: "rating_changed",
      platform,
      fromRating: previous.overall_rating,
      toRating: current.overall_rating
    });
  }

  const prevComplaintSet = new Set(previous.top_complaint_themes ?? []);
  for (const theme of current.top_complaint_themes ?? []) {
    if (!prevComplaintSet.has(theme)) {
      events.push({ type: "complaint_theme_added", platform, theme });
    }
  }

  return events;
}

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

  // Fetch changed scans for the Intel Feed, including rawResult for reviews diff events.
  const feed = await prisma.scan.findMany({
    where: { hasChanges: true },
    include: {
      page: true
    },
    orderBy: { scannedAt: "desc" },
    take: 25
  });
  const competitorNames = new Map(competitors.map((competitor) => [competitor.id, competitor.name]));

  // For reviews pages in the feed, fetch the previous scan to compute diff events.
  // Only load previous scans for reviews pages that have changes — keeps it targeted.
  const reviewsFeedScans = feed.filter((item) => item.page.type === "reviews");
  const previousReviewsScans = new Map<string, ReviewsData | null>();

  for (const scan of reviewsFeedScans) {
    const prev = await prisma.scan.findFirst({
      where: { pageId: scan.pageId, scannedAt: { lt: scan.scannedAt } },
      orderBy: { scannedAt: "desc" },
      select: { rawResult: true }
    });
    const prevData = prev?.rawResult && typeof prev.rawResult === "object" ? (prev.rawResult as ReviewsData) : null;
    previousReviewsScans.set(scan.id, prevData);
  }

  return {
    matrix,
    feed: feed.map((item) => {
      const isReviews = item.page.type === "reviews";
      const currentData =
        isReviews && item.rawResult && typeof item.rawResult === "object" ? (item.rawResult as ReviewsData) : null;
      const prevData = isReviews ? (previousReviewsScans.get(item.id) ?? null) : null;
      const reviewsEvents = currentData ? computeReviewsEvents(currentData, prevData) : [];

      return {
        id: item.id,
        competitorName: competitorNames.get(item.page.competitorId) ?? "Unknown competitor",
        pageLabel: item.page.label,
        scannedAt: item.scannedAt,
        diffSummary: item.diffSummary,
        reviewsEvents: reviewsEvents.length > 0 ? reviewsEvents : undefined
      };
    })
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
