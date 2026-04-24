import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    competitor: { findUnique: vi.fn() },
    competitorPage: { findFirst: vi.fn() },
    scan: { findFirst: vi.fn() }
  }
}));
vi.mock("../../db.js", () => ({ prisma: mockPrisma }));

import { getCompetitorDiff } from "../get-competitor-diff.js";

const mockComp = { id: "comp-uuid", name: "Acme", isSelf: false };
const mockPage = { id: "page-uuid", url: "https://acme.com/pricing" };
const scanDate = new Date("2025-04-01T00:00:00Z");
const prevDate = new Date("2025-03-01T00:00:00Z");

describe("getCompetitorDiff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns competitor_not_found when no competitor exists", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(null);
    const result = await getCompetitorDiff("missing", "pricing");
    expect(result).toMatchObject({ error: "competitor_not_found", competitor: "missing" });
  });

  it("returns competitor_not_found for isSelf competitors", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue({ ...mockComp, isSelf: true });
    const result = await getCompetitorDiff("acme", "pricing");
    expect(result).toMatchObject({ error: "competitor_not_found" });
  });

  it("returns page_type_not_tracked when page does not exist", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(mockComp);
    mockPrisma.competitorPage.findFirst.mockResolvedValue(null);
    const result = await getCompetitorDiff("acme", "careers");
    expect(result).toMatchObject({ error: "page_type_not_tracked", competitor: "acme", page_type: "careers" });
  });

  it("returns no_diff_available when no scan with hasChanges found", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(mockComp);
    mockPrisma.competitorPage.findFirst.mockResolvedValue(mockPage);
    mockPrisma.scan.findFirst.mockResolvedValueOnce(null);
    const result = await getCompetitorDiff("acme", "pricing");
    expect(result).toMatchObject({ error: "no_diff_available", competitor: "acme", page_type: "pricing" });
  });

  it("returns before/after content for a found diff", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(mockComp);
    mockPrisma.competitorPage.findFirst.mockResolvedValue(mockPage);
    mockPrisma.scan.findFirst
      .mockResolvedValueOnce({
        id: "scan-new",
        scannedAt: scanDate,
        rawResult: { price: 99 },
        markdownResult: null,
        diffSummary: "Price went up"
      })
      .mockResolvedValueOnce({
        id: "scan-old",
        scannedAt: prevDate,
        rawResult: { price: 79 },
        markdownResult: null
      });
    const result = await getCompetitorDiff("acme", "pricing");
    expect(result).toMatchObject({
      competitor: "Acme",
      page_type: "pricing",
      detected_at: scanDate.toISOString(),
      source_url: "https://acme.com/pricing",
      summary: "Price went up",
      truncated: false
    });
    expect((result as { after: string }).after).toContain("99");
    expect((result as { before: string }).before).toContain("79");
  });

  it("truncates content over 8000 characters and sets truncated=true", async () => {
    const longContent = "x".repeat(9000);
    mockPrisma.competitor.findUnique.mockResolvedValue(mockComp);
    mockPrisma.competitorPage.findFirst.mockResolvedValue(mockPage);
    mockPrisma.scan.findFirst
      .mockResolvedValueOnce({
        id: "scan-new",
        scannedAt: scanDate,
        rawResult: null,
        markdownResult: longContent,
        diffSummary: null
      })
      .mockResolvedValueOnce(null);
    const result = await getCompetitorDiff("acme", "pricing");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.truncated).toBe(true);
    expect(result.after).toContain("[truncated]");
    expect((result.after ?? "").length).toBeLessThan(9000);
  });

  it("returns null before when no previous scan exists", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(mockComp);
    mockPrisma.competitorPage.findFirst.mockResolvedValue(mockPage);
    mockPrisma.scan.findFirst
      .mockResolvedValueOnce({
        id: "scan-new",
        scannedAt: scanDate,
        rawResult: { price: 99 },
        markdownResult: null,
        diffSummary: null
      })
      .mockResolvedValueOnce(null);
    const result = await getCompetitorDiff("acme", "pricing");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.before).toBeNull();
  });
});
