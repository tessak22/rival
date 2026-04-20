/**
 * Bootstrap a first scan cycle for any competitor with zero scans.
 *
 * Why this exists: rivals.config.json + scripts/seed.ts create the Competitor
 * and CompetitorPage rows, but scans only run on the weekday cron. A freshly
 * added competitor therefore has no data on the dashboard until the next cron
 * tick — up to ~24 hours. Rival exists to showcase Tabstack, so a new
 * competitor should come online immediately.
 *
 * What it does:
 * - Lists every Competitor.
 * - Skips any competitor that already has at least one Scan row.
 * - For the rest, scans each CompetitorPage sequentially and then generates
 *   the intelligence brief.
 *
 * Design notes:
 * - Idempotent: re-running it is a no-op when every competitor has scans.
 * - Sequential per-page + sequential per-competitor to stay polite to the
 *   Tabstack API and keep output readable in build logs.
 * - Non-fatal: individual scan or brief errors are logged but do not abort
 *   the loop. The script exits 0 even when some pages fail, so wiring it
 *   into a production build (see netlify.toml) never blocks a deploy.
 *
 * Usage:
 *   npm run bootstrap-new
 *
 * Runs automatically as part of the Netlify production build, after seed.
 */

import { generateCompetitorBrief } from "@/lib/brief";
import { prisma } from "@/lib/db/client";
import { scanPage } from "@/lib/scanner";

async function bootstrapCompetitor(competitor: {
  id: string;
  slug: string;
  name: string;
  pages: Array<{ id: string; label: string; url: string; type: string; geoTarget: string | null }>;
}) {
  console.log(`\n[bootstrap] ${competitor.slug}: scanning ${competitor.pages.length} page(s)...`);
  let scanErrors = 0;

  for (const page of competitor.pages) {
    try {
      const result = await scanPage({
        competitorId: competitor.id,
        pageId: page.id,
        label: page.label,
        url: page.url,
        type: page.type,
        geoTarget: page.geoTarget
      });
      console.log(`  ✓ ${page.type.padEnd(10)} ${page.label.padEnd(20)} endpoint=${result.endpointUsed}`);
    } catch (error) {
      scanErrors += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  ✗ ${page.type.padEnd(10)} ${page.label.padEnd(20)} ${message}`);
    }
  }

  // Only attempt a brief if at least one scan landed — generateCompetitorBrief
  // throws when there are no recent scans for the competitor, which would be
  // noisy in build logs.
  const scanCount = await prisma.scan.count({ where: { page: { competitorId: competitor.id } } });
  if (scanCount === 0) {
    console.warn(`[bootstrap] ${competitor.slug}: no scans landed, skipping brief generation.`);
    return;
  }

  console.log(`[bootstrap] ${competitor.slug}: generating brief...`);
  try {
    const payload = await generateCompetitorBrief(competitor.id, true);
    const threat = (payload as { threat_level?: string })?.threat_level ?? "—";
    console.log(`[bootstrap] ${competitor.slug}: brief generated (threat=${threat}, scan errors=${scanErrors}).`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[bootstrap] ${competitor.slug}: brief failed: ${message}`);
  }
}

async function main() {
  const competitors = await prisma.competitor.findMany({
    include: { pages: true },
    orderBy: { slug: "asc" }
  });

  if (competitors.length === 0) {
    console.log("[bootstrap] No competitors in DB. Run `npm run db:seed` first.");
    return;
  }

  // Fetch the set of competitorIds that already have scans. Faster than
  // per-competitor checks, and cheaper than a join.
  const scanned = await prisma.scan.findMany({
    distinct: ["pageId"],
    select: { page: { select: { competitorId: true } } }
  });
  const scannedCompetitorIds = new Set(scanned.map((s) => s.page.competitorId));

  const toBootstrap = competitors.filter((c) => !scannedCompetitorIds.has(c.id));

  if (toBootstrap.length === 0) {
    console.log(`[bootstrap] All ${competitors.length} competitor(s) already have scans. Nothing to do.`);
    return;
  }

  console.log(
    `[bootstrap] Found ${toBootstrap.length} unscanned competitor(s): ${toBootstrap.map((c) => c.slug).join(", ")}`
  );

  for (const competitor of toBootstrap) {
    // Re-check immediately before bootstrapping. The snapshot above can go
    // stale if a concurrent cron run or a parallel deploy writes the first
    // scan between now and this loop iteration — without this check, two
    // near-simultaneous production builds could both bootstrap the same
    // competitor and double-write scans + briefs. This shrinks the race
    // window from "seconds" to "the gap between the count and the first
    // scanPage call." It is not atomic; for a true lock a DB-level
    // bootstrap-runs table or advisory lock would be needed.
    const freshScanCount = await prisma.scan.count({
      where: { page: { competitorId: competitor.id } }
    });
    if (freshScanCount > 0) {
      console.log(`[bootstrap] ${competitor.slug}: scans now exist (likely concurrent run), skipping.`);
      continue;
    }
    await bootstrapCompetitor(competitor);
  }

  console.log(`\n[bootstrap] Done.`);
}

main()
  .catch((error) => {
    // Non-fatal by design: log and exit 0 so a bootstrap hiccup never blocks
    // a production deploy. Errors surface in the Netlify build log.
    console.error("[bootstrap] unexpected error:", error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
