import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { scan: { findMany: vi.fn() } }
}));
vi.mock("../../db.js", () => ({ prisma: mockPrisma }));

import { listRecentIntel } from "../list-recent-intel.js";

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
  diffSummary: overrides.diffSummary ?? "Price changed",
  page: {
    type: overrides.pageType ?? "pricing",
    url: overrides.pageUrl ?? "https://acme.com/pricing",
    competitor: {
      name: overrides.competitorName ?? "Acme",
      slug: overrides.competitorSlug ?? "acme"
    }
  }
});

describe("listRecentIntel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns entries in correct shape", async () => {
    const scanDate = new Date("2025-04-01T00:00:00Z");
    mockPrisma.scan.findMany.mockResolvedValue([makeScan({ scannedAt: scanDate })]);
    const result = await listRecentIntel({});
    expect(result.entries[0]).toMatchObject({
      id: "scan-uuid",
      competitor: "Acme",
      competitor_slug: "acme",
      page_type: "pricing",
      detected_at: scanDate.toISOString(),
      summary: "Price changed",
      source_url: "https://acme.com/pricing"
    });
  });

  it("uses default 7-day window when since is not provided", async () => {
    const before = Date.now();
    mockPrisma.scan.findMany.mockResolvedValue([]);
    await listRecentIntel({});
    const after = Date.now();
    const call = mockPrisma.scan.findMany.mock.calls[0][0];
    const sinceDate = call.where.scannedAt.gte as Date;
    const expectedMin = before - 7 * 24 * 60 * 60 * 1000;
    const expectedMax = after - 7 * 24 * 60 * 60 * 1000;
    expect(sinceDate.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(sinceDate.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it("filters by competitor slug when provided", async () => {
    mockPrisma.scan.findMany.mockResolvedValue([]);
    await listRecentIntel({ competitor: "acme" });
    const call = mockPrisma.scan.findMany.mock.calls[0][0];
    expect(JSON.stringify(call.where)).toContain("acme");
  });

  it("filters by page_type when provided", async () => {
    mockPrisma.scan.findMany.mockResolvedValue([]);
    await listRecentIntel({ page_type: "pricing" });
    const call = mockPrisma.scan.findMany.mock.calls[0][0];
    expect(JSON.stringify(call.where)).toContain("pricing");
  });

  it("sets has_more=true when results exceed limit", async () => {
    const scans = Array.from({ length: 6 }, (_, i) =>
      makeScan({ id: `scan-${i}` })
    );
    mockPrisma.scan.findMany.mockResolvedValue(scans);
    const result = await listRecentIntel({ limit: 5 });
    expect(result.has_more).toBe(true);
    expect(result.entries).toHaveLength(5);
  });

  it("sets has_more=false when results are at or below limit", async () => {
    const scans = Array.from({ length: 3 }, (_, i) =>
      makeScan({ id: `scan-${i}` })
    );
    mockPrisma.scan.findMany.mockResolvedValue(scans);
    const result = await listRecentIntel({ limit: 5 });
    expect(result.has_more).toBe(false);
    expect(result.entries).toHaveLength(3);
  });

  it("returns empty entries when no scans", async () => {
    mockPrisma.scan.findMany.mockResolvedValue([]);
    const result = await listRecentIntel({});
    expect(result.entries).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.has_more).toBe(false);
  });

  it("caps limit at MAX_LIMIT (200)", async () => {
    mockPrisma.scan.findMany.mockResolvedValue([]);
    await listRecentIntel({ limit: 9999 });
    const call = mockPrisma.scan.findMany.mock.calls[0][0];
    expect(call.take).toBeLessThanOrEqual(201); // limit + 1
  });
});
