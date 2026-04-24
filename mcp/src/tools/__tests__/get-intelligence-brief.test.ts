import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { competitor: { findUnique: vi.fn() } }
}));
vi.mock("../../db.js", () => ({ prisma: mockPrisma }));

import { getIntelligenceBrief } from "../get-intelligence-brief.js";

const generatedAt = new Date("2025-04-01T00:00:00Z");

const makeCompetitor = (overrides: {
  isSelf?: boolean;
  intelligenceBrief?: unknown;
  briefGeneratedAt?: Date | null;
  threatLevel?: string | null;
}) => ({
  name: "Acme",
  slug: "acme",
  isSelf: overrides.isSelf ?? false,
  intelligenceBrief: overrides.intelligenceBrief ?? null,
  briefGeneratedAt: overrides.briefGeneratedAt ?? null,
  threatLevel: overrides.threatLevel ?? "High"
});

const fullBrief = {
  threat_level: "high",
  threat_reasoning: "Fast growing in our core market",
  positioning_opportunity: "Emphasize openness",
  content_opportunity: "Write migration guides",
  product_opportunity: "Build native webhooks",
  watch_list: ["pricing page", "hiring"],
  openness_score: 8,
  brand_trust_score: 7,
  pricing_score: 6,
  market_maturity_score: 5,
  feature_breadth_score: 4,
  managed_service_score: 3,
  llm_included_score: 2
};

describe("getIntelligenceBrief", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns competitor_not_found when no record exists", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(null);
    const result = await getIntelligenceBrief("missing");
    expect(result).toEqual({ error: "competitor_not_found", slug: "missing" });
  });

  it("returns competitor_not_found for isSelf competitors", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(makeCompetitor({ isSelf: true }));
    const result = await getIntelligenceBrief("acme");
    expect(result).toMatchObject({ error: "competitor_not_found" });
  });

  it("returns no_brief_available when intelligenceBrief is null", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(makeCompetitor({ intelligenceBrief: null }));
    const result = await getIntelligenceBrief("acme");
    expect(result).toMatchObject({ error: "no_brief_available", competitor: "Acme", slug: "acme" });
  });

  it("returns no_brief_available when intelligenceBrief is an array (not an object)", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(makeCompetitor({ intelligenceBrief: [] }));
    const result = await getIntelligenceBrief("acme");
    expect(result).toMatchObject({ error: "no_brief_available" });
  });

  it("returns all brief fields with correct shape", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(
      makeCompetitor({ intelligenceBrief: fullBrief, briefGeneratedAt: generatedAt })
    );
    const result = await getIntelligenceBrief("acme");
    expect(result).toMatchObject({
      competitor: "Acme",
      slug: "acme",
      generated_at: generatedAt.toISOString(),
      threat_level: "high",
      threat_reasoning: "Fast growing in our core market",
      positioning_opportunity: "Emphasize openness",
      content_opportunity: "Write migration guides",
      product_opportunity: "Build native webhooks",
      watch_list: ["pricing page", "hiring"]
    });
  });

  it("returns all 7 axis_scores", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(
      makeCompetitor({ intelligenceBrief: fullBrief, briefGeneratedAt: generatedAt })
    );
    const result = await getIntelligenceBrief("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.axis_scores).toEqual({
      openness: 8,
      brand_trust: 7,
      pricing: 6,
      market_maturity: 5,
      feature_breadth: 4,
      managed_service: 3,
      llm_included: 2
    });
  });

  it("falls back to competitor threatLevel when brief.threat_level is missing", async () => {
    const briefWithoutLevel = { ...fullBrief, threat_level: undefined };
    mockPrisma.competitor.findUnique.mockResolvedValue(
      makeCompetitor({ intelligenceBrief: briefWithoutLevel, threatLevel: "Medium" })
    );
    const result = await getIntelligenceBrief("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.threat_level).toBe("Medium");
  });

  it("returns null axis scores when brief is missing those fields", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(
      makeCompetitor({ intelligenceBrief: { threat_level: "low" } })
    );
    const result = await getIntelligenceBrief("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.axis_scores.openness).toBeNull();
    expect(result.axis_scores.pricing).toBeNull();
  });
});
