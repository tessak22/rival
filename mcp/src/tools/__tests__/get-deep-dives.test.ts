import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    competitor: { findUnique: vi.fn() },
    deepDive: { findMany: vi.fn() }
  }
}));
vi.mock("../../db.js", () => ({ prisma: mockPrisma }));

import { getDeepDives } from "../get-deep-dives.js";

const mockCompetitor = { id: "comp-uuid", name: "Acme", isSelf: false };
const createdAt = new Date("2025-04-01T00:00:00Z");

const makeDeepDive = (overrides: {
  id?: string;
  mode?: string;
  query?: string;
  result?: unknown;
  citations?: unknown;
}) => ({
  id: overrides.id ?? "dive-uuid",
  createdAt,
  mode: overrides.mode ?? "balanced",
  query: overrides.query ?? "What is their pricing strategy?",
  result: overrides.result ?? null,
  citations: overrides.citations ?? null
});

describe("getDeepDives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns competitor_not_found when no record exists", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(null);
    const result = await getDeepDives("missing");
    expect(result).toEqual({ error: "competitor_not_found", slug: "missing" });
  });

  it("returns competitor_not_found for isSelf competitors", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue({ ...mockCompetitor, isSelf: true });
    const result = await getDeepDives("acme");
    expect(result).toMatchObject({ error: "competitor_not_found" });
  });

  it("returns empty array when no deep dives", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(mockCompetitor);
    mockPrisma.deepDive.findMany.mockResolvedValue([]);
    const result = await getDeepDives("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.deep_dives).toEqual([]);
  });

  it("returns report from result.report string", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(mockCompetitor);
    mockPrisma.deepDive.findMany.mockResolvedValue([
      makeDeepDive({ result: { report: "Acme uses tiered pricing..." } })
    ]);
    const result = await getDeepDives("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.deep_dives[0].report).toBe("Acme uses tiered pricing...");
  });

  it("falls back to stringified result when result.report is not a string", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(mockCompetitor);
    mockPrisma.deepDive.findMany.mockResolvedValue([
      makeDeepDive({ result: { summary: "complex object" } })
    ]);
    const result = await getDeepDives("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(typeof result.deep_dives[0].report).toBe("string");
    expect(result.deep_dives[0].report).toContain("complex object");
  });

  it("returns null report when result is null", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(mockCompetitor);
    mockPrisma.deepDive.findMany.mockResolvedValue([makeDeepDive({ result: null })]);
    const result = await getDeepDives("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.deep_dives[0].report).toBeNull();
  });

  it("returns citations with claim, source_url, source_text", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(mockCompetitor);
    mockPrisma.deepDive.findMany.mockResolvedValue([
      makeDeepDive({
        result: { report: "Report text" },
        citations: [
          { claim: "They raised prices", source_url: "https://acme.com/blog", source_text: "We updated pricing..." }
        ]
      })
    ]);
    const result = await getDeepDives("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.deep_dives[0].citations).toHaveLength(1);
    expect(result.deep_dives[0].citations[0]).toEqual({
      claim: "They raised prices",
      source_url: "https://acme.com/blog",
      source_text: "We updated pricing..."
    });
  });

  it("returns empty citations array when citations is null", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(mockCompetitor);
    mockPrisma.deepDive.findMany.mockResolvedValue([makeDeepDive({ citations: null })]);
    const result = await getDeepDives("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.deep_dives[0].citations).toEqual([]);
  });

  it("passes the limit parameter to findMany", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(mockCompetitor);
    mockPrisma.deepDive.findMany.mockResolvedValue([]);
    await getDeepDives("acme", 5);
    expect(mockPrisma.deepDive.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 })
    );
  });
});
