import { beforeEach, describe, expect, it, vi } from "vitest";

const { competitorFindFirstMock } = vi.hoisted(() => ({
  competitorFindFirstMock: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    competitor: {
      findFirst: competitorFindFirstMock
    }
  }
}));

describe("buildSelfContext", () => {
  beforeEach(() => {
    vi.resetModules();
    competitorFindFirstMock.mockReset();
  });

  it("returns null when no self row exists", async () => {
    competitorFindFirstMock.mockResolvedValue(null);
    const { buildSelfContext } = await import("@/lib/context/self-context");
    const result = await buildSelfContext();
    expect(result).toBeNull();
  });

  it("returns null when self row has no intelligenceBrief", async () => {
    competitorFindFirstMock.mockResolvedValue({
      id: "self_1",
      name: "Rival",
      isSelf: true,
      intelligenceBrief: null,
      manualData: null
    });
    const { buildSelfContext } = await import("@/lib/context/self-context");
    const result = await buildSelfContext();
    expect(result).toBeNull();
  });

  it("returns a compact context string when brief is present", async () => {
    competitorFindFirstMock.mockResolvedValue({
      id: "self_1",
      name: "Rival",
      isSelf: true,
      intelligenceBrief: {
        positioning_summary: "CI tool for devs",
        icp_summary: "Developers tracking competitors",
        pricing_summary: "Open source, self-hosted",
        differentiators: ["Powered by Tabstack", "Open source"],
        recent_signals: ["Added self-profile"]
      },
      manualData: null
    });
    const { buildSelfContext } = await import("@/lib/context/self-context");
    const result = await buildSelfContext();
    expect(result).not.toBeNull();
    expect(result).toContain("Rival");
    expect(result).toContain("CI tool for devs");
    expect(result).toContain("Powered by Tabstack");
    expect(result?.length ?? 0).toBeLessThanOrEqual(1200); // 800 payload cap + framing overhead
  });

  it("lets manual_data override brief fields", async () => {
    competitorFindFirstMock.mockResolvedValue({
      id: "self_1",
      name: "Rival",
      isSelf: true,
      intelligenceBrief: {
        positioning_summary: "OLD positioning",
        icp_summary: "Devs",
        pricing_summary: "Free",
        differentiators: [],
        recent_signals: []
      },
      manualData: { positioning_summary: "NEW positioning" }
    });
    const { buildSelfContext } = await import("@/lib/context/self-context");
    const result = await buildSelfContext();
    expect(result).toContain("NEW positioning");
    expect(result).not.toContain("OLD positioning");
  });

  it("surfaces extra manual_data keys as a User notes section", async () => {
    competitorFindFirstMock.mockResolvedValue({
      id: "self_1",
      name: "Rival",
      isSelf: true,
      intelligenceBrief: {
        positioning_summary: "x",
        icp_summary: "x",
        pricing_summary: "x",
        differentiators: [],
        recent_signals: []
      },
      manualData: { extra_fact: "signed Acme deal" }
    });
    const { buildSelfContext } = await import("@/lib/context/self-context");
    const result = await buildSelfContext();
    expect(result).toContain("User notes");
    expect(result).toContain("signed Acme deal");
  });

  it("returns null when isDemo is true even with a full self row", async () => {
    competitorFindFirstMock.mockResolvedValue({
      id: "self_1",
      name: "Rival",
      isSelf: true,
      intelligenceBrief: {
        positioning_summary: "x",
        icp_summary: "x",
        pricing_summary: "x",
        differentiators: [],
        recent_signals: []
      },
      manualData: null
    });
    const { buildSelfContext } = await import("@/lib/context/self-context");
    const result = await buildSelfContext({ isDemo: true });
    expect(result).toBeNull();
    // Demo path must short-circuit before the DB query; prevents a future
    // refactor from leaking demo loads through the self lookup.
    expect(competitorFindFirstMock).not.toHaveBeenCalled();
  });

  it("filters non-string array elements out of differentiators and recent_signals", async () => {
    competitorFindFirstMock.mockResolvedValue({
      id: "self_1",
      name: "Rival",
      isSelf: true,
      intelligenceBrief: {
        positioning_summary: "x",
        icp_summary: "x",
        pricing_summary: "x",
        differentiators: ["valid", { object: "noise" }, 42, "", "also valid"],
        recent_signals: [null, "signal", undefined]
      },
      manualData: null
    });
    const { buildSelfContext } = await import("@/lib/context/self-context");
    const result = await buildSelfContext();
    expect(result).toContain("valid; also valid");
    expect(result).toContain("signal");
    expect(result).not.toContain("[object Object]");
    expect(result).not.toContain("42");
  });
});
