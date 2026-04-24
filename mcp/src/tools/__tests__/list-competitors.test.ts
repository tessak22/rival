import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { competitor: { findMany: vi.fn() } }
}));
vi.mock("../../db.js", () => ({ prisma: mockPrisma }));

import { listCompetitors } from "../list-competitors.js";

const makeCompetitor = (overrides: {
  id?: string;
  name: string;
  slug: string;
  baseUrl?: string;
  threatLevel?: string | null;
  pages?: unknown[];
  apiLogs?: unknown[];
}) => ({
  id: overrides.id ?? "uuid-1",
  name: overrides.name,
  slug: overrides.slug,
  baseUrl: overrides.baseUrl ?? `https://${overrides.slug}.com`,
  threatLevel: overrides.threatLevel ?? null,
  isSelf: false,
  pages: overrides.pages ?? [],
  apiLogs: overrides.apiLogs ?? []
});

describe("listCompetitors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns competitors sorted by threat tier (high before low)", async () => {
    mockPrisma.competitor.findMany.mockResolvedValue([
      makeCompetitor({ name: "Low Co", slug: "low-co", threatLevel: "Low" }),
      makeCompetitor({ name: "High Co", slug: "high-co", threatLevel: "High" })
    ]);
    const result = await listCompetitors();
    expect(result.competitors[0].slug).toBe("high-co");
    expect(result.competitors[1].slug).toBe("low-co");
  });

  it("sorts medium between high and low", async () => {
    mockPrisma.competitor.findMany.mockResolvedValue([
      makeCompetitor({ name: "Low Co", slug: "low-co", threatLevel: "Low" }),
      makeCompetitor({ name: "Medium Co", slug: "medium-co", threatLevel: "Medium" }),
      makeCompetitor({ name: "High Co", slug: "high-co", threatLevel: "High" })
    ]);
    const result = await listCompetitors();
    expect(result.competitors.map((c) => c.slug)).toEqual(["high-co", "medium-co", "low-co"]);
  });

  it("sorts alphabetically within the same threat tier", async () => {
    mockPrisma.competitor.findMany.mockResolvedValue([
      makeCompetitor({ name: "Zebra", slug: "zebra", threatLevel: "High" }),
      makeCompetitor({ name: "Alpha", slug: "alpha", threatLevel: "High" })
    ]);
    const result = await listCompetitors();
    expect(result.competitors[0].slug).toBe("alpha");
    expect(result.competitors[1].slug).toBe("zebra");
  });

  it("returns empty array when no competitors", async () => {
    mockPrisma.competitor.findMany.mockResolvedValue([]);
    const result = await listCompetitors();
    expect(result.competitors).toEqual([]);
  });

  it("computes health score correctly for full/partial/empty logs", async () => {
    mockPrisma.competitor.findMany.mockResolvedValue([
      makeCompetitor({
        name: "Test Co",
        slug: "test-co",
        apiLogs: [
          { resultQuality: "full" },
          { resultQuality: "full" },
          { resultQuality: "partial" },
          { resultQuality: "empty" }
        ]
      })
    ]);
    const result = await listCompetitors();
    // (1 + 1 + 0.5 + 0) / 4 = 0.625 → 63%
    expect(result.competitors[0].health_score).toBe(63);
  });

  it("returns health_score 0 when no logs", async () => {
    mockPrisma.competitor.findMany.mockResolvedValue([
      makeCompetitor({ name: "No Logs", slug: "no-logs", apiLogs: [] })
    ]);
    const result = await listCompetitors();
    expect(result.competitors[0].health_score).toBe(0);
  });

  it("computes last_change_detected_at from pages with changes", async () => {
    const earlier = new Date("2025-01-01T00:00:00Z");
    const later = new Date("2025-06-01T00:00:00Z");
    mockPrisma.competitor.findMany.mockResolvedValue([
      makeCompetitor({
        name: "Change Co",
        slug: "change-co",
        pages: [
          { scans: [{ scannedAt: earlier }] },
          { scans: [{ scannedAt: later }] }
        ]
      })
    ]);
    const result = await listCompetitors();
    expect(result.competitors[0].last_change_detected_at).toBe(later.toISOString());
  });

  it("returns null for last_change_detected_at when no scans", async () => {
    mockPrisma.competitor.findMany.mockResolvedValue([
      makeCompetitor({ name: "No Changes", slug: "no-changes", pages: [] })
    ]);
    const result = await listCompetitors();
    expect(result.competitors[0].last_change_detected_at).toBeNull();
  });

  it("returns expected shape per competitor", async () => {
    mockPrisma.competitor.findMany.mockResolvedValue([
      makeCompetitor({ name: "Acme", slug: "acme", baseUrl: "https://acme.com", threatLevel: "High" })
    ]);
    const result = await listCompetitors();
    expect(result.competitors[0]).toMatchObject({
      name: "Acme",
      slug: "acme",
      threat_tier: "high",
      url: "https://acme.com"
    });
  });
});
