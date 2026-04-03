import { beforeEach, describe, expect, it, vi } from "vitest";

const apiLogCreateMock = vi.fn().mockResolvedValue({});

vi.mock("@/lib/db/client", () => ({
  prisma: { apiLog: { create: apiLogCreateMock } }
}));

const generateJsonMock = vi.fn();

vi.mock("@tabstack/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    generate: { json: generateJsonMock }
  }))
}));

describe("generateDiff", () => {
  beforeEach(() => {
    vi.resetModules();
    apiLogCreateMock.mockClear();
    generateJsonMock.mockClear();
    process.env.TABSTACK_API_KEY = "test-key";
  });

  it("returns result and logs with endpoint 'generate'", async () => {
    const { generateDiff } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockResolvedValue({ added: ["new feature"], changed: [], removed: [], summary: "Added a thing" });

    const result = await generateDiff({
      url: "https://example.com/changelog",
      previousContent: "old content",
      effort: "low",
      nocache: true
    });

    expect(result).toEqual({ added: ["new feature"], changed: [], removed: [], summary: "Added a thing" });
    expect(generateJsonMock).toHaveBeenCalledOnce();

    const sdkCall = generateJsonMock.mock.calls[0][0];
    expect(sdkCall.url).toBe("https://example.com/changelog");
    expect(sdkCall.nocache).toBe(true);
    expect(sdkCall.effort).toBe("standard"); // "low" maps to "standard"
    expect(sdkCall.instructions).toContain("old content");
    expect(sdkCall.instructions).toContain("Compare these two versions");
  });

  it("injects previousContent into instructions", async () => {
    const { generateDiff } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockResolvedValue({ added: [], changed: [], removed: [], summary: "No changes" });

    await generateDiff({
      url: "https://example.com/changelog",
      previousContent: "SPECIFIC_PREVIOUS_DATA_MARKER",
      effort: "high",
      nocache: true
    });

    const sdkCall = generateJsonMock.mock.calls[0][0];
    expect(sdkCall.instructions).toContain("SPECIFIC_PREVIOUS_DATA_MARKER");
    expect(sdkCall.effort).toBe("max"); // "high" maps to "max"
  });

  it("logs correct expectedFields for quality scoring", async () => {
    const { generateDiff } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockResolvedValue({ added: [], changed: [], removed: [], summary: "" });

    await generateDiff({ url: "https://example.com", previousContent: "prev", effort: "low", nocache: false });

    expect(apiLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          endpoint: "generate",
          missingFields: expect.any(Array)
        })
      })
    );
  });

  it("propagates errors and logs status 'error'", async () => {
    const { generateDiff } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockRejectedValue(new Error("API failure"));

    await expect(
      generateDiff({ url: "https://example.com", previousContent: "prev", effort: "low", nocache: true })
    ).rejects.toThrow("API failure");

    expect(apiLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "error", rawError: "Error: API failure" })
      })
    );
  });

  it("passes competitorId and pageId to logger", async () => {
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

    expect(apiLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ competitorId: "comp-123", pageId: "page-456" })
      })
    );
  });
});

describe("generateBrief", () => {
  beforeEach(() => {
    vi.resetModules();
    apiLogCreateMock.mockClear();
    generateJsonMock.mockClear();
    process.env.TABSTACK_API_KEY = "test-key";
  });

  it("returns result and logs with endpoint 'generate'", async () => {
    const { generateBrief } = await import("@/lib/tabstack/generate");
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
    const sdkCall = generateJsonMock.mock.calls[0][0];
    expect(sdkCall.url).toBe("https://competitor.com");
    expect(sdkCall.effort).toBe("max");
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
  });

  it("uses BRIEF_EXPECTED_FIELDS for quality scoring", async () => {
    const { generateBrief, BRIEF_EXPECTED_FIELDS } = await import("@/lib/tabstack/generate");
    generateJsonMock.mockResolvedValue({});

    await generateBrief({ url: "https://example.com", contextData: "data", effort: "low", nocache: true });

    expect(apiLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          missingFields: expect.arrayContaining(BRIEF_EXPECTED_FIELDS)
        })
      })
    );
  });

  it("passes geo_target through when provided", async () => {
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
  });
});

describe("schema exports", () => {
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
