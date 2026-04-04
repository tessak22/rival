import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchEvent } from "@tabstack/sdk/resources/agent";

const apiLogCreateMock = vi.fn().mockResolvedValue({});

vi.mock("@/lib/db/client", () => ({
  prisma: { apiLog: { create: apiLogCreateMock } }
}));

const researchMock = vi.fn();

vi.mock("@tabstack/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    agent: { research: researchMock }
  }))
}));

function makeStream(events: ResearchEvent[]): AsyncIterable<ResearchEvent> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const event of events) {
        yield event;
      }
    }
  };
}

const mockCitations = [
  { claim: "They charge $49/mo", source_url: "https://example.com/pricing", source_text: "pricing page content" },
  { claim: "500 GitHub stars", source_url: "https://github.com/example/repo" }
];

describe("runResearch", () => {
  beforeEach(() => {
    vi.resetModules();
    apiLogCreateMock.mockClear();
    researchMock.mockClear();
    process.env.TABSTACK_API_KEY = "test-key";
  });

  it("collects stream and extracts result and citations from complete event", async () => {
    const { runResearch } = await import("@/lib/tabstack/research");
    const events: ResearchEvent[] = [
      { event: "phase", data: { phase: "decompose" } },
      { event: "progress", data: { message: "searching" } },
      { event: "complete", data: { result: "Final research report", citations: mockCitations } }
    ];
    researchMock.mockResolvedValue(makeStream(events));

    const result = await runResearch({ query: "What is their pricing strategy?", mode: "fast" });

    expect(result.result).toBe("Final research report");
    expect(result.citations).toHaveLength(2);
    expect(result.citations[0]).toMatchObject({
      claim: "They charge $49/mo",
      source_url: "https://example.com/pricing"
    });
    expect(result.events).toHaveLength(3);
    expect(result.error).toBeUndefined();
  });

  it("logs with endpoint 'research' and mode in metadata", async () => {
    const { runResearch } = await import("@/lib/tabstack/research");
    researchMock.mockResolvedValue(makeStream([{ event: "complete", data: { result: "answer", citations: [] } }]));

    await runResearch({ query: "Research question", mode: "balanced" });

    expect(apiLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          endpoint: "research",
          mode: "balanced",
          effort: null,
          url: null
        })
      })
    );
  });

  it("logs null effort because /research has no effort param", async () => {
    const { runResearch } = await import("@/lib/tabstack/research");
    researchMock.mockResolvedValue(makeStream([{ event: "complete", data: { result: "r", citations: [] } }]));

    await runResearch({ query: "q", mode: "fast" });

    expect(apiLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ effort: null }) })
    );
  });

  it("passes nocache to SDK when provided", async () => {
    const { runResearch } = await import("@/lib/tabstack/research");
    researchMock.mockResolvedValue(makeStream([{ event: "complete", data: { result: "r", citations: [] } }]));

    await runResearch({ query: "q", mode: "fast", nocache: true });

    expect(researchMock).toHaveBeenCalledWith(expect.objectContaining({ nocache: true, mode: "fast", query: "q" }));
  });

  it("captures error event and sets error field on result", async () => {
    const { runResearch } = await import("@/lib/tabstack/research");
    researchMock.mockResolvedValue(
      makeStream([
        { event: "phase", data: { phase: "discover" } },
        { event: "error", data: "Research timed out" }
      ])
    );

    const result = await runResearch({ query: "q", mode: "balanced" });

    expect(result.error).toBe("Research timed out");
    expect(result.result).toBeNull();
    expect(result.citations).toHaveLength(0);
  });

  it("returns empty citations when complete event has no citations field", async () => {
    const { runResearch } = await import("@/lib/tabstack/research");
    researchMock.mockResolvedValue(makeStream([{ event: "complete", data: { result: "answer" } }]));

    const result = await runResearch({ query: "q", mode: "fast" });

    expect(result.citations).toEqual([]);
    expect(result.result).toBe("answer");
  });

  it("returns null result when stream has no complete event", async () => {
    const { runResearch } = await import("@/lib/tabstack/research");
    researchMock.mockResolvedValue(
      makeStream([
        { event: "phase", data: { phase: "decompose" } },
        { event: "progress", data: {} }
      ])
    );

    const result = await runResearch({ query: "q", mode: "fast" });

    expect(result.result).toBeNull();
    expect(result.citations).toEqual([]);
  });

  it("skips malformed citations gracefully", async () => {
    const { runResearch } = await import("@/lib/tabstack/research");
    researchMock.mockResolvedValue(
      makeStream([
        {
          event: "complete",
          data: {
            result: "answer",
            citations: [
              { claim: "valid", source_url: "https://x.com" },
              { claim: "no url here" }, // missing source_url — should be skipped
              null, // null — should be skipped
              { source_url: "https://y.com" } // missing claim — still valid, claim defaults to ""
            ]
          }
        }
      ])
    );

    const result = await runResearch({ query: "q", mode: "fast" });
    expect(result.citations).toHaveLength(2);
    expect(result.citations[0].source_url).toBe("https://x.com");
    expect(result.citations[1].source_url).toBe("https://y.com");
  });

  it("error event followed by complete — only error is recorded, complete is ignored", async () => {
    const { runResearch } = await import("@/lib/tabstack/research");
    researchMock.mockResolvedValue(
      makeStream([
        { event: "error", data: "Research failed mid-way" },
        { event: "complete", data: { result: "should not appear", citations: [] } }
      ])
    );

    const result = await runResearch({ query: "q", mode: "balanced" });

    expect(result.error).toBe("Research failed mid-way");
    // Break on error means complete event is never processed
    expect(result.result).toBeNull();
    expect(result.citations).toHaveLength(0);
  });

  it("omitted nocache sends undefined to SDK (not false)", async () => {
    const { runResearch } = await import("@/lib/tabstack/research");
    researchMock.mockResolvedValue(makeStream([{ event: "complete", data: { result: "r", citations: [] } }]));

    await runResearch({ query: "q", mode: "fast" });

    expect(researchMock).toHaveBeenCalledWith(expect.objectContaining({ nocache: undefined }));
  });

  it("extractResult fallback: returns fields other than citations when no result key", async () => {
    const { runResearch } = await import("@/lib/tabstack/research");
    researchMock.mockResolvedValue(
      makeStream([
        {
          event: "complete",
          data: { summary: "Competitor analysis", confidence: 0.9 } // no "result" key
        }
      ])
    );

    const result = await runResearch({ query: "q", mode: "fast" });

    expect(result.result).toEqual({ summary: "Competitor analysis", confidence: 0.9 });
  });

  it("caps intermediate events at maxStreamEvents but always captures complete", async () => {
    const { runResearch } = await import("@/lib/tabstack/research");
    // 5 progress events + 1 complete — cap at 3 intermediate events
    const events: ResearchEvent[] = [
      ...Array.from({ length: 5 }, (_, i) => ({ event: "progress", data: { step: i } }) as ResearchEvent),
      { event: "complete", data: { result: "final answer", citations: [] } }
    ];
    researchMock.mockResolvedValue(makeStream(events));

    const result = await runResearch({ query: "q", mode: "fast", maxStreamEvents: 3 });

    // Only 3 intermediate events buffered, but complete is always captured
    expect(result.events).toHaveLength(4); // 3 progress + 1 complete
    expect(result.result).toBe("final answer");
  });

  it("uses default cap of 500 when maxStreamEvents is omitted", async () => {
    const { runResearch } = await import("@/lib/tabstack/research");
    researchMock.mockResolvedValue(makeStream([{ event: "complete", data: { result: "r", citations: [] } }]));

    const result = await runResearch({ query: "q", mode: "fast" });

    expect(result.result).toBe("r");
  });

  it("propagates SDK errors and logs status 'error'", async () => {
    const { runResearch } = await import("@/lib/tabstack/research");
    researchMock.mockRejectedValue(new Error("Network failure"));

    await expect(runResearch({ query: "q", mode: "fast" })).rejects.toThrow("Network failure");

    expect(apiLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "error" }) })
    );
  });

  it("passes competitorId and isDemo to logger", async () => {
    const { runResearch } = await import("@/lib/tabstack/research");
    researchMock.mockResolvedValue(makeStream([{ event: "complete", data: { result: "r", citations: [] } }]));

    await runResearch({ query: "q", mode: "fast", competitorId: "comp-abc", isDemo: true });

    expect(apiLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ competitorId: "comp-abc", isDemo: true })
      })
    );
  });
});
