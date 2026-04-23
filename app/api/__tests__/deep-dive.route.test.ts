import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// No DB mocks needed — edge route has no Prisma

function makeSseStream(events: Array<{ event: string; data: unknown }>): ReadableStream {
  const lines = events.map((e) => `data: ${JSON.stringify({ event: e.event, data: e.data })}\n\n`).join("");
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(lines));
      controller.close();
    }
  });
}

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/deep-dive", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/deep-dive", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.TABSTACK_API_KEY = "test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: makeSseStream([{ event: "complete", data: { result: "done", citations: [] } }])
      })
    );
  });

  it("returns 400 when competitorId is missing", async () => {
    const { POST } = await import("@/app/api/deep-dive/route");
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when competitorName is missing", async () => {
    const { POST } = await import("@/app/api/deep-dive/route");
    const res = await POST(jsonRequest({ competitorId: "cmp_1" }));
    expect(res.status).toBe(400);
  });

  it("returns a streaming SSE response for valid request", async () => {
    const { POST } = await import("@/app/api/deep-dive/route");
    const res = await POST(jsonRequest({ competitorId: "cmp_1", competitorName: "Acme" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
  });

  it("calls Tabstack research API with balanced mode by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: makeSseStream([{ event: "complete", data: { result: "done", citations: [] } }])
    });
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/deep-dive/route");
    await POST(jsonRequest({ competitorId: "cmp_1", competitorName: "Acme" }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/research"),
      expect.objectContaining({ body: expect.stringContaining('"mode":"balanced"') })
    );
  });

  it("passes fast mode when specified", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: makeSseStream([{ event: "complete", data: { result: "done", citations: [] } }])
    });
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/deep-dive/route");
    await POST(jsonRequest({ competitorId: "cmp_1", competitorName: "Acme", mode: "fast" }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/research"),
      expect.objectContaining({ body: expect.stringContaining('"mode":"fast"') })
    );
  });
});
