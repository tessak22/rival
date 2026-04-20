/**
 * Force-regenerate competitive intelligence briefs for every competitor.
 *
 * Why this exists: Competitor.threatLevel is a cached enum written by
 * generateCompetitorBrief. Prompt changes (e.g. the rubric rewrite in PR #75)
 * only take effect on the next brief run, which otherwise happens on the
 * weekday cron schedule. This script triggers an immediate refresh — handy
 * before a demo, after tuning the rubric, or when the dashboard looks stale.
 *
 * Usage:
 *   DATABASE_URL=<prod-url> TABSTACK_API_KEY=<key> npm run refresh-briefs
 *
 * Safety:
 *   - Runs briefs sequentially to stay polite to the Tabstack API.
 *   - Requires at least one recent scan per competitor; logs and skips any
 *     competitor that has none (brief generation throws in that case).
 *   - Each brief costs one generate.json call. With 8 competitors this is
 *     bounded cost — don't loop this script.
 */

import { generateCompetitorBrief } from "@/lib/brief";
import { prisma } from "@/lib/db/client";

type BriefOutcome =
  | { slug: string; name: string; status: "updated"; before: string; after: string; reasoning: string }
  | { slug: string; name: string; status: "skipped" | "error"; before: string; message: string };

function formatRow(slug: string, before: string, after: string, detail: string): string {
  return `${slug.padEnd(22)} ${before.padEnd(8)} → ${after.padEnd(8)} ${detail}`;
}

async function main() {
  const competitors = await prisma.competitor.findMany({
    select: { id: true, slug: true, name: true, threatLevel: true },
    orderBy: { slug: "asc" }
  });

  if (competitors.length === 0) {
    console.log("No competitors in DB. Run `npm run db:seed` first.");
    return;
  }

  console.log(`Refreshing briefs for ${competitors.length} competitor${competitors.length === 1 ? "" : "s"}...\n`);
  console.log(formatRow("slug", "before", "after", "reasoning"));
  console.log("-".repeat(100));

  const outcomes: BriefOutcome[] = [];

  for (const competitor of competitors) {
    const before = competitor.threatLevel ?? "—";
    try {
      const payload = await generateCompetitorBrief(competitor.id, true);
      const threatRaw = (payload as { threat_level?: unknown })?.threat_level;
      const reasoningRaw = (payload as { threat_reasoning?: unknown })?.threat_reasoning;
      const after = typeof threatRaw === "string" ? threatRaw : "—";
      const reasoning = typeof reasoningRaw === "string" ? reasoningRaw.slice(0, 80) : "";
      console.log(formatRow(competitor.slug, before, after, reasoning));
      outcomes.push({ slug: competitor.slug, name: competitor.name, status: "updated", before, after, reasoning });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status: "skipped" | "error" = message.includes("No recent scans") ? "skipped" : "error";
      console.log(formatRow(competitor.slug, before, status === "skipped" ? "skip" : "ERR", message));
      outcomes.push({ slug: competitor.slug, name: competitor.name, status, before, message });
    }
  }

  const updated = outcomes.filter((o) => o.status === "updated").length;
  const skipped = outcomes.filter((o) => o.status === "skipped").length;
  const errored = outcomes.filter((o) => o.status === "error").length;

  console.log(`\nDone: ${updated} updated, ${skipped} skipped (no recent scans), ${errored} errored.`);

  if (errored > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
