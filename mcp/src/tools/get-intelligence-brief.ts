import { prisma } from "../db.js";

function asObj(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

export async function getIntelligenceBrief(slug: string) {
  const competitor = await prisma.competitor.findUnique({
    where: { slug },
    select: {
      name: true,
      slug: true,
      isSelf: true,
      intelligenceBrief: true,
      briefGeneratedAt: true,
      threatLevel: true
    }
  });

  if (!competitor || competitor.isSelf) {
    return { error: "competitor_not_found", slug };
  }

  const brief = asObj(competitor.intelligenceBrief);
  if (!brief) {
    return { error: "no_brief_available", competitor: competitor.name, slug };
  }

  return {
    competitor: competitor.name,
    slug: competitor.slug,
    generated_at: competitor.briefGeneratedAt?.toISOString() ?? null,
    threat_level: typeof brief.threat_level === "string" ? brief.threat_level : competitor.threatLevel ?? null,
    threat_reasoning: typeof brief.threat_reasoning === "string" ? brief.threat_reasoning : null,
    positioning_opportunity: typeof brief.positioning_opportunity === "string" ? brief.positioning_opportunity : null,
    content_opportunity: typeof brief.content_opportunity === "string" ? brief.content_opportunity : null,
    product_opportunity: typeof brief.product_opportunity === "string" ? brief.product_opportunity : null,
    watch_list: Array.isArray(brief.watch_list)
      ? (brief.watch_list as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
    axis_scores: {
      openness: typeof brief.openness_score === "number" ? brief.openness_score : null,
      brand_trust: typeof brief.brand_trust_score === "number" ? brief.brand_trust_score : null,
      pricing: typeof brief.pricing_score === "number" ? brief.pricing_score : null,
      market_maturity: typeof brief.market_maturity_score === "number" ? brief.market_maturity_score : null,
      feature_breadth: typeof brief.feature_breadth_score === "number" ? brief.feature_breadth_score : null,
      managed_service: typeof brief.managed_service_score === "number" ? brief.managed_service_score : null,
      llm_included: typeof brief.llm_included_score === "number" ? brief.llm_included_score : null
    }
  };
}
