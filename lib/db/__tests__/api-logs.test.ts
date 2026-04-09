import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiLogFindManyMock } = vi.hoisted(() => ({
  apiLogFindManyMock: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    apiLog: {
      findMany: apiLogFindManyMock
    }
  }
}));

describe("api-log insights aggregations", () => {
  beforeEach(() => {
    vi.resetModules();
    apiLogFindManyMock.mockReset();
    apiLogFindManyMock.mockResolvedValue([
      {
        id: "1",
        status: "success",
        endpoint: "extract/json",
        effort: "high",
        geoTarget: "US",
        missingFields: ["tiers"],
        fallbackTriggered: false,
        contentBlocked: false,
        rawError: null,
        url: "https://example.com/pricing",
        calledAt: new Date("2026-04-01T10:00:00.000Z"),
        pageId: "page_pricing",
        page: { type: "pricing", label: "Pricing", url: "https://example.com/pricing" }
      },
      {
        id: "2",
        status: "fallback",
        endpoint: "automate",
        effort: null,
        geoTarget: null,
        missingFields: [],
        fallbackTriggered: true,
        contentBlocked: true,
        rawError: "captcha blocked",
        url: "https://example.com/pricing",
        calledAt: new Date("2026-04-02T10:00:00.000Z"),
        pageId: "page_pricing",
        page: { type: "pricing", label: "Pricing", url: "https://example.com/pricing" }
      },
      {
        id: "3",
        status: "error",
        endpoint: "extract/json",
        effort: "low",
        geoTarget: null,
        missingFields: ["followers", "platform"],
        fallbackTriggered: false,
        contentBlocked: false,
        rawError: "network timeout",
        url: "https://social.example.com",
        calledAt: new Date("2026-04-02T12:00:00.000Z"),
        pageId: "page_social",
        page: { type: "social", label: "Social", url: "https://social.example.com" }
      },
      {
        id: "4",
        status: "error",
        endpoint: "extract/json",
        effort: "low",
        geoTarget: null,
        missingFields: ["followers"],
        fallbackTriggered: false,
        contentBlocked: false,
        rawError: "network timeout",
        url: "https://social.example.com",
        calledAt: new Date("2026-04-03T09:00:00.000Z"),
        pageId: "page_social",
        page: { type: "social", label: "Social", url: "https://social.example.com" }
      }
    ]);
  });

  it("computes the full insights bundle from api logs", async () => {
    const { getApiInsights } = await import("@/lib/db/api-logs");
    const result = await getApiInsights();

    expect(result.successRate).toEqual({
      totalCalls: 4,
      successCalls: 1,
      successRate: 0.25
    });

    expect(result.missingFields[0]).toEqual({
      pageType: "social",
      field: "followers",
      missingCount: 2
    });

    expect(result.fallbackFrequency[0]).toEqual(
      expect.objectContaining({
        pageId: "page_pricing",
        fallbackCount: 1,
        totalCalls: 2,
        fallbackRate: 0.5
      })
    );

    expect(result.effortDistribution).toEqual([
      { effort: "low", count: 2 },
      { effort: "high", count: 1 },
      { effort: "unknown", count: 1 }
    ]);

    expect(result.geoTargetComparisons).toContainEqual({
      segment: "geo_targeted",
      totalCalls: 1,
      successCalls: 1,
      successRate: 1
    });
    expect(result.geoTargetComparisons).toContainEqual({
      segment: "default",
      totalCalls: 3,
      successCalls: 0,
      successRate: 0
    });

    expect(result.blockedByDomain).toEqual([{ domain: "example.com", blockedCount: 1 }]);

    expect(result.topErrors[0]).toEqual({
      error: "network timeout",
      count: 2,
      timeline: [
        { day: "2026-04-02", count: 1 },
        { day: "2026-04-03", count: 1 }
      ]
    });
  });

  it("passes where filters into apiLog.findMany", async () => {
    const { getApiSuccessRate } = await import("@/lib/db/api-logs");

    await getApiSuccessRate({
      endpoint: "extract/json",
      competitorId: "cmp_1",
      dateFrom: new Date("2026-04-01T00:00:00.000Z"),
      dateTo: new Date("2026-04-30T23:59:59.000Z")
    });

    expect(apiLogFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          endpoint: "extract/json",
          competitorId: "cmp_1",
          calledAt: {
            gte: new Date("2026-04-01T00:00:00.000Z"),
            lte: new Date("2026-04-30T23:59:59.000Z")
          }
        }),
        take: 10_000
      })
    );
  });

  it("handles missing field names containing :: safely", async () => {
    apiLogFindManyMock.mockResolvedValueOnce([
      {
        id: "a",
        status: "success",
        endpoint: "extract/json",
        effort: "low",
        geoTarget: null,
        missingFields: ["features::beta"],
        fallbackTriggered: false,
        contentBlocked: false,
        rawError: null,
        url: "https://example.com",
        calledAt: new Date("2026-04-01T00:00:00.000Z"),
        pageId: "page_1",
        page: { type: "docs::api", label: "Docs", url: "https://example.com/docs" }
      }
    ]);

    const { getMissingFieldsByPageType } = await import("@/lib/db/api-logs");
    const rows = await getMissingFieldsByPageType();
    expect(rows[0]).toEqual({
      pageType: "docs::api",
      field: "features::beta",
      missingCount: 1
    });
  });

  it("returns geo-target segment when all calls are geo-targeted", async () => {
    apiLogFindManyMock.mockResolvedValueOnce([
      {
        id: "geo-only",
        status: "success",
        endpoint: "extract/json",
        effort: "low",
        geoTarget: "US",
        missingFields: [],
        fallbackTriggered: false,
        contentBlocked: false,
        rawError: null,
        url: "https://example.com",
        calledAt: new Date("2026-04-01T00:00:00.000Z"),
        pageId: "page_1",
        page: { type: "pricing", label: "Pricing", url: "https://example.com/pricing" }
      }
    ]);

    const { getGeoTargetComparisons } = await import("@/lib/db/api-logs");
    const rows = await getGeoTargetComparisons();
    expect(rows).toContainEqual({
      segment: "geo_targeted",
      totalCalls: 1,
      successCalls: 1,
      successRate: 1
    });
    expect(rows).toContainEqual({
      segment: "default",
      totalCalls: 0,
      successCalls: 0,
      successRate: 0
    });
  });

  it("returns default segment when no calls are geo-targeted", async () => {
    apiLogFindManyMock.mockResolvedValueOnce([
      {
        id: "default-only",
        status: "error",
        endpoint: "extract/json",
        effort: "low",
        geoTarget: null,
        missingFields: [],
        fallbackTriggered: false,
        contentBlocked: false,
        rawError: "timeout",
        url: "https://example.com",
        calledAt: new Date("2026-04-01T00:00:00.000Z"),
        pageId: "page_1",
        page: { type: "pricing", label: "Pricing", url: "https://example.com/pricing" }
      }
    ]);

    const { getGeoTargetComparisons } = await import("@/lib/db/api-logs");
    const rows = await getGeoTargetComparisons();
    expect(rows).toContainEqual({
      segment: "geo_targeted",
      totalCalls: 0,
      successCalls: 0,
      successRate: 0
    });
    expect(rows).toContainEqual({
      segment: "default",
      totalCalls: 1,
      successCalls: 0,
      successRate: 0
    });
  });
});
