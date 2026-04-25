import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    competitor: { findUnique: vi.fn() },
    competitorPage: { findMany: vi.fn() }
  }
}));
vi.mock("../../db.js", () => ({ prisma: mockPrisma }));

import { getCompetitorData } from "../get-competitor-data.js";

const mockCompetitor = { id: "comp-uuid", name: "Acme", isSelf: false };
const scanDate = new Date("2025-03-01T00:00:00Z");

const makePage = (overrides: {
  type?: string;
  label?: string;
  url?: string;
  rawResult?: unknown;
  markdownResult?: string | null;
  noScans?: boolean;
}) => ({
  id: "page-uuid",
  type: overrides.type ?? "pricing",
  label: overrides.label ?? "Pricing",
  url: overrides.url ?? "https://acme.com/pricing",
  scans: overrides.noScans
    ? []
    : [
        {
          scannedAt: scanDate,
          endpointUsed: "extract.json",
          rawResult: overrides.rawResult ?? null,
          markdownResult: overrides.markdownResult ?? null
        }
      ]
});

describe("getCompetitorData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns competitor_not_found when competitor does not exist", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(null);
    const result = await getCompetitorData("missing");
    expect(result).toEqual({ error: "competitor_not_found", slug: "missing" });
  });

  it("returns competitor_not_found for isSelf competitors", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue({ ...mockCompetitor, isSelf: true });
    const result = await getCompetitorData("acme");
    expect(result).toMatchObject({ error: "competitor_not_found" });
  });

  it("returns pages with rawResult data", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(mockCompetitor);
    mockPrisma.competitorPage.findMany.mockResolvedValue([makePage({ rawResult: { tiers: ["free", "pro"] } })]);
    const result = await getCompetitorData("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].page_type).toBe("pricing");
    expect(result.pages[0].data).toEqual({ tiers: ["free", "pro"] });
    expect(result.pages[0].scanned_at).toBe(scanDate.toISOString());
  });

  it("uses markdownResult content for changelog pages", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(mockCompetitor);
    mockPrisma.competitorPage.findMany.mockResolvedValue([
      makePage({ type: "changelog", markdownResult: "## v2.0\n- New feature" })
    ]);
    const result = await getCompetitorData("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.pages[0].data).toEqual({ content: "## v2.0\n- New feature" });
  });

  it("filters pages by page_type when provided", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(mockCompetitor);
    mockPrisma.competitorPage.findMany.mockResolvedValue([makePage({ type: "pricing", rawResult: { price: 99 } })]);
    await getCompetitorData("acme", "pricing");
    expect(mockPrisma.competitorPage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "pricing" })
      })
    );
  });

  it("returns empty pages array when no scans exist", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(mockCompetitor);
    mockPrisma.competitorPage.findMany.mockResolvedValue([makePage({ noScans: true })]);
    const result = await getCompetitorData("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.pages).toEqual([]);
  });

  it("excludes pages where both rawResult and markdownResult are null", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(mockCompetitor);
    mockPrisma.competitorPage.findMany.mockResolvedValue([makePage({ rawResult: null, markdownResult: null })]);
    const result = await getCompetitorData("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.pages).toEqual([]);
  });

  it("returns the competitor name and slug", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(mockCompetitor);
    mockPrisma.competitorPage.findMany.mockResolvedValue([]);
    const result = await getCompetitorData("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.competitor).toBe("Acme");
    expect(result.slug).toBe("acme");
  });
});
