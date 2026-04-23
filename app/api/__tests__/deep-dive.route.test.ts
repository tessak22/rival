import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { competitorFindUniqueMock, deepDiveCreateMock, apiLogCreateMock, buildSelfContextMock } = vi.hoisted(() => ({
  competitorFindUniqueMock: vi.fn(),
  deepDiveCreateMock: vi.fn(),
  apiLogCreateMock: vi.fn(),
  buildSelfContextMock: vi.fn().mockResolvedValue(null)
}));

vi.mock("@/lib/context/self-context", () => ({
  buildSelfContext: buildSelfContextMock
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    competitor: { findUnique: competitorFindUniqueMock },
    deepDive: { create: deepDiveCreateMock },
    apiLog: { create: apiLogCreateMock }
  }
}));

// SSE stream that sends a complete event followed by done
function makeSseStream(events: Array<{ event: string; data: unknown }>): ReadableStream {
  const lines = events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join("");
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(lines));
      controller.close();
    }
  });
}

const COMPETITOR = { id: "cmp_1", name: "Acme", baseUrl: "https://acme.com" };

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
    competitorFindUniqueMock.mockReset();
    deepDiveCreateMock.mockReset();
    apiLogCreateMock.mockReset();
    buildSelfContextMock.mockReset();
    competitorFindUniqueMock.mockResolvedValue(COMPETITOR);
    deepDiveCreateMock.mockResolvedValue({});
    apiLogCreateMock.mockResolvedValue({});
    buildSelfContextMock.mockResolvedValue(null);
    process.env.TABSTACK_API_KEY = "test-key";

    // Mock fetch to return a valid SSE stream
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
    const body = await res.json();
    expect(body.error).toBe("competitorId is required");
  });

  it("returns 404 when competitor is not found", async () => {
    competitorFindUniqueMock.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/deep-dive/route");
    const res = await POST(jsonRequest({ competitorId: "missing" }));
    expect(res.status).toBe(404);
  });

  it("returns a streaming SSE response for valid request", async () => {
    const { POST } = await import("@/app/api/deep-dive/route");
    const res = await POST(jsonRequest({ competitorId: "cmp_1" }));
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
    await POST(jsonRequest({ competitorId: "cmp_1" }));
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
    await POST(jsonRequest({ competitorId: "cmp_1", mode: "fast" }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/research"),
      expect.objectContaining({ body: expect.stringContaining('"mode":"fast"') })
    );
  });
});
