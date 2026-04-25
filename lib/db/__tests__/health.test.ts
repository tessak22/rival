import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRawMock } = vi.hoisted(() => ({
  queryRawMock: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    $queryRaw: queryRawMock
  }
}));

describe("calcHealthScore", () => {
  beforeEach(() => vi.resetModules());

  it("returns 100 when all pages have full quality", async () => {
    const { calcHealthScore } = await import("@/lib/db/health");
    const rows = [
      { competitor_id: "c1", page_id: "p1", result_quality: "full", page_type: "homepage" },
      { competitor_id: "c1", page_id: "p2", result_quality: "full", page_type: "pricing" }
    ];
    expect(calcHealthScore(rows)).toBe(100);
  });

  it("returns 50 when all pages have partial quality", async () => {
    const { calcHealthScore } = await import("@/lib/db/health");
    const rows = [
      { competitor_id: "c1", page_id: "p1", result_quality: "partial", page_type: "homepage" },
      { competitor_id: "c1", page_id: "p2", result_quality: "partial", page_type: "pricing" }
    ];
    expect(calcHealthScore(rows)).toBe(50);
  });

  it("returns 0 when all pages have empty quality", async () => {
    const { calcHealthScore } = await import("@/lib/db/health");
    const rows = [{ competitor_id: "c1", page_id: "p1", result_quality: "empty", page_type: "homepage" }];
    expect(calcHealthScore(rows)).toBe(0);
  });

  it("returns 0 for an empty row list", async () => {
    const { calcHealthScore } = await import("@/lib/db/health");
    expect(calcHealthScore([])).toBe(0);
  });

  it("correctly averages mixed quality — one full one partial = 75", async () => {
    const { calcHealthScore } = await import("@/lib/db/health");
    const rows = [
      { competitor_id: "c1", page_id: "p1", result_quality: "full", page_type: "homepage" },
      { competitor_id: "c1", page_id: "p2", result_quality: "partial", page_type: "pricing" }
    ];
    expect(calcHealthScore(rows)).toBe(75);
  });
});

describe("latestQualityPerPage", () => {
  beforeEach(() => {
    vi.resetModules();
    queryRawMock.mockReset();
  });

  it("returns empty array without querying DB when no competitor IDs given", async () => {
    const { latestQualityPerPage } = await import("@/lib/db/health");
    const result = await latestQualityPerPage([]);
    expect(result).toEqual([]);
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("returns rows from $queryRaw for provided competitor IDs", async () => {
    const mockRows = [
      { competitor_id: "c1", page_id: "p1", result_quality: "full", page_type: "homepage" },
      { competitor_id: "c1", page_id: "p2", result_quality: "partial", page_type: "pricing" }
    ];
    queryRawMock.mockResolvedValue(mockRows);

    const { latestQualityPerPage } = await import("@/lib/db/health");
    const result = await latestQualityPerPage(["c1"]);
    expect(result).toEqual(mockRows);
    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });
});

describe("competitorHealthScores", () => {
  beforeEach(() => {
    vi.resetModules();
    queryRawMock.mockReset();
  });

  it("returns a map with 0 for competitors with no pages scanned", async () => {
    queryRawMock.mockResolvedValue([]);
    const { competitorHealthScores } = await import("@/lib/db/health");
    const result = await competitorHealthScores(["c1", "c2"]);
    expect(result.get("c1")).toBe(0);
    expect(result.get("c2")).toBe(0);
  });

  it("maps each competitor ID to the average quality of their latest page scans", async () => {
    queryRawMock.mockResolvedValue([
      { competitor_id: "c1", page_id: "p1", result_quality: "full", page_type: "homepage" },
      { competitor_id: "c1", page_id: "p2", result_quality: "partial", page_type: "pricing" },
      { competitor_id: "c2", page_id: "p3", result_quality: "full", page_type: "homepage" }
    ]);
    const { competitorHealthScores } = await import("@/lib/db/health");
    const result = await competitorHealthScores(["c1", "c2"]);
    expect(result.get("c1")).toBe(75); // (1 + 0.5) / 2
    expect(result.get("c2")).toBe(100); // 1 / 1
  });

  it("returns empty map when given no competitor IDs", async () => {
    const { competitorHealthScores } = await import("@/lib/db/health");
    const result = await competitorHealthScores([]);
    expect(result.size).toBe(0);
    expect(queryRawMock).not.toHaveBeenCalled();
  });
});
