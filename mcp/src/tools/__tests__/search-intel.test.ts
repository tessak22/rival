import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { scan: { findMany: vi.fn() } }
}));
vi.mock("../../db.js", () => ({ prisma: mockPrisma }));

import { searchIntel } from "../search-intel.js";

const makeScan = (overrides: {
  id?: string;
  scannedAt?: Date;
  diffSummary?: string | null;
  competitorName?: string;
  competitorSlug?: string;
  pageType?: string;
  pageUrl?: string;
}) => ({
  id: overrides.id ?? "scan-uuid",
  scannedAt: overrides.scannedAt ?? new Date("2025-04-01T00:00:00Z"),
  diffSummary: overrides.diffSummary ?? "pricing changed",
  page: {
    type: overrides.pageType ?? "pricing",
    url: overrides.pageUrl ?? "https://acme.com/pricing",
    competitor: {
      name: overrides.competitorName ?? "Acme",
      slug: overrides.competitorSlug ?? "acme"
    }
  }
});

describe("searchIntel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns matching entries in correct shape", async () => {
    const scanDate = new Date("2025-04-01T00:00:00Z");
    mockPrisma.scan.findMany.mockResolvedValue([makeScan({ scannedAt: scanDate })]);
    const result = await searchIntel("pricing");
    expect(result.entries[0]).toMatchObject({
      id: "scan-uuid",
      competitor: "Acme",
      competitor_slug: "acme",
      page_type: "pricing",
      detected_at: scanDate.toISOString(),
      summary: "pricing changed",
      source_url: "https://acme.com/pricing"
    });
  });

  it("uses ILIKE (case-insensitive) search via Prisma contains+insensitive mode", async () => {
    mockPrisma.scan.findMany.mockResolvedValue([]);
    await searchIntel("MCP");
    const call = mockPrisma.scan.findMany.mock.calls[0][0];
    const orClause = call.where.OR;
    expect(Array.isArray(orClause)).toBe(true);
    const hasDiffSummaryFilter = orClause.some(
      (c: Record<string, unknown>) =>
        typeof c.diffSummary === "object" &&
        (c.diffSummary as Record<string, unknown>).mode === "insensitive"
    );
    expect(hasDiffSummaryFilter).toBe(true);
  });

  it("uses default 30-day window when since is not provided", async () => {
    const before = Date.now();
    mockPrisma.scan.findMany.mockResolvedValue([]);
    await searchIntel("pricing");
    const after = Date.now();
    const call = mockPrisma.scan.findMany.mock.calls[0][0];
    const sinceDate = call.where.scannedAt.gte as Date;
    const expectedMin = before - 30 * 24 * 60 * 60 * 1000;
    const expectedMax = after - 30 * 24 * 60 * 60 * 1000;
    expect(sinceDate.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(sinceDate.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it("respects a custom since date", async () => {
    mockPrisma.scan.findMany.mockResolvedValue([]);
    await searchIntel("pricing", "2025-01-01T00:00:00Z");
    const call = mockPrisma.scan.findMany.mock.calls[0][0];
    expect(call.where.scannedAt.gte).toEqual(new Date("2025-01-01T00:00:00Z"));
  });

  it("applies the limit and sets has_more=true when exceeded", async () => {
    const scans = Array.from({ length: 6 }, (_, i) => makeScan({ id: `scan-${i}` }));
    mockPrisma.scan.findMany.mockResolvedValue(scans);
    const result = await searchIntel("pricing", undefined, 5);
    expect(result.has_more).toBe(true);
    expect(result.entries).toHaveLength(5);
  });

  it("returns has_more=false when results are at or below limit", async () => {
    const scans = Array.from({ length: 3 }, (_, i) => makeScan({ id: `scan-${i}` }));
    mockPrisma.scan.findMany.mockResolvedValue(scans);
    const result = await searchIntel("pricing", undefined, 5);
    expect(result.has_more).toBe(false);
  });

  it("caps limit at 100 even if higher limit is requested", async () => {
    mockPrisma.scan.findMany.mockResolvedValue([]);
    await searchIntel("pricing", undefined, 9999);
    const call = mockPrisma.scan.findMany.mock.calls[0][0];
    expect(call.take).toBeLessThanOrEqual(101); // limit + 1
  });

  it("returns empty entries when no results", async () => {
    mockPrisma.scan.findMany.mockResolvedValue([]);
    const result = await searchIntel("nonexistent query");
    expect(result.entries).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.has_more).toBe(false);
  });
});
