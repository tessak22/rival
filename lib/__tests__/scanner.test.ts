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

  it("skips the diff LLM call when the current markdown matches the previous scan", async () => {
    scanFindFirstMock.mockResolvedValueOnce({
      id: "scan_prev",
      markdownResult: "## Updates\n\n- Shipped v2\n",
      rawResult: { content: "## Updates\n\n- Shipped v2\n" }
    });
    extractMarkdownMock.mockResolvedValueOnce({
      content: "## Updates\r\n\r\n- Shipped v2   \n",
      url: "https://example.com/changelog"
    });

    const { scanPage } = await import("@/lib/scanner");

    const result = await scanPage({
      competitorId: "cmp_1",
      pageId: "page_1",
      url: "https://example.com/changelog",
      type: "changelog"
    });

    expect(generateDiffMock).not.toHaveBeenCalled();
    expect(result.hasChanges).toBe(false);
    expect(result.diffSummary).toBeNull();
    expect(scanCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          hasChanges: false,
          diffSummary: null
        })
      })
    );
  });

  it("passes currentContent to the diff call when content genuinely differs", async () => {
    scanFindFirstMock.mockResolvedValueOnce({
      id: "scan_prev",
      markdownResult: "## Updates\n\n- Shipped v1",
      rawResult: { content: "## Updates\n\n- Shipped v1" }
    });
    extractMarkdownMock.mockResolvedValueOnce({
      content: "## Updates\n\n- Shipped v2",
      url: "https://example.com/changelog"
    });
    generateDiffMock.mockResolvedValueOnce({
      data: {
        added: ["Shipped v2"],
        changed: [],
        removed: ["Shipped v1"],
        summary: "Bumped shipped version"
      }
    });

    const { scanPage } = await import("@/lib/scanner");

    await scanPage({
      competitorId: "cmp_1",
      pageId: "page_1",
      url: "https://example.com/changelog",
      type: "changelog"
    });

    expect(generateDiffMock).toHaveBeenCalledWith(
      expect.objectContaining({
        previousContent: "## Updates\n\n- Shipped v1",
        currentContent: "## Updates\n\n- Shipped v2"
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

  it("falls back to automate for reviews when extract/json explicitly reports content_blocked", async () => {
    extractJsonMock.mockResolvedValueOnce({
      data: {
        content_blocked: true,
        platform: "G2"
      }
    });

    const { scanPage } = await import("@/lib/scanner");

    const result = await scanPage({
      pageId: "page_reviews",
      url: "https://www.g2.com/products/example/reviews",
      type: "reviews"
    });

    expect(result.endpointUsed).toBe("automate");
    expect(result.usedFallback).toBe(true);
    expect(automateExtractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fallback: {
          triggered: true,
          reason: "extract/json reported content_blocked",
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

  it("uses effortOverride when provided, ignoring the per-type routing effort", async () => {
    const { scanPage } = await import("@/lib/scanner");

    await scanPage({
      competitorId: "cmp_1",
      pageId: "page_1",
      url: "https://example.com/pricing",
      type: "pricing",
      effortOverride: "low" // pricing normally routes to effort: "high"
    });

    expect(extractJsonMock).toHaveBeenCalledWith(expect.objectContaining({ effort: "low" }));
  });

  it("uses automate fallback for blog when extract/json is empty", async () => {
    extractJsonMock.mockResolvedValueOnce({ data: {} });
    extractMarkdownMock.mockResolvedValueOnce({
      data: { content: "# Blog\n\n- Post A\n- Post B" }
    });

    const { scanPage } = await import("@/lib/scanner");

    const result = await scanPage({
      pageId: "page_blog",
      url: "https://example.com/blog",
      type: "blog"
    });

    expect(result.endpointUsed).toBe("automate");
    expect(result.usedFallback).toBe(true);
    expect(automateExtractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fallback: expect.objectContaining({
          endpoint: "automate"
        })
      })
    );
    expect(generateDiffMock).not.toHaveBeenCalled();
  });
});

describe("inferBlogPageType", () => {
  it("classifies common blog index roots", async () => {
    const { inferBlogPageType } = await import("@/lib/scanner");
    expect(inferBlogPageType("https://example.com/blog")).toBe("blog");
    expect(inferBlogPageType("https://example.com/resources/")).toBe("blog");
    expect(inferBlogPageType("https://example.com/insights")).toBe("blog");
  });

  it("returns blog for subpaths of known blog patterns", async () => {
    const { inferBlogPageType } = await import("@/lib/scanner");
    expect(inferBlogPageType("https://example.com/insights/ai")).toBe("blog");
    expect(inferBlogPageType("https://example.com/blog/how-we-built-this")).toBe("blog");
    expect(inferBlogPageType("https://example.com/resources/case-study")).toBe("blog");
  });

  it("returns null for non-blog paths and invalid URLs", async () => {
    const { inferBlogPageType } = await import("@/lib/scanner");
    expect(inferBlogPageType("https://example.com/pricing")).toBeNull();
    expect(inferBlogPageType("not-a-url")).toBeNull();
  });
});
