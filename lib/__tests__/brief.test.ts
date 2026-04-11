import { beforeEach, describe, expect, it, vi } from "vitest";

const { competitorFindUniqueMock, scanFindManyMock, competitorUpdateMock, generateBriefMock } = vi.hoisted(() => ({
  competitorFindUniqueMock: vi.fn(),
  scanFindManyMock: vi.fn(),
  competitorUpdateMock: vi.fn(),
  generateBriefMock: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    competitor: {
      findUnique: competitorFindUniqueMock,
      update: competitorUpdateMock
    },
    scan: {
      findMany: scanFindManyMock
    }
  }
}));

vi.mock("@/lib/tabstack/generate", () => ({
  generateBrief: generateBriefMock
}));

const COMPETITOR = {
  id: "cmp_1",
  name: "Acme",
  baseUrl: "https://acme.com",
  pages: [{ id: "page_1" }]
};

function makeRecentScan(overrides = {}) {
  const recent = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
  return {
    id: "scan_1",
    pageId: "page_1",
    scannedAt: recent,
    markdownResult: "## Pricing\nStarter: $10/mo",
    rawResult: null,
    page: { type: "pricing", label: "Pricing Page" },
    ...overrides
  };
}

function makeStaleScan(overrides = {}) {
  const stale = new Date(Date.now() - 1000 * 60 * 60 * 24 * 8); // 8 days ago
  return {
    id: "scan_old",
    pageId: "page_1",
    scannedAt: stale,
    markdownResult: "## Old Pricing",
    rawResult: null,
    page: { type: "pricing", label: "Pricing Page" },
    ...overrides
  };
}

describe("generateCompetitorBrief", () => {
  beforeEach(() => {
    vi.resetModules();
    competitorFindUniqueMock.mockReset();
    scanFindManyMock.mockReset();
    competitorUpdateMock.mockReset();
    generateBriefMock.mockReset();

    competitorFindUniqueMock.mockResolvedValue(COMPETITOR);
    scanFindManyMock.mockResolvedValue([makeRecentScan()]);
    competitorUpdateMock.mockResolvedValue({});
    generateBriefMock.mockResolvedValue({
      threat_level: "Medium",
      positioning_opportunity: "Fill the docs gap",
      content_opportunity: "Write TypeScript guides",
      product_opportunity: "Better SDK ergonomics",
      threat_reasoning: "Growing but behind on DX",
      watch_list: ["pricing change"]
    });
  });

  it("throws when competitor is not found", async () => {
    competitorFindUniqueMock.mockResolvedValueOnce(null);
    const { generateCompetitorBrief } = await import("@/lib/brief");

    await expect(generateCompetitorBrief("missing")).rejects.toThrow("Competitor not found");
    expect(generateBriefMock).not.toHaveBeenCalled();
  });

  it("throws when no recent scans are available", async () => {
    scanFindManyMock.mockResolvedValueOnce([makeStaleScan()]);
    const { generateCompetitorBrief } = await import("@/lib/brief");

    await expect(generateCompetitorBrief("cmp_1")).rejects.toThrow("No recent scans available for brief generation");
    expect(generateBriefMock).not.toHaveBeenCalled();
  });

  it("throws when scan list is empty", async () => {
    scanFindManyMock.mockResolvedValueOnce([]);
    const { generateCompetitorBrief } = await import("@/lib/brief");

    await expect(generateCompetitorBrief("cmp_1")).rejects.toThrow("No recent scans available for brief generation");
  });

  it("calls generateBrief with competitor baseUrl and nocache=true by default", async () => {
    const { generateCompetitorBrief } = await import("@/lib/brief");
    await generateCompetitorBrief("cmp_1");

    expect(generateBriefMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://acme.com",
        effort: "low",
        nocache: true
      })
    );
  });

  it("passes nocache=false when explicitly set", async () => {
    const { generateCompetitorBrief } = await import("@/lib/brief");
    await generateCompetitorBrief("cmp_1", false);

    expect(generateBriefMock).toHaveBeenCalledWith(expect.objectContaining({ nocache: false }));
  });

  it("passes competitorId in generateBrief params", async () => {
    const { generateCompetitorBrief } = await import("@/lib/brief");
    await generateCompetitorBrief("cmp_1");

    expect(generateBriefMock).toHaveBeenCalledWith(expect.objectContaining({ competitorId: "cmp_1" }));
  });

  it("uses markdownResult when available", async () => {
    const { generateCompetitorBrief } = await import("@/lib/brief");
    await generateCompetitorBrief("cmp_1");

    const call = generateBriefMock.mock.calls[0][0];
    expect(call.contextData).toContain("## Pricing");
  });

  it("falls back to rawResult when markdownResult is null", async () => {
    scanFindManyMock.mockResolvedValueOnce([
      makeRecentScan({ markdownResult: null, rawResult: { tiers: [{ name: "Pro" }] } })
    ]);
    const { generateCompetitorBrief } = await import("@/lib/brief");
    await generateCompetitorBrief("cmp_1");

    const call = generateBriefMock.mock.calls[0][0];
    expect(call.contextData).toContain("tiers");
  });

  it("persists intelligence brief and threat level on competitor", async () => {
    const { generateCompetitorBrief } = await import("@/lib/brief");
    await generateCompetitorBrief("cmp_1");

    expect(competitorUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cmp_1" },
        data: expect.objectContaining({
          threatLevel: "Medium",
          briefGeneratedAt: expect.any(Date)
        })
      })
    );
  });

  it("returns the payload from generateBrief", async () => {
    const mockPayload = {
      threat_level: "High",
      positioning_opportunity: "Dominate docs",
      content_opportunity: "More examples",
      product_opportunity: "Better onboarding",
      threat_reasoning: "Aggressive pricing",
      watch_list: ["funding round"]
    };
    generateBriefMock.mockResolvedValueOnce(mockPayload);

    const { generateCompetitorBrief } = await import("@/lib/brief");
    const result = await generateCompetitorBrief("cmp_1");

    expect(result).toEqual(mockPayload);
  });

  it("extracts payload from data envelope when present", async () => {
    const inner = {
      threat_level: "Low",
      positioning_opportunity: "Niche focus",
      content_opportunity: "Case studies",
      product_opportunity: "Integrations",
      threat_reasoning: "Small market share",
      watch_list: []
    };
    generateBriefMock.mockResolvedValueOnce({ data: inner });

    const { generateCompetitorBrief } = await import("@/lib/brief");
    const result = await generateCompetitorBrief("cmp_1");

    expect(result).toEqual(inner);
    expect(competitorUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ threatLevel: "Low" })
      })
    );
  });

  it("sets threatLevel to null when threat_level is not a valid string", async () => {
    generateBriefMock.mockResolvedValueOnce({ threat_level: "Unknown" });

    const { generateCompetitorBrief } = await import("@/lib/brief");
    await generateCompetitorBrief("cmp_1");

    expect(competitorUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ threatLevel: null })
      })
    );
  });

  it("sets threatLevel to null when response is not a plain object", async () => {
    generateBriefMock.mockResolvedValueOnce("just a string");

    const { generateCompetitorBrief } = await import("@/lib/brief");
    await generateCompetitorBrief("cmp_1");

    expect(competitorUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ threatLevel: null })
      })
    );
  });

  it("deduplicates scans by pageId — uses only the latest scan per page", async () => {
    const recent = makeRecentScan({ id: "scan_new", scannedAt: new Date(Date.now() - 1000 * 60 * 30) });
    const older = makeRecentScan({ id: "scan_older", scannedAt: new Date(Date.now() - 1000 * 60 * 60 * 2) });
    // Same pageId — findMany returns them newest-first per orderBy: scannedAt desc
    scanFindManyMock.mockResolvedValueOnce([recent, older]);

    const { generateCompetitorBrief } = await import("@/lib/brief");
    await generateCompetitorBrief("cmp_1");

    // contextData should contain only one entry (the most recent)
    const call = generateBriefMock.mock.calls[0][0];
    const parsed = JSON.parse(call.contextData) as unknown[];
    expect(parsed).toHaveLength(1);
  });

  it("ignores scans older than 7 days but includes scans within the window", async () => {
    const recentScan = makeRecentScan({ pageId: "page_2", page: { type: "changelog", label: "Changelog" } });
    const staleScan = makeStaleScan(); // pageId: page_1
    scanFindManyMock.mockResolvedValueOnce([recentScan, staleScan]);

    const { generateCompetitorBrief } = await import("@/lib/brief");
    await generateCompetitorBrief("cmp_1");

    // Only the recent scan (page_2) should be in context; stale scan skipped
    const call = generateBriefMock.mock.calls[0][0];
    const parsed = JSON.parse(call.contextData) as Array<{ page_type: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0].page_type).toBe("changelog");
  });

  it("propagates errors from generateBrief", async () => {
    generateBriefMock.mockRejectedValueOnce(new Error("Tabstack API failure"));

    const { generateCompetitorBrief } = await import("@/lib/brief");
    await expect(generateCompetitorBrief("cmp_1")).rejects.toThrow("Tabstack API failure");
    expect(competitorUpdateMock).not.toHaveBeenCalled();
  });

  it("accepts all three valid threat levels — High, Medium, Low", async () => {
    const { generateCompetitorBrief } = await import("@/lib/brief");

    for (const level of ["High", "Medium", "Low"] as const) {
      generateBriefMock.mockResolvedValueOnce({ threat_level: level });
      await generateCompetitorBrief("cmp_1");

      const lastCall = competitorUpdateMock.mock.calls.at(-1) as Array<unknown>;
      const data = (lastCall[0] as { data: { threatLevel: string } }).data;
      expect(data.threatLevel).toBe(level);
    }
  });
});
