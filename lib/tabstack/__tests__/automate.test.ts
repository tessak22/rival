import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomateEvent } from "@tabstack/sdk/resources/agent";

const apiLogCreateMock = vi.fn().mockResolvedValue({});

vi.mock("@/lib/db/client", () => ({
  prisma: { apiLog: { create: apiLogCreateMock } }
}));

const automateMock = vi.fn();

vi.mock("@tabstack/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    agent: { automate: automateMock }
  }))
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
    apiLogCreateMock.mockClear();
    automateMock.mockClear();
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
    expect(result.error).toBeUndefined();
  });

  it("extracts result from agent:extracted event when present", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    const events: AutomateEvent[] = [
      { event: "start", data: null },
      { event: "agent:extracted", data: { tiers: ["free", "pro"] } },
      { event: "done", data: null }
    ];
    automateMock.mockResolvedValue(makeStream(events));

    const result = await automateExtract({
      url: "https://example.com",
      task: "Extract tiers"
    });

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

  it("captures error event and sets error field", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    const events: AutomateEvent[] = [
      { event: "start", data: null },
      { event: "error", data: "Browser agent failed" }
    ];
    automateMock.mockResolvedValue(makeStream(events));

    const result = await automateExtract({ url: "https://example.com", task: "Extract" });
    expect(result.error).toBe("Browser agent failed");
    expect(result.result).toBeNull();
  });

  it("returns null result when stream has no result event", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    automateMock.mockResolvedValue(makeStream([{ event: "start", data: null }]));

    const result = await automateExtract({ url: "https://example.com", task: "Extract" });
    expect(result.result).toBeNull();
  });

  it("logs with endpoint 'automate' and null effort/nocache", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    automateMock.mockResolvedValue(makeStream([{ event: "complete", data: {} }]));

    await automateExtract({ url: "https://example.com", task: "Extract" });

    expect(apiLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          endpoint: "automate",
          effort: null,
          nocache: null
        })
      })
    );
  });

  it("normalizes geoTarget to uppercase ISO-2", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    automateMock.mockResolvedValue(makeStream([{ event: "complete", data: {} }]));

    await automateExtract({ url: "https://example.com", task: "Extract", geoTarget: "gb" });

    const sdkCall = automateMock.mock.calls[0][0];
    expect(sdkCall.geo_target).toEqual({ country: "GB" });
    expect(apiLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ geoTarget: "GB" }) })
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

    expect(apiLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fallbackTriggered: true,
          fallbackReason: "extract/json returned empty",
          fallbackEndpoint: "extract/json"
        })
      })
    );
  });

  it("propagates SDK errors and logs status 'error'", async () => {
    const { automateExtract } = await import("@/lib/tabstack/automate");
    automateMock.mockRejectedValue(new Error("SDK timeout"));

    await expect(automateExtract({ url: "https://example.com", task: "Extract" })).rejects.toThrow("SDK timeout");

    expect(apiLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "error" }) })
    );
  });

  it("propagates mid-stream iterator error through logger", async () => {
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

    expect(apiLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "error" }) })
    );
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

  it("passes guardrails and task to SDK", async () => {
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
});
