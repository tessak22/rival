import { generateCompetitorBrief } from "./brief";
import { prisma } from "./db/client";
import { scanPage } from "./scanner";

const DEFAULT_CONCURRENCY = 3;
const STALE_LOCK_AGE_MS = 60 * 60 * 1000; // 1 hour

type CompetitorWithPages = {
  id: string;
  pages: Array<{
    id: string;
    label: string;
    url: string;
    type: string;
    geoTarget: string | null;
  }>;
};

type CompetitorResult = {
  competitorId: string;
  pagesScanned: number;
  briefGenerated: boolean;
  errors: string[];
};

async function processCompetitor(competitor: CompetitorWithPages, briefNocache: boolean): Promise<CompetitorResult> {
  const item: CompetitorResult = {
    competitorId: competitor.id,
    pagesScanned: 0,
    briefGenerated: false,
    errors: []
  };

  for (const page of competitor.pages) {
    try {
      await scanPage({
        competitorId: competitor.id,
        pageId: page.id,
        label: page.label,
        url: page.url,
        type: page.type,
        geoTarget: page.geoTarget
      });
      item.pagesScanned += 1;
    } catch (error) {
      item.errors.push(`page ${page.id}: ${error instanceof Error ? error.message : "scan failed"}`);
    }
  }

  try {
    await generateCompetitorBrief(competitor.id, briefNocache);
    item.briefGenerated = true;
  } catch (error) {
    item.errors.push(`brief: ${error instanceof Error ? error.message : "brief failed"}`);
  }

  return item;
}

export interface ScanResult {
  competitors: number;
  staleLocksDeleted: number;
  summary: CompetitorResult[];
}

export async function runScans(): Promise<ScanResult> {
  const staleThreshold = new Date(Date.now() - STALE_LOCK_AGE_MS);
  const { count: staleLocksDeleted } = await prisma.demoIpLock.deleteMany({
    where: { acquiredAt: { lt: staleThreshold } }
  });

  const competitors = await prisma.competitor.findMany({
    include: { pages: true }
  });

  const briefNocache = process.env.CRON_BRIEF_NOCACHE === "true";
  const concurrency = Number(process.env.CRON_CONCURRENCY ?? DEFAULT_CONCURRENCY);
  const safeConcurrency = Number.isFinite(concurrency) ? Math.max(1, Math.min(10, concurrency)) : DEFAULT_CONCURRENCY;

  const summary: CompetitorResult[] = [];
  for (let i = 0; i < competitors.length; i += safeConcurrency) {
    const chunk = competitors.slice(i, i + safeConcurrency);
    const results = await Promise.all(chunk.map((c) => processCompetitor(c, briefNocache)));
    summary.push(...results);
  }

  return { competitors: competitors.length, staleLocksDeleted, summary };
}
