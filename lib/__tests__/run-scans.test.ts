import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  competitorFindManyMock,
  demoIpLockDeleteManyMock,
  scanPageMock,
  generateCompetitorBriefMock,
  generateSelfBriefMock
} = vi.hoisted(() => ({
  competitorFindManyMock: vi.fn(),
  demoIpLockDeleteManyMock: vi.fn().mockResolvedValue({ count: 0 }),
  scanPageMock: vi.fn().mockResolvedValue({}),
  generateCompetitorBriefMock: vi.fn().mockResolvedValue({ threat_level: "Medium" }),
  generateSelfBriefMock: vi.fn().mockResolvedValue({ positioning_summary: "x" })
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    competitor: { findMany: competitorFindManyMock },
    demoIpLock: { deleteMany: demoIpLockDeleteManyMock }
  }
}));

vi.mock("@/lib/scanner", () => ({
  scanPage: scanPageMock
}));

vi.mock("@/lib/brief", () => ({
  generateCompetitorBrief: generateCompetitorBriefMock,
  generateSelfBrief: generateSelfBriefMock
}));

describe("runScans", () => {
  beforeEach(() => {
    vi.resetModules();
    competitorFindManyMock.mockReset();
    demoIpLockDeleteManyMock.mockReset().mockResolvedValue({ count: 0 });
    scanPageMock.mockReset().mockResolvedValue({});
    generateCompetitorBriefMock.mockReset().mockResolvedValue({ threat_level: "Medium" });
    generateSelfBriefMock.mockReset().mockResolvedValue({ positioning_summary: "x" });
  });

  it("calls generateSelfBrief for isSelf rows and generateCompetitorBrief for others", async () => {
    competitorFindManyMock.mockResolvedValue([
      {
        id: "cmp_a",
        isSelf: false,
        pages: [{ id: "pg_a", label: "Home", url: "https://a.co", type: "homepage", geoTarget: null }]
      },
      {
        id: "cmp_self",
        isSelf: true,
        pages: [{ id: "pg_s", label: "Home", url: "https://rival.so", type: "homepage", geoTarget: null }]
      }
    ]);

    const { runScans } = await import("@/lib/run-scans");
    await runScans();

    expect(generateCompetitorBriefMock).toHaveBeenCalledTimes(1);
    expect(generateCompetitorBriefMock).toHaveBeenCalledWith("cmp_a", expect.any(Boolean));
    expect(generateSelfBriefMock).toHaveBeenCalledTimes(1);
    expect(generateSelfBriefMock).toHaveBeenCalledWith("cmp_self", expect.any(Boolean));
  });

  it("marks briefGenerated=true for self when generateSelfBrief succeeds", async () => {
    competitorFindManyMock.mockResolvedValue([{ id: "cmp_self", isSelf: true, pages: [] }]);

    const { runScans } = await import("@/lib/run-scans");
    const result = await runScans();

    const selfSummary = result.summary.find((s) => s.competitorId === "cmp_self");
    expect(selfSummary?.briefGenerated).toBe(true);
    expect(selfSummary?.errors).toHaveLength(0);
  });

  it("records an error on self row when generateSelfBrief fails", async () => {
    generateSelfBriefMock.mockRejectedValue(new Error("tabstack timeout"));
    competitorFindManyMock.mockResolvedValue([{ id: "cmp_self", isSelf: true, pages: [] }]);

    const { runScans } = await import("@/lib/run-scans");
    const result = await runScans();

    const selfSummary = result.summary.find((s) => s.competitorId === "cmp_self");
    expect(selfSummary?.briefGenerated).toBe(false);
    expect(selfSummary?.errors[0]).toMatch(/tabstack timeout/);
  });
});
