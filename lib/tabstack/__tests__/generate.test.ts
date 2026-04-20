import { beforeEach, describe, expect, it, vi } from "vitest";

// All mock functions defined in vi.hoisted so they are initialized before
// vi.mock() factories run (vi.mock calls are hoisted above const declarations).
const { generateJsonMock, loggerCallMock, getTabstackClientMock, toSdkEffortMock, toGeoTargetMock } = vi.hoisted(
  () => ({
    generateJsonMock: vi.fn(),
    loggerCallMock: vi.fn(async (fn: () => Promise<unknown>, _meta?: unknown) => fn()),
    getTabstackClientMock: vi.fn(),
    toSdkEffortMock: vi.fn(),
    toGeoTargetMock: vi.fn()
  })
);

// Mock at the tabstack client wrapper boundary — not the raw @tabstack/sdk.
// Real toSdkEffort and toGeoTarget behaviour is validated via the mocks below,
// which are configured per test in beforeEach.
vi.mock("@/lib/tabstack/client", () => ({
  getTabstackClient: getTabstackClientMock,
  toSdkEffort: toSdkEffortMock,
  toGeoTarget: toGeoTargetMock
}));

// Mock at the logger boundary — not the raw @/lib/db/client.
// loggerCallMock is a pass-through: it runs the SDK callback and returns the
// result, so both SDK params and logger metadata can be asserted.
vi.mock("@/lib/logger", () => ({
  logger: { call: loggerCallMock }
}));

describe("generateDiff", () => {
  beforeEach(() => {
    vi.resetModules();
    loggerCallMock.mockClear();
    generateJsonMock.mockClear();
    process.env.TABSTACK_API_KEY = "test-key";
    // Pass-through: run the SDK callback so both SDK params and metadata are assertable.
    loggerCallMock.mockImplementation((fn: () => Promise<unknown>) => fn());
    // Configure real-world effort mapping (mirrors toSdkEffort in client.ts).
    toSdkEffortMock.mockImplementation((effort: string) => (effort === "high" ? "max" : "standard"));
    // Configure real-world geo mapping (mirrors toGeoTarget in client.ts).
    toGeoTargetMock.mockImplementation((code?: string | null) => {
      if (!code) return undefined;
      const n = code.trim().toUpperCase();
      return /^[A-Z]{2}$/.test(n) ? { country: n } : undefined;
    });
    getTabstackClientMock.mockReturnValue({ generate: { json: generateJsonMock } });
  });

  it("returns SDK result and calls logger with correct metadata", async () => {
    const { generateDiff, DIFF_EXPECTED_FIELDS } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockResolvedValue({ added: ["new feature"], changed: [], removed: [], summary: "Added a thing" });

    const result = await generateDiff({
      url: "https://example.com/changelog",
      previousContent: "old content",
      effort: "low",
      nocache: true
    });

    expect(result).toEqual({ added: ["new feature"], changed: [], removed: [], summary: "Added a thing" });
    expect(loggerCallMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        endpoint: "generate",
        url: "https://example.com/changelog",
        effort: "low",
        nocache: true,
        expectedFields: DIFF_EXPECTED_FIELDS
      })
    );
  });

  it("passes effort-mapped params and instructions to SDK", async () => {
    const { generateDiff } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockResolvedValue({ added: [], changed: [], removed: [], summary: "" });

    await generateDiff({
      url: "https://example.com/changelog",
      previousContent: "old content",
      effort: "low",
      nocache: true
    });

    const sdkCall = generateJsonMock.mock.calls[0][0];
    expect(sdkCall.url).toBe("https://example.com/changelog");
    expect(sdkCall.nocache).toBe(true);
    expect(sdkCall.effort).toBe("standard"); // toSdkEffortMock: "low" → "standard"
    expect(sdkCall.instructions).toContain("old content");
    expect(sdkCall.instructions).toContain("Compare these two versions");
  });

  it("uses the two-version prompt when currentContent is provided (even if empty)", async () => {
    const { generateDiff } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockResolvedValue({ added: [], changed: [], removed: [], summary: "" });

    await generateDiff({
      url: "https://example.com/changelog",
      previousContent: "PREV_MARKER",
      currentContent: "",
      effort: "low",
      nocache: true
    });

    const sdkCall = generateJsonMock.mock.calls[0][0];
    // Empty string is an authoritative "everything removed" snapshot, not a
    // signal to fall back to the single-version prompt. The instructions
    // should be the two-version comparator with an empty current section.
    expect(sdkCall.instructions).toContain("Compare the two versions");
    expect(sdkCall.instructions).toContain("PREV_MARKER");
    expect(sdkCall.instructions).toContain("Current version:");
    expect(sdkCall.instructions).not.toContain("Compare these two versions of a competitor page.\nList");
  });

  it("passes both previousContent and currentContent into the two-version prompt", async () => {
    const { generateDiff } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockResolvedValue({ added: [], changed: [], removed: [], summary: "" });

    await generateDiff({
      url: "https://example.com/changelog",
      previousContent: "PREV_MARKER",
      currentContent: "CURR_MARKER",
      effort: "low",
      nocache: true
    });

    const sdkCall = generateJsonMock.mock.calls[0][0];
    expect(sdkCall.instructions).toContain("Compare the two versions");
    expect(sdkCall.instructions).toContain("PREV_MARKER");
    expect(sdkCall.instructions).toContain("CURR_MARKER");
  });

  it("injects previousContent into instructions and maps high effort", async () => {
    const { generateDiff } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockResolvedValue({ added: [], changed: [], removed: [], summary: "" });

    await generateDiff({
      url: "https://example.com/changelog",
      previousContent: "SPECIFIC_PREVIOUS_DATA_MARKER",
      effort: "high",
      nocache: true
    });

    const sdkCall = generateJsonMock.mock.calls[0][0];
    expect(sdkCall.instructions).toContain("SPECIFIC_PREVIOUS_DATA_MARKER");
    expect(sdkCall.effort).toBe("max"); // toSdkEffortMock: "high" → "max"
  });

  it("passes expectedFields derived from DIFF_SCHEMA.required to logger", async () => {
    const { generateDiff, DIFF_EXPECTED_FIELDS } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockResolvedValue({ added: [], changed: [], removed: [], summary: "" });

    await generateDiff({ url: "https://example.com", previousContent: "prev", effort: "low", nocache: false });

    const [, metadata] = loggerCallMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(metadata.expectedFields).toEqual(DIFF_EXPECTED_FIELDS);
  });

  it("propagates SDK errors", async () => {
    const { generateDiff } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockRejectedValue(new Error("API failure"));

    await expect(
      generateDiff({ url: "https://example.com", previousContent: "prev", effort: "low", nocache: true })
    ).rejects.toThrow("API failure");
  });

  it("passes competitorId and pageId to logger metadata", async () => {
    const { generateDiff } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockResolvedValue({ added: [], changed: [], removed: [], summary: "" });

    await generateDiff({
      url: "https://example.com",
      previousContent: "prev",
      effort: "low",
      nocache: true,
      competitorId: "comp-123",
      pageId: "page-456"
    });

    expect(loggerCallMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ competitorId: "comp-123", pageId: "page-456" })
    );
  });

  it("passes geo_target through to SDK and logger", async () => {
    const { generateDiff } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockResolvedValue({ added: [], changed: [], removed: [], summary: "" });

    await generateDiff({
      url: "https://example.com",
      previousContent: "prev",
      effort: "low",
      nocache: true,
      geoTarget: "US"
    });

    const sdkCall = generateJsonMock.mock.calls[0][0];
    expect(sdkCall.geo_target).toEqual({ country: "US" });
    expect(loggerCallMock).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ geoTarget: "US" }));
  });

  it("truncates previousContent exceeding MAX_CONTEXT_LENGTH and warns", async () => {
    const { generateDiff } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockResolvedValue({ added: [], changed: [], removed: [], summary: "" });
    const warnSpy = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
    const oversized = "x".repeat(50_001);

    await generateDiff({ url: "https://example.com", previousContent: oversized, effort: "low", nocache: true });

    const sdkCall = generateJsonMock.mock.calls[0][0];
    expect(sdkCall.instructions).not.toContain(oversized); // full oversized string not present
    expect(sdkCall.instructions).toContain("x".repeat(50_000)); // truncated portion is present
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("truncated"),
      expect.objectContaining({ code: "RIVAL_CONTEXT_TRUNCATED" })
    );
    warnSpy.mockRestore();
  });
});

describe("generateBrief", () => {
  beforeEach(() => {
    vi.resetModules();
    loggerCallMock.mockClear();
    generateJsonMock.mockClear();
    process.env.TABSTACK_API_KEY = "test-key";
    loggerCallMock.mockImplementation((fn: () => Promise<unknown>) => fn());
    toSdkEffortMock.mockImplementation((effort: string) => (effort === "high" ? "max" : "standard"));
    toGeoTargetMock.mockImplementation((code?: string | null) => {
      if (!code) return undefined;
      const n = code.trim().toUpperCase();
      return /^[A-Z]{2}$/.test(n) ? { country: n } : undefined;
    });
    getTabstackClientMock.mockReturnValue({ generate: { json: generateJsonMock } });
  });

  it("returns SDK result and calls logger with correct metadata", async () => {
    const { generateBrief, BRIEF_EXPECTED_FIELDS } = await import("@/lib/tabstack/generate");
    const mockBrief = {
      positioning_opportunity: "Fill the docs gap",
      content_opportunity: "Write TypeScript guides",
      product_opportunity: "Better SDK ergonomics",
      threat_level: "Medium",
      threat_reasoning: "Growing but behind on DX",
      watch_list: ["pricing change", "new SDK release"]
    };
    generateJsonMock.mockResolvedValue(mockBrief);

    const result = await generateBrief({
      url: "https://competitor.com",
      contextData: '{"pricing": "contact us"}',
      effort: "high",
      nocache: true
    });

    expect(result).toEqual(mockBrief);
    expect(loggerCallMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        endpoint: "generate",
        url: "https://competitor.com",
        effort: "high",
        nocache: true,
        expectedFields: BRIEF_EXPECTED_FIELDS
      })
    );
  });

  it("injects contextData into instructions", async () => {
    const { generateBrief } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockResolvedValue({});

    await generateBrief({
      url: "https://competitor.com",
      contextData: "UNIQUE_CONTEXT_MARKER",
      effort: "low",
      nocache: false
    });

    const sdkCall = generateJsonMock.mock.calls[0][0];
    expect(sdkCall.instructions).toContain("UNIQUE_CONTEXT_MARKER");
    expect(sdkCall.instructions).toContain("competitive intelligence analyst");
    expect(sdkCall.effort).toBe("standard"); // toSdkEffortMock: "low" → "standard"
  });

  it("propagates SDK errors", async () => {
    const { generateBrief } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockRejectedValue(new Error("Brief API failure"));

    await expect(
      generateBrief({ url: "https://example.com", contextData: "data", effort: "low", nocache: true })
    ).rejects.toThrow("Brief API failure");
  });

  it("passes BRIEF_EXPECTED_FIELDS to logger metadata", async () => {
    const { generateBrief, BRIEF_EXPECTED_FIELDS } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockResolvedValue({});

    await generateBrief({ url: "https://example.com", contextData: "data", effort: "low", nocache: true });

    const [, metadata] = loggerCallMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(metadata.expectedFields).toEqual(BRIEF_EXPECTED_FIELDS);
  });

  it("passes competitorId and pageId to logger metadata", async () => {
    const { generateBrief } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockResolvedValue({});

    await generateBrief({
      url: "https://competitor.com",
      contextData: "data",
      effort: "low",
      nocache: true,
      competitorId: "comp-abc",
      pageId: "page-xyz"
    });

    expect(loggerCallMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ competitorId: "comp-abc", pageId: "page-xyz" })
    );
  });

  it("passes geo_target through to SDK and logger", async () => {
    const { generateBrief } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockResolvedValue({});

    await generateBrief({
      url: "https://example.com",
      contextData: "data",
      effort: "low",
      nocache: true,
      geoTarget: "GB"
    });

    const sdkCall = generateJsonMock.mock.calls[0][0];
    expect(sdkCall.geo_target).toEqual({ country: "GB" });
    expect(loggerCallMock).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ geoTarget: "GB" }));
  });

  it("truncates contextData exceeding MAX_CONTEXT_LENGTH and warns", async () => {
    const { generateBrief } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockResolvedValue({});
    const warnSpy = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
    const oversized = "y".repeat(50_001);

    await generateBrief({ url: "https://example.com", contextData: oversized, effort: "low", nocache: true });

    const sdkCall = generateJsonMock.mock.calls[0][0];
    expect(sdkCall.instructions).not.toContain(oversized); // full oversized string not present
    expect(sdkCall.instructions).toContain("y".repeat(50_000)); // truncated portion is present
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("truncated"),
      expect.objectContaining({ code: "RIVAL_CONTEXT_TRUNCATED" })
    );
    warnSpy.mockRestore();
  });
});

describe("schema exports", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("DIFF_SCHEMA has required fields", async () => {
    const { DIFF_SCHEMA } = await import("@/lib/tabstack/generate");
    expect(DIFF_SCHEMA.type).toBe("object");
    expect(DIFF_SCHEMA.required).toContain("added");
    expect(DIFF_SCHEMA.required).toContain("changed");
    expect(DIFF_SCHEMA.required).toContain("removed");
    expect(DIFF_SCHEMA.required).toContain("summary");
  });

  it("BRIEF_SCHEMA has required fields", async () => {
    const { BRIEF_SCHEMA } = await import("@/lib/tabstack/generate");
    expect(BRIEF_SCHEMA.type).toBe("object");
    expect(BRIEF_SCHEMA.required).toContain("threat_level");
    expect(BRIEF_SCHEMA.required).toContain("watch_list");
    expect(BRIEF_SCHEMA.required).toContain("positioning_opportunity");
  });
});
