import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomateEvent } from "@tabstack/sdk/resources/agent";

const { automateMock, loggerCallMock, getTabstackClientMock, toGeoTargetMock } = vi.hoisted(() => ({
  automateMock: vi.fn(),
  loggerCallMock: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  getTabstackClientMock: vi.fn(),
  toGeoTargetMock: vi.fn()
}));

vi.mock("@/lib/logger", () => ({
  logger: { call: loggerCallMock }
}));

vi.mock("@/lib/tabstack/client", () => ({
  getTabstackClient: getTabstackClientMock,
  toGeoTarget: toGeoTargetMock
}));

function makeStream(events: AutomateEvent[]): AsyncIterable<AutomateEvent> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const event of events) {
        yield event;
      }
    }
  };
}

describe("automateExtract", () => {
  beforeEach(() => {
    vi.resetModules();
    loggerCallMock.mockReset();
    loggerCallMock.mockImplementation(async (fn: () => Promise<unknown>) => fn());
    automateMock.mockReset();
    getTabstackClientMock.mockReset();
    getTabstackClientMock.mockReturnValue({ agent: { automate: automateMock } });
    toGeoTargetMock.mockReset();
    toGeoTargetMock.mockReturnValue(undefined);
    process.env.TABSTACK_API_KEY = "test-key";
  });

  it("collects stream and extracts result from complete event", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    const events: AutomateEvent[] = [
      { event: "start", data: null },
      { event: "agent:processing", data: null },
      { event: "complete", data: { pricing: "$49/mo" } }
    ];
    automateMock.mockResolvedValue(makeStream(events));

    const result = await automateExtract({
      url: "https://example.com/pricing",
      task: "Extract pricing information"
    });

    expect(result.result).toEqual({ pricing: "$49/mo" });
    expect(result.events).toHaveLength(3);
  });

  it("extracts result from agent:extracted event when present", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    const events: AutomateEvent[] = [
      { event: "start", data: null },
      { event: "agent:extracted", data: { tiers: ["free", "pro"] } },
      { event: "done", data: null }
    ];
    automateMock.mockResolvedValue(makeStream(events));

    const result = await automateExtract({ url: "https://example.com", task: "Extract tiers" });

    expect(result.result).toEqual({ tiers: ["free", "pro"] });
  });

  it("prefers last result event when multiple present", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    const events: AutomateEvent[] = [
      { event: "agent:extracted", data: { first: true } },
      { event: "complete", data: { final: true } }
    ];
    automateMock.mockResolvedValue(makeStream(events));

    const result = await automateExtract({ url: "https://example.com", task: "Extract" });
    expect(result.result).toEqual({ final: true });
  });

  it("throws on SSE error event so caller logs status error", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    const events: AutomateEvent[] = [
      { event: "start", data: null },
      { event: "error", data: "Browser agent failed" }
    ];
    automateMock.mockResolvedValue(makeStream(events));

    await expect(automateExtract({ url: "https://example.com", task: "Extract" })).rejects.toThrow(
      "Browser agent failed"
    );
  });

  it("throws when stream exceeds MAX_EVENTS", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    const manyEvents: AutomateEvent[] = Array.from({ length: 1002 }, (_, i) => ({
      event: i === 1001 ? "complete" : "agent:processing",
      data: null
    }));
    automateMock.mockResolvedValue(makeStream(manyEvents));

    await expect(automateExtract({ url: "https://example.com", task: "Extract" })).rejects.toThrow(
      "stream exceeded 1000 event limit"
    );
  });

  it("returns null result when stream has no result event", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    automateMock.mockResolvedValue(makeStream([{ event: "start", data: null }]));

    const result = await automateExtract({ url: "https://example.com", task: "Extract" });
    expect(result.result).toBeNull();
  });

  it("done event alone does not produce a result", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    const events: AutomateEvent[] = [
      { event: "start", data: null },
      { event: "agent:processing", data: null },
      { event: "done", data: null }
    ];
    automateMock.mockResolvedValue(makeStream(events));

    const result = await automateExtract({ url: "https://example.com", task: "Extract" });
    expect(result.result).toBeNull();
  });

  it("applies default guardrails when not provided", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    automateMock.mockResolvedValue(makeStream([{ event: "complete", data: {} }]));

    await automateExtract({ url: "https://example.com", task: "Extract" });

    expect(automateMock).toHaveBeenCalledWith(
      expect.objectContaining({ guardrails: "browse and extract only, do not interact" })
    );
  });

  it("uses provided guardrails over default", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    automateMock.mockResolvedValue(makeStream([{ event: "complete", data: {} }]));

    await automateExtract({
      url: "https://example.com/pricing",
      task: "Find all pricing tiers",
      guardrails: "browse and extract only, don't interact"
    });

    expect(automateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "Find all pricing tiers",
        url: "https://example.com/pricing",
        guardrails: "browse and extract only, don't interact"
      })
    );
  });

  it("calls logger with endpoint automate and null effort/nocache", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    automateMock.mockResolvedValue(makeStream([{ event: "complete", data: {} }]));

    await automateExtract({ url: "https://example.com", task: "Extract" });

    expect(loggerCallMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ endpoint: "automate", effort: null, nocache: null })
    );
  });

  it("forwards competitorId and pageId to logger metadata", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    automateMock.mockResolvedValue(makeStream([{ event: "complete", data: {} }]));

    await automateExtract({
      url: "https://example.com",
      task: "Extract",
      competitorId: "comp-123",
      pageId: "page-456"
    });

    expect(loggerCallMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ competitorId: "comp-123", pageId: "page-456" })
    );
  });

  it("forwards isDemo flag to logger metadata", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    automateMock.mockResolvedValue(makeStream([{ event: "complete", data: {} }]));

    await automateExtract({ url: "https://example.com", task: "Extract", isDemo: true });

    expect(loggerCallMock).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isDemo: true }));
  });

  it("normalizes geoTarget and passes it to SDK and logger", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    automateMock.mockResolvedValue(makeStream([{ event: "complete", data: {} }]));
    toGeoTargetMock.mockReturnValue({ country: "GB" });

    await automateExtract({ url: "https://example.com", task: "Extract", geoTarget: "gb" });

    expect(toGeoTargetMock).toHaveBeenCalledWith("gb");
    const sdkCall = automateMock.mock.calls[0][0];
    expect(sdkCall.geo_target).toEqual({ country: "GB" });
    expect(loggerCallMock).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ geoTarget: "GB" }));
  });

  it("passes undefined geo_target to SDK when geoTarget is invalid", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    automateMock.mockResolvedValue(makeStream([{ event: "complete", data: {} }]));
    // toGeoTargetMock returns undefined by default (set in beforeEach)

    await automateExtract({ url: "https://example.com", task: "Extract", geoTarget: "USA" });

    const sdkCall = automateMock.mock.calls[0][0];
    expect(sdkCall.geo_target).toBeUndefined();
    expect(loggerCallMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ geoTarget: undefined })
    );
  });

  it("passes fallback metadata to logger", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    automateMock.mockResolvedValue(makeStream([{ event: "complete", data: {} }]));

    await automateExtract({
      url: "https://example.com",
      task: "Extract",
      fallback: { triggered: true, reason: "extract/json returned empty", endpoint: "extract/json" }
    });

    expect(loggerCallMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        fallback: { triggered: true, reason: "extract/json returned empty", endpoint: "extract/json" }
      })
    );
  });

  it("propagates SDK errors", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    automateMock.mockRejectedValue(new Error("SDK timeout"));

    await expect(automateExtract({ url: "https://example.com", task: "Extract" })).rejects.toThrow("SDK timeout");
  });

  it("propagates mid-stream iterator errors", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    const failingStream: AsyncIterable<AutomateEvent> = {
      [Symbol.asyncIterator]: async function* () {
        yield { event: "start", data: null } as AutomateEvent;
        throw new Error("connection dropped");
      }
    };
    automateMock.mockResolvedValue(failingStream);

    await expect(automateExtract({ url: "https://example.com", task: "Extract" })).rejects.toThrow(
      "connection dropped"
    );
  });
});
