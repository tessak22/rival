import { prisma } from "../db.js";

function asObj(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

export async function getDeepDives(slug: string, limit = 3) {
  const competitor = await prisma.competitor.findUnique({
    where: { slug },
    select: { id: true, name: true, isSelf: true }
  });

  if (!competitor || competitor.isSelf) {
    return { error: "competitor_not_found", slug };
  }

  const deepDives = await prisma.deepDive.findMany({
    where: { competitorId: competitor.id },
    orderBy: { createdAt: "desc" },
    take: limit
  });

  return {
    competitor: competitor.name,
    slug,
    deep_dives: deepDives.map((dd) => {
      const result = asObj(dd.result);
      const report =
        typeof result?.report === "string"
          ? result.report
          : typeof dd.result === "string"
            ? dd.result
            : result
              ? JSON.stringify(result)
              : null;

      const citations = Array.isArray(dd.citations) ? dd.citations : [];

      return {
        id: dd.id,
        created_at: dd.createdAt.toISOString(),
        mode: dd.mode,
        query: dd.query,
        report,
        citations: citations.map((c: unknown) => {
          const co = asObj(c);
          return {
            claim: typeof co?.claim === "string" ? co.claim : null,
            source_url: typeof co?.source_url === "string" ? co.source_url : null,
            source_text: typeof co?.source_text === "string" ? co.source_text : null
          };
        })
      };
    })
  };
}
