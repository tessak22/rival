import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  scanFindFirstMock,
  scanCreateMock,
  extractJsonMock,
  extractMarkdownMock,
  automateExtractMock,
  generateDiffMock
} = vi.hoisted(() => ({
  scanFindFirstMock: vi.fn(),
  scanCreateMock: vi.fn(),
  extractJsonMock: vi.fn(),
  extractMarkdownMock: vi.fn(),
  automateExtractMock: vi.fn(),
  generateDiffMock: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    scan: {
      findFirst: scanFindFirstMock,
      create: scanCreateMock
    }
  }
}));

vi.mock("@/lib/tabstack/extract-json", () => ({
  extractJson: extractJsonMock
}));

vi.mock("@/lib/tabstack/extract-markdown", () => ({
  extractMarkdown: extractMarkdownMock
}));

vi.mock("@/lib/tabstack/automate", () => ({
  automateExtract: automateExtractMock
}));

vi.mock("@/lib/tabstack/generate", () => ({
  generateDiff: generateDiffMock
}));

describe("scanPage", () => {
  beforeEach(() => {
    vi.resetModules();
    scanFindFirstMock.mockReset();
    scanCreateMock.mockReset();
    extractJsonMock.mockReset();
    extractMarkdownMock.mockReset();
    automateExtractMock.mockReset();
    generateDiffMock.mockReset();

    scanFindFirstMock.mockResolvedValue(null);
    scanCreateMock.mockResolvedValue({ id: "scan_1" });
    extractJsonMock.mockResolvedValue({ data: { tiers: [{ name: "Pro" }], has_free_tier: false } });
    extractMarkdownMock.mockResolvedValue({ content: "## Updates", url: "https://example.com/changelog" });
    automateExtractMock.mockResolvedValue({ result: { tiers: [{ name: "Fallback" }] }, events: [] });
    generateDiffMock.mockResolvedValue({ data: { added: [], changed: [], removed: [], summary: "" } });
  });

  it("routes pricing pages to extract/json with high effort and nocache true", async () => {
    const { scanPage } = await import("@/lib/scanner");

    await scanPage({
      competitorId: "cmp_1",
      pageId: "page_1",
      url: "https://example.com/pricing",
      type: "pricing",
      geoTarget: "US"
    });

    expect(extractJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        competitorId: "cmp_1",
        pageId: "page_1",
        url: "https://example.com/pricing",
        effort: "high",
        nocache: true,
        geoTarget: "US"
      })
    );
    expect(scanCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          endpointUsed: "extract/json",
          hasChanges: false
        })
      })
    );
    expect(automateExtractMock).not.toHaveBeenCalled();
  });

  it("falls back to automate for pricing when extract/json is empty", async () => {
    extractJsonMock.mockResolvedValueOnce({ data: {} });
    const { scanPage } = await import("@/lib/scanner");

    const result = await scanPage({
      competitorId: "cmp_1",
      pageId: "page_1",
      url: "https://example.com/pricing",
      type: "pricing"
    });

    expect(automateExtractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fallback: {
          triggered: true,
          reason: "extract/json returned empty result",
          endpoint: "automate"
        }
      })
    );
    expect(result.endpointUsed).toBe("automate");
    expect(result.usedFallback).toBe(true);
    expect(scanCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          endpointUsed: "automate"
        })
      })
    );
  });

  it("routes changelog pages to markdown and generates diff when previous scan exists", async () => {
    scanFindFirstMock.mockResolvedValueOnce({
      id: "scan_prev",
      markdownResult: "## Old updates",
      rawResult: { old: true }
    });
    generateDiffMock.mockResolvedValueOnce({
      data: {
        added: ["New feature"],
        changed: [],
        removed: [],
        summary: "Added new feature"
      }
    });

    const { scanPage } = await import("@/lib/scanner");

    const result = await scanPage({
      competitorId: "cmp_1",
      pageId: "page_1",
      url: "https://example.com/changelog",
      type: "changelog",
      geoTarget: "CA"
    });

    expect(extractMarkdownMock).toHaveBeenCalledWith(
      expect.objectContaining({
        effort: "low",
        nocache: true,
        geoTarget: "CA"
      })
    );
    expect(generateDiffMock).toHaveBeenCalledWith(
      expect.objectContaining({
        competitorId: "cmp_1",
        pageId: "page_1",
        effort: "low",
        nocache: true
      })
    );
    expect(result.hasChanges).toBe(true);
    expect(result.diffSummary).toBe("Added new feature");
    expect(scanCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          hasChanges: true,
          diffSummary: "Added new feature"
        })
      })
    );
  });

  it("uses automate for custom page type without JSON extraction", async () => {
    const { scanPage } = await import("@/lib/scanner");

    await scanPage({
      pageId: "page_custom",
      url: "https://example.com/app",
      type: "custom",
      customTask: "Extract pricing cards behind tabs"
    });

    expect(automateExtractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "Extract pricing cards behind tabs"
      })
    );
    expect(extractJsonMock).not.toHaveBeenCalled();
    expect(extractMarkdownMock).not.toHaveBeenCalled();
  });

  it("skips scan persistence in demo mode", async () => {
    const { scanPage } = await import("@/lib/scanner");

    const result = await scanPage({
      pageId: "page_demo",
      url: "https://example.com/pricing",
      type: "pricing",
      isDemo: true
    });

    expect(scanCreateMock).not.toHaveBeenCalled();
    expect(result.scanId).toBeNull();
  });

  it("falls back to automate when extract/json returns an ambiguous envelope", async () => {
    extractJsonMock.mockResolvedValueOnce({
      data: { tiers: [{ name: "Pro" }] },
      result: { tiers: [{ name: "Starter" }] }
    });
    const { scanPage } = await import("@/lib/scanner");

    const result = await scanPage({
      pageId: "page_1",
      url: "https://example.com/pricing",
      type: "pricing"
    });

    expect(result.endpointUsed).toBe("automate");
    expect(result.usedFallback).toBe(true);
    expect(automateExtractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fallback: {
          triggered: true,
          reason: "extract/json failed",
          endpoint: "automate"
        }
      })
    );
  });

  it("does not recurse indefinitely when checking deeply nested payloads", async () => {
    const nested: Record<string, unknown> = {};
    let cursor: Record<string, unknown> = nested;
    for (let index = 0; index < 30; index += 1) {
      cursor["next"] = {};
      cursor = cursor["next"] as Record<string, unknown>;
    }
    cursor["leaf"] = "";

    extractJsonMock.mockResolvedValueOnce({ data: nested });
    const { scanPage } = await import("@/lib/scanner");

    const result = await scanPage({
      pageId: "page_1",
      url: "https://example.com/pricing",
      type: "pricing"
    });

    expect(result.endpointUsed).toBe("extract/json");
    expect(result.usedFallback).toBe(false);
    expect(automateExtractMock).not.toHaveBeenCalled();
  });
});
