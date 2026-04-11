import { describe, expect, it } from "vitest";
import { parseSseChunk } from "@/lib/utils/sse";
import type { ParsedSseEvent } from "@/lib/utils/sse";

describe("parseSseChunk", () => {
  it("returns an empty array for an empty string", () => {
    expect(parseSseChunk("")).toEqual([]);
  });

  it("returns a raw-string event when JSON in an incomplete block cannot be parsed", () => {
    // A block without a trailing \n\n is still parsed (filter(Boolean) keeps it).
    // The invalid JSON falls back to the raw string.
    const result = parseSseChunk("event: scan:started\ndata: {");
    expect(result).toHaveLength(1);
    expect(result[0].event).toBe("scan:started");
    expect(result[0].data).toBe("{");
  });

  it("parses a single well-formed SSE block", () => {
    const chunk = 'event: scan:started\ndata: {"url":"https://example.com"}\n\n';
    const result = parseSseChunk(chunk);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      event: "scan:started",
      data: { url: "https://example.com" }
    });
  });

  it("parses multiple SSE blocks in one chunk", () => {
    const chunk = [
      'event: scan:started\ndata: {"url":"https://example.com"}',
      'event: scan:complete\ndata: {"result":"ok"}'
    ].join("\n\n") + "\n\n";

    const result = parseSseChunk(chunk);

    expect(result).toHaveLength(2);
    expect(result[0].event).toBe("scan:started");
    expect(result[1].event).toBe("scan:complete");
  });

  it("trims whitespace from event name", () => {
    const chunk = "event:  my-event  \ndata: null\n\n";
    const result = parseSseChunk(chunk);

    expect(result).toHaveLength(1);
    expect(result[0].event).toBe("my-event");
  });

  it("trims whitespace from data value before JSON parsing", () => {
    const chunk = 'event: test\ndata:   {"key":"value"}   \n\n';
    const result = parseSseChunk(chunk);

    expect(result[0].data).toEqual({ key: "value" });
  });

  it("returns raw string when JSON parsing fails", () => {
    const chunk = "event: test\ndata: not valid json\n\n";
    const result = parseSseChunk(chunk);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ event: "test", data: "not valid json" });
  });

  it("skips blocks missing an event line", () => {
    const chunk = 'data: {"value":1}\n\n';
    const result = parseSseChunk(chunk);

    expect(result).toHaveLength(0);
  });

  it("skips blocks missing a data line", () => {
    const chunk = "event: scan:started\n\n";
    const result = parseSseChunk(chunk);

    expect(result).toHaveLength(0);
  });

  it("parses JSON null as data", () => {
    const chunk = "event: ping\ndata: null\n\n";
    const result = parseSseChunk(chunk);

    expect(result[0].data).toBeNull();
  });

  it("parses JSON boolean as data", () => {
    const chunk = "event: toggle\ndata: true\n\n";
    const result = parseSseChunk(chunk);

    expect(result[0].data).toBe(true);
  });

  it("parses JSON number as data", () => {
    const chunk = "event: count\ndata: 42\n\n";
    const result = parseSseChunk(chunk);

    expect(result[0].data).toBe(42);
  });

  it("parses JSON array as data", () => {
    const chunk = 'event: list\ndata: [1,"two",3]\n\n';
    const result = parseSseChunk(chunk);

    expect(result[0].data).toEqual([1, "two", 3]);
  });

  it("handles mixed valid and invalid blocks", () => {
    const chunk = [
      "event: good\ndata: 1",
      "event: bad\ndata: {broken",
      'event: good2\ndata: {"ok":true}'
    ].join("\n\n") + "\n\n";

    const result = parseSseChunk(chunk);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ event: "good", data: 1 });
    expect(result[1]).toEqual({ event: "bad", data: "{broken" });
    expect(result[2]).toEqual({ event: "good2", data: { ok: true } });
  });

  it("returns typed ParsedSseEvent objects", () => {
    const chunk = 'event: scan:endpoint\ndata: {"type":"pricing"}\n\n';
    const result = parseSseChunk(chunk);
    const event: ParsedSseEvent = result[0];

    expect(event.event).toBe("scan:endpoint");
    expect((event.data as { type: string }).type).toBe("pricing");
  });

  it("handles multiple blank lines between blocks gracefully", () => {
    const chunk = 'event: first\ndata: 1\n\n\n\nevent: second\ndata: 2\n\n';
    const result = parseSseChunk(chunk);

    // The extra blank line block (empty string after filtering) is dropped
    const events = result.map((e) => e.data);
    expect(events).toContain(1);
    expect(events).toContain(2);
  });
});
