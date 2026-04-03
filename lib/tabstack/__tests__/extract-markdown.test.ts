import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  markdownMock,
  loggerCallMock,
  getTabstackClientMock,
  toGeoTargetMock,
  toSdkEffortMock
} = vi.hoisted(() => ({
  markdownMock: vi.fn(),
  loggerCallMock: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  getTabstackClientMock: vi.fn(),
  toGeoTargetMock: vi.fn(),
  toSdkEffortMock: vi.fn()
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    call: loggerCallMock
  }
}));

vi.mock("@/lib/tabstack/client", () => ({
  getTabstackClient: getTabstackClientMock,
  toGeoTarget: toGeoTargetMock,
  toSdkEffort: toSdkEffortMock
}));

describe("extractMarkdown", () => {
  beforeEach(() => {
    markdownMock.mockReset();
    loggerCallMock.mockClear();
    getTabstackClientMock.mockReset();
    toGeoTargetMock.mockReset();
    toSdkEffortMock.mockReset();
  });

  it("builds markdown request with explicit params and logs metadata", async () => {
    getTabstackClientMock.mockReturnValue({ extract: { markdown: markdownMock } });
    toGeoTargetMock.mockReturnValue({ country: "US" });
    toSdkEffortMock.mockReturnValue("max");
    markdownMock.mockResolvedValue({ content: "hello", url: "https://example.com" });

    const { extractMarkdown } = await import("@/lib/tabstack/extract-markdown");

    await extractMarkdown({
      competitorId: "cmp_1",
      pageId: "page_1",
      url: "https://example.com",
      effort: "high",
      nocache: true,
      geoTarget: "us",
      includeMetadata: true,
      isDemo: true
    });

    expect(markdownMock).toHaveBeenCalledWith({
      url: "https://example.com",
      effort: "max",
      nocache: true,
      geo_target: { country: "US" },
      metadata: true
    });

    expect(loggerCallMock).toHaveBeenCalledWith(expect.any(Function), {
      competitorId: "cmp_1",
      pageId: "page_1",
      endpoint: "extract/markdown",
      url: "https://example.com",
      effort: "high",
      nocache: true,
      geoTarget: "US",
      isDemo: true,
      fallback: undefined,
      expectedFields: ["content", "url", "metadata"]
    });
  });

  it("uses base expected fields when metadata is not requested", async () => {
    getTabstackClientMock.mockReturnValue({ extract: { markdown: markdownMock } });
    toGeoTargetMock.mockReturnValue(undefined);
    toSdkEffortMock.mockReturnValue("standard");
    markdownMock.mockResolvedValue({ content: "x", url: "https://example.com" });

    const { extractMarkdown } = await import("@/lib/tabstack/extract-markdown");

    await extractMarkdown({
      url: "https://example.com",
      effort: "low",
      nocache: false
    });

    expect(loggerCallMock).toHaveBeenLastCalledWith(expect.any(Function),
      expect.objectContaining({ expectedFields: ["content", "url"] })
    );
  });
});
