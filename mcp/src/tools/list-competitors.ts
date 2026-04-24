import { prisma } from "../db.js";

function threatOrder(level: string | null): number {
  if (level?.toLowerCase() === "high") return 0;
  if (level?.toLowerCase() === "medium") return 1;
  if (level?.toLowerCase() === "low") return 2;
  return 3;
}

function computeHealthScore(logs: Array<{ resultQuality: string | null }>): number {
  if (logs.length === 0) return 0;
  const score = logs.reduce((sum, l) => {
    return sum + (l.resultQuality === "full" ? 1 : l.resultQuality === "partial" ? 0.5 : 0);
  }, 0);
  return Math.round((score / logs.length) * 100);
}

export async function listCompetitors() {
  const competitors = await prisma.competitor.findMany({
    where: { isSelf: false },
    include: {
      pages: {
        include: {
          scans: {
            where: { hasChanges: true },
            orderBy: { scannedAt: "desc" },
            take: 1,
            select: { scannedAt: true }
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

  const sorted = [...competitors].sort((a, b) =>
    threatOrder(a.threatLevel) - threatOrder(b.threatLevel) ||
    a.name.localeCompare(b.name)
  );

  return {
    competitors: sorted.map((c) => {
      const lastChange = c.pages
        .flatMap((p) => p.scans)
        .sort((a, b) => b.scannedAt.getTime() - a.scannedAt.getTime())[0]?.scannedAt ?? null;

      return {
        name: c.name,
        slug: c.slug,
        threat_tier: c.threatLevel?.toLowerCase() ?? "unknown",
        health_score: computeHealthScore(c.apiLogs),
        last_change_detected_at: lastChange?.toISOString() ?? null,
        url: `${c.baseUrl}`
      };
    })
  };
}
