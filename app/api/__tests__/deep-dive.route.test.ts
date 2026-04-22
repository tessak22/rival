import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { researchMock, competitorFindUniqueMock, deepDiveCreateMock, apiLogCreateMock, buildSelfContextMock } =
  vi.hoisted(() => ({
    researchMock: vi.fn(),
    competitorFindUniqueMock: vi.fn(),
    deepDiveCreateMock: vi.fn(),
    apiLogCreateMock: vi.fn(),
    buildSelfContextMock: vi.fn().mockResolvedValue(null)
  }));

vi.mock("@/lib/tabstack/client", () => ({
  getTabstackClient: () => ({ agent: { research: researchMock } })
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

// Async generator that mimics the Tabstack research stream
async function* mockStream() {
  yield { event: "progress", data: "Researching..." };
  yield { event: "complete", data: { result: { summary: "Acme is a strong competitor" }, citations: [] } };
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
    researchMock.mockReset();
    competitorFindUniqueMock.mockReset();
    deepDiveCreateMock.mockReset();
    apiLogCreateMock.mockReset();
    buildSelfContextMock.mockReset();
    researchMock.mockReturnValue(mockStream());
    competitorFindUniqueMock.mockResolvedValue(COMPETITOR);
    deepDiveCreateMock.mockResolvedValue({});
    apiLogCreateMock.mockResolvedValue({});
    buildSelfContextMock.mockResolvedValue(null);
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

  it("defaults mode to balanced and passes nocache: true to SDK", async () => {
    const { POST } = await import("@/app/api/deep-dive/route");
    await POST(jsonRequest({ competitorId: "cmp_1" }));
    expect(researchMock).toHaveBeenCalledWith(expect.objectContaining({ mode: "balanced", nocache: true }));
  });

  it("respects provided mode", async () => {
    researchMock.mockReturnValue(mockStream());
    const { POST } = await import("@/app/api/deep-dive/route");
    await POST(jsonRequest({ competitorId: "cmp_1", mode: "fast" }));
    expect(researchMock).toHaveBeenCalledWith(expect.objectContaining({ mode: "fast" }));
  });
});
