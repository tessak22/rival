import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { competitor: { findUnique: vi.fn() } }
}));
vi.mock("../../db.js", () => ({ prisma: mockPrisma }));

import { getCompetitor } from "../get-competitor.js";

const makePage = (overrides: {
  type?: string;
  label?: string;
  url?: string;
  geoTarget?: string | null;
  scans?: unknown[];
}) => ({
  id: "page-uuid",
  type: overrides.type ?? "pricing",
  label: overrides.label ?? "Pricing",
  url: overrides.url ?? "https://acme.com/pricing",
  geoTarget: overrides.geoTarget ?? null,
  scans: overrides.scans ?? []
});

const makeCompetitor = (overrides: {
  slug?: string;
  name?: string;
  isSelf?: boolean;
  threatLevel?: string | null;
  manualData?: Record<string, unknown> | null;
  pages?: ReturnType<typeof makePage>[];
  apiLogs?: unknown[];
}) => ({
  id: "comp-uuid",
  name: overrides.name ?? "Acme",
  slug: overrides.slug ?? "acme",
  baseUrl: "https://acme.com",
  threatLevel: overrides.threatLevel ?? "High",
  isSelf: overrides.isSelf ?? false,
  manualData: overrides.manualData ?? null,
  pages: overrides.pages ?? [],
  apiLogs: overrides.apiLogs ?? []
});

describe("getCompetitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns competitor_not_found when no record exists", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(null);
    const result = await getCompetitor("missing-slug");
    expect(result).toEqual({ error: "competitor_not_found", slug: "missing-slug" });
  });

  it("returns competitor_not_found for isSelf competitors", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(makeCompetitor({ isSelf: true }));
    const result = await getCompetitor("acme");
    expect(result).toMatchObject({ error: "competitor_not_found" });
  });

  it("returns full competitor shape", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(makeCompetitor({}));
    const result = await getCompetitor("acme");
    expect(result).toMatchObject({
      name: "Acme",
      slug: "acme",
      base_url: "https://acme.com",
      threat_tier: "high"
    });
  });

  it("returns manual_data fields from manualData JSON", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(
      makeCompetitor({
        manualData: {
          founded: 2015,
          employee_count: 200,
          total_funding: "$50M",
          g2_rating: 4.5,
          g2_review_count: 120,
          praise_themes: ["easy onboarding"],
          complaint_themes: ["limited docs"],
          dev_pain_points: ["no webhooks"]
        }
      })
    );
    const result = await getCompetitor("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.manual_data.founded).toBe(2015);
    expect(result.manual_data.employee_count).toBe(200);
    expect(result.manual_data.total_funding).toBe("$50M");
    expect(result.manual_data.g2_rating).toBe(4.5);
    expect(result.manual_data.praise_themes).toEqual(["easy onboarding"]);
  });

  it("uses employees fallback for employee_count", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(
      makeCompetitor({ manualData: { employees: 500 } })
    );
    const result = await getCompetitor("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.manual_data.employee_count).toBe(500);
  });

  it("returns null manual_data fields when manualData is null", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(makeCompetitor({ manualData: null }));
    const result = await getCompetitor("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.manual_data.founded).toBeNull();
    expect(result.manual_data.praise_themes).toEqual([]);
  });

  it("returns tracked_pages with correct shape", async () => {
    const scanDate = new Date("2025-03-01T00:00:00Z");
    mockPrisma.competitor.findUnique.mockResolvedValue(
      makeCompetitor({
        pages: [
          makePage({
            type: "pricing",
            label: "Pricing",
            url: "https://acme.com/pricing",
            scans: [{ scannedAt: scanDate, hasChanges: false, diffSummary: null }]
          })
        ]
      })
    );
    const result = await getCompetitor("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.tracked_pages).toHaveLength(1);
    expect(result.tracked_pages[0]).toMatchObject({
      page_type: "pricing",
      label: "Pricing",
      url: "https://acme.com/pricing",
      last_checked_at: scanDate.toISOString()
    });
  });

  it("returns last_changed_at when scan hasChanges=true", async () => {
    const changeDate = new Date("2025-04-01T00:00:00Z");
    mockPrisma.competitor.findUnique.mockResolvedValue(
      makeCompetitor({
        pages: [
          makePage({
            scans: [{ scannedAt: changeDate, hasChanges: true, diffSummary: "Price went up" }]
          })
        ]
      })
    );
    const result = await getCompetitor("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.tracked_pages[0].last_changed_at).toBe(changeDate.toISOString());
    expect(result.tracked_pages[0].latest_summary).toBe("Price went up");
  });

  it("returns health_score 100 when all logs are full quality", async () => {
    mockPrisma.competitor.findUnique.mockResolvedValue(
      makeCompetitor({
        apiLogs: [
          { resultQuality: "full" },
          { resultQuality: "full" },
          { resultQuality: "full" }
        ]
      })
    );
    const result = await getCompetitor("acme");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.health_score).toBe(100);
  });
});
