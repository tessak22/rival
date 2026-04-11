import { prisma } from "@/lib/db/client";

function line(status: string, message: string): void {
  console.log(`${status} ${message}`);
}

async function main() {
  const competitors = await prisma.competitor.findMany({
    include: {
      pages: true,
      apiLogs: true
    }
  });

  if (competitors.length === 0) {
    line("WARN", "No competitors found. Run `npm run db:seed` first.");
    process.exitCode = 1;
    return;
  }

  let failed = false;
  for (const competitor of competitors) {
    line("INFO", `Validating ${competitor.name} (${competitor.slug})`);

    if (competitor.pages.length === 0) {
      line("FAIL", "No pages configured.");
      failed = true;
      continue;
    }

    const scans = await prisma.scan.findMany({
      where: { page: { competitorId: competitor.id } },
      include: { page: true },
      orderBy: { scannedAt: "desc" }
    });

    const scansByPage = new Map<string, typeof scans>();
    for (const scan of scans) {
      const arr = scansByPage.get(scan.pageId) ?? [];
      scansByPage.set(scan.pageId, [...arr, scan]);
    }

    for (const page of competitor.pages) {
      const pageScans = scansByPage.get(page.id) ?? [];
      if (pageScans.length === 0) {
        line("FAIL", `No scans found for page "${page.label}".`);
        failed = true;
        continue;
      }

      if (pageScans.length >= 2) {
        const latest = pageScans[0];
        if (latest.diffSummary === null) {
          line("WARN", `Latest scan for "${page.label}" has no diff summary despite prior scans.`);
        }
      }
    }

    if (competitor.apiLogs.length === 0) {
      line("FAIL", "No api_logs rows found.");
      failed = true;
    } else {
      line("PASS", `api_logs rows: ${competitor.apiLogs.length}`);
    }

    if (!competitor.intelligenceBrief || !competitor.briefGeneratedAt) {
      line("WARN", "Intelligence brief has not been generated.");
    } else {
      line("PASS", "Intelligence brief present.");
    }
  }

  if (failed) {
    line("FAIL", "Scan-cycle validation failed.");
    process.exitCode = 1;
    return;
  }

  line("PASS", "Scan-cycle validation checks passed.");
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ECONNREFUSED") || message.includes("Can't reach database server")) {
      line("FAIL", "Database connection failed. Start Postgres and set DATABASE_URL before running validation.");
      process.exitCode = 1;
      return;
    }
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
